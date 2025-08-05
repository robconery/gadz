import { beforeEach, afterEach, describe, test, expect } from "bun:test";
import { 
  save,
  find,
  findOne,
  where,
  saveMany,
  updateMany,
  deleteMany,
  deleteOne,
  raw,
  withConnection
} from "../index";

// Set test environment
process.env.NODE_ENV = "test";

class User {
  email: string;
  name?: string;
  age: number = 10;
  active: boolean = true;

  constructor(args: { email: string; name?: string; age?: number; active?: boolean }) {
    this.email = args.email;
    if (args.name !== undefined) this.name = args.name;
    if (args.age !== undefined) this.age = args.age;
    if (args.active !== undefined) this.active = args.active;
  }
}

class Product {
  name: string;
  price: number;
  category: string;
  
  constructor(args: { name: string; price: number; category: string }) {
    this.name = args.name;
    this.price = args.price;
    this.category = args.category;
  }
}

describe("Extended Operations", () => {

  describe("where (alias for find)", () => {
    test("should work identically to find", async () => {
      const user1 = new User({ email: "test1@example.com", age: 25, active: true });
      const user2 = new User({ email: "test2@example.com", age: 30, active: false });
      const user3 = new User({ email: "test3@example.com", age: 35, active: true });
      
      await save(user1);
      await save(user2);
      await save(user3);
      
      const activeUsers = await where(User, { active: true });
      const findActiveUsers = await find(User, { active: true });
      
      expect(activeUsers.length).toBe(2);
      expect(findActiveUsers.length).toBe(2);
      expect(activeUsers[0].email).toBe(findActiveUsers[0].email);
    });

    test("should support complex queries", async () => {
      const user1 = new User({ email: "young@example.com", age: 20, active: true });
      const user2 = new User({ email: "middle@example.com", age: 30, active: true });
      const user3 = new User({ email: "old@example.com", age: 40, active: true });
      
      await save(user1);
      await save(user2);
      await save(user3);
      
      const middleAged = await where(User, { 
        age: { $gte: 25, $lt: 35 },
        active: true 
      });
      
      expect(middleAged.length).toBe(1);
      expect(middleAged[0].email).toBe("middle@example.com");
    });
  });

  describe("saveMany", () => {
    test("should save multiple documents in a transaction", async () => {
      const users = [
        new User({ email: "user1@example.com", name: "User 1" }),
        new User({ email: "user2@example.com", name: "User 2" }),
        new User({ email: "user3@example.com", name: "User 3" })
      ];
      
      const saved = await saveMany(...users);
      
      expect(saved.length).toBe(3);
      expect(saved[0].id).toBeGreaterThan(0);
      expect(saved[1].id).toBeGreaterThan(0);
      expect(saved[2].id).toBeGreaterThan(0);
      expect(saved[0].name).toBe("User 1");
      expect(saved[1].name).toBe("User 2");
      expect(saved[2].name).toBe("User 3");
    });

    test("should flatten arrays and handle mixed arguments", async () => {
      const user1 = new User({ email: "single@example.com" });
      const userArray = [
        new User({ email: "array1@example.com" }),
        new User({ email: "array2@example.com" })
      ];
      const user2 = new User({ email: "single2@example.com" });
      
      const saved = await saveMany(user1, userArray, user2);
      
      expect(saved.length).toBe(4);
      expect(saved.map(u => u.email)).toContain("single@example.com");
      expect(saved.map(u => u.email)).toContain("array1@example.com");
      expect(saved.map(u => u.email)).toContain("array2@example.com");
      expect(saved.map(u => u.email)).toContain("single2@example.com");
    });

    test("should handle updates in batch", async () => {
      // Save initial users
      const user1 = await save(new User({ email: "update1@example.com", name: "Original 1" }));
      const user2 = await save(new User({ email: "update2@example.com", name: "Original 2" }));
      
      // Update them
      user1.name = "Updated 1";
      user2.name = "Updated 2";
      const newUser = new User({ email: "new@example.com", name: "New User" });
      
      const saved = await saveMany(user1, user2, newUser);
      
      expect(saved.length).toBe(3);
      expect(saved.find(u => u.id === user1.id)?.name).toBe("Updated 1");
      expect(saved.find(u => u.id === user2.id)?.name).toBe("Updated 2");
      expect(saved.find(u => u.email === "new@example.com")?.name).toBe("New User");
    });
  });

  describe("updateMany", () => {
    test("should update multiple documents with $set", async () => {
      const users = [
        new User({ email: "update1@example.com", active: false }),
        new User({ email: "update2@example.com", active: false }),
        new User({ email: "keep@example.com", active: true })
      ];
      
      await saveMany(...users);
      
      const result = await updateMany(User, 
        { active: false }, 
        { $set: { active: true, name: "Updated" } }
      );
      
      expect(result.matchedCount).toBe(2);
      expect(result.modifiedCount).toBe(2);
      
      const updatedUsers = await find(User, { active: true });
      expect(updatedUsers.length).toBe(3); // 2 updated + 1 already active
      
      const specificUpdated = await find(User, { name: "Updated" });
      expect(specificUpdated.length).toBe(2);
    });

    test("should require $set operator", async () => {
      await expect(updateMany(User, 
        { active: false }, 
        { active: true } as any // Missing $set
      )).rejects.toThrow("updateMany requires $set operator");
    });

    test("should support upsert option", async () => {
      const result = await updateMany(User,
        { email: "nonexistent@example.com" },
        { $set: { email: "nonexistent@example.com", name: "Upserted User" } },
        { upsert: true }
      );
      
      expect(result.matchedCount).toBe(0);
      expect(result.modifiedCount).toBe(0);
      expect(result.upsertedId).toBeGreaterThan(0);
      
      const upsertedUser = await findOne(User, { email: "nonexistent@example.com" });
      expect(upsertedUser?.name).toBe("Upserted User");
    });
  });

  describe("deleteMany", () => {
    test("should delete multiple documents matching filter", async () => {
      const users = [
        new User({ email: "delete1@example.com", active: false }),
        new User({ email: "delete2@example.com", active: false }),
        new User({ email: "keep@example.com", active: true })
      ];
      
      await saveMany(...users);
      
      const result = await deleteMany(User, { active: false });
      
      expect(result.deletedCount).toBe(2);
      
      const remainingUsers = await find(User);
      expect(remainingUsers.length).toBe(1);
      expect(remainingUsers[0].email).toBe("keep@example.com");
    });

    test("should require a filter to prevent accidental deletion", async () => {
      await expect(deleteMany(User, {})).rejects.toThrow(
        "deleteMany requires a filter to prevent accidental deletion of all documents"
      );
    });

    test("should return 0 when no documents match", async () => {
      const result = await deleteMany(User, { email: "nonexistent@example.com" });
      expect(result.deletedCount).toBe(0);
    });
  });

  describe("deleteOne", () => {
    test("should delete a single document", async () => {
      const users = [
        new User({ email: "delete1@example.com", active: false }),
        new User({ email: "delete2@example.com", active: false })
      ];
      
      await saveMany(...users);
      
      const result = await deleteOne(User, { active: false });
      
      expect(result.deletedCount).toBe(1);
      
      const remainingUsers = await find(User, { active: false });
      expect(remainingUsers.length).toBe(1);
    });

    test("should require a filter", async () => {
      await expect(deleteOne(User, {})).rejects.toThrow("deleteOne requires a filter");
    });
  });

  describe("raw SQL", () => {
    test("should execute raw SQL queries", async () => {
      const users = [
        new User({ email: "raw1@example.com", age: 25 }),
        new User({ email: "raw2@example.com", age: 30 })
      ];
      
      await saveMany(...users);
      
      const results = await raw("SELECT COUNT(*) as count FROM users");
      expect(results[0].count).toBe(2);
    });

    test("should support parameters", async () => {
      const user = new User({ email: "param@example.com", age: 35 });
      await save(user);
      
      const results = await raw(
        "SELECT * FROM users WHERE JSON_EXTRACT(data, '$.age') = ?", 
        [35]
      );
      
      expect(results.length).toBe(1);
      expect(JSON.parse(results[0].data).email).toBe("param@example.com");
    });

    test("should support typed returns", async () => {
      const product = new Product({ name: "Test Product", price: 99.99, category: "Test" });
      await save(product);
      
      interface ProductResult {
        name: string;
        price: number;
      }
      
      const results = await raw<ProductResult>(
        "SELECT JSON_EXTRACT(data, '$.name') as name, JSON_EXTRACT(data, '$.price') as price FROM products"
      );
      
      expect(results[0].name).toBe("Test Product");
      expect(results[0].price).toBe(99.99);
    });
  });

  describe("integration scenarios", () => {
    test("should handle complex workflow with all operations", async () => {
      // Create initial users
      const initialUsers = [
        new User({ email: "workflow1@example.com", age: 20, active: false }),
        new User({ email: "workflow2@example.com", age: 30, active: false }),
        new User({ email: "workflow3@example.com", age: 40, active: true })
      ];
      
      const saved = await saveMany(...initialUsers);
      expect(saved.length).toBe(3);
      
      // Update some users
      const updateResult = await updateMany(User,
        { age: { $lt: 35 } },
        { $set: { active: true, category: "young" } }
      );
      expect(updateResult.modifiedCount).toBe(2);
      
      // Query updated users
      const youngUsers = await where(User, { category: "young" });
      expect(youngUsers.length).toBe(2);
      
      // Delete inactive users
      const deleteResult = await deleteMany(User, { active: false });
      expect(deleteResult.deletedCount).toBe(0); // All should be active now
      
      // Verify final state with raw SQL
      const finalCount = await raw("SELECT COUNT(*) as count FROM users");
      expect(finalCount[0].count).toBe(3);
      
      const activeCount = await raw(
        "SELECT COUNT(*) as count FROM users WHERE JSON_EXTRACT(data, '$.active') = ?",
        [1]
      );
      expect(activeCount[0].count).toBe(3);
    });
  });
});
