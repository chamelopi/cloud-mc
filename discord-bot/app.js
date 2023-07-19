import 'dotenv/config';
import express from 'express';

import { verifyDiscordRequest, sendDiscordRequest } from './discord.js';
import { InteractionResponseType, InteractionType } from 'discord-interactions';
import { requestAccessToken, execContainerAction } from './azure-container-control.js';

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json({ verify: verifyDiscordRequest(process.env.PUBLIC_KEY) }));

// Send `msg` to `channel` after `delayMs` milliseconds
function delayedMessage(channel, delayMs, msg) {
    setTimeout(async () => {
        try {
            await sendDiscordRequest(`channels/${channel}/messages`, { method: 'POST', body: { content: msg } });
        } catch(e) {
            console.error('Failed to send delayed message', e);
        }
    }, delayMs);
};

app.post('/interactions', async (req, res) => {
    const { type, _id, data, channel_id } = req.body;

    console.log(`received request: ${JSON.stringify(req.body)}`);

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
        } else if (name === 'start' || name === 'stop') {
            // Schedule on event loop to not block response if azure takes a while
            setTimeout(async () => await runContainerAction(name, channel_id), 15);

            // Reply so that the user knows that we are working on it
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: `${name}ing the server, this takes some time, please be patient...`,
                },
            });
        } else if (name === "status") {
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
 * Command handler for `/start` and `/stop`. Starts/stops the Azure Container Instance running the minecraft server
 */
async function runContainerAction(name, channel) {
    const subscriptionId = "318db169-bd64-46b2-ac38-5f12eca299dc";
    const resourceGroup = "MinecraftServer";
    const containerGroup = "minecraft-server";
    const action = name;
    
    // TODO: prevent running multiple actions in parallel

    console.log(`running container action ${action}`);

    let success = true;
    try {
        // Authenticate
        const token = await requestAccessToken();
        console.log("retrieved token!");
        // Start/stop container via API call
        // TODO: Stop is a SIGKILL according to The Internet (tm) - can we stop the server gracefully somehow?
        await execContainerAction(subscriptionId, resourceGroup, containerGroup, action, token);
        console.log("container action completed successfully");
    } catch (e) {
        console.error(e);
        success = false;
    }
    
    // Determine reply message
    // TODO: Send message after some delay, since the server takes some time to start up
    const msg = success ? `successfully ${action}ed the server!` : "Error, please check logs!";

    // Send response message to the same channel
    try {
        await sendDiscordRequest(`channels/${channel}/messages`, { method: 'POST', body: { content: msg } });
    } catch(e) {
        console.error('Failed to send delayed message', e);
    }
}

/**
 * Command handler for `/status`. Returns the status of the Azure Container Instance running the minecraft server
 */
async function runContainerActionStatus(channel) {
    const subscriptionId = "318db169-bd64-46b2-ac38-5f12eca299dc";
    const resourceGroup = "MinecraftServer";
    const containerGroup = "minecraft-server";
    const action = "status";
    
    // TODO: prevent running multiple actions in parallel

    console.log(`running container action ${action}`);

    var resultJson = ""
    let success = true;
    try {
        // Authenticate
        const token = await requestAccessToken();
        console.log("retrieved token!");
        result = await getContainerState(subscriptionId, resourceGroup, containerGroup, action, token);
        console.log("container action completed successfully");
    } catch (e) {
        console.error(e);
        success = false;
    }
    
    // Determine reply message
    // TODO: Send message after some delay, since the server takes some time to start up
    const msg = success ? JSON.stringify(resultJson) : "Error, please check logs!";

    // Send response message to the same channel
    try {
        await sendDiscordRequest(`channels/${channel}/messages`, { method: 'POST', body: { content: msg } });
    } catch(e) {
        console.error('Failed to send delayed message', e);
    }
}

app.listen(PORT, () => {
    console.log('started on port', PORT);
});