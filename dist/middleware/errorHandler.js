"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
function errorHandler(err, _req, res, _next) {
    console.error('[error]', err);
    if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
        return res.status(503).json({ error: 'Service temporarily unavailable' });
    }
    if (err.code === '23505') {
        return res.status(409).json({ error: 'Resource already exists' });
    }
    if (err.code === '23503') {
        return res.status(400).json({ error: 'Invalid reference' });
    }
    const status = err.status ?? 500;
    const message = err.message && status < 500 ? err.message : 'Internal server error';
    res.status(status).json({ error: message });
}
