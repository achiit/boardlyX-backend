"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
require("dotenv/config");
exports.config = {
    port: Number(process.env.PORT) || 4000,
    jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
    postgresUrl: process.env.DATABASE_URL ||
        'postgresql://neondb_owner:password@localhost:5432/neondb',
    contractAddress: (process.env.CONTRACT_ADDRESS || '0x10185bA3F708fdC3AAAa1A8f4435d09C7af64dB6'),
    sepoliaRpcUrl: process.env.SEPOLIA_RPC_URL || 'https://rpc.sepolia.org',
};
