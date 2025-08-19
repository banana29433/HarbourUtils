const {
  ChatInputCommandInteraction,
  ApplicationCommandOptionType,
  MessageFlags,
  TextDisplayBuilder,
  ContainerBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder
} = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const ApplicationCommand = require("../../structure/ApplicationCommand");

const mainContainer = new ContainerBuilder();
const media1 = new MediaGalleryBuilder().addItems([
  {
    media: {
      url: "https://i.ibb.co/20xT88Ty/harbourbannerticketsv2.png",
    },
  },
]);
mainContainer.addMediaGalleryComponents(media1);
const text1 = new TextDisplayBuilder().setContent(
  `## Ticket Creation\nTo create a ticket, navigate to the type of ticket you want to create, then choose a specific type from the dropdown.\n\nWhen creating a ticket, you will be prompted to enter:\n- A subject for your ticket, which should summarise what the ticket is about.\n- A main body for your ticket. Staff can only see the main body of your ticket once they claim it.\n\nAfter your ticket is created, you should recieve an answer from a staff member within 48 hours. You'll recieve replies to your ticket through your DMs, and you'll need to run the command \`/reply\` with your ticket id to respond to the staff member handling your ticket. Once you're done with your ticket, the staff member handling it will prompt you to close it.\n\n**Please note**: You **MUST** have DMs with the bot enabled. You will not be able to send and recieve replies otherwise.`
);
mainContainer.addTextDisplayComponents(text1);
const separator1 = new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large);
mainContainer.addSeparatorComponents(separator1);
const text2 = new TextDisplayBuilder().setContent(
    `### Player Reporting\nAll tickets for reporting players can be created here. Make sure to send a link to your evidence in the body of your ticket. Moderators will not take action if you cannot provide evidence.`
);
mainContainer.addTextDisplayComponents(text2);
const reportingMenu = new StringSelectMenuBuilder()
    .setCustomId('ticket_create_report')
    .setPlaceholder('Select category...')
    .addOptions(
        new StringSelectMenuOptionBuilder()
            .setLabel('Ingame Report')
            .setDescription('Reporting a player on the SCPSL server')
            .setValue('report_ingame'),
        new StringSelectMenuOptionBuilder()
            .setLabel('Discord Report')
            .setDescription('Reporting a user on the Discord server')
            .setValue('report_discord')
    );
const reportingRow = new ActionRowBuilder()
    .addComponents(reportingMenu);
mainContainer.addActionRowComponents(reportingRow);
mainContainer.addSeparatorComponents(separator1);
const text3 = new TextDisplayBuilder().setContent(
    `### Contact Staff\nAll tickets for contacting staff can be created here. Please indicate via the select menu which staff members you want to contact.`
);
mainContainer.addTextDisplayComponents(text3);
const contactMenu = new StringSelectMenuBuilder()
    .setCustomId('ticket_create_contact')
    .setPlaceholder('Select category...')
    .addOptions(
        new StringSelectMenuOptionBuilder()
            .setLabel('Contact Moderators')
            .setDescription('Contact the moderation team')
            .setValue('contact_mods'),
        new StringSelectMenuOptionBuilder()
            .setLabel('Contact Community Officers')
            .setDescription('Contact the community officers')
            .setValue('contact_officers'),
        new StringSelectMenuOptionBuilder()
            .setLabel('Contact Admins')
            .setDescription('Contact the administration team')
            .setValue('contact_admins'),
        new StringSelectMenuOptionBuilder()
            .setLabel('Contact Owner')
            .setDescription('Contact the server owner')
            .setValue('contact_owner')
    );
const contactRow = new ActionRowBuilder()
    .addComponents(contactMenu);
mainContainer.addActionRowComponents(contactRow);

module.exports = new ApplicationCommand({
  command: {
    name: "ticket",
    description: "Ticket creation and management",
    type: 1,
    options: [
      {
        name: "create",
        description: "Create tickets board",
        type: ApplicationCommandOptionType.Subcommand,
      },
    ],
  },
  options: {
    cooldown: 5000,
  },
  /**
   *
   * @param {DiscordBot} client
   * @param {ChatInputCommandInteraction} interaction
   */
  run: async (client, interaction) => {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "create") {
      const channel = interaction.channel;
      channel.send({
        flags: MessageFlags.IsComponentsV2,
        components: [mainContainer],
      });
      await interaction.reply({ content: `Message created`, ephemeral: true });
    }
  },
}).toJSON();
