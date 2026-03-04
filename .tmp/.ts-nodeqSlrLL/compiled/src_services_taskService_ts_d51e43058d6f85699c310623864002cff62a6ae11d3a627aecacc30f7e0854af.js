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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiL1ZvbHVtZXMvQWFkaXR5YSdzIFNTRC9EZXZlbG9wbWVudC9ib2FyZGx5WC1iYWNrZW5kL3NyYy9zZXJ2aWNlcy90YXNrU2VydmljZS50cyIsInNvdXJjZXMiOlsiL1ZvbHVtZXMvQWFkaXR5YSdzIFNTRC9EZXZlbG9wbWVudC9ib2FyZGx5WC1iYWNrZW5kL3NyYy9zZXJ2aWNlcy90YXNrU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQTBEQSxnQ0EyQkM7QUFFRCwwQkFJQztBQUVELDhCQXVCQztBQUVELGdDQWFDO0FBRUQsNENBUUM7QUFFRCxnQ0FFQztBQUVELG9DQWdCQztBQUVELGdDQTBCQztBQUVELG9DQVdDO0FBNU1ELHlFQUEyRDtBQUMzRCx3Q0FBK0M7QUFDL0MsZ0VBQWtEO0FBb0NsRCxTQUFTLGNBQWMsQ0FBQyxHQUFxQjtJQUMzQyxPQUFPO1FBQ0wsRUFBRSxFQUFFLEdBQUcsQ0FBQyxFQUFFO1FBQ1YsTUFBTSxFQUFFLEdBQUcsQ0FBQyxPQUFPO1FBQ25CLEtBQUssRUFBRSxHQUFHLENBQUMsS0FBSztRQUNoQixXQUFXLEVBQUUsR0FBRyxDQUFDLFdBQVc7UUFDNUIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNO1FBQ2xCLFFBQVEsRUFBRSxHQUFHLENBQUMsUUFBUTtRQUN0QixPQUFPLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJO1FBQ25FLFFBQVEsRUFBRSxHQUFHLENBQUMsU0FBUztRQUN2QixlQUFlLEVBQUUsR0FBRyxDQUFDLGdCQUFnQjtRQUNyQyxjQUFjLEVBQUUsR0FBRyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFD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QWMsRUFBRSxJQUFJO1lBQ3BCLGVBQWUsRUFBRSxHQUFHLENBQUMsZ0JBQWdCO1lBQ3JDLEtBQUssRUFBRSx5QkFBeUI7U0FDakMsQ0FBQztJQUNKLENBQUM7SUFFRCxPQUFPO1FBQ0wsUUFBUSxFQUFFLElBQUk7UUFDZCxjQUFjLEVBQUUsTUFBTSxDQUFDLGNBQWMsSUFBSSxJQUFJO1FBQzdDLGVBQWUsRUFBRSxHQUFHLENBQUMsZ0JBQWdCO0tBQ3RDLENBQUM7QUFDSixDQUFDO0FBRU0sS0FBSyxVQUFVLFlBQVksQ0FBQyxNQUFjO0lBQy9DLE1BQU0sTUFBTSxHQUFHLE1BQU0sUUFBUSxDQUFDLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQzFELE1BQU0sY0FBYyxHQUNsQixNQUFNLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxTQUFTLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDN0UsT0FBTztRQUNMLFVBQVUsRUFBRSxNQUFNLENBQUMsS0FBSztRQUN4QixjQUFjLEVBQUUsTUFBTSxDQUFDLFNBQVM7UUFDaEMsWUFBWSxFQUFFLE1BQU0sQ0FBQyxPQUFPO1FBQzVCLG9CQUFvQixFQUFFLE1BQU0sQ0FBQyxlQUFlO1FBQzVDLHFCQUFxQixFQUFFLGNBQWM7S0FDdEMsQ0FBQztBQUNKLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyB0YXNrUmVwbyBmcm9tICcuLi9yZXBvc2l0b3JpZXMvdGFza1JlcG9zaXRvcnknO1xuaW1wb3J0IHsgc2hhMjU2VGFza0hhc2ggfSBmcm9tICcuLi91dGlscy9oYXNoJztcbmltcG9ydCAqIGFzIGJsb2NrY2hhaW4gZnJvbSAnLi9ibG9ja2NoYWluU2VydmljZSc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGFza0NyZWF0ZUJvZHkge1xuICB0aXRsZTogc3RyaW5nO1xuICBkZXNjcmlwdGlvbj86IHN0cmluZztcbiAgc3RhdHVzPzogc3RyaW5nO1xuICBwcmlvcml0eT86IHN0cmluZztcbiAgZHVlRGF0ZT86IHN0cmluZyB8IG51bGw7XG4gIGJvYXJkQ29sdW1uPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFRhc2tVcGRhdGVCb2R5IHtcbiAgdGl0bGU/OiBzdHJpbmc7XG4gIGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuICBzdGF0dXM/OiBzdHJpbmc7XG4gIHByaW9yaXR5Pzogc3RyaW5nO1xuICBkdWVEYXRlPzogc3RyaW5nIHwgbnVsbDtcbiAgYm9hcmRDb2x1bW4/OiBzdHJpbmc7XG4gIGJvYXJkT3JkZXI/OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGFza0xpc3RRdWVyeSB7XG4gIHN0YXR1cz86IHN0cmluZztcbiAgcHJpb3JpdHk/OiBzdHJpbmc7XG4gIHNlYXJjaD86IHN0cmluZztcbiAgc29ydEJ5Pzogc3RyaW5nO1xuICBvcmRlcj86IHN0cmluZztcbiAgbGltaXQ/OiBzdHJpbmc7XG4gIG9mZnNldD86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdG9yZU9uQ2hhaW5Cb2R5IHtcbiAgdHJhbnNhY3Rpb25IYXNoOiBzdHJpbmc7XG4gIGNoYWluVGltZXN0YW1wOiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIHRvVGFza1Jlc3BvbnNlKHJvdzogdGFza1JlcG8uVGFza1Jvdykge1xuICByZXR1cm4ge1xuICAgIGlkOiByb3cuaWQsXG4gICAgdXNlcklkOiByb3cudXNlcl9pZCxcbiAgICB0aXRsZTogcm93LnRpdGxlLFxuICAgIGRlc2NyaXB0aW9uOiByb3cuZGVzY3JpcHRpb24sXG4gICAgc3RhdHVzOiByb3cuc3RhdHVzLFxuICAgIHByaW9yaXR5OiByb3cucHJpb3JpdHksXG4gICAgZHVlRGF0ZTogcm93LmR1ZV9kYXRlID8gbmV3IERhdGUocm93LmR1ZV9kYXRlKS50b0lTT1N0cmluZygpIDogbnVsbCxcbiAgICB0YXNrSGFzaDogcm93LnRhc2tfaGFzaCxcbiAgICB0cmFuc2FjdGlvbkhhc2g6IHJvdy50cmFuc2FjdGlvbl9oYXNoLFxuICAgIGNoYWluVGltZXN0YW1wOiByb3cuY2hhaW5fdGltZXN0YW1wID8gbmV3IERhdGUocm93LmNoYWluX3RpbWVzdGFtcCkudG9JU09TdHJpbmcoKSA6IG51bGwsXG4gICAgYm9hcmRDb2x1bW46IHJvdy5ib2FyZF9jb2x1bW4gfHwgJ2JhY2tsb2cnLFxuICAgIGJvYXJkT3JkZXI6IHJvdy5ib2FyZF9vcmRlciA/PyAwLFxuICAgIHRlYW1JZDogcm93LnRlYW1faWQgfHwgbnVsbCxcbiAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKHJvdy5jcmVhdGVkX2F0KS50b0lTT1N0cmluZygpLFxuICAgIHVwZGF0ZWRBdDogbmV3IERhdGUocm93LnVwZGF0ZWRfYXQpLnRvSVNPU3RyaW5nKCksXG4gIH07XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjcmVhdGVUYXNrKHVzZXJJZDogc3RyaW5nLCBib2R5OiBUYXNrQ3JlYXRlQm9keSkge1xuICBjb25zdCBkdWVEYXRlID0gYm9keS5kdWVEYXRlID8gbmV3IERhdGUoYm9keS5kdWVEYXRlKSA6IG51bGw7XG4gIGNvbnN0IGluc2VydGVkID0gYXdhaXQgdGFza1JlcG8uY3JlYXRlVGFzayh7XG4gICAgdXNlcklkLFxuICAgIHRpdGxlOiBib2R5LnRpdGxlLFxuICAgIGRlc2NyaXB0aW9uOiBib2R5LmRlc2NyaXB0aW9uLFxuICAgIHN0YXR1czogYm9keS5zdGF0dXMgPz8gJ3BlbmRpbmcnLFxuICAgIHByaW9yaXR5OiBib2R5LnByaW9yaXR5ID8/ICdtZWRpdW0nLFxuICAgIGR1ZURhdGUsXG4gICAgdGFza0hhc2g6IG51bGwsXG4gICAgYm9hcmRDb2x1bW46IGJvZHkuYm9hcmRDb2x1bW4gfHwgJ2JhY2tsb2cnLFxuICB9KTtcblxuICBjb25zdCBjcmVhdGVkQXQgPVxuICAgIGluc2VydGVkLmNyZWF0ZWRfYXQgaW5zdGFuY2VvZiBEYXRlXG4gICAgICA/IGluc2VydGVkLmNyZWF0ZWRfYXQudG9JU09TdHJpbmcoKVxuICAgICAgOiBTdHJpbmcoaW5zZXJ0ZWQuY3JlYXRlZF9hdCk7XG4gIGNvbnN0IHRhc2tIYXNoID0gc2hhMjU2VGFza0hhc2goXG4gICAgaW5zZXJ0ZWQudGl0bGUsXG4gICAgaW5zZXJ0ZWQuZGVzY3JpcHRpb24sXG4gICAgaW5zZXJ0ZWQudXNlcl9pZCxcbiAgICBjcmVhdGVkQXQsXG4gICk7XG5cbiAgYXdhaXQgdGFza1JlcG8udXBkYXRlVGFzayhpbnNlcnRlZC5pZCwgdXNlcklkLCB7IHRhc2tIYXNoIH0pO1xuICBjb25zdCByb3cgPSBhd2FpdCB0YXNrUmVwby5nZXRUYXNrQnlJZChpbnNlcnRlZC5pZCwgdXNlcklkKTtcbiAgcmV0dXJuIHRvVGFza1Jlc3BvbnNlKHJvdyEpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0VGFzayhpZDogc3RyaW5nLCB1c2VySWQ6IHN0cmluZykge1xuICBjb25zdCByb3cgPSBhd2FpdCB0YXNrUmVwby5nZXRUYXNrQnlJZChpZCwgdXNlcklkKTtcbiAgaWYgKCFyb3cpIHJldHVybiBudWxsO1xuICByZXR1cm4gdG9UYXNrUmVzcG9uc2Uocm93KTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGxpc3RUYXNrcyh1c2VySWQ6IHN0cmluZywgcXVlcnk6IFRhc2tMaXN0UXVlcnkpIHtcbiAgY29uc3QgbGltaXQgPSBNYXRoLm1pbihNYXRoLm1heChwYXJzZUludChxdWVyeS5saW1pdCB8fCAnMjAnLCAxMCkgfHwgMjAsIDEpLCAxMDApO1xuICBjb25zdCBvZmZzZXQgPSBNYXRoLm1heChwYXJzZUludChxdWVyeS5vZmZzZXQgfHwgJzAnLCAxMCkgfHwgMCwgMCk7XG4gIGNvbnN0IHNvcnRCeSA9IHF1ZXJ5LnNvcnRCeSA9PT0gJ2R1ZV9kYXRlJyA/ICdkdWVfZGF0ZScgOiAnY3JlYXRlZF9hdCc7XG4gIGNvbnN0IG9yZGVyID0gcXVlcnkub3JkZXIgPT09ICdhc2MnID8gJ2FzYycgOiAnZGVzYyc7XG5cbiAgY29uc3QgeyB0YXNrcywgdG90YWwgfSA9IGF3YWl0IHRhc2tSZXBvLmxpc3RUYXNrcyh7XG4gICAgdXNlcklkLFxuICAgIHN0YXR1czogcXVlcnkuc3RhdHVzLFxuICAgIHByaW9yaXR5OiBxdWVyeS5wcmlvcml0eSxcbiAgICBzZWFyY2g6IHF1ZXJ5LnNlYXJjaD8udHJpbSgpIHx8IHVuZGVmaW5lZCxcbiAgICBzb3J0QnksXG4gICAgb3JkZXIsXG4gICAgbGltaXQsXG4gICAgb2Zmc2V0LFxuICB9KTtcblxuICByZXR1cm4ge1xuICAgIHRhc2tzOiB0YXNrcy5tYXAodG9UYXNrUmVzcG9uc2UpLFxuICAgIHRvdGFsLFxuICAgIGxpbWl0LFxuICAgIG9mZnNldCxcbiAgfTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHVwZGF0ZVRhc2soaWQ6IHN0cmluZywgdXNlcklkOiBzdHJpbmcsIGJvZHk6IFRhc2tVcGRhdGVCb2R5KSB7XG4gIGNvbnN0IGR1ZURhdGUgPSBib2R5LmR1ZURhdGUgIT09IHVuZGVmaW5lZCA/IChib2R5LmR1ZURhdGUgPyBuZXcgRGF0ZShib2R5LmR1ZURhdGUpIDogbnVsbCkgOiB1bmRlZmluZWQ7XG4gIGNvbnN0IHJvdyA9IGF3YWl0IHRhc2tSZXBvLnVwZGF0ZVRhc2soaWQsIHVzZXJJZCwge1xuICAgIHRpdGxlOiBib2R5LnRpdGxlLFxuICAgIGRlc2NyaXB0aW9uOiBib2R5LmRlc2NyaXB0aW9uLFxuICAgIHN0YXR1czogYm9keS5zdGF0dXMsXG4gICAgcHJpb3JpdHk6IGJvZHkucHJpb3JpdHksXG4gICAgZHVlRGF0ZSxcbiAgICBib2FyZENvbHVtbjogYm9keS5ib2FyZENvbHVtbixcbiAgICBib2FyZE9yZGVyOiBib2R5LmJvYXJkT3JkZXIsXG4gIH0pO1xuICBpZiAoIXJvdykgcmV0dXJuIG51bGw7XG4gIHJldHVybiB0b1Rhc2tSZXNwb25zZShyb3cpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbGlzdE15Qm9hcmRUYXNrcyh1c2VySWQ6IHN0cmluZykge1xuICBjb25zdCByb3dzID0gYXdhaXQgdGFza1JlcG8ubGlzdE15Qm9hcmRUYXNrcyh1c2VySWQpO1xuICBjb25zdCBlbnJpY2hlZCA9IGF3YWl0IFByb21pc2UuYWxsKHJvd3MubWFwKGFzeW5jIChyKSA9PiAoe1xuICAgIC4uLnRvVGFza1Jlc3BvbnNlKHIpLFxuICAgIHRlYW1OYW1lOiByLnRlYW1fbmFtZSxcbiAgICBhc3NpZ25lZXM6IGF3YWl0IHRhc2tSZXBvLmdldFRhc2tBc3NpZ25lZXMoci5pZCksXG4gIH0pKSk7XG4gIHJldHVybiBlbnJpY2hlZDtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGRlbGV0ZVRhc2soaWQ6IHN0cmluZywgdXNlcklkOiBzdHJpbmcpIHtcbiAgcmV0dXJuIHRhc2tSZXBvLmRlbGV0ZVRhc2soaWQsIHVzZXJJZCk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzdG9yZU9uQ2hhaW4oaWQ6IHN0cmluZywgdXNlcklkOiBzdHJpbmcsIGJvZHk6IFN0b3JlT25DaGFpbkJvZHkpIHtcbiAgY29uc3Qgcm93ID0gYXdhaXQgdGFza1JlcG8uZ2V0VGFza0J5SWQoaWQsIHVzZXJJZCk7XG4gIGlmICghcm93KSByZXR1cm4gbnVsbDtcblxuICBjb25zdCBjaGFpblRzID0gYm9keS5jaGFpblRpbWVzdGFtcFxuICAgID8gL15cXGQrJC8udGVzdChib2R5LmNoYWluVGltZXN0YW1wKVxuICAgICAgPyBuZXcgRGF0ZShOdW1iZXIoYm9keS5jaGFpblRpbWVzdGFtcCkgKiAxMDAwKVxuICAgICAgOiBuZXcgRGF0ZShib2R5LmNoYWluVGltZXN0YW1wKVxuICAgIDogbmV3IERhdGUoKTtcblxuICBjb25zdCB1cGRhdGVkID0gYXdhaXQgdGFza1JlcG8udXBkYXRlVGFzayhpZCwgdXNlcklkLCB7XG4gICAgdHJhbnNhY3Rpb25IYXNoOiBib2R5LnRyYW5zYWN0aW9uSGFzaCxcbiAgICBjaGFpblRpbWVzdGFtcDogY2hhaW5UcyxcbiAgfSk7XG4gIGlmICghdXBkYXRlZCkgcmV0dXJuIG51bGw7XG4gIHJldHVybiB0b1Rhc2tSZXNwb25zZSh1cGRhdGVkKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHZlcmlmeVRhc2soaWQ6IHN0cmluZywgdXNlcklkOiBzdHJpbmcsIHVzZXJXYWxsZXQ/OiBzdHJpbmcpIHtcbiAgY29uc3Qgcm93ID0gYXdhaXQgdGFza1JlcG8uZ2V0VGFza0J5SWQoaWQsIHVzZXJJZCk7XG4gIGlmICghcm93IHx8ICFyb3cudGFza19oYXNoKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHZlcmlmaWVkOiBmYWxzZSxcbiAgICAgIGJsb2NrVGltZXN0YW1wOiBudWxsLFxuICAgICAgdHJhbnNhY3Rpb25IYXNoOiByb3c/LnRyYW5zYWN0aW9uX2hhc2ggPz8gbnVsbCxcbiAgICAgIGVycm9yOiAhcm93ID8gJ1Rhc2sgbm90IGZvdW5kJyA6ICdUYXNrIGhhcyBubyBoYXNoJyxcbiAgICB9O1xuICB9XG5cbiAgY29uc3QgcmVzdWx0ID0gYXdhaXQgYmxvY2tjaGFpbi5maW5kUmVjb3JkQnlUYXNrSGFzaChyb3cudGFza19oYXNoLCB1c2VyV2FsbGV0KTtcbiAgaWYgKCFyZXN1bHQudmVyaWZpZWQpIHtcbiAgICByZXR1cm4ge1xuICAgICAgdmVyaWZpZWQ6IGZhbHNlLFxuICAgICAgYmxvY2tUaW1lc3RhbXA6IG51bGwsXG4gICAgICB0cmFuc2FjdGlvbkhhc2g6IHJvdy50cmFuc2FjdGlvbl9oYXNoLFxuICAgICAgZXJyb3I6ICdIYXNoIG5vdCBmb3VuZCBvbiBjaGFpbicsXG4gICAgfTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgdmVyaWZpZWQ6IHRydWUsXG4gICAgYmxvY2tUaW1lc3RhbXA6IHJlc3VsdC5ibG9ja1RpbWVzdGFtcCA/PyBudWxsLFxuICAgIHRyYW5zYWN0aW9uSGFzaDogcm93LnRyYW5zYWN0aW9uX2hhc2gsXG4gIH07XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRBbmFseXRpY3ModXNlcklkOiBzdHJpbmcpIHtcbiAgY29uc3QgY291bnRzID0gYXdhaXQgdGFza1JlcG8uZ2V0VGFza0NvdW50c0J5VXNlcih1c2VySWQpO1xuICBjb25zdCBjb21wbGV0aW9uUmF0ZSA9XG4gICAgY291bnRzLnRvdGFsID4gMCA/IE1hdGgucm91bmQoKGNvdW50cy5jb21wbGV0ZWQgLyBjb3VudHMudG90YWwpICogMTAwKSA6IDA7XG4gIHJldHVybiB7XG4gICAgdG90YWxUYXNrczogY291bnRzLnRvdGFsLFxuICAgIGNvbXBsZXRlZFRhc2tzOiBjb3VudHMuY29tcGxldGVkLFxuICAgIHBlbmRpbmdUYXNrczogY291bnRzLnBlbmRpbmcsXG4gICAgb25DaGFpblZlcmlmaWVkQ291bnQ6IGNvdW50cy5vbkNoYWluVmVyaWZpZWQsXG4gICAgY29tcGxldGlvblJhdGVQZXJjZW50OiBjb21wbGV0aW9uUmF0ZSxcbiAgfTtcbn1cbiJdfQ==