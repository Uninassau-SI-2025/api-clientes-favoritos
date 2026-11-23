import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Database, Statement } from "../src/db";

const schemaPath = join(dirname(fileURLToPath(import.meta.url)), "../migrations/0001_init.sql");
const schema = readFileSync(schemaPath, "utf8");

class SqliteStatement implements Statement {
  constructor(
    private readonly sqlite: DatabaseSync,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...values: unknown[]) {
    return new SqliteStatement(this.sqlite, this.sql, values);
  }

  async first<T = Record<string, unknown>>() {
    const row = this.sqlite.prepare(this.sql).get(...(this.params as never[]));
    return (row ?? null) as T | null;
  }

  async all<T = Record<string, unknown>>() {
    const rows = this.sqlite.prepare(this.sql).all(...(this.params as never[]));
    return { results: rows as T[] };
  }

  async run() {
    const result = this.sqlite.prepare(this.sql).run(...(this.params as never[]));
    return {
      meta: {
        last_row_id: Number(result.lastInsertRowid),
        changes: Number(result.changes),
      },
    };
  }
}

export interface TestDatabase extends Database {
  reset(): Promise<void>;
}

export function createTestDatabase(): TestDatabase {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec(schema);

  return {
    prepare(sql: string) {
      return new SqliteStatement(sqlite, sql);
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        for (const statement of statements) await statement.run();
        sqlite.exec("COMMIT");
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    async reset() {
      sqlite.exec("DELETE FROM favorites; DELETE FROM clients;");
    },
  };
}
