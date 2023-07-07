import 'dotenv/config';
import express from 'express';

import { verifyDiscordRequest } from './discord';
import { InteractionResponseType, InteractionType } from 'discord-interactions';

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json({ verify: verifyDiscordRequest(process.env.PUBLIC_KEY) }));

app.post('/interactions', async (req, res) => {
    const { type, id, data } = req.body;

    // Handle verification requests
    if (type === InteractionType.PING) {
        return res.send({ type: InteractionResponseType.PONG });
    }

    // Handle test command
    if (type === InteractionType.APPLICATION_COMMAND) {
        const { name } = data;
        if (name === 'test') {
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
    console.log('stated on port ', PORT);
});