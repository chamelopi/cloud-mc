import 'dotenv/config';
import fetch from 'node-fetch';

const TEST_COMMAND = {
    name: 'test',
    description: 'basic command',
    type: 1, // chat-based slash command
};

const ALL_COMMANDS = [TEST_COMMAND];

async function discordRequest(endpoint, options) {
    const url = 'https://discord.com/api/v10/' + endpoint;

    if (options.body) {
        options.body = JSON.stringify(options.body);
    }

    const res = await fetch(url, {
        headers: {
            Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
            'Content-Type': 'application/json; charset=utf-8',
            'User-Agent': 'DiscordBot',
        },
        ...options
    });
    if (!res.ok) {
        const data = await res.json();
        console.log(res.status);
        throw new Error(JSON.stringify(data));
    }
    return res;
}

async function installCommands(appId, commands) {
    const endpoint = `applications/${appId}/commands`;
    try {
        await discordRequest(endpoint, { method: 'PUT', body: commands });
    } catch (err) {
        console.error(err);
        return;
    }
    console.log('commands update successful!');
}

await installCommands(process.env.APP_ID, ALL_COMMANDS);