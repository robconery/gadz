import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";

let db: Database | null = null;

export function connect(): Database {
  if (db) {
    return db;
  }

  let dbPath: string;

  if (process.env.NODE_ENV === "test") {
    // Use in-memory database for tests, but ensure it persists
    dbPath = ":memory:";
  } else {
    // Check for custom SQLite path or use default
    dbPath = process.env.SQLITE_PATH || "db/dev.db";
    
    // Ensure directory exists
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  db = new Database(dbPath);
  
  // Enable foreign keys and WAL mode for better performance (not for in-memory)
  db.exec("PRAGMA foreign_keys = ON");
  if (dbPath !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL");
  }

  return db;
}

export function close(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function getDatabase(): Database {
  if (!db) {
    return connect();
  }
  return db;
}

export function collections(): string[] {
  const db = getDatabase();
  const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
  return tables.map(t => t.name);
}
