import TelegramBot from 'node-telegram-bot-api';
import { pool } from './db';

const token = process.env.TELEGRAM_BOT_TOKEN;
export const bot = token ? new TelegramBot(token, { polling: true }) : null;

// Track chats that are waiting for the user to type their username
const waitingForUsername = new Map<number, boolean>();

if (bot) {
    // Graceful shutdown to prevent ETELEGRAM 409 Conflict when ts-node-dev restarts
    const stopBot = async () => {
        try {
            await bot.stopPolling({ cancel: true });
        } catch (err) {
            // Ignore errors during shutdown
        }
    };
    process.once('SIGINT', stopBot);
    process.once('SIGTERM', stopBot);
    process.once('SIGUSR2', stopBot);

    // Helper function to handle the database linking logic
    const linkTelegramAccount = async (chatId: number, boardlyxIdentifier: string, telegramUsername: string | null) => {
        try {
            // Support linking by either the strict UUID (id) OR the username
            const isUuid = boardlyxIdentifier.length === 36 && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(boardlyxIdentifier);

            let query = '';
            if (isUuid) {
                query = 'UPDATE users SET telegram_chat_id = $1, telegram_username = $2 WHERE id = $3 RETURNING id';
            } else {
                query = 'UPDATE users SET telegram_chat_id = $1, telegram_username = $2 WHERE username = $3 RETURNING id';
            }

            const result = await pool.query(query, [chatId.toString(), telegramUsername, boardlyxIdentifier]);

            if (result.rowCount === 0) {
                bot.sendMessage(chatId, `User "${boardlyxIdentifier}" not found. Please ensure you typed your exact BoardlyX username.`);
                // Keep them in the waiting state to try again
                waitingForUsername.set(chatId, true);
            } else {
                bot.sendMessage(chatId, 'Successfully linked your Telegram account to BoardlyX! You will now receive notifications here.');
                // Successfully linked, remove from waiting state
                waitingForUsername.delete(chatId);
            }
        } catch (err) {
            console.error('Error linking telegram account:', err);
            bot.sendMessage(chatId, 'An error occurred while linking your account. Please try again later.');
            waitingForUsername.delete(chatId);
        }
    };

    // The optional (?) makes it trigger even if they just type "/start" with no parameters
    bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
        const chatId = msg.chat.id;
        const boardlyxIdentifier = match && match[1] ? match[1].trim() : null;
        const telegramUsername = msg.chat.username || msg.from?.username || null;

        console.log(`[Telegram Debug] Parsed /start command. Extracted payload: "${boardlyxIdentifier}"`);

        if (!boardlyxIdentifier) {
            // They just typed /start. Ask them for their username.
            waitingForUsername.set(chatId, true);
            bot.sendMessage(chatId, 'Welcome to BoardlyX Notifications!\n\nPlease reply with your **BoardlyX Username** to link your accounts.', { parse_mode: 'Markdown' });
            return;
        }

        // They provided a payload (e.g., via deep link)
        waitingForUsername.delete(chatId); // Clear state just in case
        await linkTelegramAccount(chatId, boardlyxIdentifier, telegramUsername);
    });

    bot.onText(/\/unlink/, async (msg) => {
        const chatId = msg.chat.id;
        try {
            const result = await pool.query(
                'UPDATE users SET telegram_chat_id = NULL, telegram_username = NULL WHERE telegram_chat_id = $1 RETURNING id',
                [chatId.toString()]
            );
            if (result.rowCount && result.rowCount > 0) {
                bot.sendMessage(chatId, 'Your Telegram account has been successfully unlinked from BoardlyX.');
            } else {
                bot.sendMessage(chatId, 'This Telegram account is not currently linked to any BoardlyX profile.');
            }
        } catch (err) {
            console.error('Error unlinking telegram account:', err);
            bot.sendMessage(chatId, 'An error occurred while unlinking your account. Please try again later.');
        }
    });

    // Listen to all messages
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text?.trim();

        // If this chat is waiting for a username, and the message isn't a command
        if (waitingForUsername.get(chatId) && text && !text.startsWith('/')) {
            const telegramUsername = msg.chat.username || msg.from?.username || null;
            console.log(`[Telegram] User in chat ${chatId} provided username manually: ${text}`);

            // Temporarily un-wait them so they can't double-submit while processing
            waitingForUsername.delete(chatId);

            await linkTelegramAccount(chatId, text, telegramUsername);
        }
    });

    console.log('Telegram bot service initialized and polling for updates.');
} else {
    console.warn('TELEGRAM_BOT_TOKEN is not set. Telegram bot notifications are disabled.');
}

/**
 * Sends a notification to all members of a conversation (except the sender) who have linked their Telegram account
 */
export async function notifyConversationMembers(
    conversationId: string,
    senderId: string,
    senderName: string,
    content: string
) {
    if (!bot) {
        console.warn('notifyConversationMembers: Bot not initialized');
        return;
    }

    try {
        console.log(`[Telegram] Notifying members for conversation: ${conversationId}, Sender: ${senderId}`);
        const { rows } = await pool.query(
            `
      SELECT u.telegram_chat_id 
      FROM conversation_members cm
      JOIN users u ON cm.user_id = u.id
      WHERE cm.conversation_id = $1 
        AND cm.user_id != $2 
        AND u.telegram_chat_id IS NOT NULL
      `,
            [conversationId, senderId]
        );

        console.log(`[Telegram] Found ${rows.length} users to notify`);

        for (const row of rows) {
            const chatId = row.telegram_chat_id;
            if (chatId) {
                const messageText = `New message from ${senderName}:\n${content}`;
                console.log(`[Telegram] Sending message to Chat ID: ${chatId}`);
                bot.sendMessage(chatId, messageText).catch(err => {
                    console.error(`Failed to send telegram message to chat ID ${chatId}:`, err);
                });
            }
        }
    } catch (err) {
        console.error('Error notifying conversation members via Telegram:', err);
    }
}

/**
 * Sends a notification to all members of a team (except the sender) who have linked their Telegram account
 */
export async function notifyTeamMembersOfTask(
    teamId: string,
    teamName: string,
    senderId: string,
    senderName: string,
    taskTitle: string
) {
    if (!bot) {
        console.warn('notifyTeamMembersOfTask: Bot not initialized');
        return;
    }

    try {
        console.log(`[Telegram] Notifying members for new task in team: ${teamId}, Sender: ${senderId}`);
        const { rows } = await pool.query(
            `
      SELECT u.telegram_chat_id 
      FROM team_members tm
      JOIN users u ON tm.user_id = u.id
      WHERE tm.team_id = $1 
        AND tm.user_id != $2 
        AND u.telegram_chat_id IS NOT NULL
      `,
            [teamId, senderId]
        );

        console.log(`[Telegram] Found ${rows.length} users to notify for new task`);

        for (const row of rows) {
            const chatId = row.telegram_chat_id;
            if (chatId) {
                const messageText = `🆕 New Task created in *${teamName}* by ${senderName}:\n\n*${taskTitle}*`;
                console.log(`[Telegram] Sending new task notification to Chat ID: ${chatId}`);
                bot.sendMessage(chatId, messageText, { parse_mode: 'Markdown' }).catch(err => {
                    console.error(`Failed to send telegram task notification to chat ID ${chatId}:`, err);
                });
            }
        }
    } catch (err) {
        console.error('Error notifying team members of task via Telegram:', err);
    }
}
