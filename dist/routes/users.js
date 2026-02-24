"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const db_1 = require("../db");
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
function userId(req) {
    return req.user.userId;
}
router.get('/search', async (req, res, next) => {
    try {
        const q = (req.query.q || '').trim();
        if (q.length < 2)
            return res.json([]);
        const pattern = `%${q}%`;
        const { rows } = await db_1.pool.query(`SELECT id, name, email, username FROM users
       WHERE (lower(username) LIKE lower($1) OR lower(email) LIKE lower($1) OR lower(name) LIKE lower($1))
         AND id != $2
       ORDER BY
         CASE WHEN lower(username) = lower($3) THEN 0
              WHEN lower(username) LIKE lower($4) THEN 1
              ELSE 2
         END,
         username ASC
       LIMIT 15`, [pattern, userId(req), q, `${q}%`]);
        res.json(rows.map((r) => ({
            id: r.id,
            name: r.name,
            email: r.email,
            username: r.username,
        })));
    }
    catch (err) {
        next(err);
    }
});
router.get('/me', async (req, res, next) => {
    try {
        const { rows } = await db_1.pool.query('SELECT id, name, email, username, wallet_address, telegram_username FROM users WHERE id = $1', [userId(req)]);
        if (!rows[0])
            return res.status(404).json({ error: 'User not found' });
        res.json(rows[0]);
    }
    catch (err) {
        next(err);
    }
});
router.post('/me/telegram', async (req, res, next) => {
    try {
        const { telegramId, telegramUsername } = req.body;
        // We update both if provided, or clear them if null
        await db_1.pool.query('UPDATE users SET telegram_chat_id = $1, telegram_username = $2 WHERE id = $3', [telegramId || null, telegramUsername || null, userId(req)]);
        res.json({ success: true, message: 'Telegram ID updated successfully' });
    }
    catch (err) {
        console.error('Failed to update telegram ID', err);
        next(err);
    }
});
exports.default = router;
