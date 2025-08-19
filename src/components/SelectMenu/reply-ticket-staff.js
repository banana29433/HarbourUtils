const { StringSelectMenuInteraction, ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");

async function replyToUser(client, ticket, content, prompt) {
    try {
        const user = await client.users.fetch(ticket.user_id);
        const staff = await client.users.fetch(ticket.staff_id); // Fixed: changed from client.user.fetch
        if (prompt === false) {
            const replyButton = new ButtonBuilder()
                .setLabel(`Reply`)
                .setStyle(ButtonStyle.Primary)
                .setCustomId(`ticket_reply_user_${ticket.ticket_id}`);
            const row = new ActionRowBuilder().addComponents(replyButton);
            await user.send({
                content: `> :exclamation: | **Reply from** ${staff.username} (<@${ticket.staff_id}>):\`\`\`${content}\`\`\`To reply, press the button below and type your message.`,
                components: [row]
            })
        } else {
            const replyButton = new ButtonBuilder()
                .setLabel(`Reply`)
                .setStyle(ButtonStyle.Primary)
                .setCustomId(`ticket_reply_user_${ticket.ticket_id}`);
            const closeButton = new ButtonBuilder()
                .setLabel(`Close Ticket`)
                .setStyle(ButtonStyle.Danger)
                .setCustomId(`ticket_close_${ticket.ticket_id}`);
            const row = new ActionRowBuilder().addComponents(replyButton, closeButton);
            await user.send({
                content: `> :exclamation: | **Reply from** ${staff.username} (<@${ticket.staff_id}>):\`\`\`${content}\`\`\`To reply, press the button below and type your message.\n\n> If this reply resolved your ticket, press the button below to have it closed.\n> **Do not press it if it didn't**, you are free to reply to the ticket by pressing the \`Reply\` button.`,
                components: [row]
            })  
        }

    } catch (error) {
        console.log(error)
    }
}

module.exports = new Component({
    customId: 'ticket_reply_staff_',
    type: 'select',
    /**
     * 
     * @param {DiscordBot} client 
     * @param {StringSelectMenuInteraction} interaction 
     */
    run: async (client, interaction) => {
        const ticketId = interaction.customId.replace("ticket_reply_staff_", "");
        
        // Get the selected value from the select menu
        const selectedValue = interaction.values[0];
        const includeClosePrompt = selectedValue === "yes_prompt";

        // Get the ticket before showing modal to check if it exists
        const ticket = client.tickets.getTicket(ticketId);

        if (!ticket) {
            await interaction.reply({
                content: `Ticket \`${ticketId}\` not found.`,
                ephemeral: true
            });
            return;
        }

        // Create modal for reply input (removed the close prompt input)
        const modal = new ModalBuilder()
            .setCustomId(`ticket_reply_modal_${ticketId}`)
            .setTitle(`Reply to Ticket #${ticketId}`);

        const replyInput = new TextInputBuilder()
            .setCustomId('reply_content')
            .setLabel('Your Reply')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Enter your reply to the user...')
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(2000);

        const firstRow = new ActionRowBuilder().addComponents(replyInput);

        modal.addComponents(firstRow);

        await interaction.showModal(modal);

        setTimeout(async () => {
        try {
          const originalComponents = interaction.message.components;
          await interaction.message.edit({ components: originalComponents });
        } catch (error) {
          console.error("Failed to reset select menu:", error);
        }
      }, 1000);

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
            await replyToUser(client, ticket, replyContent, includeClosePrompt);

            await modalSubmission.editReply({
                content: `Reply sent to user successfully!`
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