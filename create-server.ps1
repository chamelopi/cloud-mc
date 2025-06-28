$RESOURCE_GROUP="MinecraftServer"
$STORAGE_ACCOUNT="minecraft20250628"
$STORAGE_NAME="minecraft-server-phee"
$CONTAINER_NAME="minecraft-server-phee"
# For vanilla
#$IMAGE="serverimagesv2.azurecr.io/papermc"
# For modded
$IMAGE="serverimagesv2.azurecr.io/minecraft-server"
$STORAGE_PATH="/data"
$HOSTNAME="cloud-mc-phee-v2"


az storage share-rm create -g $RESOURCE_GROUP --storage-account $STORAGE_ACCOUNT --name $STORAGE_NAME --quota 20 --enabled-protocols SMB --output table
az container create -g $RESOURCE_GROUP --name $CONTAINER_NAME --image $IMAGE --azure-file-volume-share-name $STORAGE_NAME --azure-file-volume-account-name $STORAGE_ACCOUNT --azure-file-volume-mount-path "$STORAGE_PATH" --restart-policy Never --cpu 4 --memory 4 --dns-name-label $HOSTNAME --ports 25565 --os-type Linux -e "EULA=TRUE" "OPS=chamelopi" "TYPE=FABRIC" "VERSION=1.21.3" --location "west europe"
