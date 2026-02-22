import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, JwtPayload } from '../middleware/auth';
import * as teamRepo from '../repositories/teamRepository';
import * as notifRepo from '../repositories/notificationRepository';
import * as taskRepo from '../repositories/taskRepository';
import * as chatRepo from '../repositories/chatRepository';
import { joinUserToConversation } from '../socket';
import { pool } from '../db';
import { z } from 'zod';

const router = Router();
router.use(authMiddleware);

function userId(req: Request): string {
  return (req as any).user.userId;
}

function userEmail(req: Request): string | null {
  return (req as any).user.email || null;
}

const CreateTeamSchema = z.object({ name: z.string().min(1).max(100) });
const InviteSchema = z.object({
  userId: z.string().uuid().optional(),
  email: z.string().email().optional(),
}).refine((d) => d.userId || d.email, { message: 'userId or email required' });
const MoveTasksSchema = z.object({
  moves: z.array(z.object({
    id: z.string().uuid(),
    boardColumn: z.string(),
    boardOrder: z.number(),
  })),
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = CreateTeamSchema.parse(req.body);
    const team = await teamRepo.createTeam(body.name, userId(req));

    // Auto-create group chat for this team
    const groupConv = await chatRepo.createConversation('group', body.name, team.id);
    await chatRepo.addMember(groupConv.id, userId(req));
    joinUserToConversation(userId(req), groupConv.id);

    res.status(201).json(team);
  } catch (err) { next(err); }
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const teams = await teamRepo.getTeamsByUser(userId(req));
    const enriched = await Promise.all(teams.map(async (t) => ({
      ...t,
      memberCount: await teamRepo.getMemberCount(t.id),
    })));
    res.json(enriched);
  } catch (err) { next(err); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const team = await teamRepo.getTeamById(req.params.id);
    if (!team) return res.status(404).json({ error: 'Team not found' });
    const isMember = await teamRepo.isTeamMember(team.id, userId(req));
    if (!isMember) return res.status(403).json({ error: 'Not a member of this team' });
    const members = await teamRepo.getTeamMembers(team.id);
    res.json({ ...team, members });
  } catch (err) { next(err); }
});

router.post('/:id/invite', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = InviteSchema.parse(req.body);
    const team = await teamRepo.getTeamById(req.params.id);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const role = await teamRepo.getMemberRole(team.id, userId(req));
    if (!role || role === 'member') return res.status(403).json({ error: 'Only owner/admin can invite' });

    let inviteeUser: { id: string; name: string | null; email: string | null } | null = null;

    if (body.userId) {
      const { rows } = await pool.query('SELECT id, name, email FROM users WHERE id = $1', [body.userId]);
      inviteeUser = rows[0] || null;
      if (!inviteeUser) return res.status(404).json({ error: 'User not found' });
    } else if (body.email) {
      inviteeUser = await teamRepo.findUserByEmail(body.email);
    }

    if (inviteeUser) {
      const alreadyMember = await teamRepo.isTeamMember(team.id, inviteeUser.id);
      if (alreadyMember) return res.status(409).json({ error: 'User is already a team member' });
    }

    const inviteeEmail = inviteeUser?.email || body.email || '';
    const invitation = await teamRepo.createInvitation(team.id, userId(req), inviteeEmail);

    if (inviteeUser) {
      await notifRepo.createNotification(
        inviteeUser.id,
        'team_invite',
        'Team Invitation',
        `You've been invited to join "${team.name}"`,
        { invitationId: invitation.id, teamId: team.id, teamName: team.name },
      );
    }

    res.status(201).json(invitation);
  } catch (err) { next(err); }
});

router.post('/invitations/:invId/accept', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inv = await teamRepo.getInvitationById(req.params.invId);
    if (!inv || inv.status !== 'pending') return res.status(404).json({ error: 'Invitation not found or already handled' });

    const currentEmail = userEmail(req);
    if (inv.invitee_email !== currentEmail) return res.status(403).json({ error: 'This invitation is not for you' });

    await teamRepo.updateInvitationStatus(inv.id, 'accepted');
    await teamRepo.addTeamMember(inv.team_id, userId(req));

    // Auto-add to team group chat
    const groupConv = await chatRepo.findGroupConversation(inv.team_id);
    if (groupConv) {
      await chatRepo.addMember(groupConv.id, userId(req));
      joinUserToConversation(userId(req), groupConv.id);
    }

    const members = await teamRepo.getTeamMembers(inv.team_id);
    for (const m of members) {
      if (m.user_id !== userId(req)) {
        await notifRepo.createNotification(
          m.user_id,
          'member_joined',
          'New Team Member',
          `${currentEmail} has joined "${inv.team_name}"`,
          { teamId: inv.team_id, teamName: inv.team_name },
        );
      }
    }

    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/invitations/:invId/reject', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inv = await teamRepo.getInvitationById(req.params.invId);
    if (!inv || inv.status !== 'pending') return res.status(404).json({ error: 'Invitation not found or already handled' });

    const currentEmail = userEmail(req);
    if (inv.invitee_email !== currentEmail) return res.status(403).json({ error: 'This invitation is not for you' });

    await teamRepo.updateInvitationStatus(inv.id, 'rejected');

    await notifRepo.createNotification(
      inv.inviter_id,
      'invite_rejected',
      'Invitation Declined',
      `${currentEmail} declined the invitation to "${inv.team_name}"`,
      { teamId: inv.team_id },
    );

    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const team = await teamRepo.getTeamById(req.params.id);
    if (!team) return res.status(404).json({ error: 'Team not found' });
    const role = await teamRepo.getMemberRole(team.id, userId(req));
    if (role !== 'owner') return res.status(403).json({ error: 'Only the owner can delete this team' });
    await teamRepo.deleteTeam(team.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:id/members/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const team = await teamRepo.getTeamById(req.params.id);
    if (!team) return res.status(404).json({ error: 'Team not found' });
    const role = await teamRepo.getMemberRole(team.id, userId(req));
    if (!role || role === 'member') return res.status(403).json({ error: 'Insufficient permissions' });
    await teamRepo.removeTeamMember(team.id, req.params.userId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/:id/tasks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const team = await teamRepo.getTeamById(req.params.id);
    if (!team) return res.status(404).json({ error: 'Team not found' });
    const isMember = await teamRepo.isTeamMember(team.id, userId(req));
    if (!isMember) return res.status(403).json({ error: 'Not a member' });
    const tasks = await taskRepo.listTeamTasks(team.id);
    const enriched = await Promise.all(tasks.map(async (t) => ({
      ...t,
      assignees: await taskRepo.getTaskAssignees(t.id),
    })));
    res.json(enriched);
  } catch (err) { next(err); }
});

router.post('/:id/tasks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const team = await teamRepo.getTeamById(req.params.id);
    if (!team) return res.status(404).json({ error: 'Team not found' });
    const isMember = await teamRepo.isTeamMember(team.id, userId(req));
    if (!isMember) return res.status(403).json({ error: 'Not a member' });

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
    res.status(201).json({ ...task, assignees });
  } catch (err) { next(err); }
});

router.put('/:id/tasks/:taskId/move', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const isMember = await teamRepo.isTeamMember(req.params.id, userId(req));
    if (!isMember) return res.status(403).json({ error: 'Not a member' });
    const { boardColumn, boardOrder } = req.body;
    const updated = await taskRepo.updateTask(req.params.taskId, userId(req), { boardColumn, boardOrder });
    if (!updated) {
      await taskRepo.updateBoardPositions([{ id: req.params.taskId, boardColumn, boardOrder }]);
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.put('/:id/tasks/reorder', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const isMember = await teamRepo.isTeamMember(req.params.id, userId(req));
    if (!isMember) return res.status(403).json({ error: 'Not a member' });
    const { moves } = MoveTasksSchema.parse(req.body);
    await taskRepo.updateBoardPositions(moves);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/:id/tasks/:taskId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const isMember = await teamRepo.isTeamMember(req.params.id, userId(req));
    if (!isMember) return res.status(403).json({ error: 'Not a member' });
    const task = await taskRepo.getTeamTaskById(req.params.taskId, req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const assignees = await taskRepo.getTaskAssignees(task.id);
    res.json({ ...task, assignees });
  } catch (err) { next(err); }
});

router.put('/:id/tasks/:taskId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const isMember = await teamRepo.isTeamMember(req.params.id, userId(req));
    if (!isMember) return res.status(403).json({ error: 'Not a member' });
    const { title, description, status, priority, boardColumn, boardOrder, assigneeIds } = req.body;
    const updated = await taskRepo.updateTeamTask(req.params.taskId, req.params.id, {
      title, description, status, priority, boardColumn, boardOrder,
    });
    if (!updated) return res.status(404).json({ error: 'Task not found' });
    if (assigneeIds && Array.isArray(assigneeIds)) {
      await taskRepo.setTaskAssignees(req.params.taskId, assigneeIds);
    }
    const assignees = await taskRepo.getTaskAssignees(updated.id);
    res.json({ ...updated, assignees });
  } catch (err) { next(err); }
});

router.delete('/:id/tasks/:taskId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const isMember = await teamRepo.isTeamMember(req.params.id, userId(req));
    if (!isMember) return res.status(403).json({ error: 'Not a member' });
    const deleted = await taskRepo.deleteTeamTask(req.params.taskId, req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Task not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.put('/:id/tasks/:taskId/assignees', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const isMember = await teamRepo.isTeamMember(req.params.id, userId(req));
    if (!isMember) return res.status(403).json({ error: 'Not a member' });
    const { assigneeIds } = req.body;
    if (!Array.isArray(assigneeIds)) return res.status(400).json({ error: 'assigneeIds must be an array' });
    await taskRepo.setTaskAssignees(req.params.taskId, assigneeIds);
    const assignees = await taskRepo.getTaskAssignees(req.params.taskId);
    res.json(assignees);
  } catch (err) { next(err); }
});

export default router;
