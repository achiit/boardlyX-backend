"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNotification = createNotification;
exports.getNotifications = getNotifications;
exports.getUnreadCount = getUnreadCount;
exports.markAsRead = markAsRead;
exports.markAllAsRead = markAllAsRead;
const db_1 = require("../db");
async function createNotification(userId, type, title, message, data = {}) {
    const { rows } = await db_1.pool.query(`INSERT INTO notifications (user_id, type, title, message, data)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`, [userId, type, title, message, JSON.stringify(data)]);
    return rows[0];
}
async function getNotifications(userId, limit = 30, offset = 0) {
    const countRes = await db_1.pool.query(`SELECT count(*)::int as total FROM notifications WHERE user_id = $1`, [userId]);
    const { rows } = await db_1.pool.query(`SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`, [userId, limit, offset]);
    return { notifications: rows, total: countRes.rows[0].total };
}
async function getUnreadCount(userId) {
    const { rows } = await db_1.pool.query(`SELECT count(*)::int as count FROM notifications WHERE user_id = $1 AND read = false`, [userId]);
    return rows[0].count;
}
async function markAsRead(id, userId) {
    await db_1.pool.query(`UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2`, [id, userId]);
}
async function markAllAsRead(userId) {
    await db_1.pool.query(`UPDATE notifications SET read = true WHERE user_id = $1 AND read = false`, [userId]);
}
