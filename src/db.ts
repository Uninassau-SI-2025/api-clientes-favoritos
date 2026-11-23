export interface Statement {
  bind(...values: unknown[]): {
    first<T = Record<string, unknown>>(): Promise<T | null>;
    all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
    run(): Promise<{ meta?: { last_row_id?: number; changes?: number } }>;
  };
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<{ meta?: { last_row_id?: number; changes?: number } }>;
}

export interface Database {
  prepare(sql: string): Statement;
  batch(statements: Array<{ run(): Promise<unknown> }>): Promise<unknown>;
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && /unique constraint failed/i.test(error.message);
}
