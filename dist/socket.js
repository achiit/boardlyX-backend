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
                const message = await chatRepo.createMessage(conversationId, userId, content.trim());
                // Fetch sender info
                const { pool } = require('./db');
                const { rows } = await pool.query(`SELECT id, name, username FROM users WHERE id = $1`, [userId]);
                const sender = rows[0];
                const fullMessage = {
                    ...message,
                    sender: { id: sender.id, name: sender.name, username: sender.username },
                };
                // Broadcast to the conversation room
                console.log(`[Socket] broadcasting message to room conv:${conversationId}`);
                io.to(`conv:${conversationId}`).emit('new_message', fullMessage);
                callback?.({ success: true, message: fullMessage });
                // Dispatch Telegram notifications
                console.log(`[Socket] triggering telegram notifications...`);
                const { notifyConversationMembers } = require('./telegramBot');
                notifyConversationMembers(conversationId, userId, sender.name || sender.username || 'Someone', content.trim()).then(() => {
                    console.log(`[Socket] telegram notifications dispatched successfully`);
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
