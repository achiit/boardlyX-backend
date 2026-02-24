import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from './config';
import * as chatRepo from './repositories/chatRepository';

let io: Server;

export function getIO(): Server {
    return io;
}

export function initSocket(httpServer: HttpServer) {
    io = new Server(httpServer, {
        cors: { origin: '*', methods: ['GET', 'POST'] },
        pingInterval: 25000,
        pingTimeout: 20000,
    });

    // JWT Authentication middleware
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) return next(new Error('Authentication required'));
        try {
            const decoded = jwt.verify(token, config.jwtSecret) as any;
            (socket as any).userId = decoded.userId;
            (socket as any).email = decoded.email;
            next();
        } catch {
            next(new Error('Invalid token'));
        }
    });

    io.on('connection', async (socket: Socket) => {
        const userId = (socket as any).userId;
        // console.log(`Socket connected: ${userId}`);

        // Join a personal room for direct targeting
        socket.join(`user:${userId}`);

        // Auto-join all conversation rooms
        try {
            const conversations = await chatRepo.getConversationsByUser(userId);
            for (const conv of conversations) {
                socket.join(`conv:${conv.id}`);
            }
        } catch (err) {
            console.error('Failed to join conversation rooms', err);
        }

        // ── Send Message ──
        socket.on('send_message', async (data: { conversationId: string; content: string }, callback?: Function) => {
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
                const { rows } = await pool.query(
                    `SELECT id, name, username FROM users WHERE id = $1`,
                    [userId],
                );
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
                notifyConversationMembers(
                    conversationId,
                    userId,
                    sender.name || sender.username || 'Someone',
                    content.trim()
                ).then(() => {
                    console.log(`[Socket] telegram notifications dispatched successfully`);
                }).catch((err: any) => {
                    console.error('Failed to dispatch telegram notifications:', err)
                });
            } catch (err) {
                console.error('send_message error', err);
                callback?.({ error: 'Failed to send message' });
            }
        });

        // ── Typing indicators ──
        socket.on('typing_start', (data: { conversationId: string }) => {
            socket.to(`conv:${data.conversationId}`).emit('user_typing', {
                conversationId: data.conversationId,
                userId,
            });
        });

        socket.on('typing_stop', (data: { conversationId: string }) => {
            socket.to(`conv:${data.conversationId}`).emit('user_stop_typing', {
                conversationId: data.conversationId,
                userId,
            });
        });

        // ── Join a new conversation room (when a DM is created) ──
        socket.on('join_conversation', (data: { conversationId: string }) => {
            socket.join(`conv:${data.conversationId}`);
        });

        socket.on('disconnect', () => {
            // console.log(`Socket disconnected: ${userId}`);
        });
    });

    return io;
}

// Helper: make a user join a conversation room across all their sockets
export function joinUserToConversation(userId: string, conversationId: string) {
    const sockets = io?.sockets?.sockets;
    if (!sockets) return;
    for (const [, socket] of sockets) {
        if ((socket as any).userId === userId) {
            socket.join(`conv:${conversationId}`);
        }
    }
}
