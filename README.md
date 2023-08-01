# cloud-mc

Azure Cloud based Minecraft setup :)

## Discord bot

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

This requires a `.env` file present with the following contents:

```
APP_ID=...
DISCORD_TOKEN=...
PUBLIC_KEY=...
# Azure OAuth credentials, see below
AZURE_CLIENT_ID=...
AZURE_TENANT_ID=...
AZURE_CLIENT_SECRET=...
```

Optionally, you can also specify a `PORT` - the default is 3000.

#### Resources used 
- Where you manage your bots: https://discord.com/developers/applications
- Discord bot guide: https://discord.com/developers/docs/getting-started
- Example project: https://github.com/discord/discord-example-app

#### Alternative library
- We could alternatively use [**discord.js**](https://www.npmjs.com/package/discord.js)
- discord.js seems to be more powerful alternative to the "official" discord-interactions package, i.e. it can also send messages by itself, etc.
- note sure if we need it
- guide for that: https://discordjs.guide/creating-your-bot/slash-commands.html

## Next TODOs

- [ ] Check & wait for container startup (via status call) until the server is up
  - [ ] Bonus points if you check for actual minecraft server connectivity
- [ ] Stop the minecraft server gracefully before sending a SIGKILL via Azure API
- [ ] Run a cronjob every 15 minutes, checking for players on the server, shutting it down if nobody is playing
- [ ] Find out if we need some kind of backup on top of the file share
  - file share seems to retain data forever, retention period is just for soft-deleted data
  - what does "locally-redundant" mean?

## Plans
- **Azure Container Instance** running linux minecraft server
  - 15 GB limit for container size
  - started & stopped on demand via bot
  - does not have persistence when not running
- **Azure Blob Storage** for backups [Plans](https://learn.microsoft.com/en-us/azure/storage/blobs/access-tiers-overview?tabs=azure-portal)
  - should have space for up to 3 backups at minimum (~ 500MB for a small world, don't know how large they get)
  - plan might not matter too much for our needs
- **Azure Cloud Function**
  - Implements bot functionality (either directly when using discord bot or indirectly for telegram bot)
  - Starting a container based with a function: https://learn.microsoft.com/en-us/azure/container-instances/container-instances-tutorial-azure-function-trigger
- **Telegram** or **Discord bot** for administration
  - telegram has a polling-based model, i.e. a bot actively runs an event loop, reacting to interactions
    - [node-telegram-bot-api](https://www.npmjs.com/package/node-telegram-bot-api) node.js lib
  - discord has a web hook based model (push-based), i.e. it could be run in an Azure Cloud Function itself

## Azure commands from powershell

You need to set up azure cloud shell first.

- Open windows terminal
- Click the little arrow and select "Azure Cloud Shell"
- Follow the instructions on screen & in the browser
- Afterwards, you can return to your terminal and press Enter to re-activate the shell there

### Setting a quota for a storage

Select the storage account, then follow these steps (with the appropriate type of storage):

![](img/howto-set-quota.png)

### Creating a container with a file share

```
az container create -g MinecraftServer --name minecraft-server --image marctv/minecraft-papermc-server:latest --azure-file-volume-share-name minecraft --azure-file-volume-account-name minecraft20230716 --azure-file-volume-mount-path "/data" --restart-policy Never --cpu 1 --memory 4 --dns-name-label cloud-mc --ports 25565 --os-type Linux -e "EULA=TRUE OPS=chamelopi" --location "west europe"
```

With `az container create`, you can also use the `-f` flag to pass a docker-compose file? (I did not test this, but it seems likely)

### Creating a OAuth app & allowing it to start containers

**Create an app**:
-> go to azure active directory
-> app registration
-> new app
-> store the client secret, client id & tenant id for later use (.env file)

(app might need the "user_impersonation" permission under "API permissions")

**Assign "Contributor" role to the app**:
-> select subscriptions
-> Access Control (IAM)
-> Add, Add role assignment
-> In the Role tab, select "Contributor" to allow the application to execute actions like reboot, start and stop instances
-> On the Members tab. Select Assign access to, then select User, group, or service principal
-> search for the app by name
-> review & assign

([Source](https://learn.microsoft.com/en-us/azure/active-directory/develop/howto-create-service-principal-portal)).

### Creating an App Service for the bot

create "App Service" via portal
- Pricing: B1 basic
- Public networking yes
- Deployment: Code
- CI: no
- Runtime Stack: Node 18
