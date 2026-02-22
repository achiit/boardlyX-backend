import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import * as notifRepo from '../repositories/notificationRepository';

const router = Router();
router.use(authMiddleware);

function userId(req: Request): string {
  return (req as any).user.userId;
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const offset = Number(req.query.offset) || 0;
    const { notifications, total } = await notifRepo.getNotifications(userId(req), limit, offset);
    const unreadCount = await notifRepo.getUnreadCount(userId(req));
    res.json({ notifications, total, unreadCount });
  } catch (err) { next(err); }
});

router.get('/unread-count', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const count = await notifRepo.getUnreadCount(userId(req));
    res.json({ count });
  } catch (err) { next(err); }
});

router.put('/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await notifRepo.markAsRead(req.params.id, userId(req));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.put('/read-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await notifRepo.markAllAsRead(userId(req));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
