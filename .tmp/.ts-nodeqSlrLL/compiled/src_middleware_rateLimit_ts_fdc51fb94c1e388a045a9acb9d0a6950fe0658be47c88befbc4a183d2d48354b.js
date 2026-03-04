"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authLimiter = exports.apiLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
exports.apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 2000, // Increased for dev
    message: { error: 'Too many requests' },
    standardHeaders: true,
    legacyHeaders: false,
});
exports.authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 200, // Increased for dev
    message: { error: 'Too many auth attempts' },
    standardHeaders: true,
    legacyHeaders: false,
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiL1ZvbHVtZXMvQWFkaXR5YSdzIFNTRC9EZXZlbG9wbWVudC9ib2FyZGx5WC1iYWNrZW5kL3NyYy9taWRkbGV3YXJlL3JhdGVMaW1pdC50cyIsInNvdXJjZXMiOlsiL1ZvbHVtZXMvQWFkaXR5YSdzIFNTRC9EZXZlbG9wbWVudC9ib2FyZGx5WC1iYWNrZW5kL3NyYy9taWRkbGV3YXJlL3JhdGVMaW1pdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQSw0RUFBMkM7QUFFOUIsUUFBQSxVQUFVLEdBQUcsSUFBQSw0QkFBUyxFQUFDO0lBQ2xDLFFBQVEsRUFBRSxFQUFFLEdBQUcsRUFBRSxHQUFHLElBQUk7SUFDeEIsR0FBRyxFQUFFLElBQUksRUFBRSxvQkFBb0I7SUFDL0IsT0FBTyxFQUFFLEVBQUUsS0FBSyxFQUFFLG1CQUFtQixFQUFFO0lBQ3ZDLGVBQWUsRUFBRSxJQUFJO0lBQ3JCLGFBQWEsRUFBRSxLQUFLO0NBQ3JCLENBQUMsQ0FBQztBQUVVLFFBQUEsV0FBVyxHQUFHLElBQUEsNEJBQVMsRUFBQztJQUNuQyxRQUFRLEVBQUUsRUFBRSxHQUFHLEVBQUUsR0FBRyxJQUFJO0lBQ3hCLEdBQUcsRUFBRSxHQUFHLEVBQUUsb0JBQW9CO0lBQzlCLE9BQU8sRUFBRSxFQUFFLEtBQUssRUFBRSx3QkFBd0IsRUFBRTtJQUM1QyxlQUFlLEVBQUUsSUFBSTtJQUNyQixhQUFhLEVBQUUsS0FBSztDQUNyQixDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgcmF0ZUxpbWl0IGZyb20gJ2V4cHJlc3MtcmF0ZS1saW1pdCc7XG5cbmV4cG9ydCBjb25zdCBhcGlMaW1pdGVyID0gcmF0ZUxpbWl0KHtcbiAgd2luZG93TXM6IDE1ICogNjAgKiAxMDAwLFxuICBtYXg6IDIwMDAsIC8vIEluY3JlYXNlZCBmb3IgZGV2XG4gIG1lc3NhZ2U6IHsgZXJyb3I6ICdUb28gbWFueSByZXF1ZXN0cycgfSxcbiAgc3RhbmRhcmRIZWFkZXJzOiB0cnVlLFxuICBsZWdhY3lIZWFkZXJzOiBmYWxzZSxcbn0pO1xuXG5leHBvcnQgY29uc3QgYXV0aExpbWl0ZXIgPSByYXRlTGltaXQoe1xuICB3aW5kb3dNczogMTUgKiA2MCAqIDEwMDAsXG4gIG1heDogMjAwLCAvLyBJbmNyZWFzZWQgZm9yIGRldlxuICBtZXNzYWdlOiB7IGVycm9yOiAnVG9vIG1hbnkgYXV0aCBhdHRlbXB0cycgfSxcbiAgc3RhbmRhcmRIZWFkZXJzOiB0cnVlLFxuICBsZWdhY3lIZWFkZXJzOiBmYWxzZSxcbn0pO1xuIl19