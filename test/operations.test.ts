import { describe, test, expect, beforeEach, afterEach } from "@jest/globals";
import { 
  save,
  get,
  find,
  findOne,
  collections,
  deleteMany,
  resetConnection,
  type DocumentWithMeta
} from "../index";

// Set test environment
process.env.NODE_ENV = "test";

// Test classes following the MongoDB API pattern
class User {
  email: string;
  name?: string;
  age: number = 10;
  active: boolean = true;
  profile?: {
    bio?: string;
    verified?: boolean;
  };

  constructor(args: { email: string; name?: string; age?: number; active?: boolean; profile?: any }) {
    this.email = args.email;
    if (args.name) this.name = args.name;
    if (args.age !== undefined) this.age = args.age;
    if (args.active !== undefined) this.active = args.active;
    if (args.profile) this.profile = args.profile;
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

describe("MongoDB API Operations", () => {
  
  afterEach(async () => {
    await resetConnection();
  });

  describe("save operations", () => {
    test("should save a new document and assign ID", async () => {
      const user = new User({ email: "test@example.com", name: "Test User", age: 25 });
      
      const savedUser = await save(user);
      
      expect(savedUser.id).toBeGreaterThan(0);
      expect(savedUser.email).toBe("test@example.com");
      expect(savedUser.name).toBe("Test User");
      expect(savedUser.age).toBe(25);
      expect(savedUser.active).toBe(true);
    });

    test("should update existing document with ID", async () => {
      // First save
      const user = new User({ email: "test@example.com", name: "Test User" });
      const savedUser = await save(user);
      
      // Update
      const updatedUser = { ...savedUser, name: "Updated User", age: 30 };
      const result = await save(updatedUser);
      
      expect(result.id).toBe(savedUser.id);
      expect(result.name).toBe("Updated User");
      expect(result.age).toBe(30);
      expect(result.email).toBe("test@example.com");
    });

    test("should handle complex nested objects", async () => {
      const user = new User({
        email: "complex@example.com",
        name: "Complex User",
        profile: {
          bio: "A complex user profile",
          verified: true
        }
      });
      
      const savedUser = await save(user);
      
      expect(savedUser.profile?.bio).toBe("A complex user profile");
      expect(savedUser.profile?.verified).toBe(true);
    });

    test("should create separate tables for different classes", async () => {
      const user = new User({ email: "user@example.com", name: "User" });
      const product = new Product({ name: "Product 1", price: 99.99, category: "Electronics" });
      
      await save(user);
      await save(product);
      
      const tableList = await collections();
      expect(tableList).toContain("users");
      expect(tableList).toContain("products");
    });
  });

  describe("get operations", () => {
    test("should retrieve document by ID", async () => {
      const user = new User({ email: "get@example.com", name: "Get User", age: 35 });
      const savedUser = await save(user);
      
      const retrievedUser = await get(User, savedUser.id);
      
      expect(retrievedUser).not.toBeNull();
      expect(retrievedUser!.id).toBe(savedUser.id);
      expect(retrievedUser!.email).toBe("get@example.com");
      expect(retrievedUser!.name).toBe("Get User");
      expect(retrievedUser!.age).toBe(35);
      expect(retrievedUser!.created_at).toBeDefined();
      expect(retrievedUser!.updated_at).toBeDefined();
    });

    test("should return null for non-existent ID", async () => {
      const retrievedUser = await get(User, 99999);
      expect(retrievedUser).toBeNull();
    });

    test("should handle different classes correctly", async () => {
      const product = new Product({ name: "Test Product", price: 49.99, category: "Test" });
      const savedProduct = await save(product);
      
      const retrievedProduct = await get(Product, savedProduct.id);
      
      expect(retrievedProduct).not.toBeNull();
      expect(retrievedProduct!.name).toBe("Test Product");
      expect(retrievedProduct!.price).toBe(49.99);
      expect(retrievedProduct!.category).toBe("Test");
    });
  });

  describe("find operations", () => {
    test("should find all documents when no filter", async () => {
      await save(new User({ email: "user1@example.com", name: "User 1" }));
      await save(new User({ email: "user2@example.com", name: "User 2" }));
      await save(new User({ email: "user3@example.com", name: "User 3" }));
      
      const users = await find(User);
      
      expect(users).toHaveLength(3);
      expect(users.every(u => u.id > 0)).toBe(true);
    });

    test("should filter by simple equality", async () => {
      await save(new User({ email: "active@example.com", name: "Active User", active: true }));
      await save(new User({ email: "inactive@example.com", name: "Inactive User", active: false }));
      
      const activeUsers = await find(User, { active: true });
      const inactiveUsers = await find(User, { active: false });
      
      expect(activeUsers).toHaveLength(1);
      expect(activeUsers[0].email).toBe("active@example.com");
      expect(inactiveUsers).toHaveLength(1);
      expect(inactiveUsers[0].email).toBe("inactive@example.com");
    });

    test("should filter using comparison operators", async () => {
      await save(new User({ email: "young@example.com", name: "Young", age: 18 }));
      await save(new User({ email: "adult@example.com", name: "Adult", age: 30 }));
      await save(new User({ email: "senior@example.com", name: "Senior", age: 65 }));
      
      const adults = await find(User, { age: { $gte: 21, $lt: 65 } });
      const seniors = await find(User, { age: { $gte: 65 } });
      const young = await find(User, { age: { $lt: 21 } });
      
      expect(adults).toHaveLength(1);
      expect(adults[0].name).toBe("Adult");
      expect(seniors).toHaveLength(1);
      expect(seniors[0].name).toBe("Senior");
      expect(young).toHaveLength(1);
      expect(young[0].name).toBe("Young");
    });

    test("should filter using $in operator", async () => {
      await save(new User({ email: "alice@example.com", name: "Alice" }));
      await save(new User({ email: "bob@example.com", name: "Bob" }));
      await save(new User({ email: "charlie@example.com", name: "Charlie" }));
      
      const selectedUsers = await find(User, { 
        name: { $in: ["Alice", "Charlie"] }
      });
      
      expect(selectedUsers).toHaveLength(2);
      const names = selectedUsers.map(u => u.name).sort();
      expect(names).toEqual(["Alice", "Charlie"]);
    });

    test("should filter using $exists operator", async () => {
      await save(new User({ email: "with-profile@example.com", name: "With Profile", profile: { bio: "Bio" } }));
      await save(new User({ email: "without-profile@example.com", name: "Without Profile" }));
      
      const withProfile = await find(User, { "profile": { $exists: true } });
      const withoutProfile = await find(User, { "profile": { $exists: false } });
      
      expect(withProfile).toHaveLength(1);
      expect(withProfile[0].email).toBe("with-profile@example.com");
      expect(withoutProfile).toHaveLength(1);
      expect(withoutProfile[0].email).toBe("without-profile@example.com");
    });

    test("should handle sorting", async () => {
      await save(new User({ email: "c@example.com", name: "Charlie", age: 30 }));
      await save(new User({ email: "a@example.com", name: "Alice", age: 25 }));
      await save(new User({ email: "b@example.com", name: "Bob", age: 35 }));
      
      const sortedByAge = await find(User, {}, { sort: { age: 1 } });
      const sortedByAgeDesc = await find(User, {}, { sort: { age: -1 } });
      
      expect(sortedByAge.map(u => u.age)).toEqual([25, 30, 35]);
      expect(sortedByAgeDesc.map(u => u.age)).toEqual([35, 30, 25]);
    });

    test("should handle limit and skip", async () => {
      for (let i = 1; i <= 10; i++) {
        await save(new User({ email: `user${i}@example.com`, name: `User ${i}`, age: 20 + i }));
      }
      
      const firstPage = await find(User, {}, { limit: 3, sort: { age: 1 } });
      const secondPage = await find(User, {}, { limit: 3, skip: 3, sort: { age: 1 } });
      
      expect(firstPage).toHaveLength(3);
      expect(secondPage).toHaveLength(3);
      expect(firstPage[0].age).toBe(21);
      expect(secondPage[0].age).toBe(24);
    });
  });

  describe("findOne operations", () => {
    test("should find one document matching filter", async () => {
      await save(new User({ email: "first@example.com", name: "First", active: true }));
      await save(new User({ email: "second@example.com", name: "Second", active: true }));
      
      const user = await findOne(User, { active: true });
      
      expect(user).not.toBeNull();
      expect(user!.active).toBe(true);
      // Should return one of the matching documents
      expect(["First", "Second"]).toContain(user!.name);
    });

    test("should return null when no match", async () => {
      await save(new User({ email: "test@example.com", name: "Test", active: true }));
      
      const user = await findOne(User, { active: false });
      
      expect(user).toBeNull();
    });
  });

  describe("integration tests", () => {
    test("should handle mixed operations correctly", async () => {
      // Save multiple users
      const user1 = await save(new User({ email: "integration1@example.com", name: "Integration 1", age: 25 }));
      const user2 = await save(new User({ email: "integration2@example.com", name: "Integration 2", age: 30 }));
      
      // Get by ID
      const retrieved = await get(User, user1.id);
      expect(retrieved!.email).toBe("integration1@example.com");
      
      // Update
      const updated = await save({ ...retrieved!, age: 26 });
      expect(updated.age).toBe(26);
      
      // Find with filter
      const adults = await find(User, { age: { $gte: 26 } });
      expect(adults).toHaveLength(2);
      
      // Find one
      const specificUser = await findOne(User, { email: "integration2@example.com" });
      expect(specificUser!.name).toBe("Integration 2");
    });

    test("should maintain data consistency across operations", async () => {
      const originalUser = new User({ 
        email: "consistency@example.com", 
        name: "Consistency Test",
        age: 40,
        profile: { bio: "Test bio", verified: true }
      });
      
      // Save
      const saved = await save(originalUser);
      expect(saved.id).toBeGreaterThan(0);
      
      // Retrieve
      //const retrieved = await get(User, saved.id);
      const retrieved = await get(User, saved.id);
      expect(retrieved!.email).toBe(originalUser.email);
      expect(retrieved!.profile?.bio).toBe("Test bio");
      expect(retrieved!.profile?.verified).toBe(true);
      
      // Update
      const updated = await save({ 
        ...retrieved!, 
        name: "Updated Name",
        profile: { ...retrieved!.profile, bio: "Updated bio" }
      });
      
      // Verify update
      const final = await get(User, saved.id);
      expect(final!.name).toBe("Updated Name");
      expect(final!.profile?.bio).toBe("Updated bio");
      expect(final!.profile?.verified).toBe(true); // Should preserve existing data
      expect(final!.email).toBe(originalUser.email); // Should preserve original email
    });
  });
});
