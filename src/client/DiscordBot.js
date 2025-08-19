const { Client, Collection, Partials } = require("discord.js");
const CommandsHandler = require("./handler/CommandsHandler");
const { warn, error, info, success } = require("../utils/Console");
const config = require("../config");
const CommandsListener = require("./handler/CommandsListener");
const ComponentsHandler = require("./handler/ComponentsHandler");
const ComponentsListener = require("./handler/ComponentsListener");
const EventsHandler = require("./handler/EventsHandler");
const Database = require("better-sqlite3");


function createId() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    
    for (let i = 0; i < 8; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        result += characters[randomIndex];
    }
    
    return result;
}


// ---------------------- TicketManager ----------------------
class TicketManager {
    constructor(dbPath = "tickets.db") {
        this.db = new Database(dbPath);

        // Create tables if not exist
        this.db.prepare(`
            CREATE TABLE IF NOT EXISTS tickets (
                ticket_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                staff_id TEXT,
                ticket_type TEXT NOT NULL,
                access_level TEXT NOT NULL,
                subject TEXT NOT NULL,
                body TEXT NOT NULL,
                init_msg_id TEXT,
                ticket_channel_id TEXT
            )
        `).run();

        this.db.prepare(`
            CREATE TABLE IF NOT EXISTS ticket_messages (
                message_id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticket_id TEXT NOT NULL,
                sender_id TEXT NOT NULL,
                sent_by TEXT CHECK(sent_by IN ('staff', 'user')) NOT NULL,
                message TEXT NOT NULL,
                close_prompt INTEGER DEFAULT 0 CHECK(close_prompt IN (0,1)),
                FOREIGN KEY(ticket_id) REFERENCES tickets(ticket_id) ON DELETE CASCADE
            )
        `).run();
    }

    // Create a new ticket
    createTicket(user_id, ticket_type, access_level, subject, body) {
        const ticket_id = createId();
        this.db.prepare(`
            INSERT INTO tickets (ticket_id, user_id, ticket_type, access_level, subject, body)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(ticket_id, user_id, ticket_type, access_level, subject, body);

        return ticket_id;
    }

    // Get ticket info
    getTicket(ticket_id) {
        return this.db.prepare(`
            SELECT * FROM tickets WHERE ticket_id = ?
        `).get(ticket_id);
    }

    // Get messages for a ticket
    getMessages(ticket_id) {
        return this.db.prepare(`
            SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY message_id ASC
        `).all(ticket_id);
    }

    // Assign staff to ticket
    claimTicket(ticket_id, staff_id) {
        this.db.prepare(`
            UPDATE tickets SET staff_id = ? WHERE ticket_id = ?
        `).run(staff_id, ticket_id);
    }

    // Add message from user
    addMessageUser(ticket_id, msg) {
        const ticket = this.getTicket(ticket_id);
        if (!ticket) throw new Error("Ticket not found");

        this.db.prepare(`
            INSERT INTO ticket_messages (ticket_id, sender_id, sent_by, message, close_prompt)
            VALUES (?, ?, 'user', ?, 0)
        `).run(ticket_id, ticket.user_id, msg);
    }

    // Add message from staff
    addMessageStaff(ticket_id, msg, prompt = false) {
        const ticket = this.getTicket(ticket_id);
        if (!ticket || !ticket.staff_id) throw new Error("Ticket not found or unclaimed");

        this.db.prepare(`
            INSERT INTO ticket_messages (ticket_id, sender_id, sent_by, message, close_prompt)
            VALUES (?, ?, 'staff', ?, ?)
        `).run(ticket_id, ticket.staff_id, msg, prompt ? 1 : 0);
    }

    // Transfer ticket to new access level and unclaim staff
    transferTicket(ticket_id, access_level) {
        this.db.prepare(`
            UPDATE tickets SET access_level = ?, staff_id = NULL WHERE ticket_id = ?
        `).run(access_level, ticket_id);
    }

    // Get most recent message for a ticket
    getRecentMsg(ticket_id) {
        return this.db.prepare(`
            SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY message_id DESC LIMIT 1
        `).get(ticket_id);
    }

    // Add message ID to ticket
    addMsgId(ticket_id, init_msg_id) {
        this.db.prepare(`
        UPDATE tickets SET init_msg_id = ? WHERE ticket_id = ?
    `).run(init_msg_id, ticket_id);
    }

    // Add channel ID to ticket
    addChannelId(ticket_id, ticket_channel_id) {
        this.db.prepare(`
        UPDATE tickets SET ticket_channel_id = ? WHERE ticket_id = ?
    `).run(ticket_channel_id, ticket_id);
    }
}

// ---------------------- DiscordBot ----------------------
class DiscordBot extends Client {
    collection = {
        application_commands: new Collection(),
        message_commands: new Collection(),
        message_commands_aliases: new Collection(),
        components: {
            buttons: new Collection(),
            selects: new Collection(),
            modals: new Collection(),
            autocomplete: new Collection()
        }
    }
    rest_application_commands_array = [];
    login_attempts = 0;
    login_timestamp = 0;
    statusMessages = [
        { name: 'watching you', type: 4 },
        { name: 'watching banana', type: 4 },
        { name: 'watching tickets', type: 4 }
    ];

    commands_handler = new CommandsHandler(this);
    components_handler = new ComponentsHandler(this);
    events_handler = new EventsHandler(this);

    // add ticket manager instance
    tickets = new TicketManager();

    constructor() {
        super({
            intents: 3276799,
            partials: [
                Partials.Channel,
                Partials.GuildMember,
                Partials.Message,
                Partials.Reaction,
                Partials.User
            ],
            presence: {
                activities: [{
                    name: 'keep this empty',
                    type: 4,
                    state: 'Banana\'s Harbour'
                }]
            }
        });
        
        new CommandsListener(this);
        new ComponentsListener(this);
    }

    startStatusRotation = () => {
        let index = 0;
        setInterval(() => {
            this.user.setPresence({ activities: [this.statusMessages[index]] });
            index = (index + 1) % this.statusMessages.length;
        }, 4000);
    }

    connect = async () => {
        warn(`Attempting to connect to the Discord bot... (${this.login_attempts + 1})`);

        this.login_timestamp = Date.now();

        try {
            await this.login(process.env.CLIENT_TOKEN);
            this.commands_handler.load();
            this.components_handler.load();
            this.events_handler.load();
            this.startStatusRotation();

            warn('Attempting to register application commands... (this might take a while!)');
            await this.commands_handler.registerApplicationCommands(config.development);
            success('Successfully registered application commands. For specific guild? ' + (config.development.enabled ? 'Yes' : 'No'));
        } catch (err) {
            error('Failed to connect to the Discord bot, retrying...');
            error(err);
            this.login_attempts++;
            setTimeout(this.connect, 5000);
        }
    }
}

module.exports = DiscordBot;
