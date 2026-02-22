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
