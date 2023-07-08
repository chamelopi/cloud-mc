# Discord bot

for now just a PoC, should later be able to remote-controll the server

#### Instructions

To run the bot, do the following

```bash
# Install dependencies from npm
npm install
# Register bot commands via discord API
npm run register
# Run the server which reacts to discord interactions
npm start
```

#### Resources used 
- Where you manage your bots: https://discord.com/developers/applications
- Discord bot guide: https://discord.com/developers/docs/getting-started
- Example project: https://github.com/discord/discord-example-app

#### Alternative library
- We could alternatively use [**discord.js**](https://www.npmjs.com/package/discord.js)
- discord.js seems to be more powerful alternative to the "official" discord-interactions package, i.e. it can also send messages by itself, etc.
- note sure if we need it
- guide for that: https://discordjs.guide/creating-your-bot/slash-commands.html
