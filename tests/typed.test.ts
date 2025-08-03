// Tests for DB methods that derive collection names from types
import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { save, saveMany, get, find, findOne, where, setDefaultClient, isUnique, Client } from '../index.js';

// Test model classes
class User {
  email!: string;
  name?: string;
  active!: boolean;
  
  constructor(args: { email?: string; name?: string; active?: boolean } = {}) {
    if (args.email) this.email = args.email;
    if (args.name) this.name = args.name;
    if (args.active !== undefined) this.active = args.active;
  }
}

class ValidatedUser {
  email!: string;
  name?: string;
  active!: boolean;
  
  constructor(args: { email?: string; name?: string; active?: boolean } = {}) {
    if (args.email) this.email = args.email;
    if (args.name) this.name = args.name;
    if (args.active !== undefined) this.active = args.active;
  }
  
  validate() {
    if (!this.email || !this.email.includes('@')) {
      throw new Error('Invalid email format');
    }
    if (typeof this.active !== 'boolean') {
      throw new Error('Active must be a boolean');
    }
  }
}

class UniqueUser {
  email!: string;
  name?: string;
  active!: boolean;
  
  constructor(args: { email?: string; name?: string; active?: boolean } = {}) {
    if (args.email) this.email = args.email;
    if (args.name) this.name = args.name;
    if (args.active !== undefined) this.active = args.active;
  }
  
  async validate() {
    if (!this.email || !this.email.includes('@')) {
      throw new Error('Invalid email format');
    }
    
    // Check email uniqueness
    if (!isUnique(UniqueUser, { email: this.email })) {
      throw new Error('Email already exists');
    }
  }
}

class Product {
  title!: string;
  price!: number;
  category?: string;
  
  constructor(args: { title?: string; price?: number; category?: string } = {}) {
    if (args.title) this.title = args.title;
    if (args.price !== undefined) this.price = args.price;
    if (args.category) this.category = args.category;
  }
}

describe('DB Methods', () => {
  let client: Client;
  
  beforeEach(async () => {
    // Use in-memory database for tests
    client = new Client();
    setDefaultClient(client);
    await client.connect();
  });
  
  afterEach(async () => {
    await client.close();
  });

  describe('save', () => {
    test('should save a single user document', async () => {
      const user = new User({ email: 'test@example.com', name: 'Test User', active: true });
      
      const result = await save(user);
      
      expect(result.acknowledged).toBe(true);
      expect(result.insertedId).toBeDefined();
    });

    test('should derive collection name from class name', async () => {
      const user = new User({ email: 'test@example.com', active: true });
      await save(user);
      
      const product = new Product({ title: 'Test Product', price: 99.99 });
      await save(product);
      
      // Collections should be 'users' and 'products' (pluralized)
      const db = client.db('default');
      const collections = db.listCollections();
      expect(collections).toContain('users');
      expect(collections).toContain('products');
    });

    test('should throw error for objects without constructor', async () => {
      const plainObject = { email: 'test@example.com' };
      
      await expect(save(plainObject as any)).rejects.toThrow('Document must have a constructor to derive collection name');
    });
  });

  describe('saveMany', () => {
    test('should save multiple user documents', async () => {
      const users = [
        new User({ email: 'user1@example.com', name: 'User 1', active: true }),
        new User({ email: 'user2@example.com', name: 'User 2', active: false })
      ];
      
      const result = await saveMany(users);
      
      expect(result.acknowledged).toBe(true);
      expect(result.insertedCount).toBe(2);
      expect(result.insertedIds).toHaveLength(2);
    });

    test('should handle empty array', async () => {
      const result = await saveMany([]);
      
      expect(result.acknowledged).toBe(true);
      expect(result.insertedCount).toBe(0);
      expect(result.insertedIds).toHaveLength(0);
    });

    test('should use transaction for multiple documents', async () => {
      const users = [
        new User({ email: 'user1@example.com', active: true }),
        new User({ email: 'user2@example.com', active: false }),
        new User({ email: 'user3@example.com', active: true })
      ];
      
      const result = await saveMany(users);
      
      expect(result.acknowledged).toBe(true);
      expect(result.insertedCount).toBe(3);
      
      // Verify all users were saved
      const foundUsers = find(User);
      expect(foundUsers).toHaveLength(3);
    });
  });

  describe('get', () => {
    test('should get user by ID', async () => {
      const user = new User({ email: 'test@example.com', name: 'Test User', active: true });
      const saveResult = await save(user);
      
      const foundUser = get(User, saveResult.insertedId.toString());
      
      expect(foundUser).not.toBeNull();
      expect(foundUser!.email).toBe('test@example.com');
      expect(foundUser!.name).toBe('Test User');
      expect(foundUser!.active).toBe(true);
      expect(foundUser).toBeInstanceOf(User);
    });

    test('should return null for non-existent ID', () => {
      const foundUser = get(User, 'non-existent-id');
      
      expect(foundUser).toBeNull();
    });

    test('should handle numeric IDs', async () => {
      const user = new User({ email: 'test@example.com', active: true });
      const saveResult = await save(user);
      
      const foundUser = get(User, 123);
      
      expect(foundUser).toBeNull(); // Should not find since we saved with string ID
    });
  });

  describe('find', () => {
    beforeEach(async () => {
      // Set up test data
      const users = [
        new User({ email: 'user1@example.com', name: 'Alice', active: true }),
        new User({ email: 'user2@example.com', name: 'Bob', active: false }),
        new User({ email: 'user3@example.com', name: 'Charlie', active: true })
      ];
      await saveMany(users);
    });

    test('should find all users when no filter provided', () => {
      const users = find(User);
      
      expect(users).toHaveLength(3);
      expect(users.every(user => user instanceof User)).toBe(true);
    });

    test('should find users with filter', () => {
      const activeUsers = find(User, { active: true });
      
      expect(activeUsers).toHaveLength(2);
      expect(activeUsers.every(user => user.active === true)).toBe(true);
    });

    test('should find users with options', () => {
      const users = find(User, {}, { limit: 2 });
      
      expect(users).toHaveLength(2);
    });

    test('should return empty array when no matches', () => {
      const users = find(User, { email: 'nonexistent@example.com' });
      
      expect(users).toHaveLength(0);
    });
  });

  describe('findOne', () => {
    beforeEach(async () => {
      const users = [
        new User({ email: 'user1@example.com', name: 'Alice', active: true }),
        new User({ email: 'user2@example.com', name: 'Bob', active: false })
      ];
      await saveMany(users);
    });

    test('should find one user with filter', () => {
      const user = findOne(User, { email: 'user1@example.com' });
      
      expect(user).not.toBeNull();
      expect(user!.email).toBe('user1@example.com');
      expect(user!.name).toBe('Alice');
      expect(user).toBeInstanceOf(User);
    });

    test('should return null when no match found', () => {
      const user = findOne(User, { email: 'nonexistent@example.com' });
      
      expect(user).toBeNull();
    });

    test('should return first match when multiple matches', () => {
      const user = findOne(User, { active: true });
      
      expect(user).not.toBeNull();
      expect(user!.active).toBe(true);
    });
  });

  describe('where', () => {
    beforeEach(async () => {
      const users = [
        new User({ email: 'user1@example.com', name: 'Alice', active: true }),
        new User({ email: 'user2@example.com', name: 'Bob', active: false }),
        new User({ email: 'user3@example.com', name: 'Charlie', active: true })
      ];
      await saveMany(users);
    });

    test('should provide query builder interface', () => {
      const userQuery = where(User);
      
      expect(userQuery).toHaveProperty('find');
      expect(userQuery).toHaveProperty('findOne');
      expect(typeof userQuery.find).toBe('function');
      expect(typeof userQuery.findOne).toBe('function');
    });

    test('should find users using query builder', () => {
      const activeUsers = where(User).find({ active: true });
      
      expect(activeUsers).toHaveLength(2);
      expect(activeUsers.every(user => user.active === true)).toBe(true);
      expect(activeUsers.every(user => user instanceof User)).toBe(true);
    });

    test('should findOne using query builder', () => {
      const user = where(User).findOne({ name: 'Bob' });
      
      expect(user).not.toBeNull();
      expect(user!.name).toBe('Bob');
      expect(user!.active).toBe(false);
      expect(user).toBeInstanceOf(User);
    });

    test('should work with options', () => {
      const users = where(User).find({ active: true }, { limit: 1 });
      
      expect(users).toHaveLength(1);
      expect(users[0].active).toBe(true);
    });
  });

  describe('setDefaultClient', () => {
    test('should set custom client and database', async () => {
      const customClient = new Client();
      await customClient.connect();
      
      setDefaultClient(customClient, 'custom');
      
      const user = new User({ email: 'test@example.com', active: true });
      save(user);
      
      // Verify it was saved to the custom database
      const customDb = customClient.db('custom');
      const collections = customDb.listCollections();
      expect(collections).toContain('users');
      
      await customClient.close();
    });

    test('should use default database name when not specified', async () => {
      const customClient = new Client();
      await customClient.connect();
      
      setDefaultClient(customClient);
      
      const user = new User({ email: 'test@example.com', active: true });
      await save(user);
      
      // Should use 'default' database
      const defaultDb = customClient.db('default');
      const collections = defaultDb.listCollections();
      expect(collections).toContain('users');
      
      await customClient.close();
    });
  });

  describe('Collection name derivation', () => {
    test('should pluralize class names correctly', async () => {
      class Person {
        name!: string;
        constructor(args: { name?: string } = {}) {
          if (args.name) this.name = args.name;
        }
      }
      
      class Company {
        name!: string;
        constructor(args: { name?: string } = {}) {
          if (args.name) this.name = args.name;
        }
      }
      
      const person = new Person({ name: 'John' });
      const company = new Company({ name: 'Acme Corp' });
      
      await save(person);
      await save(company);
      
      const db = client.db('default');
      const collections = db.listCollections();
      
      expect(collections).toContain('people'); // Person -> people
      expect(collections).toContain('companies'); // Company -> companies
    });
  });

  describe('Type safety and instances', () => {
    test('should return properly typed instances', async () => {
      const user = new User({ email: 'test@example.com', name: 'Test', active: true });
      const saveResult = await save(user);
      
      const foundUser = get(User, saveResult.insertedId.toString());
      const foundUsers = find(User, { active: true });
      const oneUser = findOne(User, { email: 'test@example.com' });
      
      // All should be instances of User class
      expect(foundUser).toBeInstanceOf(User);
      expect(foundUsers[0]).toBeInstanceOf(User);
      expect(oneUser).toBeInstanceOf(User);
      
      // Should have proper properties
      expect(foundUser!.email).toBe('test@example.com');
      expect(foundUsers[0].name).toBe('Test');
      expect(oneUser!.active).toBe(true);
    });
  });

  describe('Validation', () => {
    test('should save document without validation method', async () => {
      const user = new User({ email: 'test@example.com', active: true });
      
      const result = await save(user);
      
      expect(result.acknowledged).toBe(true);
      expect(result.insertedId).toBeDefined();
    });

    test('should call sync validation method before saving', async () => {
      const validUser = new ValidatedUser({ email: 'valid@example.com', active: true });
      
      const result = await save(validUser);
      
      expect(result.acknowledged).toBe(true);
      expect(result.insertedId).toBeDefined();
    });

    test('should throw error when sync validation fails', async () => {
      const invalidUser = new ValidatedUser({ email: 'invalid-email', active: true });
      
      await expect(save(invalidUser)).rejects.toThrow('Invalid email format');
    });

    test('should throw error when sync validation fails on boolean', async () => {
      const invalidUser = new ValidatedUser({ email: 'test@example.com', active: 'not-boolean' as any });
      
      await expect(save(invalidUser)).rejects.toThrow('Active must be a boolean');
    });

    test('should call async validation method before saving', async () => {
      const uniqueUser = new UniqueUser({ email: 'unique@example.com', active: true });
      
      const result = await save(uniqueUser);
      
      expect(result.acknowledged).toBe(true);
      expect(result.insertedId).toBeDefined();
    });

    test('should throw error when async validation fails due to duplicate email', async () => {
      // Save first user
      const firstUser = new UniqueUser({ email: 'duplicate@example.com', active: true });
      await save(firstUser);
      
      // Try to save second user with same email
      const secondUser = new UniqueUser({ email: 'duplicate@example.com', active: false });
      
      await expect(save(secondUser)).rejects.toThrow('Email already exists');
    });

    test('should validate all documents in saveMany', async () => {
      const users = [
        new ValidatedUser({ email: 'user1@example.com', active: true }),
        new ValidatedUser({ email: 'user2@example.com', active: false })
      ];
      
      const result = await saveMany(users);
      
      expect(result.acknowledged).toBe(true);
      expect(result.insertedCount).toBe(2);
    });

    test('should fail saveMany if any validation fails', async () => {
      const users = [
        new ValidatedUser({ email: 'valid@example.com', active: true }),
        new ValidatedUser({ email: 'invalid-email', active: false })
      ];
      
      await expect(saveMany(users)).rejects.toThrow('Invalid email format');
    });

    test('should validate uniqueness for all documents in saveMany', async () => {
      // Save one user first
      const existingUser = new UniqueUser({ email: 'existing@example.com', active: true });
      await save(existingUser);
      
      const users = [
        new UniqueUser({ email: 'new@example.com', active: true }),
        new UniqueUser({ email: 'existing@example.com', active: false }) // Duplicate
      ];
      
      await expect(saveMany(users)).rejects.toThrow('Email already exists');
    });
  });

  describe('isUnique', () => {
    beforeEach(async () => {
      const users = [
        new User({ email: 'existing1@example.com', active: true }),
        new User({ email: 'existing2@example.com', active: false })
      ];
      await saveMany(users);
    });

    test('should return true for unique values', () => {
      const isEmailUnique = isUnique(User, { email: 'new@example.com' });
      expect(isEmailUnique).toBe(true);
    });

    test('should return false for existing values', () => {
      const isEmailUnique = isUnique(User, { email: 'existing1@example.com' });
      expect(isEmailUnique).toBe(false);
    });

    test('should work with complex queries', () => {
      const isUniqueActive = isUnique(User, { email: 'existing1@example.com', active: false });
      expect(isUniqueActive).toBe(true); // exists but with different active status
      
      const isUniqueExact = isUnique(User, { email: 'existing1@example.com', active: true });
      expect(isUniqueExact).toBe(false); // exact match exists
    });
  });
});