"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTask = createTask;
exports.getTaskById = getTaskById;
exports.listTasks = listTasks;
exports.updateTask = updateTask;
exports.deleteTask = deleteTask;
exports.getTaskCountsByUser = getTaskCountsByUser;
exports.getTeamTaskById = getTeamTaskById;
exports.updateTeamTask = updateTeamTask;
exports.deleteTeamTask = deleteTeamTask;
exports.listTeamTasks = listTeamTasks;
exports.getTaskAssignees = getTaskAssignees;
exports.setTaskAssignees = setTaskAssignees;
exports.listMyBoardTasks = listMyBoardTasks;
exports.updateBoardPositions = updateBoardPositions;
const db_1 = require("../db");
async function createTask(input) {
    const { rows } = await db_1.pool.query(`insert into tasks (user_id, title, description, status, priority, due_date, task_hash, team_id, board_column, board_order)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     returning *`, [
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
    ]);
    return rows[0];
}
async function getTaskById(id, userId) {
    const { rows } = await db_1.pool.query('select * from tasks where id = $1 and user_id = $2', [id, userId]);
    return rows[0] ?? null;
}
async function listTasks(options) {
    const conditions = ['user_id = $1'];
    const params = [options.userId];
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
    const countResult = await db_1.pool.query(`select count(*)::int as c from tasks where ${where}`, params);
    const total = countResult.rows[0]?.c ?? 0;
    const { rows } = await db_1.pool.query(`select * from tasks where ${where}
     order by ${orderCol} ${orderDir}${orderNulls}
     limit $${idx} offset $${idx + 1}`, [...params, options.limit, options.offset]);
    return { tasks: rows, total };
}
async function updateTask(id, userId, input) {
    const updates = [];
    const values = [];
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
    const { rows } = await db_1.pool.query(`update tasks set ${updates.join(', ')} where id = $${i} and user_id = $${i + 1} returning *`, values);
    return rows[0] ?? null;
}
async function deleteTask(id, userId) {
    const { rowCount } = await db_1.pool.query('delete from tasks where id = $1 and user_id = $2', [id, userId]);
    return (rowCount ?? 0) > 0;
}
async function getTaskCountsByUser(userId) {
    const { rows } = await db_1.pool.query(`select
       count(*)::int as total,
       count(*) filter (where status = 'completed')::int as completed,
       count(*) filter (where status = 'pending')::int as pending,
       count(*) filter (where transaction_hash is not null and chain_timestamp is not null)::int as on_chain_verified
     from tasks where user_id = $1`, [userId]);
    const r = rows[0];
    return {
        total: r?.total ?? 0,
        completed: r?.completed ?? 0,
        pending: r?.pending ?? 0,
        onChainVerified: r?.on_chain_verified ?? 0,
    };
}
async function getTeamTaskById(taskId, teamId) {
    const { rows } = await db_1.pool.query('SELECT * FROM tasks WHERE id = $1 AND team_id = $2', [taskId, teamId]);
    return rows[0] ?? null;
}
async function updateTeamTask(taskId, teamId, input) {
    const updates = [];
    const values = [];
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
    if (input.boardColumn !== undefined) {
        updates.push(`board_column = $${i++}`);
        values.push(input.boardColumn);
    }
    if (input.boardOrder !== undefined) {
        updates.push(`board_order = $${i++}`);
        values.push(input.boardOrder);
    }
    if (updates.length === 0)
        return getTeamTaskById(taskId, teamId);
    updates.push(`updated_at = now()`);
    values.push(taskId, teamId);
    const { rows } = await db_1.pool.query(`UPDATE tasks SET ${updates.join(', ')} WHERE id = $${i} AND team_id = $${i + 1} RETURNING *`, values);
    return rows[0] ?? null;
}
async function deleteTeamTask(taskId, teamId) {
    const { rowCount } = await db_1.pool.query('DELETE FROM tasks WHERE id = $1 AND team_id = $2', [taskId, teamId]);
    return (rowCount ?? 0) > 0;
}
async function listTeamTasks(teamId) {
    const { rows } = await db_1.pool.query(`SELECT * FROM tasks WHERE team_id = $1 ORDER BY board_column, board_order, created_at DESC`, [teamId]);
    return rows;
}
async function getTaskAssignees(taskId) {
    const { rows } = await db_1.pool.query(`SELECT ta.user_id, u.name as user_name, u.email as user_email, u.username as user_username
     FROM task_assignees ta
     INNER JOIN users u ON u.id = ta.user_id
     WHERE ta.task_id = $1`, [taskId]);
    return rows;
}
async function setTaskAssignees(taskId, userIds) {
    const client = await db_1.pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`DELETE FROM task_assignees WHERE task_id = $1`, [taskId]);
        for (const uid of userIds) {
            await client.query(`INSERT INTO task_assignees (task_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [taskId, uid]);
        }
        await client.query('COMMIT');
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}
async function listMyBoardTasks(userId) {
    const { rows } = await db_1.pool.query(`SELECT DISTINCT ON (t.id)
       t.*,
       tm.name AS team_name
     FROM tasks t
     LEFT JOIN task_assignees ta ON ta.task_id = t.id
     LEFT JOIN teams tm ON tm.id = t.team_id
     WHERE (t.user_id = $1 AND t.team_id IS NULL)
        OR ta.user_id = $1
     ORDER BY t.id, t.updated_at DESC`, [userId]);
    rows.sort((a, b) => {
        if (a.board_column !== b.board_column)
            return a.board_column.localeCompare(b.board_column);
        if (a.board_order !== b.board_order)
            return a.board_order - b.board_order;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return rows;
}
async function updateBoardPositions(moves) {
    const client = await db_1.pool.connect();
    try {
        await client.query('BEGIN');
        for (const m of moves) {
            await client.query(`UPDATE tasks SET board_column = $1, board_order = $2, updated_at = now() WHERE id = $3`, [m.boardColumn, m.boardOrder, m.id]);
        }
        await client.query('COMMIT');
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}
