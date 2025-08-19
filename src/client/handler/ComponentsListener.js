const DiscordBot = require("../DiscordBot");
const config = require("../../config");
const { error } = require("../../utils/Console");

class ComponentsListener {
    /**
     * @param {DiscordBot} client 
     */
    constructor(client) {
        client.on('interactionCreate', async (interaction) => {
            const checkUserPermissions = async (component) => {
                if (component.options?.public === false && interaction.user.id !== interaction.message.interaction.user.id) {
                    await interaction.reply({
                        content: config.messages.COMPONENT_NOT_PUBLIC,
                        ephemeral: true
                    });
                    return false;
                }
                return true;
            }

            try {
                // BUTTONS
                if (interaction.isButton()) {
                    // Try exact match first
                    let component = client.collection.components.buttons.get(interaction.customId);

                    // If no exact match, try partial match (prefix/regex)
                    if (!component) {
                        component = [...client.collection.components.buttons.values()]
                            .find(c => interaction.customId.startsWith(c.customId));
                    }

                    if (!component) return;
                    if (!(await checkUserPermissions(component))) return;

                    try {
                        component.run(client, interaction);
                    } catch (err) {
                        error(err);
                    }
                    return;
                }

                // SELECT MENUS
                if (interaction.isAnySelectMenu()) {
                    let component = client.collection.components.selects.get(interaction.customId);
                    if (!component) {
                        component = [...client.collection.components.selects.values()]
                            .find(c => interaction.customId.startsWith(c.customId));
                    }
                    if (!component) return;
                    if (!(await checkUserPermissions(component))) return;

                    try {
                        component.run(client, interaction);
                    } catch (err) {
                        error(err);
                    }
                    return;
                }

                // MODALS
                if (interaction.isModalSubmit()) {
                    let component = client.collection.components.modals.get(interaction.customId);
                    if (!component) {
                        component = [...client.collection.components.modals.values()]
                            .find(c => interaction.customId.startsWith(c.customId));
                    }
                    if (!component) return;

                    try {
                        component.run(client, interaction);
                    } catch (err) {
                        error(err);
                    }
                    return;
                }

                // AUTOCOMPLETE
                if (interaction.isAutocomplete()) {
                    const component = client.collection.components.autocomplete.get(interaction.commandName);
                    if (!component) return;
                    try {
                        component.run(client, interaction);
                    } catch (err) {
                        error(err);
                    }
                    return;
                }

            } catch (err) {
                error(err);
            }
        });
    }
}

module.exports = ComponentsListener;