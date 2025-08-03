import { test, expect, beforeEach, afterAll } from "bun:test";
import { connect, close, save, raw } from "../index.js";

class Customer {
  id?: number;
  email: string;
  name: string;
  age: number;

  constructor(args: { email: string; name: string; age: number }) {
    this.email = args.email;
    this.name = args.name;
    this.age = args.age;
  }
}

beforeEach(() => {
  process.env.NODE_ENV = "test";
  connect();
});

afterAll(() => {
  close();
});

test("raw SQL with typed return", async () => {
  // Insert test data
  const customers = [
    new Customer({ email: "alice@test.com", name: "Alice Smith", age: 25 }),
    new Customer({ email: "bob@test.com", name: "Bob Jones", age: 30 }),
    new Customer({ email: "charlie@test.com", name: "Charlie Brown", age: 35 })
  ];
  
  for (const customer of customers) {
    await save(customer, Customer);
  }
  
  // Query with typed return
  const results = await raw<any>("SELECT * FROM customers ORDER BY age");
  
  expect(results.length).toBe(3);
  expect(results[0].id).toBeDefined();
  expect(results[0].data).toBeDefined(); // Raw data should include the JSON column
  expect(results[0].created_at).toBeDefined();
  expect(results[0].updated_at).toBeDefined();
  
  // Note: Raw SQL returns the actual database structure, not the deserialized objects
  // To get typed Customer objects, you'd need to use the find operations
});

test("raw SQL with any return type", async () => {
  // Insert test data
  const customer = new Customer({ email: "test@example.com", name: "Test User", age: 28 });
  await save(customer, Customer);
  
  // Query specific fields with any type
  const emails = await raw<any>("SELECT JSON_EXTRACT(data, '$.email') as email FROM customers");
  
  expect(emails.length).toBeGreaterThanOrEqual(1);
  expect(emails[0].email).toBe("test@example.com");
  
  // Count query
  const countResult = await raw<any>("SELECT COUNT(*) as total FROM customers");
  expect(countResult[0].total).toBeGreaterThanOrEqual(1);
  
  // Complex aggregation
  const ageStats = await raw<any>(`
    SELECT 
      AVG(CAST(JSON_EXTRACT(data, '$.age') AS INTEGER)) as avg_age,
      MIN(CAST(JSON_EXTRACT(data, '$.age') AS INTEGER)) as min_age,
      MAX(CAST(JSON_EXTRACT(data, '$.age') AS INTEGER)) as max_age
    FROM customers
  `);
  
  expect(ageStats[0].avg_age).toBeGreaterThan(0);
  expect(ageStats[0].min_age).toBeGreaterThan(0);
  expect(ageStats[0].max_age).toBeGreaterThan(0);
});

test("raw SQL for database schema inspection", async () => {
  // Ensure we have at least one customer to create the table
  const customer = new Customer({ email: "schema@test.com", name: "Schema Test", age: 30 });
  await save(customer, Customer);
  
  // Get table info
  const tableInfo = await raw<any>("PRAGMA table_info(customers)");
  
  expect(tableInfo.length).toBeGreaterThanOrEqual(4); // id, data, created_at, updated_at
  
  const columns = tableInfo.map((col: any) => col.name);
  expect(columns).toContain("id");
  expect(columns).toContain("data");
  expect(columns).toContain("created_at");
  expect(columns).toContain("updated_at");
  
  // Get index info
  const indexes = await raw<any>("PRAGMA index_list(customers)");
  // Should have at least the primary key index
  expect(Array.isArray(indexes)).toBe(true);
});

test("raw SQL for data manipulation", async () => {
  // Insert initial data
  const customer = new Customer({ email: "manipulate@test.com", name: "Manipulate Test", age: 25 });
  const saved = await save(customer, Customer);
  
  // Update using raw SQL
  await raw("UPDATE customers SET data = JSON_SET(data, '$.age', 26) WHERE id = ?", [saved.id]);
  
  // Verify the update
  const updated = await raw<any>("SELECT JSON_EXTRACT(data, '$.age') as age FROM customers WHERE id = ?", [saved.id]);
  expect(parseInt(updated[0].age)).toBe(26);
  
  // Delete using raw SQL
  await raw("DELETE FROM customers WHERE id = ?", [saved.id]);
  
  // Verify deletion
  const deleted = await raw<any>("SELECT * FROM customers WHERE id = ?", [saved.id]);
  expect(deleted.length).toBe(0);
});

test("raw SQL with parameters", async () => {
  // Insert test data
  const customers = [
    new Customer({ email: "param1@test.com", name: "Param One", age: 20 }),
    new Customer({ email: "param2@test.com", name: "Param Two", age: 30 }),
    new Customer({ email: "param3@test.com", name: "Param Three", age: 40 })
  ];
  
  for (const customer of customers) {
    await save(customer, Customer);
  }
  
  // Query with single parameter
  const youngCustomers = await raw<any>(
    "SELECT * FROM customers WHERE CAST(JSON_EXTRACT(data, '$.age') AS INTEGER) < ?", 
    [25]
  );
  expect(youngCustomers.length).toBeGreaterThanOrEqual(1);
  
  // Query with multiple parameters
  const ageRangeCustomers = await raw<any>(
    "SELECT * FROM customers WHERE CAST(JSON_EXTRACT(data, '$.age') AS INTEGER) BETWEEN ? AND ?", 
    [25, 35]
  );
  expect(ageRangeCustomers.length).toBeGreaterThanOrEqual(1);
  
  // Query with IN clause
  const specificAges = await raw<any>(
    "SELECT * FROM customers WHERE CAST(JSON_EXTRACT(data, '$.age') AS INTEGER) IN (?, ?)", 
    [20, 40]
  );
  expect(specificAges.length).toBeGreaterThanOrEqual(2);
});

test("raw SQL for complex joins and subqueries", async () => {
  // Since we're using a document database, we'll simulate a join-like operation
  // by using JSON data and subqueries
  
  const customers = [
    new Customer({ email: "join1@test.com", name: "Join One", age: 25 }),
    new Customer({ email: "join2@test.com", name: "Join Two", age: 35 }),
    new Customer({ email: "join3@test.com", name: "Join Three", age: 45 })
  ];
  
  for (const customer of customers) {
    await save(customer, Customer);
  }
  
  // Subquery example: find customers older than average age
  const olderThanAverage = await raw<any>(`
    SELECT 
      id,
      JSON_EXTRACT(data, '$.name') as name,
      JSON_EXTRACT(data, '$.age') as age
    FROM customers 
    WHERE CAST(JSON_EXTRACT(data, '$.age') AS INTEGER) > (
      SELECT AVG(CAST(JSON_EXTRACT(data, '$.age') AS INTEGER)) 
      FROM customers
    )
  `);
  
  expect(Array.isArray(olderThanAverage)).toBe(true);
  // Should have at least one customer older than average
  expect(olderThanAverage.length).toBeGreaterThanOrEqual(1);
});

test("raw SQL error handling", async () => {
  // Test invalid SQL
  await expect(async () => {
    await raw("INVALID SQL STATEMENT");
  }).toThrow();
  
  // Test SQL with wrong number of parameters
  await expect(async () => {
    await raw("SELECT * FROM customers WHERE id = ? AND age = ?", [1]); // Missing second parameter
  }).toThrow();
});

test("raw SQL with non-SELECT statements", async () => {
  // Create a customer first
  const customer = new Customer({ email: "nonselect@test.com", name: "Non Select", age: 30 });
  await save(customer, Customer);
  
  // Test INSERT (should return empty array)
  const insertResult = await raw("INSERT INTO customers (data) VALUES (?)", ['{"test": "data"}']);
  expect(Array.isArray(insertResult)).toBe(true);
  expect(insertResult.length).toBe(0);
  
  // Test UPDATE (should return empty array)
  const updateResult = await raw("UPDATE customers SET updated_at = CURRENT_TIMESTAMP WHERE id = 1");
  expect(Array.isArray(updateResult)).toBe(true);
  expect(updateResult.length).toBe(0);
  
  // Test DELETE (should return empty array)
  const deleteResult = await raw("DELETE FROM customers WHERE JSON_EXTRACT(data, '$.test') = 'data'");
  expect(Array.isArray(deleteResult)).toBe(true);
  expect(deleteResult.length).toBe(0);
});
