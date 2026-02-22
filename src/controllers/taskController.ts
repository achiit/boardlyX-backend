import { Request, Response } from 'express';
import { z } from 'zod';
import * as taskService from '../services/taskService';
import { JwtPayload } from '../middleware/auth';

const CreateTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  status: z.enum(['pending', 'completed']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  dueDate: z.string().optional().nullable(),
  boardColumn: z.string().optional(),
});

const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
  status: z.enum(['pending', 'completed']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  dueDate: z.string().optional().nullable(),
  boardColumn: z.string().optional(),
  boardOrder: z.number().optional(),
});

const StoreOnChainSchema = z.object({
  transactionHash: z.string().min(1),
  chainTimestamp: z.union([z.string(), z.number()]),
});

function getUserId(req: Request): string {
  return (req as any).user?.userId;
}

export async function createTask(req: Request, res: Response) {
  const parse = CreateTaskSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
  }
  const userId = getUserId(req);
  try {
    const task = await taskService.createTask(userId, parse.data);
    return res.status(201).json(task);
  } catch (err: any) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
}

export async function listTasks(req: Request, res: Response) {
  const userId = getUserId(req);
  const query = {
    status: req.query.status as string | undefined,
    priority: req.query.priority as string | undefined,
    search: req.query.search as string | undefined,
    sortBy: req.query.sortBy as string | undefined,
    order: req.query.order as string | undefined,
    limit: req.query.limit as string | undefined,
    offset: req.query.offset as string | undefined,
  };
  try {
    const result = await taskService.listTasks(userId, query);
    return res.json(result);
  } catch (err: any) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
}

export async function getTask(req: Request, res: Response) {
  const userId = getUserId(req);
  const task = await taskService.getTask(req.params.id, userId);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  return res.json(task);
}

export async function updateTask(req: Request, res: Response) {
  const parse = UpdateTaskSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
  }
  const userId = getUserId(req);
  const task = await taskService.updateTask(req.params.id, userId, parse.data);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  return res.json(task);
}

export async function deleteTask(req: Request, res: Response) {
  const userId = getUserId(req);
  const deleted = await taskService.deleteTask(req.params.id, userId);
  if (!deleted) return res.status(404).json({ error: 'Task not found' });
  return res.status(204).send();
}

export async function storeOnChain(req: Request, res: Response) {
  const parse = StoreOnChainSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
  }
  const userId = getUserId(req);
  const chainTimestamp =
    typeof parse.data.chainTimestamp === 'number'
      ? String(parse.data.chainTimestamp)
      : parse.data.chainTimestamp;
  const task = await taskService.storeOnChain(req.params.id, userId, {
    transactionHash: parse.data.transactionHash,
    chainTimestamp,
  });
  if (!task) return res.status(404).json({ error: 'Task not found' });
  return res.json(task);
}

export async function verifyTask(req: Request, res: Response) {
  const userId = getUserId(req);
  const userWallet = (req as any).user?.walletAddress ?? req.query.walletAddress as string | undefined;
  const result = await taskService.verifyTask(req.params.id, userId, userWallet);
  return res.json(result);
}

export async function myBoardTasks(req: Request, res: Response) {
  const userId = getUserId(req);
  try {
    const tasks = await taskService.listMyBoardTasks(userId);
    return res.json(tasks);
  } catch (err: any) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
}

export async function movePersonalTask(req: Request, res: Response) {
  const userId = getUserId(req);
  const { boardColumn, boardOrder } = req.body;
  const task = await taskService.updateTask(req.params.id, userId, { boardColumn, boardOrder });
  if (!task) return res.status(404).json({ error: 'Task not found' });
  return res.json(task);
}

export async function getAnalytics(req: Request, res: Response) {
  const userId = getUserId(req);
  const analytics = await taskService.getAnalytics(userId);
  return res.json(analytics);
}
