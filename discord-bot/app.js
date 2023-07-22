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
async function runContainerAction(name, channel) {
    const subscriptionId = "318db169-bd64-46b2-ac38-5f12eca299dc";
    const resourceGroup = "MinecraftServer";
    const containerGroup = "minecraft-server";
    const containerHostName = "cloud-mc.westeurope.azurecontainer.io";
    const port = 25565;
    const action = name;
    
    // TODO: prevent running multiple actions in parallel

    console.log(`running container action ${action}`);

    let success = true;
    let result = ""
    try {
        // Authenticate
        const token = await requestAccessToken();
        console.log("retrieved token!");
        // Start/stop container via API call
        // TODO: Stop is a SIGKILL according to The Internet (tm) - can we stop the server gracefully somehow?
        if (action === "status") {
            result = await getContainerState(subscriptionId, resourceGroup, containerGroup, token);

            // If server is running, request its player count & display that
            if (result.state === 'Running') { 
                try {
                    console.log('asking server for player count');
                    result = await getStatus(containerHostName, port);
                } catch (e) {
                    console.error('could not retrieve status from the minecraft server', e);
                    result = { state: 'Minecraft Unavailable' };
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
    
    // Determine reply message
    // TODO: Send message after some delay, since the server takes some time to start up
    const msg = getReplyMessage(action, success, result);

    // Send response message to the same channel
    await sendMessage(channel, msg);
}

/**
 * Pretty-prints the server status
 */
function formatStatus(status) {
    if (status.state == 'Terminated') {
        return `🔴 Not Running since ${status.stateSince}`;
    } else if (status.version) {
        return `🟢 Running ${status.version.name} with ${status.players.online}/${status.players.max} players`;
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