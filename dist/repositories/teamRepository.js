"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTeam = createTeam;
exports.getTeamsByUser = getTeamsByUser;
exports.getTeamById = getTeamById;
exports.getTeamMembers = getTeamMembers;
exports.isTeamMember = isTeamMember;
exports.getMemberRole = getMemberRole;
exports.addTeamMember = addTeamMember;
exports.removeTeamMember = removeTeamMember;
exports.createInvitation = createInvitation;
exports.getInvitationById = getInvitationById;
exports.getPendingInvitationsForEmail = getPendingInvitationsForEmail;
exports.updateInvitationStatus = updateInvitationStatus;
exports.deleteTeam = deleteTeam;
exports.getMemberCount = getMemberCount;
exports.findUserByEmail = findUserByEmail;
const db_1 = require("../db");
async function createTeam(name, createdBy) {
    const client = await db_1.pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(`INSERT INTO teams (name, created_by) VALUES ($1, $2) RETURNING *`, [name, createdBy]);
        await client.query(`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')`, [rows[0].id, createdBy]);
        await client.query('COMMIT');
        return rows[0];
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}
async function getTeamsByUser(userId) {
    const { rows } = await db_1.pool.query(`SELECT t.* FROM teams t
     INNER JOIN team_members tm ON t.id = tm.team_id
     WHERE tm.user_id = $1
     ORDER BY t.created_at DESC`, [userId]);
    return rows;
}
async function getTeamById(teamId) {
    const { rows } = await db_1.pool.query(`SELECT * FROM teams WHERE id = $1`, [teamId]);
    return rows[0] || null;
}
async function getTeamMembers(teamId) {
    const { rows } = await db_1.pool.query(`SELECT tm.*, u.name as user_name, u.email as user_email, u.username as user_username
     FROM team_members tm
     INNER JOIN users u ON u.id = tm.user_id
     WHERE tm.team_id = $1
     ORDER BY tm.joined_at ASC`, [teamId]);
    return rows;
}
async function isTeamMember(teamId, userId) {
    const { rows } = await db_1.pool.query(`SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2`, [teamId, userId]);
    return rows.length > 0;
}
async function getMemberRole(teamId, userId) {
    const { rows } = await db_1.pool.query(`SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2`, [teamId, userId]);
    return rows[0]?.role || null;
}
async function addTeamMember(teamId, userId, role = 'member') {
    await db_1.pool.query(`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [teamId, userId, role]);
}
async function removeTeamMember(teamId, userId) {
    await db_1.pool.query(`DELETE FROM team_members WHERE team_id = $1 AND user_id = $2 AND role != 'owner'`, [teamId, userId]);
}
async function createInvitation(teamId, inviterId, inviteeEmail) {
    const { rows } = await db_1.pool.query(`INSERT INTO invitations (team_id, inviter_id, invitee_email) VALUES ($1, $2, $3) RETURNING *`, [teamId, inviterId, inviteeEmail]);
    return rows[0];
}
async function getInvitationById(id) {
    const { rows } = await db_1.pool.query(`SELECT inv.*, t.name as team_name, u.name as inviter_name
     FROM invitations inv
     INNER JOIN teams t ON t.id = inv.team_id
     INNER JOIN users u ON u.id = inv.inviter_id
     WHERE inv.id = $1`, [id]);
    return rows[0] || null;
}
async function getPendingInvitationsForEmail(email) {
    const { rows } = await db_1.pool.query(`SELECT inv.*, t.name as team_name, u.name as inviter_name
     FROM invitations inv
     INNER JOIN teams t ON t.id = inv.team_id
     INNER JOIN users u ON u.id = inv.inviter_id
     WHERE inv.invitee_email = $1 AND inv.status = 'pending'
     ORDER BY inv.created_at DESC`, [email]);
    return rows;
}
async function updateInvitationStatus(id, status) {
    await db_1.pool.query(`UPDATE invitations SET status = $1 WHERE id = $2`, [status, id]);
}
async function deleteTeam(teamId) {
    await db_1.pool.query(`DELETE FROM teams WHERE id = $1`, [teamId]);
}
async function getMemberCount(teamId) {
    const { rows } = await db_1.pool.query(`SELECT count(*)::int as count FROM team_members WHERE team_id = $1`, [teamId]);
    return rows[0].count;
}
async function findUserByEmail(email) {
    const { rows } = await db_1.pool.query(`SELECT id, name, email FROM users WHERE email = $1`, [email]);
    return rows[0] || null;
}
