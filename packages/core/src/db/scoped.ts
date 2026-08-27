export class NotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export function requireOwnership<T extends { userId: string }>(row: T | undefined | null, userId: string): T {
  if (!row || row.userId !== userId) {
    throw new NotFoundError(); // 404, never 403 - don't leak existence (§9.2)
  }
  return row;
}
