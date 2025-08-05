import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Collection } from "../src/collection";
import { resetConnection } from "../src/connection";
import * as fs from "fs";
import * as path from "path";

// Set test environment
process.env.NODE_ENV = "test";

// Test model
class User extends Collection<User> {
  email: string;
  name?: string;
  age: number;
  active: boolean;

  constructor(data: { email: string; name?: string; age: number; active?: boolean }) {
    super();
    this.email = data.email;
    this.name = data.name;
    this.age = data.age;
    this.active = data.active ?? true;
  }
}

class Order extends Collection<Order> {
  total: number;
  status: string;
  userId: number;

  constructor(data: { total: number; status: string; userId: number }) {
    super();
    this.total = data.total;
    this.status = data.status;
    this.userId = data.userId;
  }
}

describe("Collection class", () => {
  
  afterEach(async () => {
    await resetConnection();
  });

  test("should provide static get method", async () => {
    // First save a user
    const user = new User({ email: "test@example.com", age: 25 });
    const saved = await user.save();
    
    // Then get it back
    const found = await User.get(saved.id);
    expect(found).toBeTruthy();
    expect(found?.email).toBe("test@example.com");
    expect(found?.age).toBe(25);
  });

  test("should provide static find method", async () => {
    // Save some users
    const user1 = new User({ email: "user1@example.com", age: 20 });
    const user2 = new User({ email: "user2@example.com", age: 30, active: false });
    
    await user1.save();
    await user2.save();
    
    // Find active users
    const activeUsers = await User.find({ active: true });
    expect(activeUsers.length).toBeGreaterThan(0);
    expect(activeUsers.every(u => u.active)).toBe(true);
    
    // Find users over 25
    const olderUsers = await User.find({ age: { $gt: 25 } });
    expect(olderUsers.length).toBeGreaterThan(0);
    expect(olderUsers.every(u => u.age > 25)).toBe(true);
  });

  test("should provide static findOne method", async () => {
    // Create a user first
    const user = new User({ email: "findone@example.com", age: 25 });
    await user.save();
    
    const found = await User.findOne({ email: "findone@example.com" });
    expect(found).toBeTruthy();
    expect(found?.email).toBe("findone@example.com");
  });

  test("should provide static where method (alias for find)", async () => {
    const users = await User.where({ active: true });
    expect(Array.isArray(users)).toBe(true);
  });

  test("should provide static saveMany method", async () => {
    const users = [
      new User({ email: "bulk1@example.com", age: 25 }),
      new User({ email: "bulk2@example.com", age: 26 }),
      new User({ email: "bulk3@example.com", age: 27 })
    ];
    
    const saved = await User.saveMany(...users);
    expect(saved).toHaveLength(3);
    expect(saved.every(u => u.id)).toBe(true);
  });

  test("should provide static updateMany method", async () => {
    // Create some users first
    const user1 = new User({ email: "update1@example.com", age: 30 });
    const user2 = new User({ email: "update2@example.com", age: 35 });
    await user1.save();
    await user2.save();
    
    const result = await User.updateMany(
      { age: { $gt: 25 } },
      { $set: { active: false } }
    );
    expect(result.matchedCount).toBeGreaterThan(0);
  });

  test("should provide static deleteMany method", async () => {
    // Create some users first and set them to inactive
    const user1 = new User({ email: "delete1@example.com", age: 30, active: false });
    const user2 = new User({ email: "delete2@example.com", age: 35, active: false });
    await user1.save();
    await user2.save();
    
    const result = await User.deleteMany({ active: false });
    expect(result.deletedCount).toBeGreaterThan(0);
  });

  test("should provide instance save method", async () => {
    const user = new User({ email: "instance@example.com", age: 30 });
    const saved = await user.save();
    
    expect(saved.id).toBeTruthy();
    expect(saved.email).toBe("instance@example.com");
    expect(user.id).toBe(saved.id); // Instance should be updated
  });

  test("should provide instance delete method", async () => {
    const user = new User({ email: "delete@example.com", age: 30 });
    await user.save();
    
    const deleted = await user.delete();
    expect(deleted).toBe(true);
    
    // Verify it's gone
    const found = await User.get(user.id!);
    expect(found).toBeNull();
  });

  test("should provide instance reload method", async () => {
    const user = new User({ email: "reload@example.com", age: 30 });
    await user.save();
    
    // Update directly in database
    await User.updateMany({ id: user.id }, { $set: { age: 35 } });
    
    // Reload the instance
    await user.reload();
    expect(user.age).toBe(35);
  });

  test("should provide toJSON and toObject methods", async () => {
    const user = new User({ email: "json@example.com", age: 30 });
    await user.save();
    
    const json = user.toJSON();
    const obj = user.toObject();
    
    expect(json.email).toBe("json@example.com");
    expect(obj.email).toBe("json@example.com");
    expect(typeof json.save).toBe("undefined"); // Methods should not be included
    expect(typeof obj.save).toBe("undefined"); // Methods should not be included
  });

  test("should work with different model classes", async () => {
    const order = new Order({ total: 100, status: "pending", userId: 1 });
    const saved = await order.save();
    
    expect(saved.id).toBeTruthy();
    expect(saved.total).toBe(100);
    
    const found = await Order.get(saved.id);
    expect(found?.status).toBe("pending");
    
    const orders = await Order.find({ total: { $gt: 50 } });
    expect(orders.length).toBeGreaterThan(0);
  });
});
