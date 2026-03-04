"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bot = void 0;
exports.notifyConversationMembers = notifyConversationMembers;
exports.notifyTeamMembersOfTask = notifyTeamMembersOfTask;
exports.notifyTaskUpdated = notifyTaskUpdated;
exports.notifyMentionedUsernames = notifyMentionedUsernames;
exports.notifyRepliedUser = notifyRepliedUser;
const node_telegram_bot_api_1 = __importDefault(require("node-telegram-bot-api"));
const db_1 = require("./db");
const token = process.env.TELEGRAM_BOT_TOKEN;
exports.bot = token ? new node_telegram_bot_api_1.default(token, { polling: true }) : null;
// Track chats that are waiting for the user to type their username
const waitingForUsername = new Map();
if (exports.bot) {
    // Graceful shutdown to prevent ETELEGRAM 409 Conflict when ts-node-dev restarts
    const stopBot = async () => {
        try {
            await exports.bot.stopPolling({ cancel: true });
        }
        catch (err) {
            // Ignore errors during shutdown
        }
    };
    process.once('SIGINT', stopBot);
    process.once('SIGTERM', stopBot);
    process.once('SIGUSR2', stopBot);
    // Helper function to handle the database linking logic
    const linkTelegramAccount = async (chatId, boardlyxIdentifier, telegramUsername) => {
        try {
            // Support linking by either the strict UUID (id) OR the username
            const isUuid = boardlyxIdentifier.length === 36 && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(boardlyxIdentifier);
            let query = '';
            if (isUuid) {
                query = 'UPDATE users SET telegram_chat_id = $1, telegram_username = $2 WHERE id = $3 RETURNING id';
            }
            else {
                query = 'UPDATE users SET telegram_chat_id = $1, telegram_username = $2 WHERE username = $3 RETURNING id';
            }
            const result = await db_1.pool.query(query, [chatId.toString(), telegramUsername, boardlyxIdentifier]);
            if (result.rowCount === 0) {
                exports.bot.sendMessage(chatId, `User "${boardlyxIdentifier}" not found. Please ensure you typed your exact BoardlyX username.`);
                // Keep them in the waiting state to try again
                waitingForUsername.set(chatId, true);
            }
            else {
                exports.bot.sendMessage(chatId, 'Successfully linked your Telegram account to BoardlyX! You will now receive notifications here.');
                // Successfully linked, remove from waiting state
                waitingForUsername.delete(chatId);
            }
        }
        catch (err) {
            console.error('Error linking telegram account:', err);
            exports.bot.sendMessage(chatId, 'An error occurred while linking your account. Please try again later.');
            waitingForUsername.delete(chatId);
        }
    };
    // The optional (?) makes it trigger even if they just type "/start" with no parameters
    exports.bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
        const chatId = msg.chat.id;
        const boardlyxIdentifier = match && match[1] ? match[1].trim() : null;
        const telegramUsername = msg.chat.username || msg.from?.username || null;
        console.log(`[Telegram Debug] Parsed /start command. Extracted payload: "${boardlyxIdentifier}"`);
        if (!boardlyxIdentifier) {
            // They just typed /start. Ask them for their username.
            waitingForUsername.set(chatId, true);
            exports.bot.sendMessage(chatId, 'Welcome to BoardlyX Notifications!\n\nPlease reply with your **BoardlyX Username** to link your accounts.', { parse_mode: 'Markdown' });
            return;
        }
        // They provided a payload (e.g., via deep link)
        waitingForUsername.delete(chatId); // Clear state just in case
        await linkTelegramAccount(chatId, boardlyxIdentifier, telegramUsername);
    });
    exports.bot.onText(/\/unlink/, async (msg) => {
        const chatId = msg.chat.id;
        try {
            const result = await db_1.pool.query('UPDATE users SET telegram_chat_id = NULL, telegram_username = NULL WHERE telegram_chat_id = $1 RETURNING id', [chatId.toString()]);
            if (result.rowCount && result.rowCount > 0) {
                exports.bot.sendMessage(chatId, 'Your Telegram account has been successfully unlinked from BoardlyX.');
            }
            else {
                exports.bot.sendMessage(chatId, 'This Telegram account is not currently linked to any BoardlyX profile.');
            }
        }
        catch (err) {
            console.error('Error unlinking telegram account:', err);
            exports.bot.sendMessage(chatId, 'An error occurred while unlinking your account. Please try again later.');
        }
    });
    // Listen to all messages
    exports.bot.on('message', async (msg) => {
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
}
else {
    console.warn('TELEGRAM_BOT_TOKEN is not set. Telegram bot notifications are disabled.');
}
/**
 * Sends a notification to all members of a conversation (except the sender) who have linked their Telegram account
 */
async function notifyConversationMembers(conversationId, senderId, senderName, content, excludeIds = []) {
    if (!exports.bot) {
        console.warn('notifyConversationMembers: Bot not initialized');
        return;
    }
    try {
        console.log(`[Telegram] Notifying members for conversation: ${conversationId}, Sender: ${senderId}`);
        const { rows } = await db_1.pool.query(`
      SELECT u.id as user_id, u.telegram_chat_id 
      FROM conversation_members cm
      JOIN users u ON cm.user_id = u.id
      WHERE cm.conversation_id = $1 
        AND cm.user_id != $2 
        AND u.telegram_chat_id IS NOT NULL
      `, [conversationId, senderId]);
        console.log(`[Telegram] Found ${rows.length} users to potentially notify`);
        for (const row of rows) {
            if (excludeIds.includes(row.user_id))
                continue;
            const chatId = row.telegram_chat_id;
            if (chatId) {
                const messageText = `New message from ${senderName}:\n${content}`;
                console.log(`[Telegram] Sending message to Chat ID: ${chatId}`);
                exports.bot.sendMessage(chatId, messageText).catch(err => {
                    console.error(`Failed to send telegram message to chat ID ${chatId}:`, err);
                });
            }
        }
    }
    catch (err) {
        console.error('Error notifying conversation members via Telegram:', err);
    }
}
/**
 * Sends a notification to all members of a team (except the sender) who have linked their Telegram account
 */
async function notifyTeamMembersOfTask(teamId, teamName, senderId, senderName, taskTitle, assigneeIds = []) {
    if (!exports.bot) {
        console.warn('notifyTeamMembersOfTask: Bot not initialized');
        return;
    }
    try {
        console.log(`[Telegram] Notifying members for new task in team: ${teamId}, Sender: ${senderId}`);
        const { rows } = await db_1.pool.query(`
      SELECT u.id as user_id, u.telegram_chat_id 
      FROM team_members tm
      JOIN users u ON tm.user_id = u.id
      WHERE tm.team_id = $1 
        AND tm.user_id != $2 
        AND u.telegram_chat_id IS NOT NULL
      `, [teamId, senderId]);
        console.log(`[Telegram] Found ${rows.length} users to notify for new task`);
        for (const row of rows) {
            const chatId = row.telegram_chat_id;
            if (chatId) {
                const isAssigned = assigneeIds.includes(row.user_id);
                const messageText = isAssigned
                    ? `🆕 New Task **assigned to you** in *${teamName}* by ${senderName}:\n\n*${taskTitle}*`
                    : `🆕 New Task created in *${teamName}* by ${senderName}:\n\n*${taskTitle}*`;
                console.log(`[Telegram] Sending new task notification to Chat ID: ${chatId}`);
                exports.bot.sendMessage(chatId, messageText, { parse_mode: 'Markdown' }).catch(err => {
                    console.error(`Failed to send telegram task notification to chat ID ${chatId}:`, err);
                });
            }
        }
    }
    catch (err) {
        console.error('Error notifying team members of task via Telegram:', err);
    }
}
/**
 * Sends a notification to team members when a task is updated
 */
async function notifyTaskUpdated(teamId, teamName, senderId, senderName, taskTitle, updatesDescription, assigneeIds = []) {
    if (!exports.bot)
        return;
    try {
        const { rows } = await db_1.pool.query(`
      SELECT u.id as user_id, u.telegram_chat_id 
      FROM team_members tm
      JOIN users u ON tm.user_id = u.id
      WHERE tm.team_id = $1 
        AND tm.user_id != $2 
        AND u.telegram_chat_id IS NOT NULL
      `, [teamId, senderId]);
        for (const row of rows) {
            const chatId = row.telegram_chat_id;
            if (chatId) {
                const isAssigned = assigneeIds.includes(row.user_id);
                const assignedText = isAssigned ? ` (Assigned to you)` : ``;
                const messageText = `📝 Task "${taskTitle}"${assignedText} was updated by ${senderName} in ${teamName}.\n\nUpdates:\n${updatesDescription}`;
                exports.bot.sendMessage(chatId, messageText).catch(err => {
                    console.error(`Failed to send telegram task update to chat ID ${chatId}:`, err);
                });
            }
        }
    }
    catch (err) {
        console.error('Error sending task update notification:', err);
    }
}
/**
 * Targeted notification for mentions
 * Returns the list of UUIDs that were successfully found and notified
 */
async function notifyMentionedUsernames(usernames, conversationId, senderName, content) {
    if (!exports.bot || usernames.length === 0)
        return [];
    try {
        // Find users in the conversation who have these usernames and have telegram linked
        const { rows } = await db_1.pool.query(`
      SELECT u.id as user_id, u.telegram_chat_id 
      FROM conversation_members cm
      JOIN users u ON cm.user_id = u.id
      WHERE cm.conversation_id = $1 
        AND u.username = ANY($2::text[])
        AND u.telegram_chat_id IS NOT NULL
      `, [conversationId, usernames]);
        const notifiedIds = [];
        for (const row of rows) {
            const chatId = row.telegram_chat_id;
            if (chatId) {
                const messageText = `🔔 You were mentioned by ${senderName}:\n${content}`;
                exports.bot.sendMessage(chatId, messageText).catch(err => {
                    console.error(`Failed to send targeted mention ping to chat ID ${chatId}:`, err);
                });
                notifiedIds.push(row.user_id);
            }
        }
        return notifiedIds;
    }
    catch (err) {
        console.error('Error sending mention notifications:', err);
        return [];
    }
}
/**
 * Targeted notification for replies
 * Returns the UUID of the replied user if they were found and notified
 */
async function notifyRepliedUser(replyToMessageId, senderName, content) {
    if (!exports.bot)
        return null;
    try {
        // Find the original message author
        const { rows } = await db_1.pool.query(`
      SELECT u.id as user_id, u.telegram_chat_id 
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.id = $1 
        AND u.telegram_chat_id IS NOT NULL
      `, [replyToMessageId]);
        if (rows.length === 0)
            return null;
        const row = rows[0];
        const chatId = row.telegram_chat_id;
        if (chatId) {
            const messageText = `💬 ${senderName} replied to your message:\n${content}`;
            exports.bot.sendMessage(chatId, messageText).catch(err => {
                console.error(`Failed to send targeted reply ping to chat ID ${chatId}:`, err);
            });
            return row.user_id;
        }
        return null;
    }
    catch (err) {
        console.error('Error sending reply notification:', err);
        return null;
    }
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiL1ZvbHVtZXMvQWFkaXR5YSdzIFNTRC9EZXZlbG9wbWVudC9ib2FyZGx5WC1iYWNrZW5kL3NyYy90ZWxlZ3JhbUJvdC50cyIsInNvdXJjZXMiOlsiL1ZvbHVtZXMvQWFkaXR5YSdzIFNTRC9EZXZlbG9wbWVudC9ib2FyZGx5WC1iYWNrZW5kL3NyYy90ZWxlZ3JhbUJvdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7QUFvSEEsOERBMkNDO0FBS0QsMERBOENDO0FBS0QsOENBdUNDO0FBTUQsNERBd0NDO0FBTUQsOENBc0NDO0FBeFZELGtGQUFnRDtBQUNoRCw2QkFBNEI7QUFFNUIsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQztBQUNoQyxRQUFBLEdBQUcsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUksK0JBQVcsQ0FBQyxLQUFLLEVBQUUsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO0FBRTVFLG1FQUFtRTtBQUNuRSxNQUFNLGtCQUFrQixHQUFHLElBQUksR0FBRyxFQUFtQixDQUFDO0FBRXRELElBQUksV0FBRyxFQUFFLENBQUM7SUFDTixnRkFBZ0Y7SUFDaEYsTUFBTSxPQUFPLEdBQUcsS0FBSyxJQUFJLEVBQUU7UUFDdkIsSUFBSSxDQUFDO1lBQ0QsTUFBTSxXQUFHLENBQUMsV0FBVyxDQUFDLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFDNUMsQ0FBQztRQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7WUFDWCxnQ0FBZ0M7UUFDcEMsQ0FBQztJQUNMLENBQUMsQ0FBQztJQUNGLE9BQU8sQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQ2hDLE9BQU8sQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQ2pDLE9BQU8sQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLE9BQU8sQ0FB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S0FBSyxDQUM3Qjs7Ozs7O09BTUwsRUFDSyxDQUFDLGdCQUFnQixDQUFDLENBQ3JCLENBQUM7UUFFRixJQUFJLElBQUksQ0FBQyxNQUFNLEtBQUssQ0FBQztZQUFFLE9BQU8sSUFBSSxDQUFDO1FBRW5DLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNwQixNQUFNLE1BQU0sR0FBRyxHQUFHLENBQUMsZ0JBQWdCLENBQUM7UUFFcEMsSUFBSSxNQUFNLEVBQUUsQ0FBQztZQUNULE1BQU0sV0FBVyxHQUFHLE1BQU0sVUFBVSw4QkFBOEIsT0FBTyxFQUFFLENBQUM7WUFDNUUsV0FBRyxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsV0FBVyxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxFQUFFO2dCQUM3QyxPQUFPLENBQUMsS0FBSyxDQUFDLGlEQUFpRCxNQUFNLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUNuRixDQUFDLENBQUMsQ0FBQztZQUNILE9BQU8sR0FBRyxDQUFDLE9BQU8sQ0FBQztRQUN2QixDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUM7SUFDaEIsQ0FBQztJQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7UUFDWCxPQUFPLENBQUMsS0FBSyxDQUFDLG1DQUFtQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ3hELE9BQU8sSUFBSSxDQUFDO0lBQ2hCLENBQUM7QUFDTCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IFRlbGVncmFtQm90IGZyb20gJ25vZGUtdGVsZWdyYW0tYm90LWFwaSc7XG5pbXBvcnQgeyBwb29sIH0gZnJvbSAnLi9kYic7XG5cbmNvbnN0IHRva2VuID0gcHJvY2Vzcy5lbnYuVEVMRUdSQU1fQk9UX1RPS0VOO1xuZXhwb3J0IGNvbnN0IGJvdCA9IHRva2VuID8gbmV3IFRlbGVncmFtQm90KHRva2VuLCB7IHBvbGxpbmc6IHRydWUgfSkgOiBudWxsO1xuXG4vLyBUcmFjayBjaGF0cyB0aGF0IGFyZSB3YWl0aW5nIGZvciB0aGUgdXNlciB0byB0eXBlIHRoZWlyIHVzZXJuYW1lXG5jb25zdCB3YWl0aW5nRm9yVXNlcm5hbWUgPSBuZXcgTWFwPG51bWJlciwgYm9vbGVhbj4oKTtcblxuaWYgKGJvdCkge1xuICAgIC8vIEdyYWNlZnVsIHNodXRkb3duIHRvIHByZXZlbnQgRVRFTEVHUkFNIDQwOSBDb25mbGljdCB3aGVuIHRzLW5vZGUtZGV2IHJlc3RhcnRzXG4gICAgY29uc3Qgc3RvcEJvdCA9IGFzeW5jICgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IGJvdC5zdG9wUG9sbGluZyh7IGNhbmNlbDogdHJ1ZSB9KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAvLyBJZ25vcmUgZXJyb3JzIGR1cmluZyBzaHV0ZG93blxuICAgICAgICB9XG4gICAgfTtcbiAgICBwcm9jZXNzLm9uY2UoJ1NJR0lOVCcsIHN0b3BCb3QpO1xuICAgIHByb2Nlc3Mub25jZSgnU0lHVEVSTScsIHN0b3BCb3QpO1xuICAgIHByb2Nlc3Mub25jZSgnU0lHVVNSMicsIHN0b3BCb3QpO1xuXG4gICAgLy8gSGVscGVyIGZ1bmN0aW9uIHRvIGhhbmRsZSB0aGUgZGF0YWJhc2UgbGlua2luZyBsb2dpY1xuICAgIGNvbnN0IGxpbmtUZWxlZ3JhbUFjY291bnQgPSBhc3luYyAoY2hhdElkOiBudW1iZXIsIGJvYXJkbHl4SWRlbnRpZmllcjogc3RyaW5nLCB0ZWxlZ3JhbVVzZXJuYW1lOiBzdHJpbmcgfCBudWxsKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBTdXBwb3J0IGxpbmtpbmcgYnkgZWl0aGVyIHRoZSBzdHJpY3QgVVVJRCAoaWQpIE9SIHRoZSB1c2VybmFtZVxuICAgICAgICAgICAgY29uc3QgaXNVdWlkID0gYm9hcmRseXhJZGVudGlmaWVyLmxlbmd0aCA9PT0gMzYgJiYgL15bMC05YS1mXXs4fS1bMC05YS1mXXs0fS1bMS01XVswLTlhLWZdezN9LVs4OWFiXVswLTlhLWZdezN9LVswLTlhLWZdezEyfSQvaS50ZXN0KGJvYXJkbHl4SWRlbnRpZmllcik7XG5cbiAgICAgICAgICAgIGxldCBxdWVyeSA9ICcnO1xuICAgICAgICAgICAgaWYgKGlzVXVpZCkge1xuICAgICAgICAgICAgICAgIHF1ZXJ5ID0gJ1VQREFURSB1c2VycyBTRVQgdGVsZWdyYW1fY2hhdF9pZCA9ICQxLCB0ZWxlZ3JhbV91c2VybmFtZSA9ICQyIFdIRVJFIGlkID0gJDMgUkVUVVJOSU5HIGlkJztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcXVlcnkgPSAnVVBEQVRFIHVzZXJzIFNFVCB0ZWxlZ3JhbV9jaGF0X2lkID0gJDEsIHRlbGVncmFtX3VzZXJuYW1lID0gJDIgV0hFUkUgdXNlcm5hbWUgPSAkMyBSRVRVUk5JTkcgaWQnO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBwb29sLnF1ZXJ5KHF1ZXJ5LCBbY2hhdElkLnRvU3RyaW5nKCksIHRlbGVncmFtVXNlcm5hbWUsIGJvYXJkbHl4SWRlbnRpZmllcl0pO1xuXG4gICAgICAgICAgICBpZiAocmVzdWx0LnJvd0NvdW50ID09PSAwKSB7XG4gICAgICAgICAgICAgICAgYm90LnNlbmRNZXNzYWdlKGNoYXRJZCwgYFVzZXIgXCIke2JvYXJkbHl4SWRlbnRpZmllcn1cIiBub3QgZm91bmQuIFBsZWFzZSBlbnN1cmUgeW91IHR5cGVkIHlvdXIgZXhhY3QgQm9hcmRseVggdXNlcm5hbWUuYCk7XG4gICAgICAgICAgICAgICAgLy8gS2VlcCB0aGVtIGluIHRoZSB3YWl0aW5nIHN0YXRlIHRvIHRyeSBhZ2FpblxuICAgICAgICAgICAgICAgIHdhaXRpbmdGb3JVc2VybmFtZS5zZXQoY2hhdElkLCB0cnVlKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgYm90LnNlbmRNZXNzYWdlKGNoYXRJZCwgJ1N1Y2Nlc3NmdWxseSBsaW5rZWQgeW91ciBUZWxlZ3JhbSBhY2NvdW50IHRvIEJvYXJkbHlYISBZb3Ugd2lsbCBub3cgcmVjZWl2ZSBub3RpZmljYXRpb25zIGhlcmUuJyk7XG4gICAgICAgICAgICAgICAgLy8gU3VjY2Vzc2Z1bGx5IGxpbmtlZCwgcmVtb3ZlIGZyb20gd2FpdGluZyBzdGF0ZVxuICAgICAgICAgICAgICAgIHdhaXRpbmdGb3JVc2VybmFtZS5kZWxldGUoY2hhdElkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBsaW5raW5nIHRlbGVncmFtIGFjY291bnQ6JywgZXJyKTtcbiAgICAgICAgICAgIGJvdC5zZW5kTWVzc2FnZShjaGF0SWQsICdBbiBlcnJvciBvY2N1cnJlZCB3aGlsZSBsaW5raW5nIHlvdXIgYWNjb3VudC4gUGxlYXNlIHRyeSBhZ2FpbiBsYXRlci4nKTtcbiAgICAgICAgICAgIHdhaXRpbmdGb3JVc2VybmFtZS5kZWxldGUoY2hhdElkKTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICAvLyBUaGUgb3B0aW9uYWwgKD8pIG1ha2VzIGl0IHRyaWdnZXIgZXZlbiBpZiB0aGV5IGp1c3QgdHlwZSBcIi9zdGFydFwiIHdpdGggbm8gcGFyYW1ldGVyc1xuICAgIGJvdC5vblRleHQoL1xcL3N0YXJ0KD86XFxzKyguKykpPy8sIGFzeW5jIChtc2csIG1hdGNoKSA9PiB7XG4gICAgICAgIGNvbnN0IGNoYXRJZCA9IG1zZy5jaGF0LmlkO1xuICAgICAgICBjb25zdCBib2FyZGx5eElkZW50aWZpZXIgPSBtYXRjaCAmJiBtYXRjaFsxXSA/IG1hdGNoWzFdLnRyaW0oKSA6IG51bGw7XG4gICAgICAgIGNvbnN0IHRlbGVncmFtVXNlcm5hbWUgPSBtc2cuY2hhdC51c2VybmFtZSB8fCBtc2cuZnJvbT8udXNlcm5hbWUgfHwgbnVsbDtcblxuICAgICAgICBjb25zb2xlLmxvZyhgW1RlbGVncmFtIERlYnVnXSBQYXJzZWQgL3N0YXJ0IGNvbW1hbmQuIEV4dHJhY3RlZCBwYXlsb2FkOiBcIiR7Ym9hcmRseXhJZGVudGlmaWVyfVwiYCk7XG5cbiAgICAgICAgaWYgKCFib2FyZGx5eElkZW50aWZpZXIpIHtcbiAgICAgICAgICAgIC8vIFRoZXkganVzdCB0eXBlZCAvc3RhcnQuIEFzayB0aGVtIGZvciB0aGVpciB1c2VybmFtZS5cbiAgICAgICAgICAgIHdhaXRpbmdGb3JVc2VybmFtZS5zZXQoY2hhdElkLCB0cnVlKTtcbiAgICAgICAgICAgIGJvdC5zZW5kTWVzc2FnZShjaGF0SWQsICdXZWxjb21lIHRvIEJvYXJkbHlYIE5vdGlmaWNhdGlvbnMhXFxuXFxuUGxlYXNlIHJlcGx5IHdpdGggeW91ciAqKkJvYXJkbHlYIFVzZXJuYW1lKiogdG8gbGluayB5b3VyIGFjY291bnRzLicsIHsgcGFyc2VfbW9kZTogJ01hcmtkb3duJyB9KTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFRoZXkgcHJvdmlkZWQgYSBwYXlsb2FkIChlLmcuLCB2aWEgZGVlcCBsaW5rKVxuICAgICAgICB3YWl0aW5nRm9yVXNlcm5hbWUuZGVsZXRlKGNoYXRJZCk7IC8vIENsZWFyIHN0YXRlIGp1c3QgaW4gY2FzZVxuICAgICAgICBhd2FpdCBsaW5rVGVsZWdyYW1BY2NvdW50KGNoYXRJZCwgYm9hcmRseXhJZGVudGlmaWVyLCB0ZWxlZ3JhbVVzZXJuYW1lKTtcbiAgICB9KTtcblxuICAgIGJvdC5vblRleHQoL1xcL3VubGluay8sIGFzeW5jIChtc2cpID0+IHtcbiAgICAgICAgY29uc3QgY2hhdElkID0gbXNnLmNoYXQuaWQ7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBwb29sLnF1ZXJ5KFxuICAgICAgICAgICAgICAgICdVUERBVEUgdXNlcnMgU0VUIHRlbGVncmFtX2NoYXRfaWQgPSBOVUxMLCB0ZWxlZ3JhbV91c2VybmFtZSA9IE5VTEwgV0hFUkUgdGVsZWdyYW1fY2hhdF9pZCA9ICQxIFJFVFVSTklORyBpZCcsXG4gICAgICAgICAgICAgICAgW2NoYXRJZC50b1N0cmluZygpXVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGlmIChyZXN1bHQucm93Q291bnQgJiYgcmVzdWx0LnJvd0NvdW50ID4gMCkge1xuICAgICAgICAgICAgICAgIGJvdC5zZW5kTWVzc2FnZShjaGF0SWQsICdZb3VyIFRlbGVncmFtIGFjY291bnQgaGFzIGJlZW4gc3VjY2Vzc2Z1bGx5IHVubGlua2VkIGZyb20gQm9hcmRseVguJyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGJvdC5zZW5kTWVzc2FnZShjaGF0SWQsICdUaGlzIFRlbGVncmFtIGFjY291bnQgaXMgbm90IGN1cnJlbnRseSBsaW5rZWQgdG8gYW55IEJvYXJkbHlYIHByb2ZpbGUuJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgdW5saW5raW5nIHRlbGVncmFtIGFjY291bnQ6JywgZXJyKTtcbiAgICAgICAgICAgIGJvdC5zZW5kTWVzc2FnZShjaGF0SWQsICdBbiBlcnJvciBvY2N1cnJlZCB3aGlsZSB1bmxpbmtpbmcgeW91ciBhY2NvdW50LiBQbGVhc2UgdHJ5IGFnYWluIGxhdGVyLicpO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBMaXN0ZW4gdG8gYWxsIG1lc3NhZ2VzXG4gICAgYm90Lm9uKCdtZXNzYWdlJywgYXN5bmMgKG1zZykgPT4ge1xuICAgICAgICBjb25zdCBjaGF0SWQgPSBtc2cuY2hhdC5pZDtcbiAgICAgICAgY29uc3QgdGV4dCA9IG1zZy50ZXh0Py50cmltKCk7XG5cbiAgICAgICAgLy8gSWYgdGhpcyBjaGF0IGlzIHdhaXRpbmcgZm9yIGEgdXNlcm5hbWUsIGFuZCB0aGUgbWVzc2FnZSBpc24ndCBhIGNvbW1hbmRcbiAgICAgICAgaWYgKHdhaXRpbmdGb3JVc2VybmFtZS5nZXQoY2hhdElkKSAmJiB0ZXh0ICYmICF0ZXh0LnN0YXJ0c1dpdGgoJy8nKSkge1xuICAgICAgICAgICAgY29uc3QgdGVsZWdyYW1Vc2VybmFtZSA9IG1zZy5jaGF0LnVzZXJuYW1lIHx8IG1zZy5mcm9tPy51c2VybmFtZSB8fCBudWxsO1xuICAgICAgICAgICAgY29uc29sZS5sb2coYFtUZWxlZ3JhbV0gVXNlciBpbiBjaGF0ICR7Y2hhdElkfSBwcm92aWRlZCB1c2VybmFtZSBtYW51YWxseTogJHt0ZXh0fWApO1xuXG4gICAgICAgICAgICAvLyBUZW1wb3JhcmlseSB1bi13YWl0IHRoZW0gc28gdGhleSBjYW4ndCBkb3VibGUtc3VibWl0IHdoaWxlIHByb2Nlc3NpbmdcbiAgICAgICAgICAgIHdhaXRpbmdGb3JVc2VybmFtZS5kZWxldGUoY2hhdElkKTtcblxuICAgICAgICAgICAgYXdhaXQgbGlua1RlbGVncmFtQWNjb3VudChjaGF0SWQsIHRleHQsIHRlbGVncmFtVXNlcm5hbWUpO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBjb25zb2xlLmxvZygnVGVsZWdyYW0gYm90IHNlcnZpY2UgaW5pdGlhbGl6ZWQgYW5kIHBvbGxpbmcgZm9yIHVwZGF0ZXMuJyk7XG59IGVsc2Uge1xuICAgIGNvbnNvbGUud2FybignVEVMRUdSQU1fQk9UX1RPS0VOIGlzIG5vdCBzZXQuIFRlbGVncmFtIGJvdCBub3RpZmljYXRpb25zIGFyZSBkaXNhYmxlZC4nKTtcbn1cblxuLyoqXG4gKiBTZW5kcyBhIG5vdGlmaWNhdGlvbiB0byBhbGwgbWVtYmVycyBvZiBhIGNvbnZlcnNhdGlvbiAoZXhjZXB0IHRoZSBzZW5kZXIpIHdobyBoYXZlIGxpbmtlZCB0aGVpciBUZWxlZ3JhbSBhY2NvdW50XG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBub3RpZnlDb252ZXJzYXRpb25NZW1iZXJzKFxuICAgIGNvbnZlcnNhdGlvbklkOiBzdHJpbmcsXG4gICAgc2VuZGVySWQ6IHN0cmluZyxcbiAgICBzZW5kZXJOYW1lOiBzdHJpbmcsXG4gICAgY29udGVudDogc3RyaW5nLFxuICAgIGV4Y2x1ZGVJZHM6IHN0cmluZ1tdID0gW11cbikge1xuICAgIGlmICghYm90KSB7XG4gICAgICAgIGNvbnNvbGUud2Fybignbm90aWZ5Q29udmVyc2F0aW9uTWVtYmVyczogQm90IG5vdCBpbml0aWFsaXplZCcpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgICAgY29uc29sZS5sb2coYFtUZWxlZ3JhbV0gTm90aWZ5aW5nIG1lbWJlcnMgZm9yIGNvbnZlcnNhdGlvbjogJHtjb252ZXJzYXRpb25JZH0sIFNlbmRlcjogJHtzZW5kZXJJZH1gKTtcbiAgICAgICAgY29uc3QgeyByb3dzIH0gPSBhd2FpdCBwb29sLnF1ZXJ5KFxuICAgICAgICAgICAgYFxuICAgICAgU0VMRUNUIHUuaWQgYXMgdXNlcl9pZCwgdS50ZWxlZ3JhbV9jaGF0X2lkIFxuICAgICAgRlJPTSBjb252ZXJzYXRpb25fbWVtYmVycyBjbVxuICAgICAgSk9JTiB1c2VycyB1IE9OIGNtLnVzZXJfaWQgPSB1LmlkXG4gICAgICBXSEVSRSBjbS5jb252ZXJzYXRpb25faWQgPSAkMSBcbiAgICAgICAgQU5EIGNtLnVzZXJfaWQgIT0gJDIgXG4gICAgICAgIEFORCB1LnRlbGVncmFtX2NoYXRfaWQgSVMgTk9UIE5VTExcbiAgICAgIGAsXG4gICAgICAgICAgICBbY29udmVyc2F0aW9uSWQsIHNlbmRlcklkXVxuICAgICAgICApO1xuXG4gICAgICAgIGNvbnNvbGUubG9nKGBbVGVsZWdyYW1dIEZvdW5kICR7cm93cy5sZW5ndGh9IHVzZXJzIHRvIHBvdGVudGlhbGx5IG5vdGlmeWApO1xuXG4gICAgICAgIGZvciAoY29uc3Qgcm93IG9mIHJvd3MpIHtcbiAgICAgICAgICAgIGlmIChleGNsdWRlSWRzLmluY2x1ZGVzKHJvdy51c2VyX2lkKSkgY29udGludWU7XG5cbiAgICAgICAgICAgIGNvbnN0IGNoYXRJZCA9IHJvdy50ZWxlZ3JhbV9jaGF0X2lkO1xuICAgICAgICAgICAgaWYgKGNoYXRJZCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IG1lc3NhZ2VUZXh0ID0gYE5ldyBtZXNzYWdlIGZyb20gJHtzZW5kZXJOYW1lfTpcXG4ke2NvbnRlbnR9YDtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgW1RlbGVncmFtXSBTZW5kaW5nIG1lc3NhZ2UgdG8gQ2hhdCBJRDogJHtjaGF0SWR9YCk7XG4gICAgICAgICAgICAgICAgYm90LnNlbmRNZXNzYWdlKGNoYXRJZCwgbWVzc2FnZVRleHQpLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBzZW5kIHRlbGVncmFtIG1lc3NhZ2UgdG8gY2hhdCBJRCAke2NoYXRJZH06YCwgZXJyKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBub3RpZnlpbmcgY29udmVyc2F0aW9uIG1lbWJlcnMgdmlhIFRlbGVncmFtOicsIGVycik7XG4gICAgfVxufVxuXG4vKipcbiAqIFNlbmRzIGEgbm90aWZpY2F0aW9uIHRvIGFsbCBtZW1iZXJzIG9mIGEgdGVhbSAoZXhjZXB0IHRoZSBzZW5kZXIpIHdobyBoYXZlIGxpbmtlZCB0aGVpciBUZWxlZ3JhbSBhY2NvdW50XG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBub3RpZnlUZWFtTWVtYmVyc09mVGFzayhcbiAgICB0ZWFtSWQ6IHN0cmluZyxcbiAgICB0ZWFtTmFtZTogc3RyaW5nLFxuICAgIHNlbmRlcklkOiBzdHJpbmcsXG4gICAgc2VuZGVyTmFtZTogc3RyaW5nLFxuICAgIHRhc2tUaXRsZTogc3RyaW5nLFxuICAgIGFzc2lnbmVlSWRzOiBzdHJpbmdbXSA9IFtdXG4pIHtcbiAgICBpZiAoIWJvdCkge1xuICAgICAgICBjb25zb2xlLndhcm4oJ25vdGlmeVRlYW1NZW1iZXJzT2ZUYXNrOiBCb3Qgbm90IGluaXRpYWxpemVkJyk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgICBjb25zb2xlLmxvZyhgW1RlbGVncmFtXSBOb3RpZnlpbmcgbWVtYmVycyBmb3IgbmV3IHRhc2sgaW4gdGVhbTogJHt0ZWFtSWR9LCBTZW5kZXI6ICR7c2VuZGVySWR9YCk7XG4gICAgICAgIGNvbnN0IHsgcm93cyB9ID0gYXdhaXQgcG9vbC5xdWVyeShcbiAgICAgICAgICAgIGBcbiAgICAgIFNFTEVDVCB1LmlkIGFzIHVzZXJfaWQsIHUudGVsZWdyYW1fY2hhdF9pZCBcbiAgICAgIEZST00gdGVhbV9tZW1iZXJzIHRtXG4gICAgICBKT0lOIHVzZXJzIHUgT04gdG0udXNlcl9pZCA9IHUuaWRcbiAgICAgIFdIRVJFIHRtLnRlYW1faWQgPSAkMSBcbiAgICAgICAgQU5EIHRtLnVzZXJfaWQgIT0gJDIgXG4gICAgICAgIEFORCB1LnRlbGVncmFtX2NoYXRfaWQgSVMgTk9UIE5VTExcbiAgICAgIGAsXG4gICAgICAgICAgICBbdGVhbUlkLCBzZW5kZXJJZF1cbiAgICAgICAgKTtcblxuICAgICAgICBjb25zb2xlLmxvZyhgW1RlbGVncmFtXSBGb3VuZCAke3Jvd3MubGVuZ3RofSB1c2VycyB0byBub3RpZnkgZm9yIG5ldyB0YXNrYCk7XG5cbiAgICAgICAgZm9yIChjb25zdCByb3cgb2Ygcm93cykge1xuICAgICAgICAgICAgY29uc3QgY2hhdElkID0gcm93LnRlbGVncmFtX2NoYXRfaWQ7XG4gICAgICAgICAgICBpZiAoY2hhdElkKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgaXNBc3NpZ25lZCA9IGFzc2lnbmVlSWRzLmluY2x1ZGVzKHJvdy51c2VyX2lkKTtcbiAgICAgICAgICAgICAgICBjb25zdCBtZXNzYWdlVGV4dCA9IGlzQXNzaWduZWRcbiAgICAgICAgICAgICAgICAgICAgPyBg8J+GlSBOZXcgVGFzayAqKmFzc2lnbmVkIHRvIHlvdSoqIGluICoke3RlYW1OYW1lfSogYnkgJHtzZW5kZXJOYW1lfTpcXG5cXG4qJHt0YXNrVGl0bGV9KmBcbiAgICAgICAgICAgICAgICAgICAgOiBg8J+GlSBOZXcgVGFzayBjcmVhdGVkIGluICoke3RlYW1OYW1lfSogYnkgJHtzZW5kZXJOYW1lfTpcXG5cXG4qJHt0YXNrVGl0bGV9KmA7XG5cbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgW1RlbGVncmFtXSBTZW5kaW5nIG5ldyB0YXNrIG5vdGlmaWNhdGlvbiB0byBDaGF0IElEOiAke2NoYXRJZH1gKTtcbiAgICAgICAgICAgICAgICBib3Quc2VuZE1lc3NhZ2UoY2hhdElkLCBtZXNzYWdlVGV4dCwgeyBwYXJzZV9tb2RlOiAnTWFya2Rvd24nIH0pLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBzZW5kIHRlbGVncmFtIHRhc2sgbm90aWZpY2F0aW9uIHRvIGNoYXQgSUQgJHtjaGF0SWR9OmAsIGVycik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3Igbm90aWZ5aW5nIHRlYW0gbWVtYmVycyBvZiB0YXNrIHZpYSBUZWxlZ3JhbTonLCBlcnIpO1xuICAgIH1cbn1cblxuLyoqXG4gKiBTZW5kcyBhIG5vdGlmaWNhdGlvbiB0byB0ZWFtIG1lbWJlcnMgd2hlbiBhIHRhc2sgaXMgdXBkYXRlZFxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbm90aWZ5VGFza1VwZGF0ZWQoXG4gICAgdGVhbUlkOiBzdHJpbmcsXG4gICAgdGVhbU5hbWU6IHN0cmluZyxcbiAgICBzZW5kZXJJZDogc3RyaW5nLFxuICAgIHNlbmRlck5hbWU6IHN0cmluZyxcbiAgICB0YXNrVGl0bGU6IHN0cmluZyxcbiAgICB1cGRhdGVzRGVzY3JpcHRpb246IHN0cmluZyxcbiAgICBhc3NpZ25lZUlkczogc3RyaW5nW10gPSBbXVxuKSB7XG4gICAgaWYgKCFib3QpIHJldHVybjtcblxuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgcm93cyB9ID0gYXdhaXQgcG9vbC5xdWVyeShcbiAgICAgICAgICAgIGBcbiAgICAgIFNFTEVDVCB1LmlkIGFzIHVzZXJfaWQsIHUudGVsZWdyYW1fY2hhdF9pZCBcbiAgICAgIEZST00gdGVhbV9tZW1iZXJzIHRtXG4gICAgICBKT0lOIHVzZXJzIHUgT04gdG0udXNlcl9pZCA9IHUuaWRcbiAgICAgIFdIRVJFIHRtLnRlYW1faWQgPSAkMSBcbiAgICAgICAgQU5EIHRtLnVzZXJfaWQgIT0gJDIgXG4gICAgICAgIEFORCB1LnRlbGVncmFtX2NoYXRfaWQgSVMgTk9UIE5VTExcbiAgICAgIGAsXG4gICAgICAgICAgICBbdGVhbUlkLCBzZW5kZXJJZF1cbiAgICAgICAgKTtcblxuICAgICAgICBmb3IgKGNvbnN0IHJvdyBvZiByb3dzKSB7XG4gICAgICAgICAgICBjb25zdCBjaGF0SWQgPSByb3cudGVsZWdyYW1fY2hhdF9pZDtcbiAgICAgICAgICAgIGlmIChjaGF0SWQpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBpc0Fzc2lnbmVkID0gYXNzaWduZWVJZHMuaW5jbHVkZXMocm93LnVzZXJfaWQpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGFzc2lnbmVkVGV4dCA9IGlzQXNzaWduZWQgPyBgIChBc3NpZ25lZCB0byB5b3UpYCA6IGBgO1xuICAgICAgICAgICAgICAgIGNvbnN0IG1lc3NhZ2VUZXh0ID0gYPCfk50gVGFzayBcIiR7dGFza1RpdGxlfVwiJHthc3NpZ25lZFRleHR9IHdhcyB1cGRhdGVkIGJ5ICR7c2VuZGVyTmFtZX0gaW4gJHt0ZWFtTmFtZX0uXFxuXFxuVXBkYXRlczpcXG4ke3VwZGF0ZXNEZXNjcmlwdGlvbn1gO1xuXG4gICAgICAgICAgICAgICAgYm90LnNlbmRNZXNzYWdlKGNoYXRJZCwgbWVzc2FnZVRleHQpLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBzZW5kIHRlbGVncmFtIHRhc2sgdXBkYXRlIHRvIGNoYXQgSUQgJHtjaGF0SWR9OmAsIGVycik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3Igc2VuZGluZyB0YXNrIHVwZGF0ZSBub3RpZmljYXRpb246JywgZXJyKTtcbiAgICB9XG59XG5cbi8qKlxuICogVGFyZ2V0ZWQgbm90aWZpY2F0aW9uIGZvciBtZW50aW9uc1xuICogUmV0dXJucyB0aGUgbGlzdCBvZiBVVUlEcyB0aGF0IHdlcmUgc3VjY2Vzc2Z1bGx5IGZvdW5kIGFuZCBub3RpZmllZFxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbm90aWZ5TWVudGlvbmVkVXNlcm5hbWVzKFxuICAgIHVzZXJuYW1lczogc3RyaW5nW10sXG4gICAgY29udmVyc2F0aW9uSWQ6IHN0cmluZyxcbiAgICBzZW5kZXJOYW1lOiBzdHJpbmcsXG4gICAgY29udGVudDogc3RyaW5nXG4pOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gICAgaWYgKCFib3QgfHwgdXNlcm5hbWVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIFtdO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgLy8gRmluZCB1c2VycyBpbiB0aGUgY29udmVyc2F0aW9uIHdobyBoYXZlIHRoZXNlIHVzZXJuYW1lcyBhbmQgaGF2ZSB0ZWxlZ3JhbSBsaW5rZWRcbiAgICAgICAgY29uc3QgeyByb3dzIH0gPSBhd2FpdCBwb29sLnF1ZXJ5KFxuICAgICAgICAgICAgYFxuICAgICAgU0VMRUNUIHUuaWQgYXMgdXNlcl9pZCwgdS50ZWxlZ3JhbV9jaGF0X2lkIFxuICAgICAgRlJPTSBjb252ZXJzYXRpb25fbWVtYmVycyBjbVxuICAgICAgSk9JTiB1c2VycyB1IE9OIGNtLnVzZXJfaWQgPSB1LmlkXG4gICAgICBXSEVSRSBjbS5jb252ZXJzYXRpb25faWQgPSAkMSBcbiAgICAgICAgQU5EIHUudXNlcm5hbWUgPSBBTlkoJDI6OnRleHRbXSlcbiAgICAgICAgQU5EIHUudGVsZWdyYW1fY2hhdF9pZCBJUyBOT1QgTlVMTFxuICAgICAgYCxcbiAgICAgICAgICAgIFtjb252ZXJzYXRpb25JZCwgdXNlcm5hbWVzXVxuICAgICAgICApO1xuXG4gICAgICAgIGNvbnN0IG5vdGlmaWVkSWRzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgICAgIGZvciAoY29uc3Qgcm93IG9mIHJvd3MpIHtcbiAgICAgICAgICAgIGNvbnN0IGNoYXRJZCA9IHJvdy50ZWxlZ3JhbV9jaGF0X2lkO1xuICAgICAgICAgICAgaWYgKGNoYXRJZCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IG1lc3NhZ2VUZXh0ID0gYPCflJQgWW91IHdlcmUgbWVudGlvbmVkIGJ5ICR7c2VuZGVyTmFtZX06XFxuJHtjb250ZW50fWA7XG4gICAgICAgICAgICAgICAgYm90LnNlbmRNZXNzYWdlKGNoYXRJZCwgbWVzc2FnZVRleHQpLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBzZW5kIHRhcmdldGVkIG1lbnRpb24gcGluZyB0byBjaGF0IElEICR7Y2hhdElkfTpgLCBlcnIpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIG5vdGlmaWVkSWRzLnB1c2gocm93LnVzZXJfaWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG5vdGlmaWVkSWRzO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBzZW5kaW5nIG1lbnRpb24gbm90aWZpY2F0aW9uczonLCBlcnIpO1xuICAgICAgICByZXR1cm4gW107XG4gICAgfVxufVxuXG4vKipcbiAqIFRhcmdldGVkIG5vdGlmaWNhdGlvbiBmb3IgcmVwbGllc1xuICogUmV0dXJucyB0aGUgVVVJRCBvZiB0aGUgcmVwbGllZCB1c2VyIGlmIHRoZXkgd2VyZSBmb3VuZCBhbmQgbm90aWZpZWRcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG5vdGlmeVJlcGxpZWRVc2VyKFxuICAgIHJlcGx5VG9NZXNzYWdlSWQ6IHN0cmluZyxcbiAgICBzZW5kZXJOYW1lOiBzdHJpbmcsXG4gICAgY29udGVudDogc3RyaW5nXG4pOiBQcm9taXNlPHN0cmluZyB8IG51bGw+IHtcbiAgICBpZiAoIWJvdCkgcmV0dXJuIG51bGw7XG5cbiAgICB0cnkge1xuICAgICAgICAvLyBGaW5kIHRoZSBvcmlnaW5hbCBtZXNzYWdlIGF1dGhvclxuICAgICAgICBjb25zdCB7IHJvd3MgfSA9IGF3YWl0IHBvb2wucXVlcnkoXG4gICAgICAgICAgICBgXG4gICAgICBTRUxFQ1QgdS5pZCBhcyB1c2VyX2lkLCB1LnRlbGVncmFtX2NoYXRfaWQgXG4gICAgICBGUk9NIG1lc3NhZ2VzIG1cbiAgICAgIEpPSU4gdXNlcnMgdSBPTiBtLnNlbmRlcl9pZCA9IHUuaWRcbiAgICAgIFdIRVJFIG0uaWQgPSAkMSBcbiAgICAgICAgQU5EIHUudGVsZWdyYW1fY2hhdF9pZCBJUyBOT1QgTlVMTFxuICAgICAgYCxcbiAgICAgICAgICAgIFtyZXBseVRvTWVzc2FnZUlkXVxuICAgICAgICApO1xuXG4gICAgICAgIGlmIChyb3dzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XG5cbiAgICAgICAgY29uc3Qgcm93ID0gcm93c1swXTtcbiAgICAgICAgY29uc3QgY2hhdElkID0gcm93LnRlbGVncmFtX2NoYXRfaWQ7XG5cbiAgICAgICAgaWYgKGNoYXRJZCkge1xuICAgICAgICAgICAgY29uc3QgbWVzc2FnZVRleHQgPSBg8J+SrCAke3NlbmRlck5hbWV9IHJlcGxpZWQgdG8geW91ciBtZXNzYWdlOlxcbiR7Y29udGVudH1gO1xuICAgICAgICAgICAgYm90LnNlbmRNZXNzYWdlKGNoYXRJZCwgbWVzc2FnZVRleHQpLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIHNlbmQgdGFyZ2V0ZWQgcmVwbHkgcGluZyB0byBjaGF0IElEICR7Y2hhdElkfTpgLCBlcnIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gcm93LnVzZXJfaWQ7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3Igc2VuZGluZyByZXBseSBub3RpZmljYXRpb246JywgZXJyKTtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxufVxuIl19