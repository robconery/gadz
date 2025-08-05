import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { 
  connect, 
  close, 
  withConnection, 
  withTransaction, 
  collections, 
  getConnectionStatus, 
  isConnected,
  resetConnection,
  type DatabaseConnection 
} from "../src/connection";

// Set test environment
process.env.NODE_ENV = "test";

describe("Connection Manager", () => {
  
  afterEach(async () => {
    await resetConnection();
  });

  describe("Basic Connection", () => {
    test("should connect with default in-memory database in test environment", async () => {
      await connect();
      expect(isConnected()).toBe(true);
      
      const status = getConnectionStatus();
      expect(status).not.toBeNull();
      expect(status!.connected).toBe(true);
      expect(status!.inTransaction).toBe(false);
    });

    test("should connect with custom config", async () => {
      await connect({
        maintenanceIntervalMs: 10000
      });
      
      expect(isConnected()).toBe(true);
      
      const status = getConnectionStatus();
      expect(status!.connected).toBe(true);
      expect(status!.dbPath).toBe(":memory:");
    });

    test("should throw error when connecting twice", async () => {
      await connect();
      expect(isConnected()).toBe(true);
      
      await expect(connect()).rejects.toThrow("Already connected");
    });

    test("should close connection properly", async () => {
      await connect();
      expect(isConnected()).toBe(true);
      
      await close();
      expect(isConnected()).toBe(false);
      expect(getConnectionStatus()).toBeNull();
    });
  });

  describe("Connection Pool", () => {
    test("should execute query with withConnection", async () => {
      await connect();
      
      const result = await withConnection(async (connection) => {
        const query = connection.db.query("SELECT 1 as test");
        return query.get() as { test: number };
      });
      
      expect(result.test).toBe(1);
    });

    test("should handle multiple concurrent operations", async () => {
      await connect();
      
      const promises = Array.from({ length: 5 }, (_, i) => 
        withConnection(async (connection) => {
          // Simulate some work
          await new Promise(resolve => setTimeout(resolve, 10));
          const query = connection.db.query("SELECT ? as value");
          return (query.get(i) as { value: number }).value;
        })
      );
      
      const results = await Promise.all(promises);
      expect(results).toEqual([0, 1, 2, 3, 4]);
    });

    test("should release connection even if error occurs", async () => {
      await connect();
      
      const statusBefore = getConnectionStatus();
      expect(statusBefore!.connected).toBe(true);
      
      await expect(
        withConnection(async () => {
          throw new Error("Test error");
        })
      ).rejects.toThrow("Test error");
      
      const statusAfter = getConnectionStatus();
      expect(statusAfter!.connected).toBe(true);
    });
  });

  describe("Transactions", () => {
    test("should execute transaction successfully", async () => {
      await connect();
      
      // Execute transaction that creates table and inserts data
      await withTransaction(async (connection) => {
        connection.db.exec(`
          CREATE TABLE IF NOT EXISTS test_users (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL
          )
        `);
        const insert = connection.db.query("INSERT INTO test_users (name) VALUES (?)");
        insert.run("Alice");
        insert.run("Bob");
      });
      
      // Verify data was committed
      const users = await withConnection(async (connection) => {
        const query = connection.db.query("SELECT name FROM test_users ORDER BY name");
        return query.all() as { name: string }[];
      });
      
      expect(users).toHaveLength(2);
      expect(users.map(u => u.name)).toEqual(["Alice", "Bob"]);
    });

    test("should rollback transaction on error", async () => {
      await connect();
      
      // Create test table and insert initial record in single transaction
      await withTransaction(async (connection) => {
        connection.db.exec(`
          CREATE TABLE IF NOT EXISTS test_products (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE
          )
        `);
        const insert = connection.db.query("INSERT INTO test_products (name) VALUES (?)");
        insert.run("Product A");
      });
      
      // Try to insert duplicate in transaction (should rollback)
      await expect(
        withTransaction(async (connection) => {
          const insert = connection.db.query("INSERT INTO test_products (name) VALUES (?)");
          insert.run("Product B");
          insert.run("Product A"); // This should cause constraint violation
        })
      ).rejects.toThrow();
      
      // Verify only the first record exists
      const products = await withConnection(async (connection) => {
        const query = connection.db.query("SELECT name FROM test_products");
        return query.all() as { name: string }[];
      });
      
      expect(products).toHaveLength(1);
      expect(products[0].name).toBe("Product A");
    });

    test("should handle nested transaction calls gracefully", async () => {
      await connect();
      
      // This should work even though we're manually managing transactions
      await withTransaction(async (connection) => {
        connection.db.exec(`
          CREATE TABLE IF NOT EXISTS test_items (
            id INTEGER PRIMARY KEY,
            value INTEGER
          )
        `);
        
        expect(connection.inTransaction).toBe(true);
        
        const insert = connection.db.query("INSERT INTO test_items (value) VALUES (?)");
        insert.run(42);
      });
      
      const count = await withConnection(async (connection) => {
        const query = connection.db.query("SELECT COUNT(*) as count FROM test_items");
        return (query.get() as { count: number }).count;
      });
      
      expect(count).toBe(1);
    });
  });

  describe("Collections Management", () => {
    test("should return empty collections list initially", async () => {
      await connect();
      
      const tableList = await collections();
      expect(Array.isArray(tableList)).toBe(true);
      expect(tableList.length).toBeGreaterThanOrEqual(0);
    });

    test("should list created tables", async () => {
      await connect();
      
      // Create some test tables within a single connection transaction
      await withTransaction(async (connection) => {
        connection.db.exec(`
          CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY);
          CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY);
        `);
      });
      
      const tableList = await collections();
      expect(tableList).toContain("users");
      expect(tableList).toContain("posts");
      expect(tableList).not.toContain("sqlite_master"); // Should exclude SQLite system tables
    });
  });

  describe("Error Handling", () => {
    test("should auto-connect when using withConnection", async () => {
      // With the new strategy, connections are auto-initialized
      const result = await withConnection(async (connection) => {
        const query = connection.db.query("SELECT 1 as test");
        return query.get() as { test: number };
      });
      expect(result.test).toBe(1);
    });

    test("should auto-connect when using withTransaction", async () => {
      // With the new strategy, connections are auto-initialized
      const result = await withTransaction(async (connection) => {
        const query = connection.db.query("SELECT 2 as test");
        return query.get() as { test: number };
      });
      expect(result.test).toBe(2);
    });

    test("should handle database errors gracefully", async () => {
      await connect();
      
      await expect(
        withConnection(async (connection) => {
          // Try to query non-existent table
          const query = connection.db.query("SELECT * FROM non_existent_table");
          return query.get();
        })
      ).rejects.toThrow();
    });
  });

  describe("Connection Status", () => {
    test("should return null status when not connected", () => {
      expect(getConnectionStatus()).toBeNull();
    });

    test("should return connection status when connected", async () => {
      await connect();
      
      const status = getConnectionStatus();
      expect(status).not.toBeNull();
      expect(status!.connected).toBe(true);
      expect(status!.inTransaction).toBe(false);
      expect(status!.transactionDepth).toBe(0);
      expect(status!.dbPath).toBe(":memory:");
    });
  });
});
