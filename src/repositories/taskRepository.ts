import { pool } from '../db';

export interface TaskRow {
  id: string;
  user_id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  due_date: Date | null;
  task_hash: string | null;
  transaction_hash: string | null;
  chain_timestamp: Date | null;
  team_id: string | null;
  board_column: string;
  board_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTaskInput {
  userId: string;
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  dueDate?: Date | null;
  taskHash?: string | null;
  teamId?: string | null;
  boardColumn?: string;
  boardOrder?: number;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  dueDate?: Date | null;
  taskHash?: string | null;
  transactionHash?: string | null;
  chainTimestamp?: Date | null;
  teamId?: string | null;
  boardColumn?: string;
  boardOrder?: number;
}

export interface ListTasksOptions {
  userId: string;
  status?: string;
  priority?: string;
  search?: string;
  sortBy?: 'created_at' | 'due_date';
  order?: 'asc' | 'desc';
  limit: number;
  offset: number;
}

export async function createTask(input: CreateTaskInput): Promise<TaskRow> {
  const { rows } = await pool.query<TaskRow>(
    `insert into tasks (user_id, title, description, status, priority, due_date, task_hash, team_id, board_column, board_order)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     returning *`,
    [
      input.userId,
      input.title,
      input.description ?? '',
      input.status ?? 'pending',
      input.priority ?? 'medium',
      input.dueDate ?? null,
      input.taskHash ?? null,
      input.teamId ?? null,
      input.boardColumn ?? 'backlog',
      input.boardOrder ?? 0,
    ],
  );
  return rows[0];
}

export async function getTaskById(id: string, userId: string): Promise<TaskRow | null> {
  const { rows } = await pool.query<TaskRow>(
    'select * from tasks where id = $1 and user_id = $2',
    [id, userId],
  );
  return rows[0] ?? null;
}

export async function listTasks(options: ListTasksOptions): Promise<{ tasks: TaskRow[]; total: number }> {
  const conditions: string[] = ['user_id = $1'];
  const params: any[] = [options.userId];
  let idx = 2;

  if (options.status) {
    conditions.push(`status = $${idx}`);
    params.push(options.status);
    idx++;
  }
  if (options.priority) {
    conditions.push(`priority = $${idx}`);
    params.push(options.priority);
    idx++;
  }
  if (options.search) {
    conditions.push(`(title ilike $${idx} or description ilike $${idx})`);
    params.push(`%${options.search}%`);
    idx++;
  }

  const where = conditions.join(' and ');
  const orderCol = options.sortBy === 'due_date' ? 'due_date' : 'created_at';
  const orderDir = options.order === 'asc' ? 'asc' : 'desc';
  const orderNulls = options.sortBy === 'due_date' ? ' nulls last' : '';

  const countResult = await pool.query(
    `select count(*)::int as c from tasks where ${where}`,
    params,
  );
  const total = countResult.rows[0]?.c ?? 0;

  const { rows } = await pool.query<TaskRow>(
    `select * from tasks where ${where}
     order by ${orderCol} ${orderDir}${orderNulls}
     limit $${idx} offset $${idx + 1}`,
    [...params, options.limit, options.offset],
  );

  return { tasks: rows, total };
}

export async function updateTask(id: string, userId: string, input: UpdateTaskInput): Promise<TaskRow | null> {
  const updates: string[] = [];
  const values: any[] = [];
  let i = 1;

  if (input.title !== undefined) {
    updates.push(`title = $${i++}`);
    values.push(input.title);
  }
  if (input.description !== undefined) {
    updates.push(`description = $${i++}`);
    values.push(input.description);
  }
  if (input.status !== undefined) {
    updates.push(`status = $${i++}`);
    values.push(input.status);
  }
  if (input.priority !== undefined) {
    updates.push(`priority = $${i++}`);
    values.push(input.priority);
  }
  if (input.dueDate !== undefined) {
    updates.push(`due_date = $${i++}`);
    values.push(input.dueDate);
  }
  if (input.taskHash !== undefined) {
    updates.push(`task_hash = $${i++}`);
    values.push(input.taskHash);
  }
  if (input.transactionHash !== undefined) {
    updates.push(`transaction_hash = $${i++}`);
    values.push(input.transactionHash);
  }
  if (input.chainTimestamp !== undefined) {
    updates.push(`chain_timestamp = $${i++}`);
    values.push(input.chainTimestamp);
  }
  if (input.teamId !== undefined) {
    updates.push(`team_id = $${i++}`);
    values.push(input.teamId);
  }
  if (input.boardColumn !== undefined) {
    updates.push(`board_column = $${i++}`);
    values.push(input.boardColumn);
  }
  if (input.boardOrder !== undefined) {
    updates.push(`board_order = $${i++}`);
    values.push(input.boardOrder);
  }

  if (updates.length === 0) {
    return getTaskById(id, userId);
  }

  updates.push(`updated_at = now()`);
  values.push(id, userId);

  const { rows } = await pool.query<TaskRow>(
    `update tasks set ${updates.join(', ')} where id = $${i} and user_id = $${i + 1} returning *`,
    values,
  );
  return rows[0] ?? null;
}

export async function deleteTask(id: string, userId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    'delete from tasks where id = $1 and user_id = $2',
    [id, userId],
  );
  return (rowCount ?? 0) > 0;
}

export async function getTaskCountsByUser(userId: string): Promise<{
  total: number;
  completed: number;
  pending: number;
  onChainVerified: number;
}> {
  const { rows } = await pool.query(
    `select
       count(*)::int as total,
       count(*) filter (where status = 'completed')::int as completed,
       count(*) filter (where status = 'pending')::int as pending,
       count(*) filter (where transaction_hash is not null and chain_timestamp is not null)::int as on_chain_verified
     from tasks where user_id = $1`,
    [userId],
  );
  const r = rows[0];
  return {
    total: r?.total ?? 0,
    completed: r?.completed ?? 0,
    pending: r?.pending ?? 0,
    onChainVerified: r?.on_chain_verified ?? 0,
  };
}

export async function getTeamTaskById(taskId: string, teamId: string): Promise<TaskRow | null> {
  const { rows } = await pool.query<TaskRow>(
    'SELECT * FROM tasks WHERE id = $1 AND team_id = $2',
    [taskId, teamId]
  );
  return rows[0] ?? null;
}

export async function updateTeamTask(taskId: string, teamId: string, input: UpdateTaskInput): Promise<TaskRow | null> {
  const updates: string[] = [];
  const values: any[] = [];
  let i = 1;

  if (input.title !== undefined) { updates.push(`title = $${i++}`); values.push(input.title); }
  if (input.description !== undefined) { updates.push(`description = $${i++}`); values.push(input.description); }
  if (input.status !== undefined) { updates.push(`status = $${i++}`); values.push(input.status); }
  if (input.priority !== undefined) { updates.push(`priority = $${i++}`); values.push(input.priority); }
  if (input.dueDate !== undefined) { updates.push(`due_date = $${i++}`); values.push(input.dueDate); }
  if (input.boardColumn !== undefined) { updates.push(`board_column = $${i++}`); values.push(input.boardColumn); }
  if (input.boardOrder !== undefined) { updates.push(`board_order = $${i++}`); values.push(input.boardOrder); }

  if (updates.length === 0) return getTeamTaskById(taskId, teamId);

  updates.push(`updated_at = now()`);
  values.push(taskId, teamId);

  const { rows } = await pool.query<TaskRow>(
    `UPDATE tasks SET ${updates.join(', ')} WHERE id = $${i} AND team_id = $${i + 1} RETURNING *`,
    values,
  );
  return rows[0] ?? null;
}

export async function deleteTeamTask(taskId: string, teamId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    'DELETE FROM tasks WHERE id = $1 AND team_id = $2',
    [taskId, teamId],
  );
  return (rowCount ?? 0) > 0;
}

export async function listTeamTasks(teamId: string): Promise<TaskRow[]> {
  const { rows } = await pool.query<TaskRow>(
    `SELECT * FROM tasks WHERE team_id = $1 ORDER BY board_column, board_order, created_at DESC`,
    [teamId]
  );
  return rows;
}

export async function getTaskAssignees(taskId: string): Promise<{ user_id: string; user_name: string | null; user_email: string | null; user_username: string | null }[]> {
  const { rows } = await pool.query(
    `SELECT ta.user_id, u.name as user_name, u.email as user_email, u.username as user_username
     FROM task_assignees ta
     INNER JOIN users u ON u.id = ta.user_id
     WHERE ta.task_id = $1`,
    [taskId]
  );
  return rows;
}

export async function setTaskAssignees(taskId: string, userIds: string[]) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM task_assignees WHERE task_id = $1`, [taskId]);
    for (const uid of userIds) {
      await client.query(
        `INSERT INTO task_assignees (task_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [taskId, uid]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export interface MyTaskRow extends TaskRow {
  team_name: string | null;
}

export async function listMyBoardTasks(userId: string): Promise<MyTaskRow[]> {
  const { rows } = await pool.query<MyTaskRow>(
    `SELECT DISTINCT ON (t.id)
       t.*,
       tm.name AS team_name
     FROM tasks t
     LEFT JOIN task_assignees ta ON ta.task_id = t.id
     LEFT JOIN teams tm ON tm.id = t.team_id
     WHERE (t.user_id = $1 AND t.team_id IS NULL)
        OR ta.user_id = $1
     ORDER BY t.id, t.updated_at DESC`,
    [userId]
  );
  rows.sort((a: MyTaskRow, b: MyTaskRow) => {
    if (a.board_column !== b.board_column) return a.board_column.localeCompare(b.board_column);
    if (a.board_order !== b.board_order) return a.board_order - b.board_order;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  return rows;
}

export async function updateBoardPositions(moves: { id: string; boardColumn: string; boardOrder: number }[]) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const m of moves) {
      await client.query(
        `UPDATE tasks SET board_column = $1, board_order = $2, updated_at = now() WHERE id = $3`,
        [m.boardColumn, m.boardOrder, m.id]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
