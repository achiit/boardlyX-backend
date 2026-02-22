import { pool } from '../db';

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

export async function createNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
  data: Record<string, unknown> = {}
): Promise<NotificationRow> {
  const { rows } = await pool.query(
    `INSERT INTO notifications (user_id, type, title, message, data)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, type, title, message, JSON.stringify(data)]
  );
  return rows[0];
}

export async function getNotifications(userId: string, limit = 30, offset = 0): Promise<{ notifications: NotificationRow[]; total: number }> {
  const countRes = await pool.query(
    `SELECT count(*)::int as total FROM notifications WHERE user_id = $1`,
    [userId]
  );
  const { rows } = await pool.query(
    `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return { notifications: rows, total: countRes.rows[0].total };
}

export async function getUnreadCount(userId: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT count(*)::int as count FROM notifications WHERE user_id = $1 AND read = false`,
    [userId]
  );
  return rows[0].count;
}

export async function markAsRead(id: string, userId: string) {
  await pool.query(
    `UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
}

export async function markAllAsRead(userId: string) {
  await pool.query(
    `UPDATE notifications SET read = true WHERE user_id = $1 AND read = false`,
    [userId]
  );
}
