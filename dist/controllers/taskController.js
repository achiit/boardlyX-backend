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
exports.listTasks = listTasks;
exports.getTask = getTask;
exports.updateTask = updateTask;
exports.deleteTask = deleteTask;
exports.storeOnChain = storeOnChain;
exports.verifyTask = verifyTask;
exports.myBoardTasks = myBoardTasks;
exports.movePersonalTask = movePersonalTask;
exports.getAnalytics = getAnalytics;
const zod_1 = require("zod");
const taskService = __importStar(require("../services/taskService"));
const CreateTaskSchema = zod_1.z.object({
    title: zod_1.z.string().min(1).max(500),
    description: zod_1.z.string().max(5000).optional(),
    status: zod_1.z.enum(['pending', 'completed']).optional(),
    priority: zod_1.z.enum(['low', 'medium', 'high']).optional(),
    dueDate: zod_1.z.string().optional().nullable(),
    boardColumn: zod_1.z.string().optional(),
});
const UpdateTaskSchema = zod_1.z.object({
    title: zod_1.z.string().min(1).max(500).optional(),
    description: zod_1.z.string().max(5000).optional(),
    status: zod_1.z.enum(['pending', 'completed']).optional(),
    priority: zod_1.z.enum(['low', 'medium', 'high']).optional(),
    dueDate: zod_1.z.string().optional().nullable(),
    boardColumn: zod_1.z.string().optional(),
    boardOrder: zod_1.z.number().optional(),
});
const StoreOnChainSchema = zod_1.z.object({
    transactionHash: zod_1.z.string().min(1),
    chainTimestamp: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]),
});
function getUserId(req) {
    return req.user?.userId;
}
async function createTask(req, res) {
    const parse = CreateTaskSchema.safeParse(req.body);
    if (!parse.success) {
        return res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    }
    const userId = getUserId(req);
    try {
        const task = await taskService.createTask(userId, parse.data);
        return res.status(201).json(task);
    }
    catch (err) {
        if (err.status)
            return res.status(err.status).json({ error: err.message });
        throw err;
    }
}
async function listTasks(req, res) {
    const userId = getUserId(req);
    const query = {
        status: req.query.status,
        priority: req.query.priority,
        search: req.query.search,
        sortBy: req.query.sortBy,
        order: req.query.order,
        limit: req.query.limit,
        offset: req.query.offset,
    };
    try {
        const result = await taskService.listTasks(userId, query);
        return res.json(result);
    }
    catch (err) {
        if (err.status)
            return res.status(err.status).json({ error: err.message });
        throw err;
    }
}
async function getTask(req, res) {
    const userId = getUserId(req);
    const task = await taskService.getTask(req.params.id, userId);
    if (!task)
        return res.status(404).json({ error: 'Task not found' });
    return res.json(task);
}
async function updateTask(req, res) {
    const parse = UpdateTaskSchema.safeParse(req.body);
    if (!parse.success) {
        return res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    }
    const userId = getUserId(req);
    const task = await taskService.updateTask(req.params.id, userId, parse.data);
    if (!task)
        return res.status(404).json({ error: 'Task not found' });
    return res.json(task);
}
async function deleteTask(req, res) {
    const userId = getUserId(req);
    const deleted = await taskService.deleteTask(req.params.id, userId);
    if (!deleted)
        return res.status(404).json({ error: 'Task not found' });
    return res.status(204).send();
}
async function storeOnChain(req, res) {
    const parse = StoreOnChainSchema.safeParse(req.body);
    if (!parse.success) {
        return res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    }
    const userId = getUserId(req);
    const chainTimestamp = typeof parse.data.chainTimestamp === 'number'
        ? String(parse.data.chainTimestamp)
        : parse.data.chainTimestamp;
    const task = await taskService.storeOnChain(req.params.id, userId, {
        transactionHash: parse.data.transactionHash,
        chainTimestamp,
    });
    if (!task)
        return res.status(404).json({ error: 'Task not found' });
    return res.json(task);
}
async function verifyTask(req, res) {
    const userId = getUserId(req);
    const userWallet = req.user?.walletAddress ?? req.query.walletAddress;
    const result = await taskService.verifyTask(req.params.id, userId, userWallet);
    return res.json(result);
}
async function myBoardTasks(req, res) {
    const userId = getUserId(req);
    try {
        const tasks = await taskService.listMyBoardTasks(userId);
        return res.json(tasks);
    }
    catch (err) {
        if (err.status)
            return res.status(err.status).json({ error: err.message });
        throw err;
    }
}
async function movePersonalTask(req, res) {
    const userId = getUserId(req);
    const { boardColumn, boardOrder } = req.body;
    const task = await taskService.updateTask(req.params.id, userId, { boardColumn, boardOrder });
    if (!task)
        return res.status(404).json({ error: 'Task not found' });
    return res.json(task);
}
async function getAnalytics(req, res) {
    const userId = getUserId(req);
    const analytics = await taskService.getAnalytics(userId);
    return res.json(analytics);
}
