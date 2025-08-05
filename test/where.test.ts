import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { where, save, raw } from "../src/operations";
import { withConnection } from "../src/connection";

// Test class for user documents
class User {
  email: string;
  name?: string;
  age: number;
  active: boolean;
  profile?: {
    verified: boolean;
    city: string;
  };

  constructor(args: any) {
    this.email = args.email;
    this.name = args.name;
    this.age = args.age;
    this.active = args.active;
    this.profile = args.profile;
  }
}

describe("where method with string WHERE clauses", () => {
  beforeAll(async () => {
    // Clean up any existing test data
    await raw("DROP TABLE IF EXISTS users");
    
    // Create test users
    const users = [
      new User({ email: "john@test.com", name: "John", age: 25, active: true, profile: { verified: true, city: "New York" } }),
      new User({ email: "jane@test.com", name: "Jane", age: 30, active: false, profile: { verified: false, city: "Los Angeles" } }),
      new User({ email: "bob@test.com", name: "Bob", age: 35, active: true, profile: { verified: true, city: "Chicago" } }),
      new User({ email: "alice@gmail.com", name: "Alice", age: 22, active: true, profile: { verified: false, city: "New York" } }),
      new User({ email: "charlie@test.com", name: "Charlie", age: 45, active: false, profile: { verified: true, city: "Boston" } })
    ];

    for (const user of users) {
      await save(user);
    }
  });

  afterAll(async () => {
    // Clean up test data
    await raw("DROP TABLE IF EXISTS users");
  });

  it("should convert simple field comparisons to JSON_EXTRACT", async () => {
    const results = await where(User, "age > ?", [30]);
    expect(results.length).toBe(2); // Bob (35) and Charlie (45)
    expect(results.every(user => user.age > 30)).toBe(true);
  });

  it("should handle equality comparisons", async () => {
    const results = await where(User, "active = ?", [true]);
    expect(results.length).toBe(3); // John, Bob, Alice
    expect(results.every(user => user.active === true)).toBe(true);
  });

  it("should handle LIKE operations for string fields", async () => {
    const results = await where(User, "email LIKE ?", ["%@gmail.com"]);
    expect(results.length).toBe(1); // Alice
    expect(results[0].email).toBe("alice@gmail.com");
  });

  it("should handle complex conditions with AND/OR", async () => {
    const results = await where(User, "age > ? AND active = ?", [25, true]);
    expect(results.length).toBe(1); // Bob (35, active)
    expect(results[0].name).toBe("Bob");
  });

  it("should handle nested field access", async () => {
    const results = await where(User, "profile.verified = ?", [true]);
    expect(results.length).toBe(3); // John, Bob, and Charlie
    expect(results.every(user => user.profile?.verified === true)).toBe(true);
  });

  it("should handle nested field with string comparison", async () => {
    const results = await where(User, "profile.city = ?", ["New York"]);
    expect(results.length).toBe(2); // John and Alice
    expect(results.every(user => user.profile?.city === "New York")).toBe(true);
  });

  it("should automatically add WHERE keyword when missing", async () => {
    const results = await where(User, "age < ?", [30]);
    expect(results.length).toBe(2); // John (25) and Alice (22)
    expect(results.every(user => user.age < 30)).toBe(true);
  });

  it("should not duplicate WHERE keyword when already present", async () => {
    const results = await where(User, "WHERE age < ?", [30]);
    expect(results.length).toBe(2); // John (25) and Alice (22)
    expect(results.every(user => user.age < 30)).toBe(true);
  });

  it("should handle case-insensitive WHERE detection", async () => {
    const results = await where(User, "where age < ?", [30]);
    expect(results.length).toBe(2); // John (25) and Alice (22)
    expect(results.every(user => user.age < 30)).toBe(true);
  });

  it("should work with IN operator", async () => {
    const results = await where(User, "age IN (?, ?)", [25, 35]);
    expect(results.length).toBe(2); // John (25) and Bob (35)
    expect(results.every(user => [25, 35].includes(user.age))).toBe(true);
  });

  it("should preserve system columns without conversion", async () => {
    const results = await where(User, "id > ?", [1]);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(user => user.id > 1)).toBe(true);
  });

  it("should not convert already JSON_EXTRACT expressions", async () => {
    const results = await where(User, "JSON_EXTRACT(data, '$.age') > ?", [30]);
    expect(results.length).toBe(2); // Bob (35) and Charlie (45)
    expect(results.every(user => user.age > 30)).toBe(true);
  });

  it("should work with FindOptions for limit and skip", async () => {
    const results = await where(User, "active = ?", [true], { limit: 2, skip: 1 });
    expect(results.length).toBe(2);
    expect(results.every(user => user.active === true)).toBe(true);
  });

  it("should work with FindOptions for sorting", async () => {
    const results = await where(User, "active = ?", [true], { sort: { age: -1 } });
    expect(results.length).toBe(3);
    expect(results[0].age).toBeGreaterThan(results[1].age); // Descending order
  });

  it("should handle multiple nested conditions", async () => {
    const results = await where(User, "age > ? AND profile.verified = ? AND profile.city = ?", 
      [20, true, "New York"]);
    expect(results.length).toBe(1); // John
    expect(results[0].name).toBe("John");
  });

  it("should handle inequality operators correctly", async () => {
    const results = await where(User, "age >= ? AND age <= ?", [30, 40]);
    expect(results.length).toBe(2); // Jane (30) and Bob (35)
    expect(results.every(user => user.age >= 30 && user.age <= 40)).toBe(true);
  });

  it("should maintain backward compatibility with Filter objects", async () => {
    const results = await where(User, { age: { $gt: 30 } });
    expect(results.length).toBe(2); // Bob (35) and Charlie (45)
    expect(results.every(user => user.age > 30)).toBe(true);
  });

  it("should handle complex boolean logic", async () => {
    const results = await where(User, "(age < ? OR age > ?) AND active = ?", [25, 40, true]);
    expect(results.length).toBe(1); // Alice (22, active)
    expect(results[0].name).toBe("Alice");
  });

  it("should handle NOT operators", async () => {
    const results = await where(User, "NOT (age < ?)", [30]);
    expect(results.length).toBe(3); // Jane (30), Bob (35), Charlie (45)
    expect(results.every(user => user.age >= 30)).toBe(true);
  });

  it("should handle IS NULL and IS NOT NULL", async () => {
    // First create a user without a name
    const userWithoutName = new User({ email: "noname@test.com", age: 20, active: true });
    await save(userWithoutName);

    const results = await where(User, "name IS NOT NULL");
    expect(results.length).toBe(5); // All original users have names
    expect(results.every(user => user.name !== null && user.name !== undefined)).toBe(true);

    // Clean up
    await where(User, "email = ?", ["noname@test.com"]).then(users => {
      if (users.length > 0) {
        return raw("DELETE FROM users WHERE id = ?", [users[0].id]);
      }
    });
  });
});
