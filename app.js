import 'dotenv/config';
import express from 'express';

import { verifyDiscordRequest, sendDiscordRequest } from './discord.js';
import { InteractionResponseType, InteractionType } from 'discord-interactions';
import { requestAccessToken, execContainerAction, getContainerState } from './azure-container-control.js';
import { getStatus } from './minecraft.js';

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json({ verify: verifyDiscordRequest(process.env.PUBLIC_KEY) }));

// Send `msg` to `channel` after `delayMs` milliseconds
function delayedMessage(channel, delayMs, msg) {
    setTimeout(async () => await sendMessage(channel, msg), delayMs);
};

async function sendMessage(channel, msg) {
    try {
        await sendDiscordRequest(`channels/${channel}/messages`, { method: 'POST', body: { content: msg } });
    } catch(e) {
        console.error('Failed to send delayed message', e);
    }
}

app.get('/health', (_, res) => {
    return res.send("OK");
})

app.post('/interactions', async (req, res) => {
    const { type, _id, data, channel_id } = req.body;

    // Handle verification requests
    if (type === InteractionType.PING) {
        return res.send({ type: InteractionResponseType.PONG });
    }

    // Handle test command
    if (type === InteractionType.APPLICATION_COMMAND) {
        const { name } = data;

        console.log(`${name} command sent to channel ${channel_id} by ${req.body.member ? req.body.member.user.username : '(no member)'}`);

        if (name === 'test') {
            // Dummy command
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: "hello world!",
                },
            });
        } else if (name === 'delayed') {
            // Dummy async command
            delayedMessage(channel_id, 3000, 'you will read this 3 seconds later');
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: "wait a moment...",
                },
            });
        } else if (name === 'start' || name === 'stop' || name === 'status') {
            // Schedule on event loop to not block response if azure takes a while
            setTimeout(async () => await runContainerAction(name, channel_id), 15);

            // Reply so that the user knows that we are working on it
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: `${name}ing the server, this takes some time, please be patient...`,
                },
            });
        }
    }
});

/**
 * Command handler for container control. Starts/stops the Azure Container Instance running the minecraft server,
 * or returns its status.
 */
async function runContainerAction(action, channel) {
    // TODO: Get from env
    const subscriptionId = "318db169-bd64-46b2-ac38-5f12eca299dc";
    const resourceGroup = "MinecraftServer";
    const containerGroup = "minecraft-server";
    const containerHostName = process.env.MC_SERVER_URL;
    const containerPort = 25565;
    
    // TODO: prevent running multiple actions in parallel

    console.log(`running container action ${action}`);

    let success = true;
    let result = ""
    try {
        // Authenticate
        const token = await requestAccessToken();
        console.log("retrieved token!");
        // Start/stop container via API call
        // TODO: Stop is a SIGKILL according to The Internet (tm) - can we stop the server gracefully?
        if (action === "status") {
            result = await getContainerState(subscriptionId, resourceGroup, containerGroup, token);

            // If server is running, request its player count & display that
            if (result.state === 'Running') { 
                try {
                    result = JSON.parse(await getStatus(containerHostName, containerPort));
                } catch (e) {
                    console.error('could not retrieve status from the minecraft server', e);
                    result = { state: 'Minecraft starting up...' };
                }
            }
            result = formatStatus(result);
        } else {
            await execContainerAction(subscriptionId, resourceGroup, containerGroup, action, token);
        }
        
        console.log("container action completed successfully");
    } catch (e) {
        console.error(e);
        success = false;
    }
    
    
    if (action !== "start") {
        // Determine reply message
        const msg = getReplyMessage(action, success, result);
        // Send response message to the same channel
        await sendMessage(channel, msg);
    } else {
        // If action is 'start', delay the reply & poll the server every 5 seconds
        // so that we only notify the players once they can connect.
        setTimeout(() => pollServerUntilStarted(containerHostName, containerPort, 0, channel), 15000);
    }
}

/**
 * Because the server takes quite a while to start, poll in 5 second intervals if it can be reached.
 * Stop after retry attempts.
 */
async function pollServerUntilStarted(containerHostName, containerPort, attempt, channel) {
    if (attempt > 20) {
        console.error("Could not receive positive status from server after " + attempt + " attempts. Giving up!");
        await sendMessage(channel, "Server takes longer than expected to start, please wait a bit, then try /status!");
        return;
    }

    try {
        result = JSON.parse(await getStatus(containerHostName, containerPort));
        result = formatStatus(result);
        const msg = getReplyMessage("start", true, result);
        // Send response message to the same channel
        await sendMessage(channel, msg);
    } catch (e) {
        // Send response message to the same channel
        await sendMessage(channel, "...");

        console.log("Attempt " + attempt + " did not reach the server, trying again in 15 seconds...");
        setTimeout(() => pollServerUntilStarted(containerHostName, containerPort, ++attempt, channel));
    }
}

/**
 * Pretty-prints the server status object
 */
function formatStatus(status) {
    if (status.state == 'Terminated') {
        return `🔴 Not Running since ${status.stateSince}`;
    } else if (!!status.version) {
        let text = `🟢 Running ${status.version.name} with ${status.players.online}/${status.players.max} players`;
        if (process.env.MC_SERVER_URL) {
            text += `\nYou can access the server at ${process.env.MC_SERVER_URL}`;
        }
        return text;
    } else if (status.state == 'Waiting') {
        return `🟡 Waiting`;
    } else {
        return `🟡 ${status.state}`;
    }
}

/**
 * Builds the message the bot sends after completing an action, based on the action and its result.
 */
function getReplyMessage(action, success, result) {
    if (success) {
        switch(action) {
            case "status":
                return (typeof(result) == 'object') ? JSON.stringify(result) : result;
            case "start":
                return `successfully started the server!`;
            case "stop":
                return `successfully stopped the server!`;
        }
    } else {
        return "Error, please check logs!";
    }
}


app.listen(PORT, () => {
    console.log('started on port', PORT);
});