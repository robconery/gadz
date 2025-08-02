// Main client class - implements MongoDB client API
import { Database } from 'bun:sqlite';
import { BongoDatabase } from './database.js';

export interface BongoClientOptions {
  filename?: string;
  readonly?: boolean;
  create?: boolean;
  readwrite?: boolean;
}

export class BongoClient {
  private databases: Map<string, BongoDatabase> = new Map();
  private sqliteConnections: Map<string, Database> = new Map();
  private options: BongoClientOptions;

  constructor(options: BongoClientOptions = {}) {
    this.options = {
      filename: ':memory:',
      readonly: false,
      create: true,
      readwrite: true,
      ...options
    };
  }

  db(name: string): BongoDatabase {
    if (!this.databases.has(name)) {
      // Create or get SQLite connection for this database
      let sqliteDb: Database;
      
      if (this.sqliteConnections.has(name)) {
        sqliteDb = this.sqliteConnections.get(name)!;
      } else {
        // For file-based databases, use separate files for each database
        const filename = this.options.filename === ':memory:' 
          ? ':memory:' 
          : `${this.options.filename || 'bongo'}_${name}.db`;
        
        sqliteDb = new Database(filename, {
          readonly: this.options.readonly,
          create: this.options.create,
          readwrite: this.options.readwrite
        });

        // Enable foreign keys if supported
        try {
          sqliteDb.run('PRAGMA foreign_keys = ON');
        } catch {
          // Ignore if not supported
        }

        // Add REGEXP function for regex support
        try {
          (sqliteDb as any).function('REGEXP', (pattern: string, text: string) => {
            try {
              return new RegExp(pattern).test(text) ? 1 : 0;
            } catch {
              return 0;
            }
          });
        } catch {
          // Ignore if function registration fails
        }
        
        this.sqliteConnections.set(name, sqliteDb);
      }

      const database = new BongoDatabase(sqliteDb, name);
      this.databases.set(name, database);
    }

    return this.databases.get(name)!;
  }

  async connect(): Promise<void> {
    // For SQLite, connection is established when the database is created
    // This method exists for MongoDB API compatibility
    return Promise.resolve();
  }

  async close(): Promise<void> {
    // Close all database connections
    for (const [name, database] of this.databases) {
      database.close();
    }
    
    for (const [name, connection] of this.sqliteConnections) {
      try {
        connection.close();
      } catch {
        // Ignore close errors
      }
    }

    this.databases.clear();
    this.sqliteConnections.clear();
  }

  listDatabases(): { name: string; sizeOnDisk?: number; empty?: boolean }[] {
    const databases: { name: string; sizeOnDisk?: number; empty?: boolean }[] = [];
    
    for (const [name, database] of this.databases) {
      const stats = database.stats();
      databases.push({
        name,
        sizeOnDisk: stats.dataSize,
        empty: stats.objects === 0
      });
    }

    return databases;
  }

  // Utility method to get SQLite connection for advanced operations
  getSQLiteConnection(databaseName: string): Database | undefined {
    return this.sqliteConnections.get(databaseName);
  }

  // Method to execute raw SQL (for advanced users)
  executeSQL(databaseName: string, sql: string, params: any[] = []): any {
    const connection = this.getSQLiteConnection(databaseName);
    if (!connection) {
      throw new Error(`Database ${databaseName} not found`);
    }
    
    const stmt = connection.prepare(sql);
    return stmt.all(...params);
  }
}
