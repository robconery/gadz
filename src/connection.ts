import { Database } from "bun:sqlite";
import { createPool, Pool } from "generic-pool";
import * as path from "path";

interface PooledDatabase {
  db: Database;
  inTransaction: boolean;
}

interface ConnectionConfig {
  path?: string;
  poolMin?: number;
  poolMax?: number;
  poolAcquireTimeoutMs?: number;
  poolIdleTimeoutMs?: number;
  maintenanceIntervalMs?: number; // For periodic maintenance
}

class ConnectionManager {
  private pool: Pool<PooledDatabase> | null = null;
  private config: ConnectionConfig = {};
  private sharedDatabase: Database | null = null; // For in-memory databases
  private maintenanceTimer: Timer | null = null; // For periodic maintenance
  
  /**
   * Configure SQLite database with production-optimized settings
   */
  private configureDatabase(db: Database, isInMemory: boolean = false): void {
    // Enable foreign key constraints
    db.exec("PRAGMA foreign_keys = ON;");
    
    if (!isInMemory) {
      // Enable WAL mode for better concurrency and performance
      db.exec("PRAGMA journal_mode = WAL;");
      
      // Set WAL checkpoint mode for better performance
      db.exec("PRAGMA wal_checkpoint_threshold = 1000;");
      
      // Optimize synchronous mode for production
      // NORMAL provides good balance of safety and performance
      db.exec("PRAGMA synchronous = NORMAL;");
      
      // Increase cache size (negative value = KB, positive = pages)
      // 64MB cache size
      db.exec("PRAGMA cache_size = -65536;");
      
      // Set temp store to memory for better performance
      db.exec("PRAGMA temp_store = MEMORY;");
      
      // Optimize page size (default 4096 is usually good)
      // Only set on database creation, can't change after
      db.exec("PRAGMA page_size = 4096;");
      
      // Set busy timeout to handle concurrent access
      db.exec("PRAGMA busy_timeout = 30000;");
      
      // Enable query optimization
      db.exec("PRAGMA optimize;");
      
      // Auto-vacuum for better space management
      db.exec("PRAGMA auto_vacuum = INCREMENTAL;");
      
      // Set mmap size for better performance on larger databases
      // 256MB mmap size
      db.exec("PRAGMA mmap_size = 268435456;");
    } else {
      // In-memory specific optimizations
      db.exec("PRAGMA cache_size = -32768;"); // 32MB for in-memory
      db.exec("PRAGMA temp_store = MEMORY;");
      db.exec("PRAGMA synchronous = OFF;"); // Safe for in-memory
      db.exec("PRAGMA journal_mode = MEMORY;");
    }
  }
  
  /**
   * Initialize the connection pool based on environment
   */
  async connect(config: ConnectionConfig = {}): Promise<void> {
    if (this.pool) {
      throw new Error("Already connected. Call close() first.");
    }

    this.config = {
      poolMin: 2,
      poolMax: 10,
      poolAcquireTimeoutMs: 30000,
      poolIdleTimeoutMs: 60000,
      maintenanceIntervalMs: 300000, // 5 minutes
      ...config
    };

    // Determine database path based on environment
    let dbPath: string;
    if (process.env.NODE_ENV === "test") {
      dbPath = ":memory:";
    } else {
      dbPath = process.env.SQLITE_PATH || config.path || path.join(process.cwd(), "db", "dev.db");
    }

    // For in-memory databases, create a shared database instance
    if (dbPath === ":memory:") {
      this.sharedDatabase = new Database(":memory:");
      this.configureDatabase(this.sharedDatabase, true);
    }

    this.pool = createPool(
      {
        create: async (): Promise<PooledDatabase> => {
          let db: Database;
          
          if (this.sharedDatabase) {
            // Use the shared in-memory database
            db = this.sharedDatabase;
          } else {
            db = new Database(dbPath);
            this.configureDatabase(db, false);
          }
          
          return { db, inTransaction: false };
        },
        destroy: async (pooledDb: PooledDatabase): Promise<void> => {
          if (pooledDb.inTransaction) {
            try {
              pooledDb.db.exec("ROLLBACK;");
            } catch (e) {
              // Ignore rollback errors on destroy
            }
          }
          // Don't close shared in-memory database connections
          if (!this.sharedDatabase) {
            pooledDb.db.close();
          }
        },
        validate: async (pooledDb: PooledDatabase): Promise<boolean> => {
          try {
            // Simple validation query
            pooledDb.db.query("SELECT 1").get();
            return true;
          } catch {
            return false;
          }
        }
      },
      {
        min: this.config.poolMin,
        max: this.config.poolMax,
        acquireTimeoutMillis: this.config.poolAcquireTimeoutMs,
        idleTimeoutMillis: this.config.poolIdleTimeoutMs,
        testOnBorrow: true
      }
    );

    // Start maintenance timer for file-based databases
    if (dbPath !== ":memory:" && this.config.maintenanceIntervalMs) {
      this.startMaintenance();
    }
  }

  /**
   * Start periodic maintenance operations
   */
  private startMaintenance(): void {
    if (this.maintenanceTimer) return;

    this.maintenanceTimer = setInterval(async () => {
      try {
        await this.runMaintenance();
      } catch (error) {
        console.warn("Database maintenance error:", error);
      }
    }, this.config.maintenanceIntervalMs!);
  }

  /**
   * Run database maintenance operations
   */
  private async runMaintenance(): Promise<void> {
    if (!this.pool || this.sharedDatabase) return;

    await this.withConnection(async (pooledDb) => {
      // WAL checkpoint to move data from WAL to main database
      pooledDb.db.exec("PRAGMA wal_checkpoint(PASSIVE);");
      
      // Optimize query planner
      pooledDb.db.exec("PRAGMA optimize;");
      
      // Incremental vacuum if auto_vacuum is enabled
      pooledDb.db.exec("PRAGMA incremental_vacuum;");
    });
  }

  /**
   * Stop maintenance operations
   */
  private stopMaintenance(): void {
    if (this.maintenanceTimer) {
      clearInterval(this.maintenanceTimer);
      this.maintenanceTimer = null;
    }
  }

  /**
   * Get a database connection from the pool
   */
  async acquire(): Promise<PooledDatabase> {
    if (!this.pool) {
      throw new Error("Not connected. Call connect() first.");
    }
    return await this.pool.acquire();
  }

  /**
   * Return a database connection to the pool
   */
  async release(pooledDb: PooledDatabase): Promise<void> {
    if (!this.pool) {
      throw new Error("Not connected.");
    }
    
    // If connection is in transaction, rollback before releasing
    if (pooledDb.inTransaction) {
      try {
        pooledDb.db.exec("ROLLBACK;");
        pooledDb.inTransaction = false;
      } catch (e) {
        // Log error but continue with release
        console.warn("Error rolling back transaction:", e);
      }
    }
    
    await this.pool.release(pooledDb);
  }

  /**
   * Begin a transaction on a pooled connection
   */
  async beginTransaction(pooledDb: PooledDatabase): Promise<void> {
    if (pooledDb.inTransaction) {
      throw new Error("Connection already in transaction");
    }
    pooledDb.db.exec("BEGIN;");
    pooledDb.inTransaction = true;
  }

  /**
   * Commit a transaction on a pooled connection
   */
  async commitTransaction(pooledDb: PooledDatabase): Promise<void> {
    if (!pooledDb.inTransaction) {
      throw new Error("No active transaction");
    }
    pooledDb.db.exec("COMMIT;");
    pooledDb.inTransaction = false;
  }

  /**
   * Rollback a transaction on a pooled connection
   */
  async rollbackTransaction(pooledDb: PooledDatabase): Promise<void> {
    if (!pooledDb.inTransaction) {
      throw new Error("No active transaction");
    }
    pooledDb.db.exec("ROLLBACK;");
    pooledDb.inTransaction = false;
  }

  /**
   * Execute a function with a database connection
   */
  async withConnection<T>(fn: (pooledDb: PooledDatabase) => Promise<T> | T): Promise<T> {
    const pooledDb = await this.acquire();
    try {
      return await fn(pooledDb);
    } finally {
      await this.release(pooledDb);
    }
  }

  /**
   * Execute a function within a transaction
   */
  async withTransaction<T>(fn: (pooledDb: PooledDatabase) => Promise<T> | T): Promise<T> {
    const pooledDb = await this.acquire();
    try {
      await this.beginTransaction(pooledDb);
      const result = await fn(pooledDb);
      await this.commitTransaction(pooledDb);
      return result;
    } catch (error) {
      await this.rollbackTransaction(pooledDb);
      throw error;
    } finally {
      await this.release(pooledDb);
    }
  }

  /**
   * Get list of all tables (collections)
   */
  async collections(): Promise<string[]> {
    return await this.withConnection(async (pooledDb) => {
      const query = pooledDb.db.query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      );
      const tables = query.all() as { name: string }[];
      return tables.map(table => table.name);
    });
  }

  /**
   * Close all connections and destroy the pool
   */
  async close(): Promise<void> {
    // Stop maintenance operations
    this.stopMaintenance();
    
    if (this.pool) {
      await this.pool.drain();
      await this.pool.clear();
      this.pool = null;
    }
    
    // Close shared database if it exists
    if (this.sharedDatabase) {
      this.sharedDatabase.close();
      this.sharedDatabase = null;
    }
  }

  /**
   * Get pool status information
   */
  getPoolStatus() {
    if (!this.pool) {
      return null;
    }
    
    return {
      size: this.pool.size,
      available: this.pool.available,
      borrowed: this.pool.borrowed,
      pending: this.pool.pending,
      min: this.config.poolMin,
      max: this.config.poolMax
    };
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.pool !== null;
  }

  /**
   * Manually trigger database maintenance
   */
  async maintenance(): Promise<void> {
    await this.runMaintenance();
  }

  /**
   * Get database statistics and health information
   */
  async getDatabaseStats(): Promise<any> {
    if (!this.pool) {
      throw new Error("Not connected");
    }

    return await this.withConnection(async (pooledDb) => {
      const stats: any = {};
      
      try {
        // Get basic database info
        const pageCountResult = pooledDb.db.query("PRAGMA page_count").get() as any;
        const pageSizeResult = pooledDb.db.query("PRAGMA page_size").get() as any;
        const freePageResult = pooledDb.db.query("PRAGMA freelist_count").get() as any;
        
        // Handle different result formats
        stats.totalPages = pageCountResult?.page_count ?? pageCountResult ?? 0;
        stats.pageSize = pageSizeResult?.page_size ?? pageSizeResult ?? 4096;
        stats.freePages = freePageResult?.freelist_count ?? freePageResult ?? 0;
        
        stats.databaseSize = stats.totalPages * stats.pageSize;
        stats.freeSpace = stats.freePages * stats.pageSize;
        
        // WAL information (if applicable)
        stats.walInfo = null;
        if (!this.sharedDatabase) {
          try {
            const walResult = pooledDb.db.query("PRAGMA wal_checkpoint").get();
            stats.walInfo = walResult;
          } catch (e) {
            // WAL might not be enabled or supported
            stats.walInfo = null;
          }
        }
        
        // Cache information
        const cacheSizeResult = pooledDb.db.query("PRAGMA cache_size").get() as any;
        stats.cacheSize = cacheSizeResult?.cache_size ?? cacheSizeResult ?? -32768;
        
      } catch (error) {
        // Fallback values for in-memory or other edge cases
        stats.totalPages = 1;
        stats.pageSize = 4096;
        stats.freePages = 0;
        stats.databaseSize = 4096;
        stats.freeSpace = 0;
        stats.cacheSize = -32768;
        stats.walInfo = null;
        stats.error = error instanceof Error ? error.message : String(error);
      }
      
      return stats;
    });
  }
}

// Singleton instance
const connectionManager = new ConnectionManager();

// Export the singleton methods
export const connect = (config?: ConnectionConfig) => connectionManager.connect(config);
export const close = () => connectionManager.close();
export const getDatabase = () => connectionManager.acquire();
export const releaseDatabase = (pooledDb: PooledDatabase) => connectionManager.release(pooledDb);
export const withConnection = <T>(fn: (pooledDb: PooledDatabase) => Promise<T> | T) => 
  connectionManager.withConnection(fn);
export const withTransaction = <T>(fn: (pooledDb: PooledDatabase) => Promise<T> | T) => 
  connectionManager.withTransaction(fn);
export const collections = () => connectionManager.collections();
export const getPoolStatus = () => connectionManager.getPoolStatus();
export const isConnected = () => connectionManager.isConnected();
export const maintenance = () => connectionManager.maintenance();
export const getDatabaseStats = () => connectionManager.getDatabaseStats();

// Export types
export type { PooledDatabase, ConnectionConfig };
