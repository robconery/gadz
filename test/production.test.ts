import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { 
  connect, 
  close, 
  withConnection, 
  getDatabaseStats,
  maintenance,
  isConnected 
} from "../src/connection";

describe("Production Optimizations", () => {
  beforeEach(async () => {
    if (isConnected()) {
      await close();
    }
  });

  afterEach(async () => {
    if (isConnected()) {
      await close();
    }
  });

  test("should apply production SQLite configurations", async () => {
    await connect();
    
    const stats = await getDatabaseStats();
    
    // Verify basic stats are available
    expect(typeof stats.totalPages).toBe("number");
    expect(typeof stats.pageSize).toBe("number");
    expect(typeof stats.databaseSize).toBe("number");
    expect(typeof stats.cacheSize).toBe("number");
    
    // For in-memory database, WAL info should be null
    expect(stats.walInfo).toBeNull();
  });

  test("should handle maintenance operations", async () => {
    await connect();
    
    // Should not throw
    await maintenance();
    
    // Verify database is still functional after maintenance
    await withConnection(async (pooledDb) => {
      const result = pooledDb.db.query("SELECT 1 as test").get() as { test: number };
      expect(result.test).toBe(1);
    });
  });

  test("should connect with custom maintenance interval", async () => {
    await connect({
      maintenanceIntervalMs: 60000 // 1 minute
    });
    
    expect(isConnected()).toBe(true);
    
    const stats = await getDatabaseStats();
    expect(stats).toBeDefined();
  });

  test("should verify foreign key constraints are enabled", async () => {
    await connect();
    
    await withConnection(async (pooledDb) => {
      // Create tables with foreign key relationship
      pooledDb.db.exec(`
        CREATE TABLE parent (id INTEGER PRIMARY KEY);
        CREATE TABLE child (
          id INTEGER PRIMARY KEY,
          parent_id INTEGER REFERENCES parent(id)
        );
      `);
      
      // Insert parent record
      pooledDb.db.query("INSERT INTO parent (id) VALUES (1)").run();
      
      // This should work
      pooledDb.db.query("INSERT INTO child (parent_id) VALUES (1)").run();
      
      // This should fail due to foreign key constraint
      expect(() => {
        pooledDb.db.query("INSERT INTO child (parent_id) VALUES (999)").run();
      }).toThrow();
    });
  });

  test("should verify cache configuration", async () => {
    await connect();
    
    const stats = await getDatabaseStats();
    
    // Cache size should be set (negative values indicate KB)
    expect(stats.cacheSize).toBeLessThan(0); // Should be in KB format
    expect(Math.abs(stats.cacheSize)).toBeGreaterThan(1000); // Should be at least 1MB
  });

  test("should handle database statistics for empty database", async () => {
    await connect();
    
    const stats = await getDatabaseStats();
    
    expect(stats.totalPages).toBeGreaterThanOrEqual(0);
    expect(stats.pageSize).toBeGreaterThan(0);
    expect(stats.databaseSize).toBeGreaterThanOrEqual(0);
    expect(stats.freePages).toBeGreaterThanOrEqual(0);
    expect(stats.freeSpace).toBeGreaterThanOrEqual(0);
  });

  test("should handle concurrent access properly", async () => {
    await connect({ poolMax: 5 });
    
    // Run multiple concurrent operations
    const promises = Array.from({ length: 10 }, async (_, i) => {
      return await withConnection(async (pooledDb) => {
        // Create a table specific to this operation
        const tableName = `test_table_${i}`;
        pooledDb.db.exec(`CREATE TABLE IF NOT EXISTS ${tableName} (id INTEGER PRIMARY KEY, value TEXT)`);
        
        // Insert some data
        const insert = pooledDb.db.query(`INSERT INTO ${tableName} (value) VALUES (?)`);
        insert.run(`value_${i}`);
        
        // Read it back
        const select = pooledDb.db.query(`SELECT value FROM ${tableName} WHERE value = ?`);
        const result = select.get(`value_${i}`) as { value: string };
        
        return result.value;
      });
    });
    
    const results = await Promise.all(promises);
    
    // Verify all operations completed successfully
    expect(results).toHaveLength(10);
    results.forEach((result, i) => {
      expect(result).toBe(`value_${i}`);
    });
  });
});
