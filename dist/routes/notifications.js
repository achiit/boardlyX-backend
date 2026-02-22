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
const notifRepo = __importStar(require("../repositories/notificationRepository"));
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
function userId(req) {
    return req.user.userId;
}
router.get('/', async (req, res, next) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 30, 100);
        const offset = Number(req.query.offset) || 0;
        const { notifications, total } = await notifRepo.getNotifications(userId(req), limit, offset);
        const unreadCount = await notifRepo.getUnreadCount(userId(req));
        res.json({ notifications, total, unreadCount });
    }
    catch (err) {
        next(err);
    }
});
router.get('/unread-count', async (req, res, next) => {
    try {
        const count = await notifRepo.getUnreadCount(userId(req));
        res.json({ count });
    }
    catch (err) {
        next(err);
    }
});
router.put('/:id/read', async (req, res, next) => {
    try {
        await notifRepo.markAsRead(req.params.id, userId(req));
        res.json({ ok: true });
    }
    catch (err) {
        next(err);
    }
});
router.put('/read-all', async (req, res, next) => {
    try {
        await notifRepo.markAllAsRead(userId(req));
        res.json({ ok: true });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
