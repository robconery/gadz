import { beforeEach, afterEach, describe, test, expect } from "@jest/globals";
import { 
  save,
  find,
  isUnique,
  withConnection,
  resetConnection
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

  async _validate(): Promise<void> {
    // Check if email is unique
    const unique = await isUnique(this, "email");
    if (!unique) {
      throw new Error(`Email '${this.email}' already exists`);
    }
    
    // Additional validation rules
    if (!this.email || this.email.length === 0) {
      throw new Error("Email is required");
    }
    
    if (this.age < 0) {
      throw new Error("Age must be positive");
    }
  }
}

class Product {
  name: string;
  price: number;
  
  constructor(args: { name: string; price: number }) {
    this.name = args.name;
    this.price = args.price;
  }
  
  // No _validate method - should save without validation
}

describe("Validation System", () => {
  
  afterEach(async () => {
    await resetConnection();
  });

  describe("_validate method integration", () => {
    test("should save document with valid _validate method", async () => {
      const user = new User({ 
        email: "valid@example.com", 
        name: "Valid User", 
        age: 25 
      });
      
      const saved = await save(user);
      expect(saved.id).toBeGreaterThan(0);
      expect(saved.email).toBe("valid@example.com");
      expect(saved.name).toBe("Valid User");
      expect(saved.age).toBe(25);
    });

    test("should reject document when _validate throws error", async () => {
      const user = new User({ 
        email: "", // Invalid email
        age: 25 
      });
      
      await expect(save(user)).rejects.toThrow("Email is required");
    });

    test("should reject document with negative age", async () => {
      const user = new User({ 
        email: "test@example.com", 
        age: -5 
      });
      
      await expect(save(user)).rejects.toThrow("Age must be positive");
    });

    test("should save document without _validate method", async () => {
      const product = new Product({ 
        name: "Test Product", 
        price: 19.99 
      });
      
      const saved = await save(product);
      expect(saved.id).toBeGreaterThan(0);
      expect(saved.name).toBe("Test Product");
      expect(saved.price).toBe(19.99);
    });
  });

  describe("isUnique function", () => {
    test("should return true for unique field value", async () => {
      const user = new User({ email: "unique@example.com" });
      const result = await isUnique(user, "email");
      expect(result).toBe(true);
    });

    test("should return false for duplicate field value", async () => {
      // Save first user
      const user1 = new User({ email: "duplicate@example.com" });
      await save(user1);
      
      // Check if another user with same email is unique (without saving)
      const user2 = new User({ email: "duplicate@example.com" });
      const result = await isUnique(user2, "email");
      expect(result).toBe(false);
    });

    test("should exclude current document from uniqueness check on updates", async () => {
      // Save a user
      const user = new User({ email: "update@example.com", name: "Original" });
      const saved = await save(user);
      
      // Create a new User instance with the saved data for update
      const updatedUser = new User({
        email: saved.email,
        name: "Updated",
        age: saved.age,
        active: saved.active
      });
      // Set the ID to make it an update
      (updatedUser as any).id = saved.id;
      
      const result = await isUnique(updatedUser, "email");
      expect(result).toBe(true);
      
      // Should be able to save the update
      const updated = await save(updatedUser);
      expect(updated.name).toBe("Updated");
      expect(updated.email).toBe("update@example.com");
    });

    test("should work with different field types", async () => {
      const user1 = new User({ email: "test1@example.com", age: 25 });
      await save(user1);
      
      const user2 = new User({ email: "test2@example.com", age: 25 });
      const emailUnique = await isUnique(user2, "email");
      const ageUnique = await isUnique(user2, "age");
      
      expect(emailUnique).toBe(true); // Different email
      expect(ageUnique).toBe(false);  // Same age
    });
  });

  describe("uniqueness validation integration", () => {
    test("should prevent saving duplicate emails", async () => {
      // Save first user
      const user1 = new User({ email: "duplicate@test.com", name: "First" });
      await save(user1);
      
      // Try to save second user with same email
      const user2 = new User({ email: "duplicate@test.com", name: "Second" });
      await expect(save(user2)).rejects.toThrow("Email 'duplicate@test.com' already exists");
    });

    test("should allow updating existing user with same email", async () => {
      // Save a user
      const user = new User({ email: "update-test@example.com", name: "Original" });
      const saved = await save(user);
      
      // Create updated User instance
      const updatedUser = new User({
        email: saved.email,
        name: "Updated Name",
        age: saved.age,
        active: saved.active
      });
      (updatedUser as any).id = saved.id;
      
      const result = await save(updatedUser);
      
      expect(result.name).toBe("Updated Name");
      expect(result.email).toBe("update-test@example.com");
      expect(result.id).toBe(saved.id);
    });
  });

  describe("error handling", () => {
    test("should propagate custom validation errors", async () => {
      class CustomUser extends User {
        async _validate(): Promise<void> {
          await super._validate();
          if (this.name === "forbidden") {
            throw new Error("This name is not allowed");
          }
        }
      }
      
      const user = new CustomUser({ 
        email: "custom@example.com", 
        name: "forbidden" 
      });
      
      await expect(save(user)).rejects.toThrow("This name is not allowed");
    });

    test("should handle validation methods that return false", async () => {
      class ReturnFalseUser {
        email: string;
        
        constructor(args: { email: string }) {
          this.email = args.email;
        }
        
        async _validate(): Promise<boolean> {
          return false; // Always fail validation
        }
      }
      
      const user = new ReturnFalseUser({ email: "test@example.com" });
      await expect(save(user)).rejects.toThrow("Document validation failed");
    });
  });
});
