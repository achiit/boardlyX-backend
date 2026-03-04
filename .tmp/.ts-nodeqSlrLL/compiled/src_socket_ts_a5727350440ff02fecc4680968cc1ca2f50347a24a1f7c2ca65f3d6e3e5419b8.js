"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIO = getIO;
exports.initSocket = initSocket;
exports.joinUserToConversation = joinUserToConversation;
const socket_io_1 = require("socket.io");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("./config");
const chatRepo = __importStar(require("./repositories/chatRepository"));
let io;
function getIO() {
    return io;
}
function initSocket(httpServer) {
    io = new socket_io_1.Server(httpServer, {
        cors: { origin: '*', methods: ['GET', 'POST'] },
        pingInterval: 25000,
        pingTimeout: 20000,
    });
    // JWT Authentication middleware
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token)
            return next(new Error('Authentication required'));
        try {
            const decoded = jsonwebtoken_1.default.verify(token, config_1.config.jwtSecret);
            socket.userId = decoded.userId;
            socket.email = decoded.email;
            next();
        }
        catch {
            next(new Error('Invalid token'));
        }
    });
    io.on('connection', async (socket) => {
        const userId = socket.userId;
        // console.log(`Socket connected: ${userId}`);
        // Join a personal room for direct targeting
        socket.join(`user:${userId}`);
        // Auto-join all conversation rooms
        try {
            const conversations = await chatRepo.getConversationsByUser(userId);
            for (const conv of conversations) {
                socket.join(`conv:${conv.id}`);
            }
        }
        catch (err) {
            console.error('Failed to join conversation rooms', err);
        }
        // ── Send Message ──
        socket.on('send_message', async (data, callback) => {
            console.log(`[Socket] received send_message from ${userId} for conversation ${data?.conversationId}`);
            try {
                const { conversationId, content } = data;
                if (!conversationId || !content?.trim()) {
                    console.log(`[Socket] missing conversationId or content`);
                    return;
                }
                // Verify membership
                const member = await chatRepo.isMember(conversationId, userId);
                if (!member) {
                    console.log(`[Socket] user ${userId} is not a member of conversation ${conversationId}`);
                    return callback?.({ error: 'Not a member' });
                }
                // Save to DB
                console.log(`[Socket] saving message to DB...`);
                const message = await chatRepo.createMessage(conversationId, userId, content.trim(), null, null, data.replyToId);
                // Fetch sender info
                const { pool } = require('./db');
                const { rows } = await pool.query(`SELECT id, name, username FROM users WHERE id = $1`, [userId]);
                const sender = rows[0];
                const fullMessage = {
                    ...message,
                    sender: { id: sender.id, name: sender.name, username: sender.username },
                };
                const senderName = sender.name || sender.username || 'Someone';
                // Broadcast to the conversation room
                console.log(`[Socket] broadcasting message to room conv:${conversationId}`);
                io.to(`conv:${conversationId}`).emit('new_message', fullMessage);
                callback?.({ success: true, message: fullMessage });
                // Dispatch Telegram notifications
                console.log(`[Socket] triggering telegram notifications...`);
                const { notifyConversationMembers, notifyMentionedUsernames, notifyRepliedUser } = require('./telegramBot');
                const excludeIds = [];
                // 1. Reply Notification
                if (data.replyToId) {
                    const repliedUserId = await notifyRepliedUser(data.replyToId, senderName, content.trim());
                    if (repliedUserId) {
                        excludeIds.push(repliedUserId);
                    }
                }
                // 2. Mention Notifications
                // Matches @username (alphanumeric and underscores)
                const mentionRegex = /@([a-zA-Z0-9_]+)/g;
                const matches = [...content.matchAll(mentionRegex)];
                const mentionedUsernames = matches.map(m => m[1]);
                if (mentionedUsernames.length > 0) {
                    const notifiedIds = await notifyMentionedUsernames(mentionedUsernames, conversationId, senderName, content.trim());
                    excludeIds.push(...notifiedIds);
                }
                // 3. Generic Group Notification (excluding already targeted users)
                notifyConversationMembers(conversationId, userId, senderName, content.trim(), excludeIds).then(() => {
                    console.log(`[Socket] telegram notifications dispatched successfully (Targeted: ${excludeIds.length})`);
                }).catch((err) => {
                    console.error('Failed to dispatch telegram notifications:', err);
                });
            }
            catch (err) {
                console.error('send_message error', err);
                callback?.({ error: 'Failed to send message' });
            }
        });
        // ── Typing indicators ──
        socket.on('typing_start', (data) => {
            socket.to(`conv:${data.conversationId}`).emit('user_typing', {
                conversationId: data.conversationId,
                userId,
            });
        });
        socket.on('typing_stop', (data) => {
            socket.to(`conv:${data.conversationId}`).emit('user_stop_typing', {
                conversationId: data.conversationId,
                userId,
            });
        });
        // ── Join a new conversation room (when a DM is created) ──
        socket.on('join_conversation', (data) => {
            socket.join(`conv:${data.conversationId}`);
        });
        socket.on('disconnect', () => {
            // console.log(`Socket disconnected: ${userId}`);
        });
    });
    return io;
}
// Helper: make a user join a conversation room across all their sockets
function joinUserToConversation(userId, conversationId) {
    const sockets = io?.sockets?.sockets;
    if (!sockets)
        return;
    for (const [, socket] of sockets) {
        if (socket.userId === userId) {
            socket.join(`conv:${conversationId}`);
        }
    }
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiL1ZvbHVtZXMvQWFkaXR5YSdzIFNTRC9EZXZlbG9wbWVudC9ib2FyZGx5WC1iYWNrZW5kL3NyYy9zb2NrZXQudHMiLCJzb3VyY2VzIjpbIi9Wb2x1bWVzL0FhZGl0eWEncyBTU0QvRGV2ZWxvcG1lbnQvYm9hcmRseVgtYmFja2VuZC9zcmMvc29ja2V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBUUEsc0JBRUM7QUFFRCxnQ0E2SkM7QUFHRCx3REFRQztBQW5MRCx5Q0FBMkM7QUFDM0MsZ0VBQStCO0FBQy9CLHFDQUFrQztBQUNsQyx3RUFBMEQ7QUFFMUQsSUFBSSxFQUFVLENBQUM7QUFFZixTQUFnQixLQUFLO0lBQ2pCLE9BQU8sRUFBRSxDQUFDO0FBQ2QsQ0FBQztBQUVELFNBQWdCLFVBQVUsQ0FBQyxVQUFzQjtJQUM3QyxFQUFFLEdBQUcsSUFBSSxrQkFBTSxDQUFDLFVBQVUsRUFBRTtRQUN4QixJQUFJLEVBQUUsRUFBRSxNQUFNLEVBQUUsR0FBRyxFQUFFLE9BQU8sRUFBRSxDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsRUFBRTtRQUMvQyxZQUFZLEVBQUUsS0FBSztRQUNuQixXQUFXLEVBQUUsS0FBSztLQUNyQixDQUFDLENBQUM7SUFFSCxnQ0FBZ0M7SUFDaEMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsRUFBRTtRQUNwQixNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUM7UUFDM0MsSUFBSSxDQUFDLEtBQUs7WUFBRSxPQUFPLElBQUksQ0FBQyxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUM7UUFDOUQsSUFBSSxDQUFDO1lBQ0QsTUFBTSxPQUFPLEdBQUcsc0JBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLGVBQU0sQ0FBQyxTQUFTLENBQVEsQ0FBQztZQUMxRCxNQUFj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SUFBSSxDQUFDLFFBQVEsY0FBYyxFQUFFLENBQUMsQ0FBQztRQUMxQyxDQUFDO0lBQ0wsQ0FBQztBQUNMLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBTZXJ2ZXIgYXMgSHR0cFNlcnZlciB9IGZyb20gJ2h0dHAnO1xuaW1wb3J0IHsgU2VydmVyLCBTb2NrZXQgfSBmcm9tICdzb2NrZXQuaW8nO1xuaW1wb3J0IGp3dCBmcm9tICdqc29ud2VidG9rZW4nO1xuaW1wb3J0IHsgY29uZmlnIH0gZnJvbSAnLi9jb25maWcnO1xuaW1wb3J0ICogYXMgY2hhdFJlcG8gZnJvbSAnLi9yZXBvc2l0b3JpZXMvY2hhdFJlcG9zaXRvcnknO1xuXG5sZXQgaW86IFNlcnZlcjtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldElPKCk6IFNlcnZlciB7XG4gICAgcmV0dXJuIGlvO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaW5pdFNvY2tldChodHRwU2VydmVyOiBIdHRwU2VydmVyKSB7XG4gICAgaW8gPSBuZXcgU2VydmVyKGh0dHBTZXJ2ZXIsIHtcbiAgICAgICAgY29yczogeyBvcmlnaW46ICcqJywgbWV0aG9kczogWydHRVQnLCAnUE9TVCddIH0sXG4gICAgICAgIHBpbmdJbnRlcnZhbDogMjUwMDAsXG4gICAgICAgIHBpbmdUaW1lb3V0OiAyMDAwMCxcbiAgICB9KTtcblxuICAgIC8vIEpXVCBBdXRoZW50aWNhdGlvbiBtaWRkbGV3YXJlXG4gICAgaW8udXNlKChzb2NrZXQsIG5leHQpID0+IHtcbiAgICAgICAgY29uc3QgdG9rZW4gPSBzb2NrZXQuaGFuZHNoYWtlLmF1dGg/LnRva2VuO1xuICAgICAgICBpZiAoIXRva2VuKSByZXR1cm4gbmV4dChuZXcgRXJyb3IoJ0F1dGhlbnRpY2F0aW9uIHJlcXVpcmVkJykpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgZGVjb2RlZCA9IGp3dC52ZXJpZnkodG9rZW4sIGNvbmZpZy5qd3RTZWNyZXQpIGFzIGFueTtcbiAgICAgICAgICAgIChzb2NrZXQgYXMgYW55KS51c2VySWQgPSBkZWNvZGVkLnVzZXJJZDtcbiAgICAgICAgICAgIChzb2NrZXQgYXMgYW55KS5lbWFpbCA9IGRlY29kZWQuZW1haWw7XG4gICAgICAgICAgICBuZXh0KCk7XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgbmV4dChuZXcgRXJyb3IoJ0ludmFsaWQgdG9rZW4nKSk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIGlvLm9uKCdjb25uZWN0aW9uJywgYXN5bmMgKHNvY2tldDogU29ja2V0KSA9PiB7XG4gICAgICAgIGNvbnN0IHVzZXJJZCA9IChzb2NrZXQgYXMgYW55KS51c2VySWQ7XG4gICAgICAgIC8vIGNvbnNvbGUubG9nKGBTb2NrZXQgY29ubmVjdGVkOiAke3VzZXJJZH1gKTtcblxuICAgICAgICAvLyBKb2luIGEgcGVyc29uYWwgcm9vbSBmb3IgZGlyZWN0IHRhcmdldGluZ1xuICAgICAgICBzb2NrZXQuam9pbihgdXNlcjoke3VzZXJJZH1gKTtcblxuICAgICAgICAvLyBBdXRvLWpvaW4gYWxsIGNvbnZlcnNhdGlvbiByb29tc1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgY29udmVyc2F0aW9ucyA9IGF3YWl0IGNoYXRSZXBvLmdldENvbnZlcnNhdGlvbnNCeVVzZXIodXNlcklkKTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgY29udiBvZiBjb252ZXJzYXRpb25zKSB7XG4gICAgICAgICAgICAgICAgc29ja2V0LmpvaW4oYGNvbnY6JHtjb252LmlkfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBqb2luIGNvbnZlcnNhdGlvbiByb29tcycsIGVycik7XG4gICAgICAgIH1cblxuICAgICAgICAvLyDilIDilIAgU2VuZCBNZXNzYWdlIOKUgOKUgFxuICAgICAgICBzb2NrZXQub24oJ3NlbmRfbWVzc2FnZScsIGFzeW5jIChkYXRhOiB7IGNvbnZlcnNhdGlvbklkOiBzdHJpbmc7IGNvbnRlbnQ6IHN0cmluZzsgcmVwbHlUb0lkPzogc3RyaW5nIH0sIGNhbGxiYWNrPzogRnVuY3Rpb24pID0+IHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBbU29ja2V0XSByZWNlaXZlZCBzZW5kX21lc3NhZ2UgZnJvbSAke3VzZXJJZH0gZm9yIGNvbnZlcnNhdGlvbiAke2RhdGE/LmNvbnZlcnNhdGlvbklkfWApO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCB7IGNvbnZlcnNhdGlvbklkLCBjb250ZW50IH0gPSBkYXRhO1xuICAgICAgICAgICAgICAgIGlmICghY29udmVyc2F0aW9uSWQgfHwgIWNvbnRlbnQ/LnRyaW0oKSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgW1NvY2tldF0gbWlzc2luZyBjb252ZXJzYXRpb25JZCBvciBjb250ZW50YCk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBWZXJpZnkgbWVtYmVyc2hpcFxuICAgICAgICAgICAgICAgIGNvbnN0IG1lbWJlciA9IGF3YWl0IGNoYXRSZXBvLmlzTWVtYmVyKGNvbnZlcnNhdGlvbklkLCB1c2VySWQpO1xuICAgICAgICAgICAgICAgIGlmICghbWVtYmVyKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBbU29ja2V0XSB1c2VyICR7dXNlcklkfSBpcyBub3QgYSBtZW1iZXIgb2YgY29udmVyc2F0aW9uICR7Y29udmVyc2F0aW9uSWR9YCk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjYWxsYmFjaz8uKHsgZXJyb3I6ICdOb3QgYSBtZW1iZXInIH0pO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIFNhdmUgdG8gREJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgW1NvY2tldF0gc2F2aW5nIG1lc3NhZ2UgdG8gREIuLi5gKTtcbiAgICAgICAgICAgICAgICBjb25zdCBtZXNzYWdlID0gYXdhaXQgY2hhdFJlcG8uY3JlYXRlTWVzc2FnZShjb252ZXJzYXRpb25JZCwgdXNlcklkLCBjb250ZW50LnRyaW0oKSwgbnVsbCwgbnVsbCwgZGF0YS5yZXBseVRvSWQpO1xuXG4gICAgICAgICAgICAgICAgLy8gRmV0Y2ggc2VuZGVyIGluZm9cbiAgICAgICAgICAgICAgICBjb25zdCB7IHBvb2wgfSA9IHJlcXVpcmUoJy4vZGInKTtcbiAgICAgICAgICAgICAgICBjb25zdCB7IHJvd3MgfSA9IGF3YWl0IHBvb2wucXVlcnkoXG4gICAgICAgICAgICAgICAgICAgIGBTRUxFQ1QgaWQsIG5hbWUsIHVzZXJuYW1lIEZST00gdXNlcnMgV0hFUkUgaWQgPSAkMWAsXG4gICAgICAgICAgICAgICAgICAgIFt1c2VySWRdLFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgY29uc3Qgc2VuZGVyID0gcm93c1swXTtcblxuICAgICAgICAgICAgICAgIGNvbnN0IGZ1bGxNZXNzYWdlID0ge1xuICAgICAgICAgICAgICAgICAgICAuLi5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICBzZW5kZXI6IHsgaWQ6IHNlbmRlci5pZCwgbmFtZTogc2VuZGVyLm5hbWUsIHVzZXJuYW1lOiBzZW5kZXIudXNlcm5hbWUgfSxcbiAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgY29uc3Qgc2VuZGVyTmFtZSA9IHNlbmRlci5uYW1lIHx8IHNlbmRlci51c2VybmFtZSB8fCAnU29tZW9uZSc7XG5cbiAgICAgICAgICAgICAgICAvLyBCcm9hZGNhc3QgdG8gdGhlIGNvbnZlcnNhdGlvbiByb29tXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYFtTb2NrZXRdIGJyb2FkY2FzdGluZyBtZXNzYWdlIHRvIHJvb20gY29udjoke2NvbnZlcnNhdGlvbklkfWApO1xuICAgICAgICAgICAgICAgIGlvLnRvKGBjb252OiR7Y29udmVyc2F0aW9uSWR9YCkuZW1pdCgnbmV3X21lc3NhZ2UnLCBmdWxsTWVzc2FnZSk7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2s/Lih7IHN1Y2Nlc3M6IHRydWUsIG1lc3NhZ2U6IGZ1bGxNZXNzYWdlIH0pO1xuXG4gICAgICAgICAgICAgICAgLy8gRGlzcGF0Y2ggVGVsZWdyYW0gbm90aWZpY2F0aW9uc1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBbU29ja2V0XSB0cmlnZ2VyaW5nIHRlbGVncmFtIG5vdGlmaWNhdGlvbnMuLi5gKTtcbiAgICAgICAgICAgICAgICBjb25zdCB7XG4gICAgICAgICAgICAgICAgICAgIG5vdGlmeUNvbnZlcnNhdGlvbk1lbWJlcnMsXG4gICAgICAgICAgICAgICAgICAgIG5vdGlmeU1lbnRpb25lZFVzZXJuYW1lcyxcbiAgICAgICAgICAgICAgICAgICAgbm90aWZ5UmVwbGllZFVzZXJcbiAgICAgICAgICAgICAgICB9ID0gcmVxdWlyZSgnLi90ZWxlZ3JhbUJvdCcpO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgZXhjbHVkZUlkczogc3RyaW5nW10gPSBbXTtcblxuICAgICAgICAgICAgICAgIC8vIDEuIFJlcGx5IE5vdGlmaWNhdGlvblxuICAgICAgICAgICAgICAgIGlmIChkYXRhLnJlcGx5VG9JZCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByZXBsaWVkVXNlcklkID0gYXdhaXQgbm90aWZ5UmVwbGllZFVzZXIoZGF0YS5yZXBseVRvSWQsIHNlbmRlck5hbWUsIGNvbnRlbnQudHJpbSgpKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlcGxpZWRVc2VySWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGV4Y2x1ZGVJZHMucHVzaChyZXBsaWVkVXNlcklkKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIDIuIE1lbnRpb24gTm90aWZpY2F0aW9uc1xuICAgICAgICAgICAgICAgIC8vIE1hdGNoZXMgQHVzZXJuYW1lIChhbHBoYW51bWVyaWMgYW5kIHVuZGVyc2NvcmVzKVxuICAgICAgICAgICAgICAgIGNvbnN0IG1lbnRpb25SZWdleCA9IC9AKFthLXpBLVowLTlfXSspL2c7XG4gICAgICAgICAgICAgICAgY29uc3QgbWF0Y2hlcyA9IFsuLi5jb250ZW50Lm1hdGNoQWxsKG1lbnRpb25SZWdleCldO1xuICAgICAgICAgICAgICAgIGNvbnN0IG1lbnRpb25lZFVzZXJuYW1lcyA9IG1hdGNoZXMubWFwKG0gPT4gbVsxXSk7XG5cbiAgICAgICAgICAgICAgICBpZiAobWVudGlvbmVkVXNlcm5hbWVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgbm90aWZpZWRJZHMgPSBhd2FpdCBub3RpZnlNZW50aW9uZWRVc2VybmFtZXMoXG4gICAgICAgICAgICAgICAgICAgICAgICBtZW50aW9uZWRVc2VybmFtZXMsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb252ZXJzYXRpb25JZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbmRlck5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb250ZW50LnRyaW0oKVxuICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICBleGNsdWRlSWRzLnB1c2goLi4ubm90aWZpZWRJZHMpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIDMuIEdlbmVyaWMgR3JvdXAgTm90aWZpY2F0aW9uIChleGNsdWRpbmcgYWxyZWFkeSB0YXJnZXRlZCB1c2VycylcbiAgICAgICAgICAgICAgICBub3RpZnlDb252ZXJzYXRpb25NZW1iZXJzKFxuICAgICAgICAgICAgICAgICAgICBjb252ZXJzYXRpb25JZCxcbiAgICAgICAgICAgICAgICAgICAgdXNlcklkLFxuICAgICAgICAgICAgICAgICAgICBzZW5kZXJOYW1lLFxuICAgICAgICAgICAgICAgICAgICBjb250ZW50LnRyaW0oKSxcbiAgICAgICAgICAgICAgICAgICAgZXhjbHVkZUlkc1xuICAgICAgICAgICAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBbU29ja2V0XSB0ZWxlZ3JhbSBub3RpZmljYXRpb25zIGRpc3BhdGNoZWQgc3VjY2Vzc2Z1bGx5IChUYXJnZXRlZDogJHtleGNsdWRlSWRzLmxlbmd0aH0pYCk7XG4gICAgICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBkaXNwYXRjaCB0ZWxlZ3JhbSBub3RpZmljYXRpb25zOicsIGVycilcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ3NlbmRfbWVzc2FnZSBlcnJvcicsIGVycik7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2s/Lih7IGVycm9yOiAnRmFpbGVkIHRvIHNlbmQgbWVzc2FnZScgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIOKUgOKUgCBUeXBpbmcgaW5kaWNhdG9ycyDilIDilIBcbiAgICAgICAgc29ja2V0Lm9uKCd0eXBpbmdfc3RhcnQnLCAoZGF0YTogeyBjb252ZXJzYXRpb25JZDogc3RyaW5nIH0pID0+IHtcbiAgICAgICAgICAgIHNvY2tldC50byhgY29udjoke2RhdGEuY29udmVyc2F0aW9uSWR9YCkuZW1pdCgndXNlcl90eXBpbmcnLCB7XG4gICAgICAgICAgICAgICAgY29udmVyc2F0aW9uSWQ6IGRhdGEuY29udmVyc2F0aW9uSWQsXG4gICAgICAgICAgICAgICAgdXNlcklkLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHNvY2tldC5vbigndHlwaW5nX3N0b3AnLCAoZGF0YTogeyBjb252ZXJzYXRpb25JZDogc3RyaW5nIH0pID0+IHtcbiAgICAgICAgICAgIHNvY2tldC50byhgY29udjoke2RhdGEuY29udmVyc2F0aW9uSWR9YCkuZW1pdCgndXNlcl9zdG9wX3R5cGluZycsIHtcbiAgICAgICAgICAgICAgICBjb252ZXJzYXRpb25JZDogZGF0YS5jb252ZXJzYXRpb25JZCxcbiAgICAgICAgICAgICAgICB1c2VySWQsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8g4pSA4pSAIEpvaW4gYSBuZXcgY29udmVyc2F0aW9uIHJvb20gKHdoZW4gYSBETSBpcyBjcmVhdGVkKSDilIDilIBcbiAgICAgICAgc29ja2V0Lm9uKCdqb2luX2NvbnZlcnNhdGlvbicsIChkYXRhOiB7IGNvbnZlcnNhdGlvbklkOiBzdHJpbmcgfSkgPT4ge1xuICAgICAgICAgICAgc29ja2V0LmpvaW4oYGNvbnY6JHtkYXRhLmNvbnZlcnNhdGlvbklkfWApO1xuICAgICAgICB9KTtcblxuICAgICAgICBzb2NrZXQub24oJ2Rpc2Nvbm5lY3QnLCAoKSA9PiB7XG4gICAgICAgICAgICAvLyBjb25zb2xlLmxvZyhgU29ja2V0IGRpc2Nvbm5lY3RlZDogJHt1c2VySWR9YCk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIGlvO1xufVxuXG4vLyBIZWxwZXI6IG1ha2UgYSB1c2VyIGpvaW4gYSBjb252ZXJzYXRpb24gcm9vbSBhY3Jvc3MgYWxsIHRoZWlyIHNvY2tldHNcbmV4cG9ydCBmdW5jdGlvbiBqb2luVXNlclRvQ29udmVyc2F0aW9uKHVzZXJJZDogc3RyaW5nLCBjb252ZXJzYXRpb25JZDogc3RyaW5nKSB7XG4gICAgY29uc3Qgc29ja2V0cyA9IGlvPy5zb2NrZXRzPy5zb2NrZXRzO1xuICAgIGlmICghc29ja2V0cykgcmV0dXJuO1xuICAgIGZvciAoY29uc3QgWywgc29ja2V0XSBvZiBzb2NrZXRzKSB7XG4gICAgICAgIGlmICgoc29ja2V0IGFzIGFueSkudXNlcklkID09PSB1c2VySWQpIHtcbiAgICAgICAgICAgIHNvY2tldC5qb2luKGBjb252OiR7Y29udmVyc2F0aW9uSWR9YCk7XG4gICAgICAgIH1cbiAgICB9XG59XG4iXX0=