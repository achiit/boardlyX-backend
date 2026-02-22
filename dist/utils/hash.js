"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sha256TaskHash = sha256TaskHash;
const crypto_1 = __importDefault(require("crypto"));
function sha256TaskHash(title, description, userId, createdAt) {
    const payload = `${title}|${description}|${userId}|${createdAt}`;
    return crypto_1.default.createHash('sha256').update(payload).digest('hex');
}
