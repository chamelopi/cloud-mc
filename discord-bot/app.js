import 'dotenv/config';
import express from 'express';

import { verifyDiscordRequest, sendDiscordRequest } from './discord.js';
import { InteractionResponseType, InteractionType } from 'discord-interactions';

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json({ verify: verifyDiscordRequest(process.env.PUBLIC_KEY) }));

function delayedMessage(channel, delayMs, msg) {
    setTimeout(async () => {
        try {
            await sendDiscordRequest(`/channels/${channel}/messages`, { method: 'POST', body: { content: msg } });
        } catch(e) {
            console.error('Failed to send delayed message', e);
        }
    }, delayMs);
};

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
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: "hello world!",
                },
            });
        }

        if (name === 'delayed') {
            delayedMessage(channel_id, 3000, 'you will read this 3 seconds later');
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: "wait a moment...",
                },
            });
        }
    }
});


app.listen(PORT, () => {
    console.log('started on port', PORT);
});