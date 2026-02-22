"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTotalRecords = getTotalRecords;
exports.getRecord = getRecord;
exports.findRecordByTaskHash = findRecordByTaskHash;
const viem_1 = require("viem");
const chains_1 = require("viem/chains");
const config_1 = require("../config");
const ABI = [
    {
        inputs: [{ internalType: 'uint256', name: 'index', type: 'uint256' }],
        name: 'getRecord',
        outputs: [
            {
                components: [
                    { internalType: 'address', name: 'user', type: 'address' },
                    { internalType: 'string', name: 'taskHash', type: 'string' },
                    { internalType: 'uint256', name: 'timestamp', type: 'uint256' },
                ],
                internalType: 'struct AstraTaskRegistry.TaskRecord',
                name: '',
                type: 'tuple',
            },
        ],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'getTotalRecords',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
];
const client = (0, viem_1.createPublicClient)({
    chain: chains_1.sepolia,
    transport: (0, viem_1.http)(config_1.config.sepoliaRpcUrl),
});
const contract = (0, viem_1.getContract)({
    address: config_1.config.contractAddress,
    abi: ABI,
    client,
});
async function getTotalRecords() {
    return contract.read.getTotalRecords();
}
async function getRecord(index) {
    const result = await contract.read.getRecord([BigInt(index)]);
    const r = result;
    return { user: r.user, taskHash: r.taskHash, timestamp: r.timestamp };
}
async function findRecordByTaskHash(taskHash, userWallet) {
    const total = await getTotalRecords();
    const totalNum = Number(total);
    for (let i = 0; i < totalNum; i++) {
        const record = await getRecord(i);
        if (record.taskHash.toLowerCase() !== taskHash.toLowerCase())
            continue;
        if (userWallet && record.user.toLowerCase() !== userWallet.toLowerCase())
            continue;
        return {
            verified: true,
            blockTimestamp: Number(record.timestamp),
            index: i,
        };
    }
    return { verified: false };
}
