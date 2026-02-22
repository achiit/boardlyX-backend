import * as taskRepo from '../repositories/taskRepository';
import { sha256TaskHash } from '../utils/hash';
import * as blockchain from './blockchainService';

export interface TaskCreateBody {
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  dueDate?: string | null;
  boardColumn?: string;
}

export interface TaskUpdateBody {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  dueDate?: string | null;
  boardColumn?: string;
  boardOrder?: number;
}

export interface TaskListQuery {
  status?: string;
  priority?: string;
  search?: string;
  sortBy?: string;
  order?: string;
  limit?: string;
  offset?: string;
}

export interface StoreOnChainBody {
  transactionHash: string;
  chainTimestamp: string;
}

function toTaskResponse(row: taskRepo.TaskRow) {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date ? new Date(row.due_date).toISOString() : null,
    taskHash: row.task_hash,
    transactionHash: row.transaction_hash,
    chainTimestamp: row.chain_timestamp ? new Date(row.chain_timestamp).toISOString() : null,
    boardColumn: row.board_column || 'backlog',
    boardOrder: row.board_order ?? 0,
    teamId: row.team_id || null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function createTask(userId: string, body: TaskCreateBody) {
  const dueDate = body.dueDate ? new Date(body.dueDate) : null;
  const inserted = await taskRepo.createTask({
    userId,
    title: body.title,
    description: body.description,
    status: body.status ?? 'pending',
    priority: body.priority ?? 'medium',
    dueDate,
    taskHash: null,
    boardColumn: body.boardColumn || 'backlog',
  });

  const createdAt =
    inserted.created_at instanceof Date
      ? inserted.created_at.toISOString()
      : String(inserted.created_at);
  const taskHash = sha256TaskHash(
    inserted.title,
    inserted.description,
    inserted.user_id,
    createdAt,
  );

  await taskRepo.updateTask(inserted.id, userId, { taskHash });
  const row = await taskRepo.getTaskById(inserted.id, userId);
  return toTaskResponse(row!);
}

export async function getTask(id: string, userId: string) {
  const row = await taskRepo.getTaskById(id, userId);
  if (!row) return null;
  return toTaskResponse(row);
}

export async function listTasks(userId: string, query: TaskListQuery) {
  const limit = Math.min(Math.max(parseInt(query.limit || '20', 10) || 20, 1), 100);
  const offset = Math.max(parseInt(query.offset || '0', 10) || 0, 0);
  const sortBy = query.sortBy === 'due_date' ? 'due_date' : 'created_at';
  const order = query.order === 'asc' ? 'asc' : 'desc';

  const { tasks, total } = await taskRepo.listTasks({
    userId,
    status: query.status,
    priority: query.priority,
    search: query.search?.trim() || undefined,
    sortBy,
    order,
    limit,
    offset,
  });

  return {
    tasks: tasks.map(toTaskResponse),
    total,
    limit,
    offset,
  };
}

export async function updateTask(id: string, userId: string, body: TaskUpdateBody) {
  const dueDate = body.dueDate !== undefined ? (body.dueDate ? new Date(body.dueDate) : null) : undefined;
  const row = await taskRepo.updateTask(id, userId, {
    title: body.title,
    description: body.description,
    status: body.status,
    priority: body.priority,
    dueDate,
    boardColumn: body.boardColumn,
    boardOrder: body.boardOrder,
  });
  if (!row) return null;
  return toTaskResponse(row);
}

export async function listMyBoardTasks(userId: string) {
  const rows = await taskRepo.listMyBoardTasks(userId);
  const enriched = await Promise.all(rows.map(async (r) => ({
    ...toTaskResponse(r),
    teamName: r.team_name,
    assignees: await taskRepo.getTaskAssignees(r.id),
  })));
  return enriched;
}

export async function deleteTask(id: string, userId: string) {
  return taskRepo.deleteTask(id, userId);
}

export async function storeOnChain(id: string, userId: string, body: StoreOnChainBody) {
  const row = await taskRepo.getTaskById(id, userId);
  if (!row) return null;

  const chainTs = body.chainTimestamp
    ? /^\d+$/.test(body.chainTimestamp)
      ? new Date(Number(body.chainTimestamp) * 1000)
      : new Date(body.chainTimestamp)
    : new Date();

  const updated = await taskRepo.updateTask(id, userId, {
    transactionHash: body.transactionHash,
    chainTimestamp: chainTs,
  });
  if (!updated) return null;
  return toTaskResponse(updated);
}

export async function verifyTask(id: string, userId: string, userWallet?: string) {
  const row = await taskRepo.getTaskById(id, userId);
  if (!row || !row.task_hash) {
    return {
      verified: false,
      blockTimestamp: null,
      transactionHash: row?.transaction_hash ?? null,
      error: !row ? 'Task not found' : 'Task has no hash',
    };
  }

  const result = await blockchain.findRecordByTaskHash(row.task_hash, userWallet);
  if (!result.verified) {
    return {
      verified: false,
      blockTimestamp: null,
      transactionHash: row.transaction_hash,
      error: 'Hash not found on chain',
    };
  }

  return {
    verified: true,
    blockTimestamp: result.blockTimestamp ?? null,
    transactionHash: row.transaction_hash,
  };
}

export async function getAnalytics(userId: string) {
  const counts = await taskRepo.getTaskCountsByUser(userId);
  const completionRate =
    counts.total > 0 ? Math.round((counts.completed / counts.total) * 100) : 0;
  return {
    totalTasks: counts.total,
    completedTasks: counts.completed,
    pendingTasks: counts.pending,
    onChainVerifiedCount: counts.onChainVerified,
    completionRatePercent: completionRate,
  };
}
