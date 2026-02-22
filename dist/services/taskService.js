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
exports.createTask = createTask;
exports.getTask = getTask;
exports.listTasks = listTasks;
exports.updateTask = updateTask;
exports.listMyBoardTasks = listMyBoardTasks;
exports.deleteTask = deleteTask;
exports.storeOnChain = storeOnChain;
exports.verifyTask = verifyTask;
exports.getAnalytics = getAnalytics;
const taskRepo = __importStar(require("../repositories/taskRepository"));
const hash_1 = require("../utils/hash");
const blockchain = __importStar(require("./blockchainService"));
function toTaskResponse(row) {
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
async function createTask(userId, body) {
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
    const createdAt = inserted.created_at instanceof Date
        ? inserted.created_at.toISOString()
        : String(inserted.created_at);
    const taskHash = (0, hash_1.sha256TaskHash)(inserted.title, inserted.description, inserted.user_id, createdAt);
    await taskRepo.updateTask(inserted.id, userId, { taskHash });
    const row = await taskRepo.getTaskById(inserted.id, userId);
    return toTaskResponse(row);
}
async function getTask(id, userId) {
    const row = await taskRepo.getTaskById(id, userId);
    if (!row)
        return null;
    return toTaskResponse(row);
}
async function listTasks(userId, query) {
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
async function updateTask(id, userId, body) {
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
    if (!row)
        return null;
    return toTaskResponse(row);
}
async function listMyBoardTasks(userId) {
    const rows = await taskRepo.listMyBoardTasks(userId);
    const enriched = await Promise.all(rows.map(async (r) => ({
        ...toTaskResponse(r),
        teamName: r.team_name,
        assignees: await taskRepo.getTaskAssignees(r.id),
    })));
    return enriched;
}
async function deleteTask(id, userId) {
    return taskRepo.deleteTask(id, userId);
}
async function storeOnChain(id, userId, body) {
    const row = await taskRepo.getTaskById(id, userId);
    if (!row)
        return null;
    const chainTs = body.chainTimestamp
        ? /^\d+$/.test(body.chainTimestamp)
            ? new Date(Number(body.chainTimestamp) * 1000)
            : new Date(body.chainTimestamp)
        : new Date();
    const updated = await taskRepo.updateTask(id, userId, {
        transactionHash: body.transactionHash,
        chainTimestamp: chainTs,
    });
    if (!updated)
        return null;
    return toTaskResponse(updated);
}
async function verifyTask(id, userId, userWallet) {
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
async function getAnalytics(userId) {
    const counts = await taskRepo.getTaskCountsByUser(userId);
    const completionRate = counts.total > 0 ? Math.round((counts.completed / counts.total) * 100) : 0;
    return {
        totalTasks: counts.total,
        completedTasks: counts.completed,
        pendingTasks: counts.pending,
        onChainVerifiedCount: counts.onChainVerified,
        completionRatePercent: completionRate,
    };
}
