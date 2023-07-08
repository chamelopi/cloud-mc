import 'dotenv/config';
import express from 'express';

import { verifyDiscordRequest } from './discord.js';
import { InteractionResponseType, InteractionType } from 'discord-interactions';

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json({ verify: verifyDiscordRequest(process.env.PUBLIC_KEY) }));

app.post('/interactions', async (req, res) => {
    const { type, _id, data, channel_id } = req.body;

    // Handle verification requests
    if (type === InteractionType.PING) {
        return res.send({ type: InteractionResponseType.PONG });
    }

    // Handle test command
    if (type === InteractionType.APPLICATION_COMMAND) {
        const { name } = data;
        if (name === 'test') {
            console.log(`test command sent to channel ${channel_id} by ${req.body.member ? req.body.member.user : '(no member)'}`);
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: "hello world!",
                },
            });
        }
    }
});


app.listen(PORT, () => {
    console.log('started on port', PORT);
});