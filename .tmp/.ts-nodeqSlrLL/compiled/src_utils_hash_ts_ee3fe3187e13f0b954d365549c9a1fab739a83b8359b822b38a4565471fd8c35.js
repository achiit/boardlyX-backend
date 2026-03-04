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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiL1ZvbHVtZXMvQWFkaXR5YSdzIFNTRC9EZXZlbG9wbWVudC9ib2FyZGx5WC1iYWNrZW5kL3NyYy91dGlscy9oYXNoLnRzIiwic291cmNlcyI6WyIvVm9sdW1lcy9BYWRpdHlhJ3MgU1NEL0RldmVsb3BtZW50L2JvYXJkbHlYLWJhY2tlbmQvc3JjL3V0aWxzL2hhc2gudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFFQSx3Q0FRQztBQVZELG9EQUE0QjtBQUU1QixTQUFnQixjQUFjLENBQzVCLEtBQWEsRUFDYixXQUFtQixFQUNuQixNQUFjLEVBQ2QsU0FBaUI7SUFFakIsTUFBTSxPQUFPLEdBQUcsR0FBRyxLQUFLLElBQUksV0FBVyxJQUFJLE1BQU0sSUFBSSxTQUFTLEVBQUUsQ0FBQztJQUNqRSxPQUFPLGdCQUFNLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDbkUsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBjcnlwdG8gZnJvbSAnY3J5cHRvJztcblxuZXhwb3J0IGZ1bmN0aW9uIHNoYTI1NlRhc2tIYXNoKFxuICB0aXRsZTogc3RyaW5nLFxuICBkZXNjcmlwdGlvbjogc3RyaW5nLFxuICB1c2VySWQ6IHN0cmluZyxcbiAgY3JlYXRlZEF0OiBzdHJpbmcsXG4pOiBzdHJpbmcge1xuICBjb25zdCBwYXlsb2FkID0gYCR7dGl0bGV9fCR7ZGVzY3JpcHRpb259fCR7dXNlcklkfXwke2NyZWF0ZWRBdH1gO1xuICByZXR1cm4gY3J5cHRvLmNyZWF0ZUhhc2goJ3NoYTI1NicpLnVwZGF0ZShwYXlsb2FkKS5kaWdlc3QoJ2hleCcpO1xufVxuIl19