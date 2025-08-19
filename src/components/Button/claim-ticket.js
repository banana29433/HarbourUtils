const { ButtonInteraction, ButtonBuilder, ButtonStyle, ContainerBuilder, TextDisplayBuilder, MessageFlags, ActionRowBuilder, PermissionOverwrites, ChannelType, SeparatorBuilder, SeparatorSpacingSize, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const config = require("../../config.js");

async function updateInitMsg(msgId, staffId, userId, subject, channel, ticketId) {
  try {
    const mainContainer = new ContainerBuilder();
    const text1 = new TextDisplayBuilder().setContent(
      `### Incoming Ticket\n**Created by**: <@${userId}>\n**Subject**:\n\`\`\`${subject}\`\`\`\n\n**Claimed by**: <@${staffId}>`
    );
    mainContainer.addTextDisplayComponents(text1);
    
    const claimButton = new ButtonBuilder()
      .setLabel("Claimed")
      .setStyle(ButtonStyle.Secondary)
      .setCustomId(`ticket_claim_${ticketId}`)
      .setDisabled(true);
    
    const claimRow = new ActionRowBuilder().addComponents(claimButton);
    mainContainer.addActionRowComponents(claimRow);

    const message = await channel.messages.fetch(msgId);
    await message.edit({
      flags: MessageFlags.IsComponentsV2,
      components: [mainContainer]
    });
  } catch (error) {
    console.error('Failed to update init message:', error);
  }
}

async function createTicketChannel(interaction, ticket, categoryId) {
      const channel = await interaction.guild.channels.create({
        name: `ticket-${ticket.ticket_id}`,
        type: ChannelType.GuildText,
        parent: categoryId,
        permissionOverwrites: [
          {
            id: interaction.guild.roles.everyone,
            deny: ['ViewChannel']
          },
          {
            id: interaction.user.id,
            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages']
          }
        ],
      });

    const mainContainer = new ContainerBuilder();
    const text1 = new TextDisplayBuilder().setContent(`### Ticket \`${ticket.ticket_id}\`\nCreated by: <@${ticket.user_id}>\nClaimed by: <@${ticket.staff_id}>\nTicket type: \`${ticket.ticket_type}\`\nAccess level: \`${ticket.access_level}\``);
    mainContainer.addTextDisplayComponents(text1);
    const separator1 = new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large);
    const separator2 = new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small);
    mainContainer.addSeparatorComponents(separator1);
    const text2 = new TextDisplayBuilder().setContent(`**Subject**: \`${ticket.subject}\``);
    mainContainer.addTextDisplayComponents(text2);
    mainContainer.addSeparatorComponents(separator2);
    const text3 = new TextDisplayBuilder().setContent(`\`\`\`${ticket.body}\`\`\``);
    mainContainer.addTextDisplayComponents(text3);
    const noPrompt = new StringSelectMenuOptionBuilder()
      .setLabel(`Without Prompt`)
      .setDescription(`Reply to the user without a prompt to close the ticket`)
      .setValue(`no_prompt`);
    const withPrompt = new StringSelectMenuOptionBuilder()
      .setLabel(`With Prompt`)
      .setDescription(`Reply to the user with a prompt to close the ticket`)
      .setValue(`yes_prompt`);
    const replyList = new StringSelectMenuBuilder().addOptions(noPrompt, withPrompt).setCustomId(`ticket_reply_staff_${ticket.ticket_id}`).setPlaceholder(`Select reply type...`);
    const closeButton = new ButtonBuilder()
      .setLabel(`Close Ticket`)
      .setStyle(ButtonStyle.Danger)
      .setCustomId(`ticket_close_${ticket.ticket_id}`);
    const row = new ActionRowBuilder().addComponents(replyList);
    const row2 = new ActionRowBuilder().addComponents(closeButton);
    mainContainer.addActionRowComponents(row, row2);
    channel.send({
      flags: MessageFlags.IsComponentsV2,
      components: [mainContainer]
    });
    return channel;
}

async function dmUser(client, userId, staffId, ticketId) {
    try {
      const staff = await client.users.fetch(staffId);
      const user = await client.users.fetch(userId);
      user.send({
        content: `> :white_check_mark: | Your ticket \`${ticketId}\` has been claimed by ${staff.username} (<@${staffId}>). You should recieve a reply shortly.`
      })
    } catch (error) {
      console.log(error);
    }
}

module.exports = new Component({
  customId: "ticket_claim_",
  type: "button",
  /**
   *
   * @param {DiscordBot} client
   * @param {ButtonInteraction} interaction
   */
  run: async (client, interaction) => {
    try {
      // Defer reply immediately to prevent timeout
      await interaction.deferReply({ ephemeral: true });
      const ticketId = interaction.customId.replace("ticket_claim_", "");
      const activeCategoryId = config.tickets.activeTickets;
      
      // Get the ticket before claiming to check if it exists
      const ticket = client.tickets.getTicket(ticketId);

      if (!ticket) {
        await interaction.editReply({
          content: `❌ Ticket \`${ticketId}\` not found.`
        });
        return;
      }

      // Check if ticket is already claimed
      if (ticket.claimed_by) {
        await interaction.editReply({
          content: `❌ Ticket \`${ticketId}\` has already been claimed by <@${ticket.claimed_by}>.`
        });
        return;
      }

      // Claim the ticket
      client.tickets.claimTicket(ticketId, interaction.user.id);
      
      // Refresh ticket data after claiming
      const updatedTicket = client.tickets.getTicket(ticketId);

      const initChannelIds = {
        ingame: config.tickets.ingameReports,
        discord: config.tickets.discordReports,
        mods: config.tickets.contactMods,
        officers: config.tickets.contactOfficers,
        admins: config.tickets.contactAdmins,
        owner: config.tickets.contactOwner
      };

      // Get the ticket type from the ticket object
      const ticketType = updatedTicket.ticket_type.split("-")[1];
      const initChannelId = initChannelIds[ticketType];
      
      if (!initChannelId) {
        await interaction.editReply({
          content: `❌ Invalid ticket type: ${ticketType}`
        });
        return;
      }

      const initChannel = client.channels.cache.get(initChannelId);
      
      if (!initChannel) {
        await interaction.editReply({
          content: `❌ Channel not found for ticket type: ${ticketType}`
        });
        return;
      }

      // Update the original message to show it's been claimed
      await updateInitMsg(updatedTicket.init_msg_id, interaction.user.id, updatedTicket.user_id, updatedTicket.subject, initChannel, ticketId);
      
      // Create the ticket channel
      const ticketChannel = await createTicketChannel(interaction, updatedTicket, activeCategoryId);

      if (ticketChannel) {
        // Update ticket with channel ID
        client.tickets.addChannelId(ticketId, ticketChannel.id);

        await interaction.editReply({
          content: `✅ You claimed ticket \`${ticketId}\` and created ${ticketChannel}`
        });
      } else {
        await interaction.editReply({
          content: `✅ You claimed ticket \`${ticketId}\` but the system failed to create the channel.`
        });
      }

      // Notify user
      await dmUser(client, ticket.user_id, interaction.user.id, ticketId);

    } catch (error) {
      console.error('Error in ticket claim:', error);
      
      // Try to respond with an error message
      try {
        if (interaction.deferred) {
          await interaction.editReply({
            content: `❌ Failed to claim ticket: ${error.message}`
          });
        } else {
          await interaction.reply({
            content: `❌ Failed to claim ticket: ${error.message}`,
            ephemeral: true
          });
        }
      } catch (replyError) {
        console.error('Failed to send error message:', replyError);
      }
    }
  },
}).toJSON();