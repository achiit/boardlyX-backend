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
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const chatRepo = __importStar(require("../repositories/chatRepository"));
const socket_1 = require("../socket");
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
const MAX_MEDIA_SIZE = 2 * 1024 * 1024; // 2MB in bytes
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm'];
// List conversations for the current user
router.get('/conversations', async (req, res) => {
    try {
        const userId = req.user.userId;
        const conversations = await chatRepo.getConversationsByUser(userId);
        res.json({ conversations });
    }
    catch (err) {
        console.error('GET /conversations error', err);
        res.status(500).json({ error: 'Failed to load conversations' });
    }
});
// Get messages for a conversation (paginated)
router.get('/conversations/:id/messages', async (req, res) => {
    try {
        const userId = req.user.userId;
        const conversationId = req.params.id;
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const before = req.query.before;
        const member = await chatRepo.isMember(conversationId, userId);
        if (!member)
            return res.status(403).json({ error: 'Not a member of this conversation' });
        const messages = await chatRepo.getMessages(conversationId, limit, before);
        res.json({ messages });
    }
    catch (err) {
        console.error('GET /messages error', err);
        res.status(500).json({ error: 'Failed to load messages' });
    }
});
// Create or find a DM conversation — notify the other user via socket
router.post('/dm', async (req, res) => {
    try {
        const userId = req.user.userId;
        const { targetUserId } = req.body;
        if (!targetUserId)
            return res.status(400).json({ error: 'targetUserId required' });
        if (targetUserId === userId)
            return res.status(400).json({ error: 'Cannot DM yourself' });
        const shared = await chatRepo.shareTeam(userId, targetUserId);
        if (!shared)
            return res.status(403).json({ error: 'You must share a team to start a DM' });
        let isNew = false;
        let conversation = await chatRepo.findDmConversation(userId, targetUserId);
        if (!conversation) {
            conversation = await chatRepo.createConversation('dm', null, null);
            await chatRepo.addMember(conversation.id, userId);
            await chatRepo.addMember(conversation.id, targetUserId);
            isNew = true;
        }
        // Re-fetch with full data
        const full = await chatRepo.getConversationById(conversation.id);
        // Notify the target user in real-time so their conversation list updates
        if (isNew) {
            const io = (0, socket_1.getIO)();
            if (io) {
                // Make the target user's sockets join the new conversation room
                const sockets = io.sockets.sockets;
                for (const [, socket] of sockets) {
                    if (socket.userId === targetUserId) {
                        socket.join(`conv:${conversation.id}`);
                    }
                }
                // Emit the new conversation event to the target user
                io.to(`user:${targetUserId}`).emit('new_conversation', full);
            }
        }
        res.json({ conversation: full });
    }
    catch (err) {
        console.error('POST /dm error', err);
        res.status(500).json({ error: 'Failed to create DM' });
    }
});
// Send a media message (image or video as base64)
router.post('/conversations/:id/media', async (req, res) => {
    try {
        const userId = req.user.userId;
        const conversationId = req.params.id;
        const { mediaType, mediaData, content } = req.body;
        // Validate membership
        const member = await chatRepo.isMember(conversationId, userId);
        if (!member)
            return res.status(403).json({ error: 'Not a member of this conversation' });
        // Validate media type
        if (!mediaType || !mediaData) {
            return res.status(400).json({ error: 'mediaType and mediaData are required' });
        }
        const allAllowed = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];
        if (!allAllowed.includes(mediaType)) {
            return res.status(400).json({ error: `Unsupported media type. Allowed: ${allAllowed.join(', ')}` });
        }
        // Validate size (base64 is ~33% larger than raw, so we check raw size)
        const base64Part = mediaData.includes(',') ? mediaData.split(',')[1] : mediaData;
        const rawSizeBytes = Math.ceil((base64Part.length * 3) / 4);
        if (rawSizeBytes > MAX_MEDIA_SIZE) {
            return res.status(400).json({ error: 'File exceeds 2MB limit' });
        }
        // Save message
        const message = await chatRepo.createMessage(conversationId, userId, content || '', mediaType, mediaData);
        // Fetch sender info
        const { pool } = require('../db');
        const { rows } = await pool.query(`SELECT id, name, username FROM users WHERE id = $1`, [userId]);
        const sender = rows[0];
        const fullMessage = {
            ...message,
            sender: { id: sender.id, name: sender.name, username: sender.username },
        };
        // Broadcast via socket
        const io = (0, socket_1.getIO)();
        if (io) {
            io.to(`conv:${conversationId}`).emit('new_message', fullMessage);
        }
        res.status(201).json({ message: fullMessage });
    }
    catch (err) {
        console.error('POST /media error', err);
        res.status(500).json({ error: 'Failed to send media message' });
    }
});
// Get single conversation details
router.get('/conversations/:id', async (req, res) => {
    try {
        const userId = req.user.userId;
        const conversationId = req.params.id;
        const member = await chatRepo.isMember(conversationId, userId);
        if (!member)
            return res.status(403).json({ error: 'Not a member' });
        const conversation = await chatRepo.getConversationById(conversationId);
        res.json({ conversation });
    }
    catch (err) {
        console.error('GET /conversation error', err);
        res.status(500).json({ error: 'Failed to load conversation' });
    }
});
exports.default = router;
