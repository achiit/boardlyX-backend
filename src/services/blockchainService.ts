import { createPublicClient, getContract, http } from 'viem';
import { sepolia } from 'viem/chains';
import { config } from '../config';

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
] as const;

const client = createPublicClient({
  chain: sepolia,
  transport: http(config.sepoliaRpcUrl),
});

const contract = getContract({
  address: config.contractAddress,
  abi: ABI,
  client,
});

export interface OnChainRecord {
  user: string;
  taskHash: string;
  timestamp: bigint;
}

export async function getTotalRecords(): Promise<bigint> {
  return contract.read.getTotalRecords();
}

export async function getRecord(index: number): Promise<OnChainRecord> {
  const result = await contract.read.getRecord([BigInt(index)]);
  const r = result as { user: string; taskHash: string; timestamp: bigint };
  return { user: r.user, taskHash: r.taskHash, timestamp: r.timestamp };
}

export async function findRecordByTaskHash(
  taskHash: string,

): Promise<{ verified: boolean; blockTimestamp?: number; transactionHash?: string; index?: number }> {
  const total = await getTotalRecords();
  const totalNum = Number(total);

  for (let i = 0; i < totalNum; i++) {
    const record = await getRecord(i);
    if (record.taskHash.toLowerCase() !== taskHash.toLowerCase()) continue;

    return {
      verified: true,
      blockTimestamp: Number(record.timestamp),
      index: i,
    };
  }

  return { verified: false };
}
