const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const config = require("../../config.js");
const {
  ModalSubmitInteraction,
  ComponentType,
  ContainerBuilder,
  TextDisplayBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require(`discord.js`);

// Rate limiting map to prevent spam (user_id -> last_ticket_time)
const ticketCooldown = new Map();
const COOLDOWN_MS = 60000; // 1 minute cooldown

async function sendInitMsg(client, ticket_id, type, user_id, subject) {
  const reportChannels = {
    contact_mods: config.tickets.contactMods,
    contact_officers: config.tickets.contactOfficers,
    contact_admins: config.tickets.contactAdmins,
    contact_owner: config.tickets.contactOwner
  };
  
  const channelId = reportChannels[type];
  if (!channelId) {
    throw new Error(`No channel configured for type: ${type}`);
  }

  const channel = client.channels.cache.get(channelId);
  if (!channel) {
    throw new Error(`Channel not found: ${channelId}`);
  }

  const mainContainer = new ContainerBuilder();
  const text1 = new TextDisplayBuilder().setContent(
    `### Incoming Ticket\n**Created by**: <@${user_id}>\n**Subject**:\n\`\`\`${subject}\`\`\`\n\n**Claimed by**: Nobody`
  );
  mainContainer.addTextDisplayComponents(text1);
  
  const claimButton = new ButtonBuilder()
    .setLabel('Claim')
    .setStyle(ButtonStyle.Success)
    .setCustomId(`ticket_claim_${ticket_id}`);
  const claimRow = new ActionRowBuilder().addComponents(claimButton);
  mainContainer.addActionRowComponents(claimRow);

  const msg = await channel.send({
    flags: MessageFlags.IsComponentsV2,
    components: [mainContainer],
  });

  return msg.id;
}

async function handleTicketSubmission(client, subject, body, type, userId) {
  try {
    // Check rate limiting
    const now = Date.now();
    const lastTicketTime = ticketCooldown.get(userId);
    if (lastTicketTime && (now - lastTicketTime) < COOLDOWN_MS) {
      const remainingTime = Math.ceil((COOLDOWN_MS - (now - lastTicketTime)) / 1000);
      return {
        success: false,
        message: ` | Please wait ${remainingTime} seconds before creating another ticket.`
      };
    }

    // Test DM capability first
    let user;
    try {
      user = await client.users.fetch(userId);
      // Send a simple test message that we can delete
      const testMsg = await user.send({ content: "Creating your ticket..." });
      await testMsg.delete().catch(() => {}); // Ignore deletion errors
    } catch (error) {
      console.log(`User ${userId} has DMs disabled`);
      return {
        success: false,
        message: " | Please enable DMs from server members to create tickets."
      };
    }

    // Create database entry
    const ticket_id = client.tickets.createTicket(
      userId,
      `contact-${type.replace('contact_', '')}`,
      "mod",
      subject,
      body
    );

    // Validate ticket creation
    if (!ticket_id) {
      throw new Error("Failed to create ticket in database");
    }

    // Send initial message to staff channel
    const initMsgId = await sendInitMsg(client, ticket_id, type, userId, subject);

    // Update database with message ID
    client.tickets.addMsgId(ticket_id, initMsgId);

    // Send success DM with final ticket information
    try {
      await user.send({
        content: `> :white_check_mark: | **Ticket created successfully!**\n> **Type**: ${type.replace('contact_', '').toUpperCase()} CONTACT\n> **Subject**: "${subject}"\n> **Ticket ID**: ${ticket_id}\n> You should receive a response within 48 hours.`
      });
    } catch (err) {
      console.warn(`Failed to send success DM to ${userId}:`, err.message);
    }

    // Set rate limiting
    ticketCooldown.set(userId, now);

    return {
      success: true,
      ticketId: ticket_id,
      message: `Ticket #${ticket_id} created successfully! Check your DMs for details.`
    };

  } catch (error) {
    console.error(`Error creating ${type} ticket:`, error);
    return {
      success: false,
      message: `Failed to create ticket. Please try again later or contact a staff member directly.\n\`\`\`${error.message}\`\`\``
    };
  }
}

function validateInput(subject, body) {
  const errors = [];
  
  if (!subject || subject.trim().length < 2) {
    errors.push("Subject must be at least 2 characters long");
  }
  if (subject && subject.length > 90) {
    errors.push("Subject must be less than 90 characters");
  }
  if (!body || body.trim().length < 10) {
    errors.push("Description must be at least 10 characters long");
  }
  if (body && body.length > 1000) {
    errors.push("Description must be less than 1000 characters");
  }
  
  return errors;
}

function getDisplayName(type) {
  const displayNames = {
    contact_mods: "Moderators",
    contact_officers: "Officers", 
    contact_admins: "Administrators",
    contact_owner: "Owner"
  };
  return displayNames[type] || type;
}

module.exports = new Component({
  customId: "ticket_create_contact",
  type: "select",
  /**
   * @param {DiscordBot} client
   * @param {import("discord.js").AnySelectMenuInteraction} interaction
   */
  run: async (client, interaction) => {
    const selectedValue = interaction.values[0];

    if (!["contact_mods", "contact_officers", "contact_admins", "contact_owner"].includes(selectedValue)) {
      await interaction.reply({
        content: "Invalid selection. Please try again.",
        ephemeral: true,
      });
      return;
    }

    const type = selectedValue;
    const modalId = `contact_${type}_submit_${Date.now()}_${interaction.user.id}`;
    const displayName = getDisplayName(type);

    // Create modal with more descriptive placeholders
    const modal = new ModalBuilder()
      .setCustomId(modalId)
      .setTitle(`Creating Ticket: Contact ${displayName}`);

    const subjectInput = new TextInputBuilder()
      .setCustomId('ticket_subject')
      .setLabel('Subject')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder(`Enter a brief summary of your inquiry`)
      .setRequired(true)
      .setMinLength(2)
      .setMaxLength(90);

    const bodyInput = new TextInputBuilder()
      .setCustomId('ticket_body')
      .setLabel('Main Body')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Provide detailed information about your inquiry or issue')
      .setRequired(true)
      .setMinLength(10)
      .setMaxLength(1000);

    const firstRow = new ActionRowBuilder().addComponents(subjectInput);
    const secondRow = new ActionRowBuilder().addComponents(bodyInput);

    modal.addComponents(firstRow, secondRow);

    try {
      await interaction.showModal(modal);

      // Reset select menu after showing modal
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
        return modalInteraction.customId === modalId &&
          modalInteraction.user.id === interaction.user.id;
      };

      const modalSubmission = await interaction.awaitModalSubmit({
        filter,
        time: 300000 // 5 minutes
      });

      await modalSubmission.deferReply({ ephemeral: true });

      // Get and validate form data
      const subject = modalSubmission.fields.getTextInputValue('ticket_subject').trim();
      const body = modalSubmission.fields.getTextInputValue('ticket_body').trim();

      const validationErrors = validateInput(subject, body);
      if (validationErrors.length > 0) {
        await modalSubmission.editReply({
          content: `Please fix the following issues:\n• ${validationErrors.join('\n• ')}`
        });
        return;
      }

      // Handle ticket creation
      const result = await handleTicketSubmission(client, subject, body, type, interaction.user.id);

      const emoji = result.success ? ":white_check_mark:" : ":x:";
      await modalSubmission.editReply({
        content: `${emoji} ${result.message}`
      });

    } catch (error) {
      if (error.code === 'InteractionCollectorError') {
        console.log(`Modal timed out for ${type} contact from user ${interaction.user.id}`);
        return; // User didn't submit in time, no response needed
      }

      console.error('Error handling modal submission:', error);
      
      // Try to send error response
      const errorMessage = ":x: An unexpected error occurred. Please try again or contact staff directly.";
      try {
        if (modalSubmission && (modalSubmission.replied || modalSubmission.deferred)) {
          await modalSubmission.editReply({ content: errorMessage });
        } else if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true });
        }
      } catch (replyError) {
        console.error('Failed to send error response:', replyError);
      }
    }
  },
}).toJSON();