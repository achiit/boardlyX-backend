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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiL1ZvbHVtZXMvQWFkaXR5YSdzIFNTRC9EZXZlbG9wbWVudC9ib2FyZGx5WC1iYWNrZW5kL3NyYy9yb3V0ZXMvdGFza3MudHMiLCJzb3VyY2VzIjpbIi9Wb2x1bWVzL0FhZGl0eWEncyBTU0QvRGV2ZWxvcG1lbnQvYm9hcmRseVgtYmFja2VuZC9zcmMvcm91dGVzL3Rhc2tzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEscUNBQWlDO0FBQ2pDLDZDQUFvRDtBQUNwRCw4RUFBZ0U7QUFFaEUsTUFBTSxNQUFNLEdBQUcsSUFBQSxnQkFBTSxHQUFFLENBQUM7QUFFeEIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxxQkFBYyxDQUFDLENBQUM7QUFFM0IsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxFQUFFO0lBQ2xDLGNBQWMsQ0FBQyxVQUFVLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNsRCxDQUFDLENBQUMsQ0FBQztBQUNILE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsRUFBRTtJQUNqQyxjQUFjLENBQUMsU0FBUyxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDakQsQ0FBQyxDQUFDLENBQUM7QUFDSCxNQUFNLENBQUMsR0FBRyxDQUFDLFlBQVksRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLEVBQUU7SUFDMUMsY0FBYyxDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ3BELENBQUMsQ0FBQyxDQUFDO0FBQ0gsTUFBTSxDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxFQUFFO0lBQ3pDLGNBQWMsQ0FBQyxZQUFZLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNwRCxDQUFDLENBQUMsQ0FBQztBQUNILE1BQU0sQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsRUFBRTtJQUN6QyxjQUFjLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUN4RCxDQUFDLENBQUMsQ0FBQztBQUNILE1BQU0sQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsRUFBRTtJQUNwQyxjQUFjLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDL0MsQ0FBQyxDQUFDLENBQUM7QUFDSCxNQUFNLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLEVBQUU7SUFDcEMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ2xELENBQUMsQ0FBQyxDQUFDO0FBQ0gsTUFBTSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxFQUFFO0lBQ3ZDLGNBQWMsQ0FBQyxVQUFVLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNsRCxDQUFDLENBQUMsQ0FBQztBQUNILE1BQU0sQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxFQUFFO0lBQ25ELGNBQWMsQ0FBQyxZQUFZLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNwRCxDQUFDLENBQUMsQ0FBQztBQUNILE1BQU0sQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsRUFBRTtJQUMzQyxjQUFjLENBQUMsVUFBVSxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDbEQsQ0FBQyxDQUFDLENBQUM7QUFFSCxrQkFBZSxNQUFNLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBSb3V0ZXIgfSBmcm9tICdleHByZXNzJztcbmltcG9ydCB7IGF1dGhNaWRkbGV3YXJlIH0gZnJvbSAnLi4vbWlkZGxld2FyZS9hdXRoJztcbmltcG9ydCAqIGFzIHRhc2tDb250cm9sbGVyIGZyb20gJy4uL2NvbnRyb2xsZXJzL3Rhc2tDb250cm9sbGVyJztcblxuY29uc3Qgcm91dGVyID0gUm91dGVyKCk7XG5cbnJvdXRlci51c2UoYXV0aE1pZGRsZXdhcmUpO1xuXG5yb3V0ZXIucG9zdCgnLycsIChyZXEsIHJlcywgbmV4dCkgPT4ge1xuICB0YXNrQ29udHJvbGxlci5jcmVhdGVUYXNrKHJlcSwgcmVzKS5jYXRjaChuZXh0KTtcbn0pO1xucm91dGVyLmdldCgnLycsIChyZXEsIHJlcywgbmV4dCkgPT4ge1xuICB0YXNrQ29udHJvbGxlci5saXN0VGFza3MocmVxLCByZXMpLmNhdGNoKG5leHQpO1xufSk7XG5yb3V0ZXIuZ2V0KCcvYW5hbHl0aWNzJywgKHJlcSwgcmVzLCBuZXh0KSA9PiB7XG4gIHRhc2tDb250cm9sbGVyLmdldEFuYWx5dGljcyhyZXEsIHJlcykuY2F0Y2gobmV4dCk7XG59KTtcbnJvdXRlci5nZXQoJy9teS1ib2FyZCcsIChyZXEsIHJlcywgbmV4dCkgPT4ge1xuICB0YXNrQ29udHJvbGxlci5teUJvYXJkVGFza3MocmVxLCByZXMpLmNhdGNoKG5leHQpO1xufSk7XG5yb3V0ZXIucHV0KCcvOmlkL21vdmUnLCAocmVxLCByZXMsIG5leHQpID0+IHtcbiAgdGFza0NvbnRyb2xsZXIubW92ZVBlcnNvbmFsVGFzayhyZXEsIHJlcykuY2F0Y2gobmV4dCk7XG59KTtcbnJvdXRlci5nZXQoJy86aWQnLCAocmVxLCByZXMsIG5leHQpID0+IHtcbiAgdGFza0NvbnRyb2xsZXIuZ2V0VGFzayhyZXEsIHJlcykuY2F0Y2gobmV4dCk7XG59KTtcbnJvdXRlci5wdXQoJy86aWQnLCAocmVxLCByZXMsIG5leHQpID0+IHtcbiAgdGFza0NvbnRyb2xsZXIudXBkYXRlVGFzayhyZXEsIHJlcykuY2F0Y2gobmV4dCk7XG59KTtcbnJvdXRlci5kZWxldGUoJy86aWQnLCAocmVxLCByZXMsIG5leHQpID0+IHtcbiAgdGFza0NvbnRyb2xsZXIuZGVsZXRlVGFzayhyZXEsIHJlcykuY2F0Y2gobmV4dCk7XG59KTtcbnJvdXRlci5wb3N0KCcvOmlkL3N0b3JlLW9uY2hhaW4nLCAocmVxLCByZXMsIG5leHQpID0+IHtcbiAgdGFza0NvbnRyb2xsZXIuc3RvcmVPbkNoYWluKHJlcSwgcmVzKS5jYXRjaChuZXh0KTtcbn0pO1xucm91dGVyLmdldCgnLzppZC92ZXJpZnknLCAocmVxLCByZXMsIG5leHQpID0+IHtcbiAgdGFza0NvbnRyb2xsZXIudmVyaWZ5VGFzayhyZXEsIHJlcykuY2F0Y2gobmV4dCk7XG59KTtcblxuZXhwb3J0IGRlZmF1bHQgcm91dGVyO1xuIl19