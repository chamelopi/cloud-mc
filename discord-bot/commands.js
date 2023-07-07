import 'dotenv/config';
import { sendDiscordRequest } from './discord';

const TEST_COMMAND = {
    name: 'test',
    description: 'basic command',
    type: 1, // chat-based slash command
};

const ALL_COMMANDS = [TEST_COMMAND];

async function installCommands(appId, commands) {
    const endpoint = `applications/${appId}/commands`;
    try {
        await sendDiscordRequest(endpoint, { method: 'PUT', body: commands });
    } catch (err) {
        console.error(err);
        return;
    }
    console.log('commands update successful!');
}

await installCommands(process.env.APP_ID, ALL_COMMANDS);