"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createConversation = createConversation;
exports.addMember = addMember;
exports.removeMember = removeMember;
exports.getConversationsByUser = getConversationsByUser;
exports.getConversationById = getConversationById;
exports.findGroupConversation = findGroupConversation;
exports.findDmConversation = findDmConversation;
exports.shareTeam = shareTeam;
exports.createMessage = createMessage;
exports.getMessages = getMessages;
exports.isMember = isMember;
exports.backfillTeamGroupChats = backfillTeamGroupChats;
const db_1 = require("../db");
// ── Conversations ──
async function createConversation(type, name, teamId) {
    const { rows } = await db_1.pool.query(`INSERT INTO conversations (type, name, team_id) VALUES ($1, $2, $3) RETURNING *`, [type, name, teamId]);
    return rows[0];
}
async function addMember(conversationId, userId) {
    await db_1.pool.query(`INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [conversationId, userId]);
}
async function removeMember(conversationId, userId) {
    await db_1.pool.query(`DELETE FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`, [conversationId, userId]);
}
async function getConversationsByUser(userId) {
    const { rows } = await db_1.pool.query(`SELECT c.*, 
            (SELECT count(*) FROM conversation_members WHERE conversation_id = c.id)::int AS member_count,
            (SELECT json_agg(json_build_object(
              'id', u.id, 'name', u.name, 'username', u.username, 'email', u.email
            )) FROM conversation_members cm2 
            JOIN users u ON u.id = cm2.user_id 
            WHERE cm2.conversation_id = c.id) AS members,
            (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message,
            (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message_at
     FROM conversations c
     JOIN conversation_members cm ON cm.conversation_id = c.id
     WHERE cm.user_id = $1
     ORDER BY COALESCE(
       (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1),
       c.created_at
     ) DESC`, [userId]);
    return rows;
}
async function getConversationById(conversationId) {
    const { rows } = await db_1.pool.query(`SELECT c.*,
            (SELECT json_agg(json_build_object(
              'id', u.id, 'name', u.name, 'username', u.username, 'email', u.email
            )) FROM conversation_members cm
            JOIN users u ON u.id = cm.user_id
            WHERE cm.conversation_id = c.id) AS members
     FROM conversations c WHERE c.id = $1`, [conversationId]);
    return rows[0] || null;
}
async function findGroupConversation(teamId) {
    const { rows } = await db_1.pool.query(`SELECT * FROM conversations WHERE team_id = $1 AND type = 'group' LIMIT 1`, [teamId]);
    return rows[0] || null;
}
async function findDmConversation(userA, userB) {
    const { rows } = await db_1.pool.query(`SELECT c.* FROM conversations c
     WHERE c.type = 'dm'
       AND EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = c.id AND user_id = $1)
       AND EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = c.id AND user_id = $2)
     LIMIT 1`, [userA, userB]);
    return rows[0] || null;
}
async function shareTeam(userA, userB) {
    const { rows } = await db_1.pool.query(`SELECT 1 FROM team_members a
     JOIN team_members b ON a.team_id = b.team_id
     WHERE a.user_id = $1 AND b.user_id = $2
     LIMIT 1`, [userA, userB]);
    return rows.length > 0;
}
// ── Messages ──
async function createMessage(conversationId, senderId, content, mediaType, mediaData) {
    const { rows } = await db_1.pool.query(`INSERT INTO messages (conversation_id, sender_id, content, media_type, media_data) VALUES ($1, $2, $3, $4, $5) RETURNING *`, [conversationId, senderId, content || '', mediaType || null, mediaData || null]);
    return rows[0];
}
async function getMessages(conversationId, limit = 50, before) {
    const params = [conversationId, limit];
    let whereClause = 'WHERE m.conversation_id = $1';
    if (before) {
        whereClause += ' AND m.created_at < $3';
        params.push(before);
    }
    const { rows } = await db_1.pool.query(`SELECT m.*, 
            json_build_object('id', u.id, 'name', u.name, 'username', u.username) AS sender
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     ${whereClause}
     ORDER BY m.created_at DESC
     LIMIT $2`, params);
    return rows.reverse(); // return oldest-first for display
}
async function isMember(conversationId, userId) {
    const { rows } = await db_1.pool.query(`SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2 LIMIT 1`, [conversationId, userId]);
    return rows.length > 0;
}
// ── Backfill: create group chats for existing teams that don't have one ──
async function backfillTeamGroupChats() {
    const { rows: teams } = await db_1.pool.query(`SELECT t.id, t.name FROM teams t
         WHERE NOT EXISTS (
           SELECT 1 FROM conversations c WHERE c.team_id = t.id AND c.type = 'group'
         )`);
    if (teams.length === 0)
        return;
    console.log(`[chat backfill] Creating group chats for ${teams.length} existing team(s)...`);
    for (const team of teams) {
        const conv = await createConversation('group', team.name, team.id);
        // Add all current members of the team
        const { rows: members } = await db_1.pool.query(`SELECT user_id FROM team_members WHERE team_id = $1`, [team.id]);
        for (const member of members) {
            await addMember(conv.id, member.user_id);
        }
        console.log(`[chat backfill] Created group chat for team "${team.name}" with ${members.length} member(s)`);
    }
}
