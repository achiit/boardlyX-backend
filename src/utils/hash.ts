import crypto from 'crypto';

export function sha256TaskHash(
  title: string,
  description: string,
  userId: string,
  createdAt: string,
): string {
  const payload = `${title}|${description}|${userId}|${createdAt}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}
