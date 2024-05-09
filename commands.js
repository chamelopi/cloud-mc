import 'dotenv/config';
import { sendDiscordRequest } from './discord.js';
import { SERVER_CHOICES } from './serverlist.js';

const TEST_COMMAND = {
    name: 'test',
    description: 'basic command',
    type: 1, // chat-based slash command
};
const DELAYED_COMMAND = {
    name: 'delayed',
    description: 'sends message asynchronously',
    type: 1,
}
const START_SERVER = {
    name: 'start',
    description: 'starts the minecraft server',
    type: 1,
    options: [
        {
            type: 3, // STRING
            name: "server",
            description: "the server to start, using 'default' if none specified",
            choices: SERVER_CHOICES,
        },
    ],
}
const STOP_SERVER = {
    name: 'stop',
    description: 'stops the minecraft server',
    type: 1,
    options: [
        {
            type: 3, // STRING
            name: "server",
            description: "the server to stop, using 'default' if none specified",
            choices: SERVER_CHOICES,
        },
    ],
}
const STATUS_SERVER = {
    name: 'status',
    description: 'status of the minecraft server',
    type: 1,
    options: [
        {
            type: 3, // STRING
            name: "server",
            description: "the server to query status of, using 'default' if none specified",
            choices: SERVER_CHOICES,
        },
    ],
}

const ALL_COMMANDS = [TEST_COMMAND, DELAYED_COMMAND, START_SERVER, STOP_SERVER, STATUS_SERVER];

async function installCommands(appId, commands) {
    const endpoint = `applications/${appId}/commands`;
    try {
        await sendDiscordRequest(endpoint, { method: 'PUT', body: commands });
    } catch (err) {
        console.error(err);
        return;
    }
    console.log('commands update successful! (it might take discord a few minutes to update)');
}

await installCommands(process.env.APP_ID, ALL_COMMANDS);