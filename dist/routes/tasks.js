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
const taskController = __importStar(require("../controllers/taskController"));
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
router.post('/', (req, res, next) => {
    taskController.createTask(req, res).catch(next);
});
router.get('/', (req, res, next) => {
    taskController.listTasks(req, res).catch(next);
});
router.get('/analytics', (req, res, next) => {
    taskController.getAnalytics(req, res).catch(next);
});
router.get('/my-board', (req, res, next) => {
    taskController.myBoardTasks(req, res).catch(next);
});
router.put('/:id/move', (req, res, next) => {
    taskController.movePersonalTask(req, res).catch(next);
});
router.get('/:id', (req, res, next) => {
    taskController.getTask(req, res).catch(next);
});
router.put('/:id', (req, res, next) => {
    taskController.updateTask(req, res).catch(next);
});
router.delete('/:id', (req, res, next) => {
    taskController.deleteTask(req, res).catch(next);
});
router.post('/:id/store-onchain', (req, res, next) => {
    taskController.storeOnChain(req, res).catch(next);
});
router.get('/:id/verify', (req, res, next) => {
    taskController.verifyTask(req, res).catch(next);
});
exports.default = router;
