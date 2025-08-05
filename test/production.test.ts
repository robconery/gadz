import { describe, test, expect, beforeEach, afterEach } from "@jest/globals";
import { 
  connect, 
  close, 
  withConnection, 
  getDatabaseStats,
  maintenance,
  isConnected,
  resetConnection
} from "../src/connection";

// Set test environment
process.env.NODE_ENV = "test";

describe("Production Optimizations", () => {
  
  afterEach(async () => {
    await resetConnection();
  });

  test("should handle maintenance operations", async () => {

    // Should not throw
    await maintenance();
    
    // Verify database is still functional after maintenance
    await withConnection(async (connection) => {
      const result = connection.db.prepare("SELECT 1 as test").get() as { test: number };
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
    
    await withConnection(async (connection) => {
      // Create tables with foreign key relationship
      connection.db.exec(`
        CREATE TABLE parent (id INTEGER PRIMARY KEY);
        CREATE TABLE child (
          id INTEGER PRIMARY KEY,
          parent_id INTEGER REFERENCES parent(id)
        );
      `);
      
      // Insert parent record
      connection.db.prepare("INSERT INTO parent (id) VALUES (1)").run();
      
      // This should work
      connection.db.prepare("INSERT INTO child (parent_id) VALUES (1)").run();
      
      // This should fail due to foreign key constraint
      expect(() => {
        connection.db.prepare("INSERT INTO child (parent_id) VALUES (999)").run();
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
    await connect({ maintenanceIntervalMs: 5000 });
    
    // Run multiple concurrent operations
    const promises = Array.from({ length: 10 }, async (_, i) => {
      return await withConnection(async (connection) => {
        // Create a table specific to this operation
        const tableName = `test_table_${i}`;
        connection.db.exec(`CREATE TABLE IF NOT EXISTS ${tableName} (id INTEGER PRIMARY KEY, value TEXT)`);
        
        // Insert some data
        const insert = connection.db.prepare(`INSERT INTO ${tableName} (value) VALUES (?)`);
        insert.run(`value_${i}`);
        
        // Read it back
        const select = connection.db.prepare(`SELECT value FROM ${tableName} WHERE value = ?`);
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
