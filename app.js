import 'dotenv/config';
import express from 'express';

import { InteractionResponseType, InteractionType } from 'discord-interactions';
import { execContainerAction, getContainerState, requestAccessToken } from './azure-container-control.js';
import { sendDiscordRequest, verifyDiscordRequest } from './discord.js';
import { getStatus } from './minecraft.js';
import { SERVER_CHOICES } from './serverlist.js';

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
    } catch (e) {
        console.error('Failed to send delayed message', e);
    }
}

app.get('/health', (_, res) => {
    return res.send("OK");
})

app.post('/interactions', async (req, res) => {
    console.log('interaction received: ', req.body.type);

    const { type, _id, data, channel_id } = req.body;

    // Handle verification requests
    if (type === InteractionType.PING) {
        return res.send({ type: InteractionResponseType.PONG });
    }

    // Handle test command
    if (type === InteractionType.APPLICATION_COMMAND) {
        const { name, options } = data;

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
            const serverContainerGroup = getServerOption(options);
            const serverAlias = getServerAlias(options);
            // Schedule on event loop to not block response if azure takes a while
            setTimeout(async () => await runContainerAction(name, channel_id, serverAlias, serverContainerGroup), 15);

            // Reply so that the user knows that we are working on it
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: `${name}ing the server, this takes some time, please be patient...`,
                },
            });
        } else {
            console.log(`unknown command: ${name}`);
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: `meh, what is ${name}?`,
                },
            });
        }
    } else {
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: `helo`,
            },
        });
    }
});

/**
 * Finds the server alias (i.e. what the user specified as command option) from options array
 */
function getServerAlias(options) {
    if (!options) {
        return 'default';
    }

    for (let option of options) {
        if (option.name === 'server') {
            // Find the original choice - that is the server alias
            // Note that SERVER_CHOICES is a LIST of OBJECTS!
            for (let elem of SERVER_CHOICES) {
                if (elem.value === option.value) {
                    return elem.name;
                }
            }
        }
    }
    return 'default';
}

/**
 * Retrieves server resource group (given via aliases) from the command options
 */
function getServerOption(options) {
    if (!options) {
        return 'minecraft-server';
    }

    for (let option of options) {
        if (option.name === 'server') {
            return option.value;
        }
    }
    // Default server container group
    return 'minecraft-server';
}

/**
 * Command handler for container control. Starts/stops the Azure Container Instance running the minecraft server,
 * or returns its status.
 */
async function runContainerAction(action, channel, serverAlias, serverContainerGroup) {
    // TODO: Get from env
    const subscriptionId = "318db169-bd64-46b2-ac38-5f12eca299dc";
    const resourceGroup = "MinecraftServer";
    // Default minecraft port
    const containerPort = 25565;
    // These two are distinguished by the command option
    const containerGroup = serverContainerGroup;
    const containerHostName = process.env['MC_SERVER_URL_' + serverAlias.toUpperCase()];

    // TODO: prevent running multiple actions in parallel

    console.log(`running container action ${action} for ${containerGroup} (${serverAlias})`);

    let success = true;
    let result = ""
    try {
        // Authenticate
        const azToken = await requestAccessToken();
        console.log("retrieved token!");
        // Start/stop container via API call
        // TODO: Stop is a SIGKILL according to The Internet (tm) - can we stop the server gracefully?
        if (action === "status") {
            result = await getContainerState(subscriptionId, resourceGroup, containerGroup, azToken);

            // If server is running, request its player count & display that
            if (result.state === 'Running') {
                try {
                    result = JSON.parse(await getStatus(result.fqdn || containerHostName, containerPort));
                } catch (e) {
                    console.error(`could not retrieve status from the minecraft server at ${containerHostName}`, e);
                    result = { state: 'Minecraft starting up...' };
                }
            }
            result = formatStatus(result, result.fqdn || containerHostName);
        } else {
            await execContainerAction(subscriptionId, resourceGroup, containerGroup, action, azToken);
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
        // If action is 'start', delay the reply & poll the server every minute
        // so that we only notify the players once they can connect.
        // TODO: We could refactor this to use the fqdn from the status response
        setTimeout(() => pollServerUntilStarted(containerHostName, containerPort, 0, channel), 60000);
    }
}

/**
 * Because the server takes quite a while to start, poll in 5 second intervals if it can be reached.
 * Stop after retry attempts.
 */
async function pollServerUntilStarted(containerHostName, containerPort, attempt, channel) {
    if (attempt > 5) {
        console.error("Could not receive positive status from server after " + attempt + " attempts. Giving up!");
        await sendMessage(channel, "Server takes longer than expected to start, please wait a bit, then try /status!");
        return;
    }

    try {
        result = JSON.parse(await getStatus(containerHostName, containerPort));
        result = formatStatus(result, containerHostName);
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
function formatStatus(status, containerHostName) {
    if (status.state == 'Terminated') {
        return `🔴 Not Running since ${status.stateSince}`;
    } else if (!!status.version) {
        let text = `🟢 Running ${status.version.name} with ${status.players.online}/${status.players.max} players`;
        if (containerHostName) {
            text += `\nYou can access the server at ${containerHostName}`;
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
        switch (action) {
            case "status":
                return (typeof (result) == 'object') ? JSON.stringify(result) : result;
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