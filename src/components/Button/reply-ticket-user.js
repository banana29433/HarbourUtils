const { ButtonInteraction, ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");

async function replyToStaff(client, ticket, content) {
    try {
        const user = await client.users.fetch(ticket.user_id);
        const ticketChannel = await client.channels.cache.get(`${ticket.ticket_channel_id}`)
        await ticketChannel.send({
            content: `> <@${ticket.staff_id}> | **Reply from** ${user.username} (<@${ticket.user_id}>):\`\`\`${content}\`\`\``,
        })
    } catch (error) {
        console.log(error)
    }
}

module.exports = new Component({
    customId: 'ticket_reply_user_',
    type: 'button',
    /**
     * 
     * @param {DiscordBot} client 
     * @param {ButtonInteraction} interaction 
     */
    run: async (client, interaction) => {
        const ticketId = interaction.customId.replace("ticket_reply_user_", "");

        // Get the ticket before showing modal to check if it exists
        const ticket = client.tickets.getTicket(ticketId);

        if (!ticket) {
            await interaction.reply({
                content: `❌ Ticket \`${ticketId}\` not found.`,
                ephemeral: true
            });
            return;
        }

        const modal = new ModalBuilder()
            .setCustomId(`ticket_reply_modal_${ticketId}`)
            .setTitle(`Reply to Ticket #${ticketId}`);

        const replyInput = new TextInputBuilder()
            .setCustomId('reply_content')
            .setLabel('Your Reply')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Enter your reply to the staff member...')
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(2000);

        const row = new ActionRowBuilder().addComponents(replyInput);

        modal.addComponents(row);

        await interaction.showModal(modal);

        // Set up modal submit listener
        const filter = (modalInteraction) => {
            return modalInteraction.customId === `ticket_reply_modal_${ticketId}` && 
                   modalInteraction.user.id === interaction.user.id;
        };

        try {
            const modalSubmission = await interaction.awaitModalSubmit({ 
                filter, 
                time: 300000 // 5 minutes timeout
            });

            await modalSubmission.deferReply({ ephemeral: true });

            const replyContent = modalSubmission.fields.getTextInputValue('reply_content');

            // Call replyToUser with the select menu determined prompt value
            await replyToStaff(client, ticket, replyContent);

            await modalSubmission.editReply({
                content: `Reply sent to staff members successfully!`
            });

        } catch (error) {
            if (error.code === 'InteractionCollectorError') {
                // Modal timed out
                console.log(`Modal for ticket ${ticketId} timed out`);
            } else {
                console.error('Error handling modal submission:', error);
            }
        }
    }
}).toJSON();