import { Database } from "bun:sqlite";
import * as path from "path";

interface ConnectionConfig {
  path?: string;
  maintenanceIntervalMs?: number; // For periodic maintenance
}

interface DatabaseConnection {
  db: Database;
  inTransaction: boolean;
  transactionDepth: number;
}

class ConnectionManager {
  private connection: DatabaseConnection | null = null;
  private config: ConnectionConfig = {};
  private maintenanceTimer: Timer | null = null; // For periodic maintenance
  private dbPath: string = "";
  
  /**
   * Configure SQLite database with multi-process optimized settings
   */
  private configureDatabase(db: Database, isInMemory: boolean = false): void {
    // Enable foreign key constraints
    db.exec("PRAGMA foreign_keys = ON;");
    
    if (!isInMemory) {
      // Enable WAL mode for multi-process concurrency
      db.exec("PRAGMA journal_mode = WAL;");
      
      // Optimize synchronous mode for multi-process safety
      // NORMAL provides good balance of safety and performance for multi-process
      db.exec("PRAGMA synchronous = NORMAL;");
      
      // Increase cache size per connection
      // 32MB cache size per process
      db.exec("PRAGMA cache_size = -32768;");
      
      // Set temp store to memory for better performance
      db.exec("PRAGMA temp_store = MEMORY;");
      
      // Critical: Set busy timeout for multi-process access
      // 60 seconds timeout to handle concurrent writes from multiple processes
      db.exec("PRAGMA busy_timeout = 60000;");
      
      // Enable query optimization
      db.exec("PRAGMA optimize;");
      
      // Auto-vacuum for better space management
      db.exec("PRAGMA auto_vacuum = INCREMENTAL;");
      
      // Set mmap size for better performance
      // 128MB mmap size per process (lower than pool version)
      db.exec("PRAGMA mmap_size = 134217728;");
      
      // Enable shared cache mode for better memory usage
      db.exec("PRAGMA cache = shared;");
    } else {
      // In-memory specific optimizations
      db.exec("PRAGMA cache_size = -16384;"); // 16MB for in-memory
      db.exec("PRAGMA temp_store = MEMORY;");
      db.exec("PRAGMA synchronous = OFF;"); // Safe for in-memory
      db.exec("PRAGMA journal_mode = MEMORY;");
    }
  }
  
  /**
   * Initialize the database connection based on environment
   */
  async connect(config: ConnectionConfig = {}): Promise<void> {
    if (this.connection) {
      throw new Error("Already connected. Call close() first.");
    }

    this.config = {
      maintenanceIntervalMs: 300000, // 5 minutes
      ...config
    };

    // Determine database path based on environment
    if (process.env.NODE_ENV === "test") {
      // Use unique in-memory database for each test run to ensure isolation
      this.dbPath = `:memory:`;
    } else {
      this.dbPath = process.env.SQLITE_PATH || config.path || path.join(process.cwd(), "db", "dev.db");
    }

    // Create single database connection for this process
    const db = new Database(this.dbPath);
    this.configureDatabase(db, this.dbPath === ":memory:");
    
    this.connection = { 
      db, 
      inTransaction: false, 
      transactionDepth: 0 
    };

    // Start maintenance timer for file-based databases
    if (this.dbPath !== ":memory:" && this.config.maintenanceIntervalMs) {
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
    if (!this.connection || this.dbPath === ":memory:") return;

    // Only run maintenance if not in transaction
    if (!this.connection.inTransaction) {
      try {
        // WAL checkpoint to move data from WAL to main database
        this.connection.db.exec("PRAGMA wal_checkpoint(PASSIVE);");
        
        // Optimize query planner
        this.connection.db.exec("PRAGMA optimize;");
        
        // Incremental vacuum if auto_vacuum is enabled
        this.connection.db.exec("PRAGMA incremental_vacuum;");
      } catch (error) {
        console.warn("Maintenance operation failed:", error);
      }
    }
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
   * Get the database connection (with auto-initialization)
   */
  async getConnection(): Promise<DatabaseConnection> {
    // Auto-initialize if not connected
    if (!this.connection) {
      await this.connect();
    }
    return this.connection!;
  }

  /**
   * Begin a transaction (supports nested transactions with savepoints)
   */
  async beginTransaction(connection: DatabaseConnection): Promise<void> {
    if (connection.transactionDepth === 0) {
      connection.db.exec("BEGIN;");
      connection.inTransaction = true;
    } else {
      // Use savepoint for nested transactions
      connection.db.exec(`SAVEPOINT sp_${connection.transactionDepth};`);
    }
    connection.transactionDepth++;
  }

  /**
   * Commit a transaction (handles nested transactions with savepoints)
   */
  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    if (connection.transactionDepth === 0) {
      throw new Error("No active transaction");
    }
    
    connection.transactionDepth--;
    
    if (connection.transactionDepth === 0) {
      connection.db.exec("COMMIT;");
      connection.inTransaction = false;
    } else {
      // Release savepoint for nested transaction
      connection.db.exec(`RELEASE SAVEPOINT sp_${connection.transactionDepth};`);
    }
  }

  /**
   * Rollback a transaction (handles nested transactions with savepoints)
   */
  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    if (connection.transactionDepth === 0) {
      throw new Error("No active transaction");
    }
    
    connection.transactionDepth--;
    
    if (connection.transactionDepth === 0) {
      connection.db.exec("ROLLBACK;");
      connection.inTransaction = false;
    } else {
      // Rollback to savepoint for nested transaction
      connection.db.exec(`ROLLBACK TO SAVEPOINT sp_${connection.transactionDepth};`);
    }
  }

  /**
   * Execute a function with the database connection
   */
  async withConnection<T>(fn: (connection: DatabaseConnection) => Promise<T> | T): Promise<T> {
    const connection = await this.getConnection();
    return await fn(connection);
  }

  /**
   * Execute a function within a transaction (supports nesting)
   */
  async withTransaction<T>(fn: (connection: DatabaseConnection) => Promise<T> | T): Promise<T> {
    const connection = await this.getConnection();
    
    await this.beginTransaction(connection);
    try {
      const result = await fn(connection);
      await this.commitTransaction(connection);
      return result;
    } catch (error) {
      await this.rollbackTransaction(connection);
      throw error;
    }
  }

  /**
   * Get list of all tables (collections)
   */
  async collections(): Promise<string[]> {
    return await this.withConnection(async (connection) => {
      const query = connection.db.query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      );
      const tables = query.all() as { name: string }[];
      return tables.map(table => table.name);
    });
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    // Stop maintenance operations
    this.stopMaintenance();
    
    if (this.connection) {
      // Rollback any pending transaction
      if (this.connection.inTransaction) {
        try {
          this.connection.db.exec("ROLLBACK;");
        } catch (e) {
          // Ignore rollback errors on close
        }
      }
      
      this.connection.db.close();
      this.connection = null;
    }
  }

  /**
   * Get connection status information
   */
  getConnectionStatus() {
    if (!this.connection) {
      return null;
    }
    
    return {
      connected: true,
      inTransaction: this.connection.inTransaction,
      transactionDepth: this.connection.transactionDepth,
      dbPath: this.dbPath
    };
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connection !== null;
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
    if (!this.connection) {
      throw new Error("Not connected");
    }

    return await this.withConnection(async (connection) => {
      const stats: any = {};
      
      try {
        // Get basic database info
        const pageCountResult = connection.db.query("PRAGMA page_count").get() as any;
        const pageSizeResult = connection.db.query("PRAGMA page_size").get() as any;
        const freePageResult = connection.db.query("PRAGMA freelist_count").get() as any;
        
        // Handle different result formats
        stats.totalPages = pageCountResult?.page_count ?? pageCountResult ?? 0;
        stats.pageSize = pageSizeResult?.page_size ?? pageSizeResult ?? 4096;
        stats.freePages = freePageResult?.freelist_count ?? freePageResult ?? 0;
        
        stats.databaseSize = stats.totalPages * stats.pageSize;
        stats.freeSpace = stats.freePages * stats.pageSize;
        
        // WAL information (if applicable)
        stats.walInfo = null;
        // For in-memory databases or test environment, WAL info should be null
        if (this.dbPath !== ":memory:" && process.env.NODE_ENV !== "test") {
          try {
            const walResult = connection.db.query("PRAGMA wal_checkpoint").get();
            stats.walInfo = walResult;
          } catch (e) {
            // WAL might not be enabled or supported
            stats.walInfo = null;
          }
        }
        
        // Cache information
        const cacheSizeResult = connection.db.query("PRAGMA cache_size").get() as any;
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
export const getConnection = () => connectionManager.getConnection();
export const withConnection = <T>(fn: (connection: DatabaseConnection) => Promise<T> | T) => 
  connectionManager.withConnection(fn);
export const withTransaction = <T>(fn: (connection: DatabaseConnection) => Promise<T> | T) => 
  connectionManager.withTransaction(fn);
export const collections = () => connectionManager.collections();
export const getConnectionStatus = () => connectionManager.getConnectionStatus();
export const isConnected = () => connectionManager.isConnected();
export const maintenance = () => connectionManager.maintenance();
export const getDatabaseStats = () => connectionManager.getDatabaseStats();

// Test utility to reset connection - only for tests
export const resetConnection = async () => {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("resetConnection is only available in test environment");
  }
  await connectionManager.close();
  // Connection will be auto-recreated on next operation
};

// Export types
export type { DatabaseConnection, ConnectionConfig };
