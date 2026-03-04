"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const http_1 = require("http");
const config_1 = require("./config");
const db_1 = require("./db");
const auth_1 = __importDefault(require("./auth"));
const tasks_1 = __importDefault(require("./routes/tasks"));
const teams_1 = __importDefault(require("./routes/teams"));
const notifications_1 = __importDefault(require("./routes/notifications"));
const users_1 = __importDefault(require("./routes/users"));
const chat_1 = __importDefault(require("./routes/chat"));
const rateLimit_1 = require("./middleware/rateLimit");
const errorHandler_1 = require("./middleware/errorHandler");
const socket_1 = require("./socket");
const chatRepository_1 = require("./repositories/chatRepository");
require("./telegramBot");
async function main() {
    await (0, db_1.initDb)();
    await (0, chatRepository_1.backfillTeamGroupChats)();
    const app = (0, express_1.default)();
    const httpServer = (0, http_1.createServer)(app);
    app.use((0, cors_1.default)({ origin: '*', credentials: true }));
    app.use(express_1.default.json({ limit: '5mb' }));
    app.get('/health', (_req, res) => {
        res.json({ ok: true });
    });
    app.use('/hello-world', (_req, res) => {
        res.json({ message: 'Hello World' });
    });
    app.use('/auth', rateLimit_1.authLimiter, auth_1.default);
    app.use('/api/tasks', rateLimit_1.apiLimiter, tasks_1.default);
    app.use('/api/teams', rateLimit_1.apiLimiter, teams_1.default);
    app.use('/api/notifications', rateLimit_1.apiLimiter, notifications_1.default);
    app.use('/api/users', rateLimit_1.apiLimiter, users_1.default);
    app.use('/api/chat', rateLimit_1.apiLimiter, chat_1.default);
    app.use(errorHandler_1.errorHandler);
    // Initialize Socket.io
    (0, socket_1.initSocket)(httpServer);
    httpServer.listen(config_1.config.port, () => {
        // eslint-disable-next-line no-console
        console.log(`boardlyX backend listening on http://localhost:${config_1.config.port}`);
    });
}
main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to start backend', err);
    process.exit(1);
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiL1ZvbHVtZXMvQWFkaXR5YSdzIFNTRC9EZXZlbG9wbWVudC9ib2FyZGx5WC1iYWNrZW5kL3NyYy9pbmRleC50cyIsInNvdXJjZXMiOlsiL1ZvbHVtZXMvQWFkaXR5YSdzIFNTRC9EZXZlbG9wbWVudC9ib2FyZGx5WC1iYWNrZW5kL3NyYy9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7OztBQUFBLHNEQUE4QjtBQUM5QixnREFBd0I7QUFDeEIsK0JBQW9DO0FBQ3BDLHFDQUFrQztBQUNsQyw2QkFBOEI7QUFDOUIsa0RBQWdDO0FBQ2hDLDJEQUF3QztBQUN4QywyREFBd0M7QUFDeEMsMkVBQXdEO0FBQ3hELDJEQUF3QztBQUN4Qyx5REFBdUM7QUFDdkMsc0RBQWlFO0FBQ2pFLDREQUF5RDtBQUN6RCxxQ0FBc0M7QUFDdEMsa0VBQXVFO0FBQ3ZFLHlCQUF1QjtBQUV2QixLQUFLLFVBQVUsSUFBSTtJQUNqQixNQUFNLElBQUEsV0FBTSxHQUFFLENBQUM7SUFDZixNQUFNLElBQUEsdUNBQXNCLEdBQUUsQ0FBQztJQUUvQixNQUFNLEdBQUcsR0FBRyxJQUFBLGlCQUFPLEdBQUUsQ0FBQztJQUN0QixNQUFNLFVBQVUsR0FBRyxJQUFBLG1CQUFZLEVBQUMsR0FBRyxDQUFDLENBQUM7SUFFckMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFBLGNBQUksRUFBQyxFQUFFLE1BQU0sRUFBRSxHQUFHLEVBQUUsV0FBVyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNsRCxHQUFHLENBQUMsR0FBRyxDQUFDLGlCQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztJQUV4QyxHQUFHLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsRUFBRTtRQUMvQixHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7SUFDekIsQ0FBQyxDQUFDLENBQUM7SUFDSCxHQUFHLENBQUMsR0FBRyxDQUFDLGNBQWMsRUFBRSxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsRUFBRTtRQUNwQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsT0FBTyxFQUFFLGFBQWEsRUFBRSxDQUFDLENBQUM7SUFDdkMsQ0FBQyxDQUFDLENBQUM7SUFDSCxHQUFHLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSx1QkFBVyxFQUFFLGNBQVUsQ0FBQyxDQUFDO0lBQzFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsWUFBWSxFQUFFLHNCQUFVLEVBQUUsZUFBVSxDQUFDLENBQUM7SUFDOUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxZQUFZLEVBQUUsc0JBQVUsRUFBRSxlQUFVLENBQUMsQ0FBQztJQUM5QyxHQUFHLENBQUMsR0FBRyxDQUFDLG9CQUFvQixFQUFFLHNCQUFVLEVBQUUsdUJBQWtCLENBQUMsQ0FBQztJQUM5RCxHQUFHLENBQUMsR0FBRyxDQUFDLFlBQVksRUFBRSxzQkFBVSxFQUFFLGVBQVUsQ0FBQyxDQUFDO0lBQzlDLEdBQUcsQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLHNCQUFVLEVBQUUsY0FBVSxDQUFDLENBQUM7SUFFN0MsR0FBRyxDQUFDLEdBQUcsQ0FBQywyQkFBWSxDQUFDLENBQUM7SUFFdEIsdUJBQXVCO0lBQ3ZCLElBQUEsbUJBQVUsRUFBQyxVQUFVLENBQUMsQ0FBQztJQUV2QixVQUFVLENBQUMsTUFBTSxDQUFDLGVBQU0sQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFO1FBQ2xDLHNDQUFzQztRQUN0QyxPQUFPLENBQUMsR0FBRyxDQUFDLGtEQUFrRCxlQUFNLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUMvRSxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUM7QUFFRCxJQUFJLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLEVBQUUsRUFBRTtJQUNuQixzQ0FBc0M7SUFDdEMsT0FBTyxDQUFDLEtBQUssQ0FBQyx5QkFBeUIsRUFBRSxHQUFHLENBQUMsQ0FBQztJQUM5QyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2xCLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IGV4cHJlc3MgZnJvbSAnZXhwcmVzcyc7XG5pbXBvcnQgY29ycyBmcm9tICdjb3JzJztcbmltcG9ydCB7IGNyZWF0ZVNlcnZlciB9IGZyb20gJ2h0dHAnO1xuaW1wb3J0IHsgY29uZmlnIH0gZnJvbSAnLi9jb25maWcnO1xuaW1wb3J0IHsgaW5pdERiIH0gZnJvbSAnLi9kYic7XG5pbXBvcnQgYXV0aFJvdXRlciBmcm9tICcuL2F1dGgnO1xuaW1wb3J0IHRhc2tSb3V0ZXMgZnJvbSAnLi9yb3V0ZXMvdGFza3MnO1xuaW1wb3J0IHRlYW1Sb3V0ZXMgZnJvbSAnLi9yb3V0ZXMvdGVhbXMnO1xuaW1wb3J0IG5vdGlmaWNhdGlvblJvdXRlcyBmcm9tICcuL3JvdXRlcy9ub3RpZmljYXRpb25zJztcbmltcG9ydCB1c2VyUm91dGVzIGZyb20gJy4vcm91dGVzL3VzZXJzJztcbmltcG9ydCBjaGF0Um91dGVzIGZyb20gJy4vcm91dGVzL2NoYXQnO1xuaW1wb3J0IHsgYXBpTGltaXRlciwgYXV0aExpbWl0ZXIgfSBmcm9tICcuL21pZGRsZXdhcmUvcmF0ZUxpbWl0JztcbmltcG9ydCB7IGVycm9ySGFuZGxlciB9IGZyb20gJy4vbWlkZGxld2FyZS9lcnJvckhhbmRsZXInO1xuaW1wb3J0IHsgaW5pdFNvY2tldCB9IGZyb20gJy4vc29ja2V0JztcbmltcG9ydCB7IGJhY2tmaWxsVGVhbUdyb3VwQ2hhdHMgfSBmcm9tICcuL3JlcG9zaXRvcmllcy9jaGF0UmVwb3NpdG9yeSc7XG5pbXBvcnQgJy4vdGVsZWdyYW1Cb3QnO1xuXG5hc3luYyBmdW5jdGlvbiBtYWluKCkge1xuICBhd2FpdCBpbml0RGIoKTtcbiAgYXdhaXQgYmFja2ZpbGxUZWFtR3JvdXBDaGF0cygpO1xuXG4gIGNvbnN0IGFwcCA9IGV4cHJlc3MoKTtcbiAgY29uc3QgaHR0cFNlcnZlciA9IGNyZWF0ZVNlcnZlcihhcHApO1xuXG4gIGFwcC51c2UoY29ycyh7IG9yaWdpbjogJyonLCBjcmVkZW50aWFsczogdHJ1ZSB9KSk7XG4gIGFwcC51c2UoZXhwcmVzcy5qc29uKHsgbGltaXQ6ICc1bWInIH0pKTtcblxuICBhcHAuZ2V0KCcvaGVhbHRoJywgKF9yZXEsIHJlcykgPT4ge1xuICAgIHJlcy5qc29uKHsgb2s6IHRydWUgfSk7XG4gIH0pO1xuICBhcHAudXNlKCcvaGVsbG8td29ybGQnLCAoX3JlcSwgcmVzKSA9PiB7XG4gICAgcmVzLmpzb24oeyBtZXNzYWdlOiAnSGVsbG8gV29ybGQnIH0pO1xuICB9KTtcbiAgYXBwLnVzZSgnL2F1dGgnLCBhdXRoTGltaXRlciwgYXV0aFJvdXRlcik7XG4gIGFwcC51c2UoJy9hcGkvdGFza3MnLCBhcGlMaW1pdGVyLCB0YXNrUm91dGVzKTtcbiAgYXBwLnVzZSgnL2FwaS90ZWFtcycsIGFwaUxpbWl0ZXIsIHRlYW1Sb3V0ZXMpO1xuICBhcHAudXNlKCcvYXBpL25vdGlmaWNhdGlvbnMnLCBhcGlMaW1pdGVyLCBub3RpZmljYXRpb25Sb3V0ZXMpO1xuICBhcHAudXNlKCcvYXBpL3VzZXJzJywgYXBpTGltaXRlciwgdXNlclJvdXRlcyk7XG4gIGFwcC51c2UoJy9hcGkvY2hhdCcsIGFwaUxpbWl0ZXIsIGNoYXRSb3V0ZXMpO1xuXG4gIGFwcC51c2UoZXJyb3JIYW5kbGVyKTtcblxuICAvLyBJbml0aWFsaXplIFNvY2tldC5pb1xuICBpbml0U29ja2V0KGh0dHBTZXJ2ZXIpO1xuXG4gIGh0dHBTZXJ2ZXIubGlzdGVuKGNvbmZpZy5wb3J0LCAoKSA9PiB7XG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcbiAgICBjb25zb2xlLmxvZyhgYm9hcmRseVggYmFja2VuZCBsaXN0ZW5pbmcgb24gaHR0cDovL2xvY2FsaG9zdDoke2NvbmZpZy5wb3J0fWApO1xuICB9KTtcbn1cblxubWFpbigpLmNhdGNoKChlcnIpID0+IHtcbiAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcbiAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIHN0YXJ0IGJhY2tlbmQnLCBlcnIpO1xuICBwcm9jZXNzLmV4aXQoMSk7XG59KTtcblxuIl19