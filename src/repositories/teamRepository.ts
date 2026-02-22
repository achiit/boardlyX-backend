import { pool } from '../db';

export interface TeamRow {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
}

export interface TeamMemberRow {
  team_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
  user_name: string | null;
  user_email: string | null;
  user_username: string | null;
}

export interface InvitationRow {
  id: string;
  team_id: string;
  inviter_id: string;
  invitee_email: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  team_name?: string;
  inviter_name?: string;
}

export async function createTeam(name: string, createdBy: string): Promise<TeamRow> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO teams (name, created_by) VALUES ($1, $2) RETURNING *`,
      [name, createdBy]
    );
    await client.query(
      `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [rows[0].id, createdBy]
    );
    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getTeamsByUser(userId: string): Promise<TeamRow[]> {
  const { rows } = await pool.query(
    `SELECT t.* FROM teams t
     INNER JOIN team_members tm ON t.id = tm.team_id
     WHERE tm.user_id = $1
     ORDER BY t.created_at DESC`,
    [userId]
  );
  return rows;
}

export async function getTeamById(teamId: string): Promise<TeamRow | null> {
  const { rows } = await pool.query(`SELECT * FROM teams WHERE id = $1`, [teamId]);
  return rows[0] || null;
}

export async function getTeamMembers(teamId: string): Promise<TeamMemberRow[]> {
  const { rows } = await pool.query(
    `SELECT tm.*, u.name as user_name, u.email as user_email, u.username as user_username
     FROM team_members tm
     INNER JOIN users u ON u.id = tm.user_id
     WHERE tm.team_id = $1
     ORDER BY tm.joined_at ASC`,
    [teamId]
  );
  return rows;
}

export async function isTeamMember(teamId: string, userId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2`,
    [teamId, userId]
  );
  return rows.length > 0;
}

export async function getMemberRole(teamId: string, userId: string): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2`,
    [teamId, userId]
  );
  return rows[0]?.role || null;
}

export async function addTeamMember(teamId: string, userId: string, role = 'member') {
  await pool.query(
    `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [teamId, userId, role]
  );
}

export async function removeTeamMember(teamId: string, userId: string) {
  await pool.query(
    `DELETE FROM team_members WHERE team_id = $1 AND user_id = $2 AND role != 'owner'`,
    [teamId, userId]
  );
}

export async function createInvitation(teamId: string, inviterId: string, inviteeEmail: string): Promise<InvitationRow> {
  const { rows } = await pool.query(
    `INSERT INTO invitations (team_id, inviter_id, invitee_email) VALUES ($1, $2, $3) RETURNING *`,
    [teamId, inviterId, inviteeEmail]
  );
  return rows[0];
}

export async function getInvitationById(id: string): Promise<InvitationRow | null> {
  const { rows } = await pool.query(
    `SELECT inv.*, t.name as team_name, u.name as inviter_name
     FROM invitations inv
     INNER JOIN teams t ON t.id = inv.team_id
     INNER JOIN users u ON u.id = inv.inviter_id
     WHERE inv.id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function getPendingInvitationsForEmail(email: string): Promise<InvitationRow[]> {
  const { rows } = await pool.query(
    `SELECT inv.*, t.name as team_name, u.name as inviter_name
     FROM invitations inv
     INNER JOIN teams t ON t.id = inv.team_id
     INNER JOIN users u ON u.id = inv.inviter_id
     WHERE inv.invitee_email = $1 AND inv.status = 'pending'
     ORDER BY inv.created_at DESC`,
    [email]
  );
  return rows;
}

export async function updateInvitationStatus(id: string, status: 'accepted' | 'rejected') {
  await pool.query(`UPDATE invitations SET status = $1 WHERE id = $2`, [status, id]);
}

export async function deleteTeam(teamId: string) {
  await pool.query(`DELETE FROM teams WHERE id = $1`, [teamId]);
}

export async function getMemberCount(teamId: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT count(*)::int as count FROM team_members WHERE team_id = $1`,
    [teamId]
  );
  return rows[0].count;
}

export async function findUserByEmail(email: string) {
  const { rows } = await pool.query(`SELECT id, name, email FROM users WHERE email = $1`, [email]);
  return rows[0] || null;
}
