#!/bin/bash

# Path to the configuration file
CONFIG_FILE="config.json"

# Function to prompt for user input
prompt() {
  echo "$1"
  read -r input
  echo "$input"
}

# Initialize the configuration
echo "Configuring sites..."
SITES=()

# Get the number of sites
SITE_COUNT=$(gum input --prompt "How many sites would you like to monitor? " --placeholder "Enter number")
SITE_COUNT=${SITE_COUNT:-1}

for i in $(seq 1 "$SITE_COUNT"); do
  NAME=$(gum input --prompt "Enter name for site $i " --placeholder "Site name")
  URL=$(gum input --prompt "Enter URL for site $i " --placeholder "Site URL")
  SITES+=("{\"name\": \"$NAME\", \"url\": \"$URL\"}")
done

# Create the config.json file
echo "Creating configuration file..."

# Join the sites array into a single string
SITES_JSON=$(printf "%s," "${SITES[@]}" | sed 's/,$//')

# Create the JSON file
echo "{\"sites\": [${SITES_JSON}]}" > "$CONFIG_FILE"

echo "Configuration saved to $CONFIG_FILE"
