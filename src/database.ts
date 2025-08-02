// Main database class - implements MongoDB database API
import { Database } from 'bun:sqlite';
import { BongoCollection } from './collection.js';

export class BongoDatabase {
  private db: Database;
  private name: string;
  private collections: Map<string, BongoCollection> = new Map();

  constructor(db: Database, name: string) {
    this.db = db;
    this.name = name;
  }

  collection(name: string): BongoCollection {
    if (!this.collections.has(name)) {
      const collection = new BongoCollection(this.db, name);
      this.collections.set(name, collection);
    }
    return this.collections.get(name)!;
  }

  createCollection(name: string): BongoCollection {
    return this.collection(name);
  }

  async dropCollection(name: string): Promise<boolean> {
    const collection = this.collection(name);
    const result = collection.drop();
    if (result) {
      this.collections.delete(name);
    }
    return result;
  }

  listCollections(): string[] {
    // Query SQLite to get all tables
    const stmt = this.db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `);
    const tables = stmt.all() as { name: string }[];
    return tables.map(table => table.name);
  }

  stats(): any {
    const collections = this.listCollections();
    const stats = {
      db: this.name,
      collections: collections.length,
      objects: 0,
      dataSize: 0,
      indexSize: 0
    };

    // Get database file size
    try {
      const dbPath = this.db.filename;
      if (dbPath && dbPath !== ':memory:') {
        const fs = require('fs');
        const stat = fs.statSync(dbPath);
        stats.dataSize = stat.size;
      }
    } catch {
      // Ignore errors for in-memory databases
    }

    // Count total documents
    for (const collectionName of collections) {
      const collection = this.collection(collectionName);
      stats.objects += collection.countDocuments();
    }

    return stats;
  }

  close(): void {
    this.db.close();
    this.collections.clear();
  }

  getName(): string {
    return this.name;
  }
}
