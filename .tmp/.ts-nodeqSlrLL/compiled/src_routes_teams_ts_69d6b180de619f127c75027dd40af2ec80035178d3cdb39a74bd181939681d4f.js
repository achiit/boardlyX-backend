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
const teamRepo = __importStar(require("../repositories/teamRepository"));
const notifRepo = __importStar(require("../repositories/notificationRepository"));
const taskRepo = __importStar(require("../repositories/taskRepository"));
const chatRepo = __importStar(require("../repositories/chatRepository"));
const socket_1 = require("../socket");
const db_1 = require("../db");
const zod_1 = require("zod");
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
function userId(req) {
    return req.user.userId;
}
function userEmail(req) {
    return req.user.email || null;
}
const CreateTeamSchema = zod_1.z.object({ name: zod_1.z.string().min(1).max(100) });
const InviteSchema = zod_1.z.object({
    userId: zod_1.z.string().uuid().optional(),
    email: zod_1.z.string().email().optional(),
}).refine((d) => d.userId || d.email, { message: 'userId or email required' });
const MoveTasksSchema = zod_1.z.object({
    moves: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.string().uuid(),
        boardColumn: zod_1.z.string(),
        boardOrder: zod_1.z.number(),
    })),
});
router.post('/', async (req, res, next) => {
    try {
        const body = CreateTeamSchema.parse(req.body);
        const team = await teamRepo.createTeam(body.name, userId(req));
        // Auto-create group chat for this team
        const groupConv = await chatRepo.createConversation('group', body.name, team.id);
        await chatRepo.addMember(groupConv.id, userId(req));
        (0, socket_1.joinUserToConversation)(userId(req), groupConv.id);
        res.status(201).json(team);
    }
    catch (err) {
        next(err);
    }
});
router.get('/', async (req, res, next) => {
    try {
        const teams = await teamRepo.getTeamsByUser(userId(req));
        const enriched = await Promise.all(teams.map(async (t) => ({
            ...t,
            memberCount: await teamRepo.getMemberCount(t.id),
        })));
        res.json(enriched);
    }
    catch (err) {
        next(err);
    }
});
router.get('/:id', async (req, res, next) => {
    try {
        const team = await teamRepo.getTeamById(req.params.id);
        if (!team)
            return res.status(404).json({ error: 'Team not found' });
        const isMember = await teamRepo.isTeamMember(team.id, userId(req));
        if (!isMember)
            return res.status(403).json({ error: 'Not a member of this team' });
        const members = await teamRepo.getTeamMembers(team.id);
        res.json({ ...team, members });
    }
    catch (err) {
        next(err);
    }
});
router.post('/:id/invite', async (req, res, next) => {
    try {
        const body = InviteSchema.parse(req.body);
        const team = await teamRepo.getTeamById(req.params.id);
        if (!team)
            return res.status(404).json({ error: 'Team not found' });
        const role = await teamRepo.getMemberRole(team.id, userId(req));
        if (!role || role === 'member')
            return res.status(403).json({ error: 'Only owner/admin can invite' });
        let inviteeUser = null;
        if (body.userId) {
            const { rows } = await db_1.pool.query('SELECT id, name, email FROM users WHERE id = $1', [body.userId]);
            inviteeUser = rows[0] || null;
            if (!inviteeUser)
                return res.status(404).json({ error: 'User not found' });
        }
        else if (body.email) {
            inviteeUser = await teamRepo.findUserByEmail(body.email);
        }
        if (inviteeUser) {
            const alreadyMember = await teamRepo.isTeamMember(team.id, inviteeUser.id);
            if (alreadyMember)
                return res.status(409).json({ error: 'User is already a team member' });
        }
        const inviteeEmail = inviteeUser?.email || body.email || '';
        const invitation = await teamRepo.createInvitation(team.id, userId(req), inviteeEmail);
        if (inviteeUser) {
            await notifRepo.createNotification(inviteeUser.id, 'team_invite', 'Team Invitation', `You've been invited to join "${team.name}"`, { invitationId: invitation.id, teamId: team.id, teamName: team.name });
        }
        res.status(201).json(invitation);
    }
    catch (err) {
        next(err);
    }
});
router.post('/invitations/:invId/accept', async (req, res, next) => {
    try {
        const inv = await teamRepo.getInvitationById(req.params.invId);
        if (!inv || inv.status !== 'pending')
            return res.status(404).json({ error: 'Invitation not found or already handled' });
        const currentEmail = userEmail(req);
        if (inv.invitee_email !== currentEmail)
            return res.status(403).json({ error: 'This invitation is not for you' });
        await teamRepo.updateInvitationStatus(inv.id, 'accepted');
        await teamRepo.addTeamMember(inv.team_id, userId(req));
        // Auto-add to team group chat
        const groupConv = await chatRepo.findGroupConversation(inv.team_id);
        if (groupConv) {
            await chatRepo.addMember(groupConv.id, userId(req));
            (0, socket_1.joinUserToConversation)(userId(req), groupConv.id);
        }
        const members = await teamRepo.getTeamMembers(inv.team_id);
        for (const m of members) {
            if (m.user_id !== userId(req)) {
                await notifRepo.createNotification(m.user_id, 'member_joined', 'New Team Member', `${currentEmail} has joined "${inv.team_name}"`, { teamId: inv.team_id, teamName: inv.team_name });
            }
        }
        res.json({ ok: true });
    }
    catch (err) {
        next(err);
    }
});
router.post('/invitations/:invId/reject', async (req, res, next) => {
    try {
        const inv = await teamRepo.getInvitationById(req.params.invId);
        if (!inv || inv.status !== 'pending')
            return res.status(404).json({ error: 'Invitation not found or already handled' });
        const currentEmail = userEmail(req);
        if (inv.invitee_email !== currentEmail)
            return res.status(403).json({ error: 'This invitation is not for you' });
        await teamRepo.updateInvitationStatus(inv.id, 'rejected');
        await notifRepo.createNotification(inv.inviter_id, 'invite_rejected', 'Invitation Declined', `${currentEmail} declined the invitation to "${inv.team_name}"`, { teamId: inv.team_id });
        res.json({ ok: true });
    }
    catch (err) {
        next(err);
    }
});
router.delete('/:id', async (req, res, next) => {
    try {
        const team = await teamRepo.getTeamById(req.params.id);
        if (!team)
            return res.status(404).json({ error: 'Team not found' });
        const role = await teamRepo.getMemberRole(team.id, userId(req));
        if (role !== 'owner')
            return res.status(403).json({ error: 'Only the owner can delete this team' });
        await teamRepo.deleteTeam(team.id);
        res.json({ ok: true });
    }
    catch (err) {
        next(err);
    }
});
router.delete('/:id/members/:userId', async (req, res, next) => {
    try {
        const team = await teamRepo.getTeamById(req.params.id);
        if (!team)
            return res.status(404).json({ error: 'Team not found' });
        const role = await teamRepo.getMemberRole(team.id, userId(req));
        if (!role || role === 'member')
            return res.status(403).json({ error: 'Insufficient permissions' });
        await teamRepo.removeTeamMember(team.id, req.params.userId);
        res.json({ ok: true });
    }
    catch (err) {
        next(err);
    }
});
router.get('/:id/tasks', async (req, res, next) => {
    try {
        const team = await teamRepo.getTeamById(req.params.id);
        if (!team)
            return res.status(404).json({ error: 'Team not found' });
        const isMember = await teamRepo.isTeamMember(team.id, userId(req));
        if (!isMember)
            return res.status(403).json({ error: 'Not a member' });
        const tasks = await taskRepo.listTeamTasks(team.id);
        const enriched = await Promise.all(tasks.map(async (t) => ({
            ...t,
            assignees: await taskRepo.getTaskAssignees(t.id),
        })));
        res.json(enriched);
    }
    catch (err) {
        next(err);
    }
});
router.post('/:id/tasks', async (req, res, next) => {
    try {
        console.log('[DEBUG] Task Create Request Body:', req.body);
        const team = await teamRepo.getTeamById(req.params.id);
        if (!team)
            return res.status(404).json({ error: 'Team not found' });
        const isMember = await teamRepo.isTeamMember(team.id, userId(req));
        if (!isMember)
            return res.status(403).json({ error: 'Not a member' });
        const { title, description, priority, dueDate, boardColumn, assigneeIds } = req.body;
        const task = await taskRepo.createTask({
            userId: userId(req),
            title,
            description,
            priority,
            dueDate: dueDate || null,
            teamId: team.id,
            boardColumn: boardColumn || 'backlog',
        });
        if (assigneeIds && Array.isArray(assigneeIds) && assigneeIds.length > 0) {
            await taskRepo.setTaskAssignees(task.id, assigneeIds);
        }
        const assignees = await taskRepo.getTaskAssignees(task.id);
        const assigneeIdsFinal = assignees.map(a => a.user_id);
        // Notify team members via Telegram
        const { notifyTeamMembersOfTask } = require('../telegramBot');
        const senderName = req.user.name || req.user.username || 'A team member';
        notifyTeamMembersOfTask(team.id, team.name, userId(req), senderName, title, assigneeIdsFinal).catch((err) => {
            console.error('Failed to dispatch telegram task notifications:', err);
        });
        res.status(201).json({ ...task, assignees });
    }
    catch (err) {
        next(err);
    }
});
router.put('/:id/tasks/:taskId/move', async (req, res, next) => {
    try {
        const isMember = await teamRepo.isTeamMember(req.params.id, userId(req));
        if (!isMember)
            return res.status(403).json({ error: 'Not a member' });
        const { boardColumn, boardOrder } = req.body;
        const updated = await taskRepo.updateTask(req.params.taskId, userId(req), { boardColumn, boardOrder });
        if (!updated) {
            await taskRepo.updateBoardPositions([{ id: req.params.taskId, boardColumn, boardOrder }]);
        }
        res.json({ ok: true });
    }
    catch (err) {
        next(err);
    }
});
router.put('/:id/tasks/reorder', async (req, res, next) => {
    try {
        const isMember = await teamRepo.isTeamMember(req.params.id, userId(req));
        if (!isMember)
            return res.status(403).json({ error: 'Not a member' });
        const { moves } = MoveTasksSchema.parse(req.body);
        await taskRepo.updateBoardPositions(moves);
        res.json({ ok: true });
    }
    catch (err) {
        next(err);
    }
});
router.get('/:id/tasks/:taskId', async (req, res, next) => {
    try {
        const isMember = await teamRepo.isTeamMember(req.params.id, userId(req));
        if (!isMember)
            return res.status(403).json({ error: 'Not a member' });
        const task = await taskRepo.getTeamTaskById(req.params.taskId, req.params.id);
        if (!task)
            return res.status(404).json({ error: 'Task not found' });
        const assignees = await taskRepo.getTaskAssignees(task.id);
        res.json({ ...task, assignees });
    }
    catch (err) {
        next(err);
    }
});
router.put('/:id/tasks/:taskId', async (req, res, next) => {
    try {
        console.log('[DEBUG] Task Update Request Body:', req.body);
        const isMember = await teamRepo.isTeamMember(req.params.id, userId(req));
        if (!isMember)
            return res.status(403).json({ error: 'Not a member' });
        // Fetch original to detect changes
        const originalTask = await taskRepo.getTeamTaskById(req.params.taskId, req.params.id);
        const originalAssigneesRows = await taskRepo.getTaskAssignees(req.params.taskId);
        const originalAssigneeIds = originalAssigneesRows.map(a => a.user_id).sort().join(',');
        const { title, description, status, priority, boardColumn, boardOrder, assigneeIds } = req.body;
        const updated = await taskRepo.updateTeamTask(req.params.taskId, req.params.id, {
            title, description, status, priority, boardColumn, boardOrder,
        });
        if (!updated)
            return res.status(404).json({ error: 'Task not found' });
        if (assigneeIds && Array.isArray(assigneeIds)) {
            await taskRepo.setTaskAssignees(req.params.taskId, assigneeIds);
        }
        const assignees = await taskRepo.getTaskAssignees(updated.id);
        const assigneeIdsFinal = assignees.map(a => a.user_id);
        const newAssigneeIdsStr = [...assigneeIdsFinal].sort().join(',');
        // Track what changed for the notification
        const updates = [];
        if (originalTask) {
            if (title && title !== originalTask.title)
                updates.push(`- Title changed to "${title}"`);
            if (description !== undefined && description !== originalTask.description)
                updates.push(`- Description was updated`);
            if (status && status !== originalTask.status)
                updates.push(`- Status changed to "${status}"`);
            if (priority && priority !== originalTask.priority)
                updates.push(`- Priority changed to ${priority}`);
            if (boardColumn && boardColumn !== originalTask.board_column)
                updates.push(`- Moved to column "${boardColumn}"`);
            if (assigneeIds && originalAssigneeIds !== newAssigneeIdsStr)
                updates.push(`- Assignees were modified`);
        }
        if (updates.length > 0) {
            const team = await teamRepo.getTeamById(req.params.id);
            if (team) {
                const { notifyTaskUpdated } = require('../telegramBot');
                const senderName = req.user.name || req.user.username || 'A team member';
                notifyTaskUpdated(team.id, team.name, userId(req), senderName, updated.title, updates.join('\n'), assigneeIdsFinal).catch((err) => {
                    console.error('Failed to dispatch telegram task update notifications:', err);
                });
            }
        }
        res.json({ ...updated, assignees });
    }
    catch (err) {
        next(err);
    }
});
router.delete('/:id/tasks/:taskId', async (req, res, next) => {
    try {
        const isMember = await teamRepo.isTeamMember(req.params.id, userId(req));
        if (!isMember)
            return res.status(403).json({ error: 'Not a member' });
        const deleted = await taskRepo.deleteTeamTask(req.params.taskId, req.params.id);
        if (!deleted)
            return res.status(404).json({ error: 'Task not found' });
        res.json({ ok: true });
    }
    catch (err) {
        next(err);
    }
});
router.put('/:id/tasks/:taskId/assignees', async (req, res, next) => {
    try {
        const isMember = await teamRepo.isTeamMember(req.params.id, userId(req));
        if (!isMember)
            return res.status(403).json({ error: 'Not a member' });
        const { assigneeIds } = req.body;
        if (!Array.isArray(assigneeIds))
            return res.status(400).json({ error: 'assigneeIds must be an array' });
        const originalAssigneesRows = await taskRepo.getTaskAssignees(req.params.taskId);
        const originalAssigneeIds = originalAssigneesRows.map((a) => a.user_id).sort().join(',');
        await taskRepo.setTaskAssignees(req.params.taskId, assigneeIds);
        const assignees = await taskRepo.getTaskAssignees(req.params.taskId);
        const assigneeIdsFinal = assignees.map((a) => a.user_id);
        const newAssigneeIdsStr = [...assigneeIdsFinal].sort().join(',');
        if (originalAssigneeIds !== newAssigneeIdsStr) {
            // Notification for specific assignee modifications
            const task = await taskRepo.getTeamTaskById(req.params.taskId, req.params.id);
            const team = await teamRepo.getTeamById(req.params.id);
            if (task && team) {
                const { notifyTaskUpdated } = require('../telegramBot');
                const senderName = req.user.name || req.user.username || 'A team member';
                notifyTaskUpdated(team.id, team.name, userId(req), senderName, task.title, '• Assignees were modified', assigneeIdsFinal).catch((err) => {
                    console.error('Failed to dispatch telegram task update notifications:', err);
                });
            }
        }
        res.json(assignees);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiL1ZvbHVtZXMvQWFkaXR5YSdzIFNTRC9EZXZlbG9wbWVudC9ib2FyZGx5WC1iYWNrZW5kL3NyYy9yb3V0ZXMvdGVhbXMudHMiLCJzb3VyY2VzIjpbIi9Wb2x1bWVzL0FhZGl0eWEncyBTU0QvRGV2ZWxvcG1lbnQvYm9hcmRseVgtYmFja2VuZC9zcmMvcm91dGVzL3RlYW1zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEscUNBQWtFO0FBQ2xFLDZDQUFnRTtBQUNoRSx5RUFBMkQ7QUFDM0Qsa0ZBQW9FO0FBQ3BFLHlFQUEyRDtBQUMzRCx5RUFBMkQ7QUFDM0Qsc0NBQW1EO0FBQ25ELDhCQUE2QjtBQUM3Qiw2QkFBd0I7QUFFeEIsTUFBTSxNQUFNLEdBQUcsSUFBQSxnQkFBTSxHQUFFLENBQUM7QUFDeEIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxxQkFBYyxDQUFDLENBQUM7QUFFM0IsU0FBUyxNQUFNLENBQUMsR0FBWTtJQUMxQixPQUFRLEdBQVcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDO0FBQ2xDLENBQUM7QUFFRCxTQUFTLFNBQVMsQ0FBQyxHQUFZO0lBQzdCLE9BQVEsR0FBVyxDQUFDLElBQUksQ0FBQyxLQUFLLElBQUksSUFBSSxDQUFDO0FBQ3pDLENBQUM7QUFFRCxNQUFNLGdCQUFnQixHQUFHLE9BQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLEVBQUUsT0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQ3hFLE1BQU0sWUFBWSxHQUFHLE9BQUMsQ0FBQyxNQUFNLENBQUM7SUFDNUIsTUFBTSxFQUFFLE9BQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDcEMsS0FBSyxFQUFFLE9BQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxLQUFLLEVB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RCxNQUFNLFVBQVUsR0FBSSxHQUFXLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSyxHQUFXLENBQUMsSUFBSSxDQUFDLFFBQVEsSUFBSSxlQUFlLENBQUM7Z0JBQzNGLGlCQUFpQixDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsVUFBVSxFQUFFLElBQUksQ0FBQyxLQUFLLEVBQUUsMkJBQTJCLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFRLEVBQUUsRUFBRTtvQkFDM0ksT0FBTyxDQUFDLEtBQUssQ0FBQyx3REFBd0QsRUFBRSxHQUFHLENBQUMsQ0FBQztnQkFDL0UsQ0FBQyxDQUFDLENBQUM7WUFDTCxDQUFDO1FBQ0gsQ0FBQztRQUVELEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDdEIsQ0FBQztJQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7UUFBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7SUFBQyxDQUFDO0FBQzlCLENBQUMsQ0FBQyxDQUFDO0FBRUgsa0JBQWUsTUFBTSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgUm91dGVyLCBSZXF1ZXN0LCBSZXNwb25zZSwgTmV4dEZ1bmN0aW9uIH0gZnJvbSAnZXhwcmVzcyc7XG5pbXBvcnQgeyBhdXRoTWlkZGxld2FyZSwgSnd0UGF5bG9hZCB9IGZyb20gJy4uL21pZGRsZXdhcmUvYXV0aCc7XG5pbXBvcnQgKiBhcyB0ZWFtUmVwbyBmcm9tICcuLi9yZXBvc2l0b3JpZXMvdGVhbVJlcG9zaXRvcnknO1xuaW1wb3J0ICogYXMgbm90aWZSZXBvIGZyb20gJy4uL3JlcG9zaXRvcmllcy9ub3RpZmljYXRpb25SZXBvc2l0b3J5JztcbmltcG9ydCAqIGFzIHRhc2tSZXBvIGZyb20gJy4uL3JlcG9zaXRvcmllcy90YXNrUmVwb3NpdG9yeSc7XG5pbXBvcnQgKiBhcyBjaGF0UmVwbyBmcm9tICcuLi9yZXBvc2l0b3JpZXMvY2hhdFJlcG9zaXRvcnknO1xuaW1wb3J0IHsgam9pblVzZXJUb0NvbnZlcnNhdGlvbiB9IGZyb20gJy4uL3NvY2tldCc7XG5pbXBvcnQgeyBwb29sIH0gZnJvbSAnLi4vZGInO1xuaW1wb3J0IHsgeiB9IGZyb20gJ3pvZCc7XG5cbmNvbnN0IHJvdXRlciA9IFJvdXRlcigpO1xucm91dGVyLnVzZShhdXRoTWlkZGxld2FyZSk7XG5cbmZ1bmN0aW9uIHVzZXJJZChyZXE6IFJlcXVlc3QpOiBzdHJpbmcge1xuICByZXR1cm4gKHJlcSBhcyBhbnkpLnVzZXIudXNlcklkO1xufVxuXG5mdW5jdGlvbiB1c2VyRW1haWwocmVxOiBSZXF1ZXN0KTogc3RyaW5nIHwgbnVsbCB7XG4gIHJldHVybiAocmVxIGFzIGFueSkudXNlci5lbWFpbCB8fCBudWxsO1xufVxuXG5jb25zdCBDcmVhdGVUZWFtU2NoZW1hID0gei5vYmplY3QoeyBuYW1lOiB6LnN0cmluZygpLm1pbigxKS5tYXgoMTAwKSB9KTtcbmNvbnN0IEludml0ZVNjaGVtYSA9IHoub2JqZWN0KHtcbiAgdXNlcklkOiB6LnN0cmluZygpLnV1aWQoKS5vcHRpb25hbCgpLFxuICBlbWFpbDogei5zdHJpbmcoKS5lbWFpbCgpLm9wdGlvbmFsKCksXG59KS5yZWZpbmUoKGQpID0+IGQudXNlcklkIHx8IGQuZW1haWwsIHsgbWVzc2FnZTogJ3VzZXJJZCBvciBlbWFpbCByZXF1aXJlZCcgfSk7XG5jb25zdCBNb3ZlVGFza3NTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIG1vdmVzOiB6LmFycmF5KHoub2JqZWN0KHtcbiAgICBpZDogei5zdHJpbmcoKS51dWlkKCksXG4gICAgYm9hcmRDb2x1bW46IHouc3RyaW5nKCksXG4gICAgYm9hcmRPcmRlcjogei5udW1iZXIoKSxcbiAgfSkpLFxufSk7XG5cbnJvdXRlci5wb3N0KCcvJywgYXN5bmMgKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSwgbmV4dDogTmV4dEZ1bmN0aW9uKSA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgYm9keSA9IENyZWF0ZVRlYW1TY2hlbWEucGFyc2UocmVxLmJvZHkpO1xuICAgIGNvbnN0IHRlYW0gPSBhd2FpdCB0ZWFtUmVwby5jcmVhdGVUZWFtKGJvZHkubmFtZSwgdXNlcklkKHJlcSkpO1xuXG4gICAgLy8gQXV0by1jcmVhdGUgZ3JvdXAgY2hhdCBmb3IgdGhpcyB0ZWFtXG4gICAgY29uc3QgZ3JvdXBDb252ID0gYXdhaXQgY2hhdFJlcG8uY3JlYXRlQ29udmVyc2F0aW9uKCdncm91cCcsIGJvZHkubmFtZSwgdGVhbS5pZCk7XG4gICAgYXdhaXQgY2hhdFJlcG8uYWRkTWVtYmVyKGdyb3VwQ29udi5pZCwgdXNlcklkKHJlcSkpO1xuICAgIGpvaW5Vc2VyVG9Db252ZXJzYXRpb24odXNlcklkKHJlcSksIGdyb3VwQ29udi5pZCk7XG5cbiAgICByZXMuc3RhdHVzKDIwMSkuanNvbih0ZWFtKTtcbiAgfSBjYXRjaCAoZXJyKSB7IG5leHQoZXJyKTsgfVxufSk7XG5cbnJvdXRlci5nZXQoJy8nLCBhc3luYyAocmVxOiBSZXF1ZXN0LCByZXM6IFJlc3BvbnNlLCBuZXh0OiBOZXh0RnVuY3Rpb24pID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCB0ZWFtcyA9IGF3YWl0IHRlYW1SZXBvLmdldFRlYW1zQnlVc2VyKHVzZXJJZChyZXEpKTtcbiAgICBjb25zdCBlbnJpY2hlZCA9IGF3YWl0IFByb21pc2UuYWxsKHRlYW1zLm1hcChhc3luYyAodCkgPT4gKHtcbiAgICAgIC4uLnQsXG4gICAgICBtZW1iZXJDb3VudDogYXdhaXQgdGVhbVJlcG8uZ2V0TWVtYmVyQ291bnQodC5pZCksXG4gICAgfSkpKTtcbiAgICByZXMuanNvbihlbnJpY2hlZCk7XG4gIH0gY2F0Y2ggKGVycikgeyBuZXh0KGVycik7IH1cbn0pO1xuXG5yb3V0ZXIuZ2V0KCcvOmlkJywgYXN5bmMgKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSwgbmV4dDogTmV4dEZ1bmN0aW9uKSA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgdGVhbSA9IGF3YWl0IHRlYW1SZXBvLmdldFRlYW1CeUlkKHJlcS5wYXJhbXMuaWQpO1xuICAgIGlmICghdGVhbSkgcmV0dXJuIHJlcy5zdGF0dXMoNDA0KS5qc29uKHsgZXJyb3I6ICdUZWFtIG5vdCBmb3VuZCcgfSk7XG4gICAgY29uc3QgaXNNZW1iZXIgPSBhd2FpdCB0ZWFtUmVwby5pc1RlYW1NZW1iZXIodGVhbS5pZCwgdXNlcklkKHJlcSkpO1xuICAgIGlmICghaXNNZW1iZXIpIHJldHVybiByZXMuc3RhdHVzKDQwMykuanNvbih7IGVycm9yOiAnTm90IGEgbWVtYmVyIG9mIHRoaXMgdGVhbScgfSk7XG4gICAgY29uc3QgbWVtYmVycyA9IGF3YWl0IHRlYW1SZXBvLmdldFRlYW1NZW1iZXJzKHRlYW0uaWQpO1xuICAgIHJlcy5qc29uKHsgLi4udGVhbSwgbWVtYmVycyB9KTtcbiAgfSBjYXRjaCAoZXJyKSB7IG5leHQoZXJyKTsgfVxufSk7XG5cbnJvdXRlci5wb3N0KCcvOmlkL2ludml0ZScsIGFzeW5jIChyZXE6IFJlcXVlc3QsIHJlczogUmVzcG9uc2UsIG5leHQ6IE5leHRGdW5jdGlvbikgPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IGJvZHkgPSBJbnZpdGVTY2hlbWEucGFyc2UocmVxLmJvZHkpO1xuICAgIGNvbnN0IHRlYW0gPSBhd2FpdCB0ZWFtUmVwby5nZXRUZWFtQnlJZChyZXEucGFyYW1zLmlkKTtcbiAgICBpZiAoIXRlYW0pIHJldHVybiByZXMuc3RhdHVzKDQwNCkuanNvbih7IGVycm9yOiAnVGVhbSBub3QgZm91bmQnIH0pO1xuXG4gICAgY29uc3Qgcm9sZSA9IGF3YWl0IHRlYW1SZXBvLmdldE1lbWJlclJvbGUodGVhbS5pZCwgdXNlcklkKHJlcSkpO1xuICAgIGlmICghcm9sZSB8fCByb2xlID09PSAnbWVtYmVyJykgcmV0dXJuIHJlcy5zdGF0dXMoNDAzKS5qc29uKHsgZXJyb3I6ICdPbmx5IG93bmVyL2FkbWluIGNhbiBpbnZpdGUnIH0pO1xuXG4gICAgbGV0IGludml0ZWVVc2VyOiB7IGlkOiBzdHJpbmc7IG5hbWU6IHN0cmluZyB8IG51bGw7IGVtYWlsOiBzdHJpbmcgfCBudWxsIH0gfCBudWxsID0gbnVsbDtcblxuICAgIGlmIChib2R5LnVzZXJJZCkge1xuICAgICAgY29uc3QgeyByb3dzIH0gPSBhd2FpdCBwb29sLnF1ZXJ5KCdTRUxFQ1QgaWQsIG5hbWUsIGVtYWlsIEZST00gdXNlcnMgV0hFUkUgaWQgPSAkMScsIFtib2R5LnVzZXJJZF0pO1xuICAgICAgaW52aXRlZVVzZXIgPSByb3dzWzBdIHx8IG51bGw7XG4gICAgICBpZiAoIWludml0ZWVVc2VyKSByZXR1cm4gcmVzLnN0YXR1cyg0MDQpLmpzb24oeyBlcnJvcjogJ1VzZXIgbm90IGZvdW5kJyB9KTtcbiAgICB9IGVsc2UgaWYgKGJvZHkuZW1haWwpIHtcbiAgICAgIGludml0ZWVVc2VyID0gYXdhaXQgdGVhbVJlcG8uZmluZFVzZXJCeUVtYWlsKGJvZHkuZW1haWwpO1xuICAgIH1cblxuICAgIGlmIChpbnZpdGVlVXNlcikge1xuICAgICAgY29uc3QgYWxyZWFkeU1lbWJlciA9IGF3YWl0IHRlYW1SZXBvLmlzVGVhbU1lbWJlcih0ZWFtLmlkLCBpbnZpdGVlVXNlci5pZCk7XG4gICAgICBpZiAoYWxyZWFkeU1lbWJlcikgcmV0dXJuIHJlcy5zdGF0dXMoNDA5KS5qc29uKHsgZXJyb3I6ICdVc2VyIGlzIGFscmVhZHkgYSB0ZWFtIG1lbWJlcicgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgaW52aXRlZUVtYWlsID0gaW52aXRlZVVzZXI/LmVtYWlsIHx8IGJvZHkuZW1haWwgfHwgJyc7XG4gICAgY29uc3QgaW52aXRhdGlvbiA9IGF3YWl0IHRlYW1SZXBvLmNyZWF0ZUludml0YXRpb24odGVhbS5pZCwgdXNlcklkKHJlcSksIGludml0ZWVFbWFpbCk7XG5cbiAgICBpZiAoaW52aXRlZVVzZXIpIHtcbiAgICAgIGF3YWl0IG5vdGlmUmVwby5jcmVhdGVOb3RpZmljYXRpb24oXG4gICAgICAgIGludml0ZWVVc2VyLmlkLFxuICAgICAgICAndGVhbV9pbnZpdGUnLFxuICAgICAgICAnVGVhbSBJbnZpdGF0aW9uJyxcbiAgICAgICAgYFlvdSd2ZSBiZWVuIGludml0ZWQgdG8gam9pbiBcIiR7dGVhbS5uYW1lfVwiYCxcbiAgICAgICAgeyBpbnZpdGF0aW9uSWQ6IGludml0YXRpb24uaWQsIHRlYW1JZDogdGVhbS5pZCwgdGVhbU5hbWU6IHRlYW0ubmFtZSB9LFxuICAgICAgKTtcbiAgICB9XG5cbiAgICByZXMuc3RhdHVzKDIwMSkuanNvbihpbnZpdGF0aW9uKTtcbiAgfSBjYXRjaCAoZXJyKSB7IG5leHQoZXJyKTsgfVxufSk7XG5cbnJvdXRlci5wb3N0KCcvaW52aXRhdGlvbnMvOmludklkL2FjY2VwdCcsIGFzeW5jIChyZXE6IFJlcXVlc3QsIHJlczogUmVzcG9uc2UsIG5leHQ6IE5leHRGdW5jdGlvbikgPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IGludiA9IGF3YWl0IHRlYW1SZXBvLmdldEludml0YXRpb25CeUlkKHJlcS5wYXJhbXMuaW52SWQpO1xuICAgIGlmICghaW52IHx8IGludi5zdGF0dXMgIT09ICdwZW5kaW5nJykgcmV0dXJuIHJlcy5zdGF0dXMoNDA0KS5qc29uKHsgZXJyb3I6ICdJbnZpdGF0aW9uIG5vdCBmb3VuZCBvciBhbHJlYWR5IGhhbmRsZWQnIH0pO1xuXG4gICAgY29uc3QgY3VycmVudEVtYWlsID0gdXNlckVtYWlsKHJlcSk7XG4gICAgaWYgKGludi5pbnZpdGVlX2VtYWlsICE9PSBjdXJyZW50RW1haWwpIHJldHVybiByZXMuc3RhdHVzKDQwMykuanNvbih7IGVycm9yOiAnVGhpcyBpbnZpdGF0aW9uIGlzIG5vdCBmb3IgeW91JyB9KTtcblxuICAgIGF3YWl0IHRlYW1SZXBvLnVwZGF0ZUludml0YXRpb25TdGF0dXMoaW52LmlkLCAnYWNjZXB0ZWQnKTtcbiAgICBhd2FpdCB0ZWFtUmVwby5hZGRUZWFtTWVtYmVyKGludi50ZWFtX2lkLCB1c2VySWQocmVxKSk7XG5cbiAgICAvLyBBdXRvLWFkZCB0byB0ZWFtIGdyb3VwIGNoYXRcbiAgICBjb25zdCBncm91cENvbnYgPSBhd2FpdCBjaGF0UmVwby5maW5kR3JvdXBDb252ZXJzYXRpb24oaW52LnRlYW1faWQpO1xuICAgIGlmIChncm91cENvbnYpIHtcbiAgICAgIGF3YWl0IGNoYXRSZXBvLmFkZE1lbWJlcihncm91cENvbnYuaWQsIHVzZXJJZChyZXEpKTtcbiAgICAgIGpvaW5Vc2VyVG9Db252ZXJzYXRpb24odXNlcklkKHJlcSksIGdyb3VwQ29udi5pZCk7XG4gICAgfVxuXG4gICAgY29uc3QgbWVtYmVycyA9IGF3YWl0IHRlYW1SZXBvLmdldFRlYW1NZW1iZXJzKGludi50ZWFtX2lkKTtcbiAgICBmb3IgKGNvbnN0IG0gb2YgbWVtYmVycykge1xuICAgICAgaWYgKG0udXNlcl9pZCAhPT0gdXNlcklkKHJlcSkpIHtcbiAgICAgICAgYXdhaXQgbm90aWZSZXBvLmNyZWF0ZU5vdGlmaWNhdGlvbihcbiAgICAgICAgICBtLnVzZXJfaWQsXG4gICAgICAgICAgJ21lbWJlcl9qb2luZWQnLFxuICAgICAgICAgICdOZXcgVGVhbSBNZW1iZXInLFxuICAgICAgICAgIGAke2N1cnJlbnRFbWFpbH0gaGFzIGpvaW5lZCBcIiR7aW52LnRlYW1fbmFtZX1cImAsXG4gICAgICAgICAgeyB0ZWFtSWQ6IGludi50ZWFtX2lkLCB0ZWFtTmFtZTogaW52LnRlYW1fbmFtZSB9LFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJlcy5qc29uKHsgb2s6IHRydWUgfSk7XG4gIH0gY2F0Y2ggKGVycikgeyBuZXh0KGVycik7IH1cbn0pO1xuXG5yb3V0ZXIucG9zdCgnL2ludml0YXRpb25zLzppbnZJZC9yZWplY3QnLCBhc3luYyAocmVxOiBSZXF1ZXN0LCByZXM6IFJlc3BvbnNlLCBuZXh0OiBOZXh0RnVuY3Rpb24pID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBpbnYgPSBhd2FpdCB0ZWFtUmVwby5nZXRJbnZpdGF0aW9uQnlJZChyZXEucGFyYW1zLmludklkKTtcbiAgICBpZiAoIWludiB8fCBpbnYuc3RhdHVzICE9PSAncGVuZGluZycpIHJldHVybiByZXMuc3RhdHVzKDQwNCkuanNvbih7IGVycm9yOiAnSW52aXRhdGlvbiBub3QgZm91bmQgb3IgYWxyZWFkeSBoYW5kbGVkJyB9KTtcblxuICAgIGNvbnN0IGN1cnJlbnRFbWFpbCA9IHVzZXJFbWFpbChyZXEpO1xuICAgIGlmIChpbnYuaW52aXRlZV9lbWFpbCAhPT0gY3VycmVudEVtYWlsKSByZXR1cm4gcmVzLnN0YXR1cyg0MDMpLmpzb24oeyBlcnJvcjogJ1RoaXMgaW52aXRhdGlvbiBpcyBub3QgZm9yIHlvdScgfSk7XG5cbiAgICBhd2FpdCB0ZWFtUmVwby51cGRhdGVJbnZpdGF0aW9uU3RhdHVzKGludi5pZCwgJ3JlamVjdGVkJyk7XG5cbiAgICBhd2FpdCBub3RpZlJlcG8uY3JlYXRlTm90aWZpY2F0aW9uKFxuICAgICAgaW52Lmludml0ZXJfaWQsXG4gICAgICAnaW52aXRlX3JlamVjdGVkJyxcbiAgICAgICdJbnZpdGF0aW9uIERlY2xpbmVkJyxcbiAgICAgIGAke2N1cnJlbnRFbWFpbH0gZGVjbGluZWQgdGhlIGludml0YXRpb24gdG8gXCIke2ludi50ZWFtX25hbWV9XCJgLFxuICAgICAgeyB0ZWFtSWQ6IGludi50ZWFtX2lkIH0sXG4gICAgKTtcblxuICAgIHJlcy5qc29uKHsgb2s6IHRydWUgfSk7XG4gIH0gY2F0Y2ggKGVycikgeyBuZXh0KGVycik7IH1cbn0pO1xuXG5yb3V0ZXIuZGVsZXRlKCcvOmlkJywgYXN5bmMgKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSwgbmV4dDogTmV4dEZ1bmN0aW9uKSA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgdGVhbSA9IGF3YWl0IHRlYW1SZXBvLmdldFRlYW1CeUlkKHJlcS5wYXJhbXMuaWQpO1xuICAgIGlmICghdGVhbSkgcmV0dXJuIHJlcy5zdGF0dXMoNDA0KS5qc29uKHsgZXJyb3I6ICdUZWFtIG5vdCBmb3VuZCcgfSk7XG4gICAgY29uc3Qgcm9sZSA9IGF3YWl0IHRlYW1SZXBvLmdldE1lbWJlclJvbGUodGVhbS5pZCwgdXNlcklkKHJlcSkpO1xuICAgIGlmIChyb2xlICE9PSAnb3duZXInKSByZXR1cm4gcmVzLnN0YXR1cyg0MDMpLmpzb24oeyBlcnJvcjogJ09ubHkgdGhlIG93bmVyIGNhbiBkZWxldGUgdGhpcyB0ZWFtJyB9KTtcbiAgICBhd2FpdCB0ZWFtUmVwby5kZWxldGVUZWFtKHRlYW0uaWQpO1xuICAgIHJlcy5qc29uKHsgb2s6IHRydWUgfSk7XG4gIH0gY2F0Y2ggKGVycikgeyBuZXh0KGVycik7IH1cbn0pO1xuXG5yb3V0ZXIuZGVsZXRlKCcvOmlkL21lbWJlcnMvOnVzZXJJZCcsIGFzeW5jIChyZXE6IFJlcXVlc3QsIHJlczogUmVzcG9uc2UsIG5leHQ6IE5leHRGdW5jdGlvbikgPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHRlYW0gPSBhd2FpdCB0ZWFtUmVwby5nZXRUZWFtQnlJZChyZXEucGFyYW1zLmlkKTtcbiAgICBpZiAoIXRlYW0pIHJldHVybiByZXMuc3RhdHVzKDQwNCkuanNvbih7IGVycm9yOiAnVGVhbSBub3QgZm91bmQnIH0pO1xuICAgIGNvbnN0IHJvbGUgPSBhd2FpdCB0ZWFtUmVwby5nZXRNZW1iZXJSb2xlKHRlYW0uaWQsIHVzZXJJZChyZXEpKTtcbiAgICBpZiAoIXJvbGUgfHwgcm9sZSA9PT0gJ21lbWJlcicpIHJldHVybiByZXMuc3RhdHVzKDQwMykuanNvbih7IGVycm9yOiAnSW5zdWZmaWNpZW50IHBlcm1pc3Npb25zJyB9KTtcbiAgICBhd2FpdCB0ZWFtUmVwby5yZW1vdmVUZWFtTWVtYmVyKHRlYW0uaWQsIHJlcS5wYXJhbXMudXNlcklkKTtcbiAgICByZXMuanNvbih7IG9rOiB0cnVlIH0pO1xuICB9IGNhdGNoIChlcnIpIHsgbmV4dChlcnIpOyB9XG59KTtcblxucm91dGVyLmdldCgnLzppZC90YXNrcycsIGFzeW5jIChyZXE6IFJlcXVlc3QsIHJlczogUmVzcG9uc2UsIG5leHQ6IE5leHRGdW5jdGlvbikgPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHRlYW0gPSBhd2FpdCB0ZWFtUmVwby5nZXRUZWFtQnlJZChyZXEucGFyYW1zLmlkKTtcbiAgICBpZiAoIXRlYW0pIHJldHVybiByZXMuc3RhdHVzKDQwNCkuanNvbih7IGVycm9yOiAnVGVhbSBub3QgZm91bmQnIH0pO1xuICAgIGNvbnN0IGlzTWVtYmVyID0gYXdhaXQgdGVhbVJlcG8uaXNUZWFtTWVtYmVyKHRlYW0uaWQsIHVzZXJJZChyZXEpKTtcbiAgICBpZiAoIWlzTWVtYmVyKSByZXR1cm4gcmVzLnN0YXR1cyg0MDMpLmpzb24oeyBlcnJvcjogJ05vdCBhIG1lbWJlcicgfSk7XG4gICAgY29uc3QgdGFza3MgPSBhd2FpdCB0YXNrUmVwby5saXN0VGVhbVRhc2tzKHRlYW0uaWQpO1xuICAgIGNvbnN0IGVucmljaGVkID0gYXdhaXQgUHJvbWlzZS5hbGwodGFza3MubWFwKGFzeW5jICh0KSA9PiAoe1xuICAgICAgLi4udCxcbiAgICAgIGFzc2lnbmVlczogYXdhaXQgdGFza1JlcG8uZ2V0VGFza0Fzc2lnbmVlcyh0LmlkKSxcbiAgICB9KSkpO1xuICAgIHJlcy5qc29uKGVucmljaGVkKTtcbiAgfSBjYXRjaCAoZXJyKSB7IG5leHQoZXJyKTsgfVxufSk7XG5cbnJvdXRlci5wb3N0KCcvOmlkL3Rhc2tzJywgYXN5bmMgKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSwgbmV4dDogTmV4dEZ1bmN0aW9uKSA9PiB7XG4gIHRyeSB7XG4gICAgY29uc29sZS5sb2coJ1tERUJVR10gVGFzayBDcmVhdGUgUmVxdWVzdCBCb2R5OicsIHJlcS5ib2R5KTtcbiAgICBjb25zdCB0ZWFtID0gYXdhaXQgdGVhbVJlcG8uZ2V0VGVhbUJ5SWQocmVxLnBhcmFtcy5pZCk7XG4gICAgaWYgKCF0ZWFtKSByZXR1cm4gcmVzLnN0YXR1cyg0MDQpLmpzb24oeyBlcnJvcjogJ1RlYW0gbm90IGZvdW5kJyB9KTtcbiAgICBjb25zdCBpc01lbWJlciA9IGF3YWl0IHRlYW1SZXBvLmlzVGVhbU1lbWJlcih0ZWFtLmlkLCB1c2VySWQocmVxKSk7XG4gICAgaWYgKCFpc01lbWJlcikgcmV0dXJuIHJlcy5zdGF0dXMoNDAzKS5qc29uKHsgZXJyb3I6ICdOb3QgYSBtZW1iZXInIH0pO1xuXG4gICAgY29uc3QgeyB0aXRsZSwgZGVzY3JpcHRpb24sIHByaW9yaXR5LCBkdWVEYXRlLCBib2FyZENvbHVtbiwgYXNzaWduZWVJZHMgfSA9IHJlcS5ib2R5O1xuICAgIGNvbnN0IHRhc2sgPSBhd2FpdCB0YXNrUmVwby5jcmVhdGVUYXNrKHtcbiAgICAgIHVzZXJJZDogdXNlcklkKHJlcSksXG4gICAgICB0aXRsZSxcbiAgICAgIGRlc2NyaXB0aW9uLFxuICAgICAgcHJpb3JpdHksXG4gICAgICBkdWVEYXRlOiBkdWVEYXRlIHx8IG51bGwsXG4gICAgICB0ZWFtSWQ6IHRlYW0uaWQsXG4gICAgICBib2FyZENvbHVtbjogYm9hcmRDb2x1bW4gfHwgJ2JhY2tsb2cnLFxuICAgIH0pO1xuXG4gICAgaWYgKGFzc2lnbmVlSWRzICYmIEFycmF5LmlzQXJyYXkoYXNzaWduZWVJZHMpICYmIGFzc2lnbmVlSWRzLmxlbmd0aCA+IDApIHtcbiAgICAgIGF3YWl0IHRhc2tSZXBvLnNldFRhc2tBc3NpZ25lZXModGFzay5pZCwgYXNzaWduZWVJZHMpO1xuICAgIH1cblxuICAgIGNvbnN0IGFzc2lnbmVlcyA9IGF3YWl0IHRhc2tSZXBvLmdldFRhc2tBc3NpZ25lZXModGFzay5pZCk7XG4gICAgY29uc3QgYXNzaWduZWVJZHNGaW5hbCA9IGFzc2lnbmVlcy5tYXAoYSA9PiBhLnVzZXJfaWQpO1xuXG4gICAgLy8gTm90aWZ5IHRlYW0gbWVtYmVycyB2aWEgVGVsZWdyYW1cbiAgICBjb25zdCB7IG5vdGlmeVRlYW1NZW1iZXJzT2ZUYXNrIH0gPSByZXF1aXJlKCcuLi90ZWxlZ3JhbUJvdCcpO1xuICAgIGNvbnN0IHNlbmRlck5hbWUgPSAocmVxIGFzIGFueSkudXNlci5uYW1lIHx8IChyZXEgYXMgYW55KS51c2VyLnVzZXJuYW1lIHx8ICdBIHRlYW0gbWVtYmVyJztcbiAgICBub3RpZnlUZWFtTWVtYmVyc09mVGFzayh0ZWFtLmlkLCB0ZWFtLm5hbWUsIHVzZXJJZChyZXEpLCBzZW5kZXJOYW1lLCB0aXRsZSwgYXNzaWduZWVJZHNGaW5hbCkuY2F0Y2goKGVycjogYW55KSA9PiB7XG4gICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gZGlzcGF0Y2ggdGVsZWdyYW0gdGFzayBub3RpZmljYXRpb25zOicsIGVycik7XG4gICAgfSk7XG5cbiAgICByZXMuc3RhdHVzKDIwMSkuanNvbih7IC4uLnRhc2ssIGFzc2lnbmVlcyB9KTtcbiAgfSBjYXRjaCAoZXJyKSB7IG5leHQoZXJyKTsgfVxufSk7XG5cbnJvdXRlci5wdXQoJy86aWQvdGFza3MvOnRhc2tJZC9tb3ZlJywgYXN5bmMgKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSwgbmV4dDogTmV4dEZ1bmN0aW9uKSA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgaXNNZW1iZXIgPSBhd2FpdCB0ZWFtUmVwby5pc1RlYW1NZW1iZXIocmVxLnBhcmFtcy5pZCwgdXNlcklkKHJlcSkpO1xuICAgIGlmICghaXNNZW1iZXIpIHJldHVybiByZXMuc3RhdHVzKDQwMykuanNvbih7IGVycm9yOiAnTm90IGEgbWVtYmVyJyB9KTtcbiAgICBjb25zdCB7IGJvYXJkQ29sdW1uLCBib2FyZE9yZGVyIH0gPSByZXEuYm9keTtcbiAgICBjb25zdCB1cGRhdGVkID0gYXdhaXQgdGFza1JlcG8udXBkYXRlVGFzayhyZXEucGFyYW1zLnRhc2tJZCwgdXNlcklkKHJlcSksIHsgYm9hcmRDb2x1bW4sIGJvYXJkT3JkZXIgfSk7XG4gICAgaWYgKCF1cGRhdGVkKSB7XG4gICAgICBhd2FpdCB0YXNrUmVwby51cGRhdGVCb2FyZFBvc2l0aW9ucyhbeyBpZDogcmVxLnBhcmFtcy50YXNrSWQsIGJvYXJkQ29sdW1uLCBib2FyZE9yZGVyIH1dKTtcbiAgICB9XG4gICAgcmVzLmpzb24oeyBvazogdHJ1ZSB9KTtcbiAgfSBjYXRjaCAoZXJyKSB7IG5leHQoZXJyKTsgfVxufSk7XG5cbnJvdXRlci5wdXQoJy86aWQvdGFza3MvcmVvcmRlcicsIGFzeW5jIChyZXE6IFJlcXVlc3QsIHJlczogUmVzcG9uc2UsIG5leHQ6IE5leHRGdW5jdGlvbikgPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IGlzTWVtYmVyID0gYXdhaXQgdGVhbVJlcG8uaXNUZWFtTWVtYmVyKHJlcS5wYXJhbXMuaWQsIHVzZXJJZChyZXEpKTtcbiAgICBpZiAoIWlzTWVtYmVyKSByZXR1cm4gcmVzLnN0YXR1cyg0MDMpLmpzb24oeyBlcnJvcjogJ05vdCBhIG1lbWJlcicgfSk7XG4gICAgY29uc3QgeyBtb3ZlcyB9ID0gTW92ZVRhc2tzU2NoZW1hLnBhcnNlKHJlcS5ib2R5KTtcbiAgICBhd2FpdCB0YXNrUmVwby51cGRhdGVCb2FyZFBvc2l0aW9ucyhtb3Zlcyk7XG4gICAgcmVzLmpzb24oeyBvazogdHJ1ZSB9KTtcbiAgfSBjYXRjaCAoZXJyKSB7IG5leHQoZXJyKTsgfVxufSk7XG5cbnJvdXRlci5nZXQoJy86aWQvdGFza3MvOnRhc2tJZCcsIGFzeW5jIChyZXE6IFJlcXVlc3QsIHJlczogUmVzcG9uc2UsIG5leHQ6IE5leHRGdW5jdGlvbikgPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IGlzTWVtYmVyID0gYXdhaXQgdGVhbVJlcG8uaXNUZWFtTWVtYmVyKHJlcS5wYXJhbXMuaWQsIHVzZXJJZChyZXEpKTtcbiAgICBpZiAoIWlzTWVtYmVyKSByZXR1cm4gcmVzLnN0YXR1cyg0MDMpLmpzb24oeyBlcnJvcjogJ05vdCBhIG1lbWJlcicgfSk7XG4gICAgY29uc3QgdGFzayA9IGF3YWl0IHRhc2tSZXBvLmdldFRlYW1UYXNrQnlJZChyZXEucGFyYW1zLnRhc2tJZCwgcmVxLnBhcmFtcy5pZCk7XG4gICAgaWYgKCF0YXNrKSByZXR1cm4gcmVzLnN0YXR1cyg0MDQpLmpzb24oeyBlcnJvcjogJ1Rhc2sgbm90IGZvdW5kJyB9KTtcbiAgICBjb25zdCBhc3NpZ25lZXMgPSBhd2FpdCB0YXNrUmVwby5nZXRUYXNrQXNzaWduZWVzKHRhc2suaWQpO1xuICAgIHJlcy5qc29uKHsgLi4udGFzaywgYXNzaWduZWVzIH0pO1xuICB9IGNhdGNoIChlcnIpIHsgbmV4dChlcnIpOyB9XG59KTtcblxucm91dGVyLnB1dCgnLzppZC90YXNrcy86dGFza0lkJywgYXN5bmMgKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSwgbmV4dDogTmV4dEZ1bmN0aW9uKSA9PiB7XG4gIHRyeSB7XG4gICAgY29uc29sZS5sb2coJ1tERUJVR10gVGFzayBVcGRhdGUgUmVxdWVzdCBCb2R5OicsIHJlcS5ib2R5KTtcbiAgICBjb25zdCBpc01lbWJlciA9IGF3YWl0IHRlYW1SZXBvLmlzVGVhbU1lbWJlcihyZXEucGFyYW1zLmlkLCB1c2VySWQocmVxKSk7XG4gICAgaWYgKCFpc01lbWJlcikgcmV0dXJuIHJlcy5zdGF0dXMoNDAzKS5qc29uKHsgZXJyb3I6ICdOb3QgYSBtZW1iZXInIH0pO1xuXG4gICAgLy8gRmV0Y2ggb3JpZ2luYWwgdG8gZGV0ZWN0IGNoYW5nZXNcbiAgICBjb25zdCBvcmlnaW5hbFRhc2sgPSBhd2FpdCB0YXNrUmVwby5nZXRUZWFtVGFza0J5SWQocmVxLnBhcmFtcy50YXNrSWQsIHJlcS5wYXJhbXMuaWQpO1xuICAgIGNvbnN0IG9yaWdpbmFsQXNzaWduZWVzUm93cyA9IGF3YWl0IHRhc2tSZXBvLmdldFRhc2tBc3NpZ25lZXMocmVxLnBhcmFtcy50YXNrSWQpO1xuICAgIGNvbnN0IG9yaWdpbmFsQXNzaWduZWVJZHMgPSBvcmlnaW5hbEFzc2lnbmVlc1Jvd3MubWFwKGEgPT4gYS51c2VyX2lkKS5zb3J0KCkuam9pbignLCcpO1xuXG4gICAgY29uc3QgeyB0aXRsZSwgZGVzY3JpcHRpb24sIHN0YXR1cywgcHJpb3JpdHksIGJvYXJkQ29sdW1uLCBib2FyZE9yZGVyLCBhc3NpZ25lZUlkcyB9ID0gcmVxLmJvZHk7XG4gICAgY29uc3QgdXBkYXRlZCA9IGF3YWl0IHRhc2tSZXBvLnVwZGF0ZVRlYW1UYXNrKHJlcS5wYXJhbXMudGFza0lkLCByZXEucGFyYW1zLmlkLCB7XG4gICAgICB0aXRsZSwgZGVzY3JpcHRpb24sIHN0YXR1cywgcHJpb3JpdHksIGJvYXJkQ29sdW1uLCBib2FyZE9yZGVyLFxuICAgIH0pO1xuXG4gICAgaWYgKCF1cGRhdGVkKSByZXR1cm4gcmVzLnN0YXR1cyg0MDQpLmpzb24oeyBlcnJvcjogJ1Rhc2sgbm90IGZvdW5kJyB9KTtcblxuICAgIGlmIChhc3NpZ25lZUlkcyAmJiBBcnJheS5pc0FycmF5KGFzc2lnbmVlSWRzKSkge1xuICAgICAgYXdhaXQgdGFza1JlcG8uc2V0VGFza0Fzc2lnbmVlcyhyZXEucGFyYW1zLnRhc2tJZCwgYXNzaWduZWVJZHMpO1xuICAgIH1cblxuICAgIGNvbnN0IGFzc2lnbmVlcyA9IGF3YWl0IHRhc2tSZXBvLmdldFRhc2tBc3NpZ25lZXModXBkYXRlZC5pZCk7XG4gICAgY29uc3QgYXNzaWduZWVJZHNGaW5hbCA9IGFzc2lnbmVlcy5tYXAoYSA9PiBhLnVzZXJfaWQpO1xuICAgIGNvbnN0IG5ld0Fzc2lnbmVlSWRzU3RyID0gWy4uLmFzc2lnbmVlSWRzRmluYWxdLnNvcnQoKS5qb2luKCcsJyk7XG5cbiAgICAvLyBUcmFjayB3aGF0IGNoYW5nZWQgZm9yIHRoZSBub3RpZmljYXRpb25cbiAgICBjb25zdCB1cGRhdGVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGlmIChvcmlnaW5hbFRhc2spIHtcbiAgICAgIGlmICh0aXRsZSAmJiB0aXRsZSAhPT0gb3JpZ2luYWxUYXNrLnRpdGxlKSB1cGRhdGVzLnB1c2goYC0gVGl0bGUgY2hhbmdlZCB0byBcIiR7dGl0bGV9XCJgKTtcbiAgICAgIGlmIChkZXNjcmlwdGlvbiAhPT0gdW5kZWZpbmVkICYmIGRlc2NyaXB0aW9uICE9PSBvcmlnaW5hbFRhc2suZGVzY3JpcHRpb24pIHVwZGF0ZXMucHVzaChgLSBEZXNjcmlwdGlvbiB3YXMgdXBkYXRlZGApO1xuICAgICAgaWYgKHN0YXR1cyAmJiBzdGF0dXMgIT09IG9yaWdpbmFsVGFzay5zdGF0dXMpIHVwZGF0ZXMucHVzaChgLSBTdGF0dXMgY2hhbmdlZCB0byBcIiR7c3RhdHVzfVwiYCk7XG4gICAgICBpZiAocHJpb3JpdHkgJiYgcHJpb3JpdHkgIT09IG9yaWdpbmFsVGFzay5wcmlvcml0eSkgdXBkYXRlcy5wdXNoKGAtIFByaW9yaXR5IGNoYW5nZWQgdG8gJHtwcmlvcml0eX1gKTtcbiAgICAgIGlmIChib2FyZENvbHVtbiAmJiBib2FyZENvbHVtbiAhPT0gb3JpZ2luYWxUYXNrLmJvYXJkX2NvbHVtbikgdXBkYXRlcy5wdXNoKGAtIE1vdmVkIHRvIGNvbHVtbiBcIiR7Ym9hcmRDb2x1bW59XCJgKTtcbiAgICAgIGlmIChhc3NpZ25lZUlkcyAmJiBvcmlnaW5hbEFzc2lnbmVlSWRzICE9PSBuZXdBc3NpZ25lZUlkc1N0cikgdXBkYXRlcy5wdXNoKGAtIEFzc2lnbmVlcyB3ZXJlIG1vZGlmaWVkYCk7XG4gICAgfVxuXG4gICAgaWYgKHVwZGF0ZXMubGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgdGVhbSA9IGF3YWl0IHRlYW1SZXBvLmdldFRlYW1CeUlkKHJlcS5wYXJhbXMuaWQpO1xuICAgICAgaWYgKHRlYW0pIHtcbiAgICAgICAgY29uc3QgeyBub3RpZnlUYXNrVXBkYXRlZCB9ID0gcmVxdWlyZSgnLi4vdGVsZWdyYW1Cb3QnKTtcbiAgICAgICAgY29uc3Qgc2VuZGVyTmFtZSA9IChyZXEgYXMgYW55KS51c2VyLm5hbWUgfHwgKHJlcSBhcyBhbnkpLnVzZXIudXNlcm5hbWUgfHwgJ0EgdGVhbSBtZW1iZXInO1xuICAgICAgICBub3RpZnlUYXNrVXBkYXRlZCh0ZWFtLmlkLCB0ZWFtLm5hbWUsIHVzZXJJZChyZXEpLCBzZW5kZXJOYW1lLCB1cGRhdGVkLnRpdGxlLCB1cGRhdGVzLmpvaW4oJ1xcbicpLCBhc3NpZ25lZUlkc0ZpbmFsKS5jYXRjaCgoZXJyOiBhbnkpID0+IHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gZGlzcGF0Y2ggdGVsZWdyYW0gdGFzayB1cGRhdGUgbm90aWZpY2F0aW9uczonLCBlcnIpO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXMuanNvbih7IC4uLnVwZGF0ZWQsIGFzc2lnbmVlcyB9KTtcbiAgfSBjYXRjaCAoZXJyKSB7IG5leHQoZXJyKTsgfVxufSk7XG5cbnJvdXRlci5kZWxldGUoJy86aWQvdGFza3MvOnRhc2tJZCcsIGFzeW5jIChyZXE6IFJlcXVlc3QsIHJlczogUmVzcG9uc2UsIG5leHQ6IE5leHRGdW5jdGlvbikgPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IGlzTWVtYmVyID0gYXdhaXQgdGVhbVJlcG8uaXNUZWFtTWVtYmVyKHJlcS5wYXJhbXMuaWQsIHVzZXJJZChyZXEpKTtcbiAgICBpZiAoIWlzTWVtYmVyKSByZXR1cm4gcmVzLnN0YXR1cyg0MDMpLmpzb24oeyBlcnJvcjogJ05vdCBhIG1lbWJlcicgfSk7XG4gICAgY29uc3QgZGVsZXRlZCA9IGF3YWl0IHRhc2tSZXBvLmRlbGV0ZVRlYW1UYXNrKHJlcS5wYXJhbXMudGFza0lkLCByZXEucGFyYW1zLmlkKTtcbiAgICBpZiAoIWRlbGV0ZWQpIHJldHVybiByZXMuc3RhdHVzKDQwNCkuanNvbih7IGVycm9yOiAnVGFzayBub3QgZm91bmQnIH0pO1xuICAgIHJlcy5qc29uKHsgb2s6IHRydWUgfSk7XG4gIH0gY2F0Y2ggKGVycikgeyBuZXh0KGVycik7IH1cbn0pO1xuXG5yb3V0ZXIucHV0KCcvOmlkL3Rhc2tzLzp0YXNrSWQvYXNzaWduZWVzJywgYXN5bmMgKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSwgbmV4dDogTmV4dEZ1bmN0aW9uKSA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgaXNNZW1iZXIgPSBhd2FpdCB0ZWFtUmVwby5pc1RlYW1NZW1iZXIocmVxLnBhcmFtcy5pZCwgdXNlcklkKHJlcSkpO1xuICAgIGlmICghaXNNZW1iZXIpIHJldHVybiByZXMuc3RhdHVzKDQwMykuanNvbih7IGVycm9yOiAnTm90IGEgbWVtYmVyJyB9KTtcbiAgICBjb25zdCB7IGFzc2lnbmVlSWRzIH0gPSByZXEuYm9keTtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkoYXNzaWduZWVJZHMpKSByZXR1cm4gcmVzLnN0YXR1cyg0MDApLmpzb24oeyBlcnJvcjogJ2Fzc2lnbmVlSWRzIG11c3QgYmUgYW4gYXJyYXknIH0pO1xuXG4gICAgY29uc3Qgb3JpZ2luYWxBc3NpZ25lZXNSb3dzID0gYXdhaXQgdGFza1JlcG8uZ2V0VGFza0Fzc2lnbmVlcyhyZXEucGFyYW1zLnRhc2tJZCk7XG4gICAgY29uc3Qgb3JpZ2luYWxBc3NpZ25lZUlkcyA9IG9yaWdpbmFsQXNzaWduZWVzUm93cy5tYXAoKGE6IGFueSkgPT4gYS51c2VyX2lkKS5zb3J0KCkuam9pbignLCcpO1xuXG4gICAgYXdhaXQgdGFza1JlcG8uc2V0VGFza0Fzc2lnbmVlcyhyZXEucGFyYW1zLnRhc2tJZCwgYXNzaWduZWVJZHMpO1xuICAgIGNvbnN0IGFzc2lnbmVlcyA9IGF3YWl0IHRhc2tSZXBvLmdldFRhc2tBc3NpZ25lZXMocmVxLnBhcmFtcy50YXNrSWQpO1xuICAgIGNvbnN0IGFzc2lnbmVlSWRzRmluYWwgPSBhc3NpZ25lZXMubWFwKChhOiBhbnkpID0+IGEudXNlcl9pZCk7XG4gICAgY29uc3QgbmV3QXNzaWduZWVJZHNTdHIgPSBbLi4uYXNzaWduZWVJZHNGaW5hbF0uc29ydCgpLmpvaW4oJywnKTtcblxuICAgIGlmIChvcmlnaW5hbEFzc2lnbmVlSWRzICE9PSBuZXdBc3NpZ25lZUlkc1N0cikge1xuICAgICAgLy8gTm90aWZpY2F0aW9uIGZvciBzcGVjaWZpYyBhc3NpZ25lZSBtb2RpZmljYXRpb25zXG4gICAgICBjb25zdCB0YXNrID0gYXdhaXQgdGFza1JlcG8uZ2V0VGVhbVRhc2tCeUlkKHJlcS5wYXJhbXMudGFza0lkLCByZXEucGFyYW1zLmlkKTtcbiAgICAgIGNvbnN0IHRlYW0gPSBhd2FpdCB0ZWFtUmVwby5nZXRUZWFtQnlJZChyZXEucGFyYW1zLmlkKTtcblxuICAgICAgaWYgKHRhc2sgJiYgdGVhbSkge1xuICAgICAgICBjb25zdCB7IG5vdGlmeVRhc2tVcGRhdGVkIH0gPSByZXF1aXJlKCcuLi90ZWxlZ3JhbUJvdCcpO1xuICAgICAgICBjb25zdCBzZW5kZXJOYW1lID0gKHJlcSBhcyBhbnkpLnVzZXIubmFtZSB8fCAocmVxIGFzIGFueSkudXNlci51c2VybmFtZSB8fCAnQSB0ZWFtIG1lbWJlcic7XG4gICAgICAgIG5vdGlmeVRhc2tVcGRhdGVkKHRlYW0uaWQsIHRlYW0ubmFtZSwgdXNlcklkKHJlcSksIHNlbmRlck5hbWUsIHRhc2sudGl0bGUsICfigKIgQXNzaWduZWVzIHdlcmUgbW9kaWZpZWQnLCBhc3NpZ25lZUlkc0ZpbmFsKS5jYXRjaCgoZXJyOiBhbnkpID0+IHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gZGlzcGF0Y2ggdGVsZWdyYW0gdGFzayB1cGRhdGUgbm90aWZpY2F0aW9uczonLCBlcnIpO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXMuanNvbihhc3NpZ25lZXMpO1xuICB9IGNhdGNoIChlcnIpIHsgbmV4dChlcnIpOyB9XG59KTtcblxuZXhwb3J0IGRlZmF1bHQgcm91dGVyO1xuIl19