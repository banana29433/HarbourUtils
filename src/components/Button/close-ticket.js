const { ButtonInteraction } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const config = require("../../config.js");

module.exports = new Component({
    customId: 'ticket_close_',
    type: 'button',
    /**
     * 
     * @param {DiscordBot} client 
     * @param {ButtonInteraction} interaction 
     */
    run: async (client, interaction) => {
        try {
            const ticketId = interaction.customId.replace("ticket_close_", "");
            const ticket = client.tickets.getTicket(ticketId);
            
            if (!ticket) {
                await interaction.reply({
                    content: `❌ Ticket \`${ticketId}\` not found.`,
                    ephemeral: true
                });
                return;
            }

            // Reply early to acknowledge the interaction
            await interaction.reply({
                content: `✅ Closing ticket \`${ticketId}\`...`,
                ephemeral: true
            });

            const initChannelIds = {
                ingame: config.tickets.ingameReports,
                discord: config.tickets.discordReports,
                mods: config.tickets.contactMods,
                officers: config.tickets.contactOfficers,
                admins: config.tickets.contactAdmins,
                owner: config.tickets.contactOwner
            };

            // Notify user with error handling
            try {
                const user = await client.users.fetch(ticket.user_id);
                await user.send({
                    content: `> Your ticket \`${ticketId}\` was closed! Thank you for getting in touch.`
                });
            } catch (error) {
                console.error(`Failed to send DM to user ${ticket.user_id}:`, error.message);
                // Continue execution even if DM fails
            }

            // Delete ticket channel with error handling
            try {
                const ticketChannel = client.channels.cache.get(ticket.ticket_channel_id);
                if (ticketChannel) {
                    await ticketChannel.delete("Ticket closed");
                } else {
                    console.warn(`Ticket channel ${ticket.ticket_channel_id} not found in cache`);
                }
            } catch (error) {
                console.error(`Failed to delete ticket channel ${ticket.ticket_channel_id}:`, error.message);
            }

            // Delete initial message with error handling
            try {
                const ticketType = ticket.ticket_type.split("-")[1];
                const initChannelId = initChannelIds[ticketType];
                
                if (!initChannelId) {
                    console.warn(`Unknown ticket type: ${ticketType}`);
                    return;
                }

                const initChannel = client.channels.cache.get(initChannelId);
                if (!initChannel) {
                    console.warn(`Init channel ${initChannelId} not found in cache`);
                    return;
                }

                const initMsg = await initChannel.messages.fetch(ticket.init_msg_id);
                if (initMsg) {
                    await initMsg.delete("Ticket closed");
                } else {
                    console.warn(`Initial message ${ticket.init_msg_id} not found`);
                }
            } catch (error) {
                console.error(`Failed to delete initial message ${ticket.init_msg_id}:`, error.message);
            }

        } catch (error) {
            console.error("Error in ticket close component:", error);
            
            // Try to send error message if interaction hasn't been replied to
            if (!interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({
                        content: "An error occurred while closing the ticket.",
                        ephemeral: true
                    });
                } catch (replyError) {
                    console.error("Failed to send error reply:", replyError);
                }
            }
        }
    }
}).toJSON();