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
const notifRepo = __importStar(require("../repositories/notificationRepository"));
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
function userId(req) {
    return req.user.userId;
}
router.get('/', async (req, res, next) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 30, 100);
        const offset = Number(req.query.offset) || 0;
        const { notifications, total } = await notifRepo.getNotifications(userId(req), limit, offset);
        const unreadCount = await notifRepo.getUnreadCount(userId(req));
        res.json({ notifications, total, unreadCount });
    }
    catch (err) {
        next(err);
    }
});
router.get('/unread-count', async (req, res, next) => {
    try {
        const count = await notifRepo.getUnreadCount(userId(req));
        res.json({ count });
    }
    catch (err) {
        next(err);
    }
});
router.put('/:id/read', async (req, res, next) => {
    try {
        await notifRepo.markAsRead(req.params.id, userId(req));
        res.json({ ok: true });
    }
    catch (err) {
        next(err);
    }
});
router.put('/read-all', async (req, res, next) => {
    try {
        await notifRepo.markAllAsRead(userId(req));
        res.json({ ok: true });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiL1ZvbHVtZXMvQWFkaXR5YSdzIFNTRC9EZXZlbG9wbWVudC9ib2FyZGx5WC1iYWNrZW5kL3NyYy9yb3V0ZXMvbm90aWZpY2F0aW9ucy50cyIsInNvdXJjZXMiOlsiL1ZvbHVtZXMvQWFkaXR5YSdzIFNTRC9EZXZlbG9wbWVudC9ib2FyZGx5WC1iYWNrZW5kL3NyYy9yb3V0ZXMvbm90aWZpY2F0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLHFDQUFrRTtBQUNsRSw2Q0FBb0Q7QUFDcEQsa0ZBQW9FO0FBRXBFLE1BQU0sTUFBTSxHQUFHLElBQUEsZ0JBQU0sR0FBRSxDQUFDO0FBQ3hCLE1BQU0sQ0FBQyxHQUFHLENBQUMscUJBQWMsQ0FBQyxDQUFDO0FBRTNCLFNBQVMsTUFBTSxDQUFDLEdBQVk7SUFDMUIsT0FBUSxHQUFXLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQztBQUNsQyxDQUFDO0FBRUQsTUFBTSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsS0FBSyxFQUFFLEdBQVksRUFBRSxHQUFhLEVBQUUsSUFBa0IsRUFBRSxFQUFFO0lBQ3hFLElBQUksQ0FBQztRQUNILE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQzNELE1BQU0sTUFBTSxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM3QyxNQUFNLEVBQUUsYUFBYSxFQUFFLEtBQUssRUFBRSxHQUFHLE1BQU0sU0FBUyxDQUFDLGdCQUFnQixDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDOUYsTUFBTSxXQUFXLEdBQUcsTUFBTSxTQUFTLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ2hFLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxhQUFhLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxDQUFDLENBQUM7SUFDbEQsQ0FBQztJQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7UUFBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7SUFBQyxDQUFDO0FBQzlCLENBQUMsQ0FBQyxDQUFDO0FBRUgsTUFBTSxDQUFDLEdBQUcsQ0FBQyxlQUFlLEVBQUUsS0FBSyxFQUFFLEdBQVksRUFBRSxHQUFhLEVBQUUsSUFBa0IsRUFBRSxFQUFFO0lBQ3BGLElBQUksQ0FBQztRQUNILE1BQU0sS0FBSyxHQUFHLE1BQU0sU0FBUyxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUMxRCxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztJQUN0QixDQUFDO0lBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztRQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUFDLENBQUM7QUFDOUIsQ0FBQyxDQUFDLENBQUM7QUFFSCxNQUFNLENBQUMsR0FBRyxDQUFDLFdBQVcsRUFBRSxLQUFLLEVBQUUsR0FBWSxFQUFFLEdBQWEsRUFBRSxJQUFrQixFQUFFLEVBQUU7SUFDaEYsSUFBSSxDQUFDO1FBQ0gsTUFBTSxTQUFTLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ3ZELEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUN6QixDQUFDO0lBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztRQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUFDLENBQUM7QUFDOUIsQ0FBQyxDQUFDLENBQUM7QUFFSCxNQUFNLENBQUMsR0FBRyxDQUFDLFdBQVcsRUFBRSxLQUFLLEVBQUUsR0FBWSxFQUFFLEdBQWEsRUFBRSxJQUFrQixFQUFFLEVBQUU7SUFDaEYsSUFBSSxDQUFDO1FBQ0gsTUFBTSxTQUFTLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQzNDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUN6QixDQUFDO0lBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztRQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUFDLENBQUM7QUFDOUIsQ0FBQyxDQUFDLENBQUM7QUFFSCxrQkFBZSxNQUFNLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBSb3V0ZXIsIFJlcXVlc3QsIFJlc3BvbnNlLCBOZXh0RnVuY3Rpb24gfSBmcm9tICdleHByZXNzJztcbmltcG9ydCB7IGF1dGhNaWRkbGV3YXJlIH0gZnJvbSAnLi4vbWlkZGxld2FyZS9hdXRoJztcbmltcG9ydCAqIGFzIG5vdGlmUmVwbyBmcm9tICcuLi9yZXBvc2l0b3JpZXMvbm90aWZpY2F0aW9uUmVwb3NpdG9yeSc7XG5cbmNvbnN0IHJvdXRlciA9IFJvdXRlcigpO1xucm91dGVyLnVzZShhdXRoTWlkZGxld2FyZSk7XG5cbmZ1bmN0aW9uIHVzZXJJZChyZXE6IFJlcXVlc3QpOiBzdHJpbmcge1xuICByZXR1cm4gKHJlcSBhcyBhbnkpLnVzZXIudXNlcklkO1xufVxuXG5yb3V0ZXIuZ2V0KCcvJywgYXN5bmMgKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSwgbmV4dDogTmV4dEZ1bmN0aW9uKSA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgbGltaXQgPSBNYXRoLm1pbihOdW1iZXIocmVxLnF1ZXJ5LmxpbWl0KSB8fCAzMCwgMTAwKTtcbiAgICBjb25zdCBvZmZzZXQgPSBOdW1iZXIocmVxLnF1ZXJ5Lm9mZnNldCkgfHwgMDtcbiAgICBjb25zdCB7IG5vdGlmaWNhdGlvbnMsIHRvdGFsIH0gPSBhd2FpdCBub3RpZlJlcG8uZ2V0Tm90aWZpY2F0aW9ucyh1c2VySWQocmVxKSwgbGltaXQsIG9mZnNldCk7XG4gICAgY29uc3QgdW5yZWFkQ291bnQgPSBhd2FpdCBub3RpZlJlcG8uZ2V0VW5yZWFkQ291bnQodXNlcklkKHJlcSkpO1xuICAgIHJlcy5qc29uKHsgbm90aWZpY2F0aW9ucywgdG90YWwsIHVucmVhZENvdW50IH0pO1xuICB9IGNhdGNoIChlcnIpIHsgbmV4dChlcnIpOyB9XG59KTtcblxucm91dGVyLmdldCgnL3VucmVhZC1jb3VudCcsIGFzeW5jIChyZXE6IFJlcXVlc3QsIHJlczogUmVzcG9uc2UsIG5leHQ6IE5leHRGdW5jdGlvbikgPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IGNvdW50ID0gYXdhaXQgbm90aWZSZXBvLmdldFVucmVhZENvdW50KHVzZXJJZChyZXEpKTtcbiAgICByZXMuanNvbih7IGNvdW50IH0pO1xuICB9IGNhdGNoIChlcnIpIHsgbmV4dChlcnIpOyB9XG59KTtcblxucm91dGVyLnB1dCgnLzppZC9yZWFkJywgYXN5bmMgKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSwgbmV4dDogTmV4dEZ1bmN0aW9uKSA9PiB7XG4gIHRyeSB7XG4gICAgYXdhaXQgbm90aWZSZXBvLm1hcmtBc1JlYWQocmVxLnBhcmFtcy5pZCwgdXNlcklkKHJlcSkpO1xuICAgIHJlcy5qc29uKHsgb2s6IHRydWUgfSk7XG4gIH0gY2F0Y2ggKGVycikgeyBuZXh0KGVycik7IH1cbn0pO1xuXG5yb3V0ZXIucHV0KCcvcmVhZC1hbGwnLCBhc3luYyAocmVxOiBSZXF1ZXN0LCByZXM6IFJlc3BvbnNlLCBuZXh0OiBOZXh0RnVuY3Rpb24pID0+IHtcbiAgdHJ5IHtcbiAgICBhd2FpdCBub3RpZlJlcG8ubWFya0FsbEFzUmVhZCh1c2VySWQocmVxKSk7XG4gICAgcmVzLmpzb24oeyBvazogdHJ1ZSB9KTtcbiAgfSBjYXRjaCAoZXJyKSB7IG5leHQoZXJyKTsgfVxufSk7XG5cbmV4cG9ydCBkZWZhdWx0IHJvdXRlcjtcbiJdfQ==