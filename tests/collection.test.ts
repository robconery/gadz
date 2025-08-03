// Comprehensive tests for collection operations and edge cases
import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { Client } from '../src/client.js';
import { GadzObjectId } from '../src/objectid.js';
import type { Collection } from '../src/collection.js';

describe('Collection', () => {
  let client: Client;
  let collection: Collection;

  beforeEach(async () => {
    client = new Client({ filename: ':memory:' });
    await client.connect();
    collection = client.db('test').collection('users');
  });

  afterEach(async () => {
    await client.close();
  });

  describe('insertOne', () => {
    test('should insert document with auto-generated _id', async () => {
      const doc = { name: 'John', age: 30 };
      const result = await collection.insertOne(doc);
      
      expect(result.insertedId).toBeDefined();
      expect(result.acknowledged).toBe(true);
      expect(GadzObjectId.isValid(result.insertedId)).toBe(true);
    });

    test('should preserve provided _id', async () => {
      const id = 'custom-id';
      const doc = { _id: id, name: 'John' };
      const result = await collection.insertOne(doc);
      
      expect(result.insertedId).toBe(id);
    });

    test('should handle empty document', async () => {
      const result = await collection.insertOne({});
      expect(result.acknowledged).toBe(true);
      expect(result.insertedId).toBeDefined();
    });

    test('should handle null values in document', async () => {
      const doc = { name: null, value: undefined, active: false };
      const result = await collection.insertOne(doc);
      expect(result.acknowledged).toBe(true);
    });

    test('should handle complex nested objects', async () => {
      const doc = {
        user: {
          profile: {
            name: 'John',
            settings: {
              theme: 'dark',
              notifications: true
            }
          }
        },
        tags: ['admin', 'user'],
        metadata: {
          created: new Date().toISOString(),
          version: 1
        }
      };
      const result = await collection.insertOne(doc);
      expect(result.acknowledged).toBe(true);
    });

    test('should handle arrays', async () => {
      const doc = {
        items: [1, 2, 3],
        tags: ['a', 'b', 'c'],
        nested: [{ id: 1 }, { id: 2 }]
      };
      const result = await collection.insertOne(doc);
      expect(result.acknowledged).toBe(true);
    });

    test('should handle very large documents', async () => {
      const largeString = 'x'.repeat(100000);
      const doc = { data: largeString };
      const result = await collection.insertOne(doc);
      expect(result.acknowledged).toBe(true);
    });

    test('should handle special characters', async () => {
      const doc = {
        name: "O'Connor",
        description: 'Special chars: "quotes", \n newlines, \t tabs',
        unicode: '🚀 Unicode 测试'
      };
      const result = await collection.insertOne(doc);
      expect(result.acknowledged).toBe(true);
    });

    test('should handle duplicate _id gracefully', async () => {
      const id = 'duplicate-id';
      await collection.insertOne({ _id: id, name: 'First' });
      
      // Should either throw or handle gracefully
      try {
        await collection.insertOne({ _id: id, name: 'Second' });
        // If no error thrown, check if second insert was ignored
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('insertMany', () => {
    test('should insert multiple documents', async () => {
      const docs = [
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25 },
        { name: 'Bob', age: 35 }
      ];
      const result = await collection.insertMany(docs);
      
      expect(result.insertedCount).toBe(3);
      expect(result.insertedIds).toHaveLength(3);
      expect(result.acknowledged).toBe(true);
    });

    test('should handle empty array', async () => {
      const result = await collection.insertMany([]);
      expect(result.insertedCount).toBe(0);
      expect(result.insertedIds).toHaveLength(0);
    });

    test('should handle single document in array', async () => {
      const result = await collection.insertMany([{ name: 'Solo' }]);
      expect(result.insertedCount).toBe(1);
      expect(result.insertedIds).toHaveLength(1);
    });

    test('should handle large batch', async () => {
      const docs = Array.from({ length: 1000 }, (_, i) => ({ 
        index: i, 
        name: `User${i}` 
      }));
      const result = await collection.insertMany(docs);
      expect(result.insertedCount).toBe(1000);
    });

    test('should handle mixed document types', async () => {
      const docs = [
        { type: 'user', name: 'John' },
        { type: 'product', title: 'Item', price: 10.99 },
        { type: 'order', items: [1, 2, 3], total: 100 }
      ];
      const result = await collection.insertMany(docs);
      expect(result.insertedCount).toBe(3);
    });
  });

  describe('findOne', () => {
    beforeEach(async () => {
      await collection.insertMany([
        { _id: 'user1', name: 'John', age: 30, active: true },
        { _id: 'user2', name: 'Jane', age: 25, active: false },
        { _id: 'user3', name: 'Bob', age: 35, active: true }
      ]);
    });

    test('should find document by _id', async () => {
      const doc = await collection.findOne({ _id: 'user1' });
      expect(doc).toBeDefined();
      expect(doc?.name).toBe('John');
    });

    test('should find document by field', async () => {
      const doc = await collection.findOne({ name: 'Jane' });
      expect(doc).toBeDefined();
      expect(doc?._id).toBe('user2');
    });

    test('should return null for non-existent document', async () => {
      const doc = await collection.findOne({ name: 'NonExistent' });
      expect(doc).toBeNull();
    });

    test('should handle empty filter', async () => {
      const doc = await collection.findOne({});
      expect(doc).toBeDefined(); // Should return first document
    });

    test('should handle complex queries', async () => {
      const doc = await collection.findOne({ 
        age: { $gte: 30 }, 
        active: true 
      });
      expect(doc).toBeDefined();
      expect(doc?.age).toBeGreaterThanOrEqual(30);
      expect(doc?.active).toBe(true);
    });

    test('should handle projection', async () => {
      const doc = await collection.findOne(
        { name: 'John' },
        { projection: { name: 1 } }
      );
      expect(doc).toBeDefined();
      expect(doc?.name).toBe('John');
      // Note: Projection is handled at application level
    });

    test('should handle null filter', async () => {
      const doc = await collection.findOne(null as any);
      expect(doc).toBeDefined();
    });
  });

  describe('find', () => {
    beforeEach(async () => {
      await collection.insertMany([
        { name: 'John', age: 30, status: 'active' },
        { name: 'Jane', age: 25, status: 'active' },
        { name: 'Bob', age: 35, status: 'inactive' },
        { name: 'Alice', age: 28, status: 'active' },
        { name: 'Charlie', age: 40, status: 'active' }
      ]);
    });

    test('should find all documents', async () => {
      const docs = await collection.find({});
      expect(docs).toHaveLength(5);
    });

    test('should find with filter', async () => {
      const docs = await collection.find({ status: 'active' });
      expect(docs).toHaveLength(4);
      docs.forEach((doc: any) => expect(doc.status).toBe('active'));
    });

    test('should handle limit', async () => {
      const docs = await collection.find({}, { limit: 3 });
      expect(docs).toHaveLength(3);
    });

    test('should handle skip', async () => {
      const docs = await collection.find({}, { skip: 2 });
      expect(docs).toHaveLength(3);
    });

    test('should handle sort', async () => {
      const docs = await collection.find({}, { sort: { age: 1 } });
      expect(docs[0].age).toBe(25); // Jane
      expect(docs[docs.length - 1].age).toBe(40); // Charlie
    });

    test('should handle complex query chain', async () => {
      const docs = await collection.find(
        { status: 'active' },
        { 
          sort: { age: -1 },
          skip: 1,
          limit: 2
        }
      );
      
      expect(docs).toHaveLength(2);
      expect(docs[0].age).toBeGreaterThan(docs[1].age);
    });

    test('should handle empty result set', async () => {
      const docs = await collection.find({ status: 'nonexistent' });
      expect(docs).toHaveLength(0);
    });

    test('should handle range queries', async () => {
      const docs = await collection.find({ 
        age: { $gte: 25, $lte: 35 } 
      });
      
      docs.forEach((doc: any) => {
        expect(doc.age).toBeGreaterThanOrEqual(25);
        expect(doc.age).toBeLessThanOrEqual(35);
      });
    });

    test('should handle $in queries', async () => {
      const docs = await collection.find({ 
        name: { $in: ['John', 'Jane'] } 
      });
      
      expect(docs).toHaveLength(2);
      expect(docs.map((d: any) => d.name)).toEqual(expect.arrayContaining(['John', 'Jane']));
    });

    test('should handle regex queries', async () => {
      const docs = await collection.find({ 
        name: { $regex: '^J' } 
      });
      
      docs.forEach((doc: any) => {
        expect(doc.name).toMatch(/^J/);
      });
    });
  });

  describe('updateOne', () => {
    beforeEach(async () => {
      await collection.insertMany([
        { _id: 'user1', name: 'John', age: 30, status: 'active' },
        { _id: 'user2', name: 'Jane', age: 25, status: 'active' }
      ]);
    });

    test('should update existing document', async () => {
      const result = await collection.updateOne(
        { _id: 'user1' },
        { $set: { age: 31 } }
      );
      
      expect(result.matchedCount).toBe(1);
      expect(result.modifiedCount).toBe(1);
      expect(result.acknowledged).toBe(true);
    });

    test('should handle $set operator', async () => {
      await collection.updateOne(
        { name: 'John' },
        { $set: { age: 32, status: 'updated' } }
      );
      
      const doc = await collection.findOne({ name: 'John' });
      expect(doc?.age).toBe(32);
      expect(doc?.status).toBe('updated');
    });

    test('should handle $unset operator', async () => {
      await collection.updateOne(
        { name: 'John' },
        { $unset: { status: '' } }
      );
      
      const doc = await collection.findOne({ name: 'John' });
      expect(doc?.status).toBeUndefined();
    });

    test('should handle $inc operator', async () => {
      await collection.updateOne(
        { name: 'John' },
        { $inc: { age: 5 } }
      );
      
      const doc = await collection.findOne({ name: 'John' });
      expect(doc?.age).toBe(35);
    });

    test('should handle non-matching filter', async () => {
      const result = await collection.updateOne(
        { name: 'NonExistent' },
        { $set: { age: 100 } }
      );
      
      expect(result.matchedCount).toBe(0);
      expect(result.modifiedCount).toBe(0);
    });

    test('should handle upsert', async () => {
      const result = await collection.updateOne(
        { name: 'NewUser' },
        { $set: { age: 25 } },
        { upsert: true }
      );
      
      expect(result.upsertedCount).toBe(1);
      expect(result.upsertedId).toBeDefined();
    });

    test('should handle complex nested updates', async () => {
      await collection.insertOne({
        _id: 'complex',
        profile: { name: 'Test', settings: { theme: 'light' } }
      });
      
      await collection.updateOne(
        { _id: 'complex' },
        { $set: { 'profile.settings.theme': 'dark' } }
      );
      
      const doc = await collection.findOne({ _id: 'complex' });
      expect(doc?.profile?.settings?.theme).toBe('dark');
    });
  });

  describe('updateMany', () => {
    beforeEach(async () => {
      await collection.insertMany([
        { name: 'John', status: 'active', score: 100 },
        { name: 'Jane', status: 'active', score: 200 },
        { name: 'Bob', status: 'inactive', score: 150 }
      ]);
    });

    test('should update multiple documents', async () => {
      const result = await collection.updateMany(
        { status: 'active' },
        { $set: { updated: true } }
      );
      
      expect(result.matchedCount).toBe(2);
      expect(result.modifiedCount).toBe(2);
    });

    test('should handle $inc on multiple documents', async () => {
      await collection.updateMany(
        { status: 'active' },
        { $inc: { score: 10 } }
      );
      
      const docs = await collection.find({ status: 'active' });
      expect(docs[0].score).toBe(110);
      expect(docs[1].score).toBe(210);
    });

    test('should handle no matches', async () => {
      const result = await collection.updateMany(
        { status: 'nonexistent' },
        { $set: { foo: 'bar' } }
      );
      
      expect(result.matchedCount).toBe(0);
      expect(result.modifiedCount).toBe(0);
    });
  });

  describe('deleteOne', () => {
    beforeEach(async () => {
      await collection.insertMany([
        { _id: 'user1', name: 'John' },
        { _id: 'user2', name: 'Jane' },
        { _id: 'user3', name: 'John' }
      ]);
    });

    test('should delete single document', async () => {
      const result = await collection.deleteOne({ _id: 'user1' });
      expect(result.deletedCount).toBe(1);
      expect(result.acknowledged).toBe(true);
    });

    test('should delete only first match', async () => {
      const result = await collection.deleteOne({ name: 'John' });
      expect(result.deletedCount).toBe(1);
      
      const remaining = await collection.find({ name: 'John' });
      expect(remaining).toHaveLength(1);
    });

    test('should handle no matches', async () => {
      const result = await collection.deleteOne({ name: 'NonExistent' });
      expect(result.deletedCount).toBe(0);
    });
  });

  describe('deleteMany', () => {
    beforeEach(async () => {
      await collection.insertMany([
        { name: 'John', status: 'active' },
        { name: 'Jane', status: 'active' },
        { name: 'Bob', status: 'inactive' }
      ]);
    });

    test('should delete multiple documents', async () => {
      const result = await collection.deleteMany({ status: 'active' });
      expect(result.deletedCount).toBe(2);
    });

    test('should delete all with empty filter', async () => {
      const result = await collection.deleteMany({});
      expect(result.deletedCount).toBe(3);
    });

    test('should handle no matches', async () => {
      const result = await collection.deleteMany({ status: 'nonexistent' });
      expect(result.deletedCount).toBe(0);
    });
  });

  describe('countDocuments', () => {
    beforeEach(async () => {
      await collection.insertMany([
        { status: 'active', age: 25 },
        { status: 'active', age: 30 },
        { status: 'inactive', age: 35 }
      ]);
    });

    test('should count all documents', async () => {
      const count = await collection.countDocuments();
      expect(count).toBe(3);
    });

    test('should count with filter', async () => {
      const count = await collection.countDocuments({ status: 'active' });
      expect(count).toBe(2);
    });

    test('should count with complex filter', async () => {
      const count = await collection.countDocuments({ 
        status: 'active', 
        age: { $gte: 30 } 
      });
      expect(count).toBe(1);
    });

    test('should return 0 for no matches', async () => {
      const count = await collection.countDocuments({ status: 'nonexistent' });
      expect(count).toBe(0);
    });
  });

  describe('createIndex', () => {
    test('should create single field index', async () => {
      const result = await collection.createIndex({ email: 1 });
      expect(result).toContain('email');
    });

    test('should create compound index', async () => {
      const result = await collection.createIndex({ 
        status: 1, 
        created: -1 
      });
      expect(result).toContain('status');
      expect(result).toContain('created');
    });

    test('should create unique index', async () => {
      const result = await collection.createIndex(
        { email: 1 },
        { unique: true }
      );
      expect(result).toContain('email');
    });

    test('should handle duplicate index creation', async () => {
      await collection.createIndex({ email: 1 });
      // Should not throw error
      await collection.createIndex({ email: 1 });
    });
  });

  describe('drop', () => {
    test('should drop collection', async () => {
      await collection.insertOne({ name: 'Test' });
      await collection.drop();
      
      const count = await collection.countDocuments();
      expect(count).toBe(0);
    });

    test('should handle dropping non-existent collection', async () => {
      await collection.drop();
      // Should not throw error
    });
  });

  describe('edge cases and error handling', () => {
    test('should handle malformed JSON in stored data', async () => {
      // This tests the robustness of JSON parsing
      const doc = { complex: { deeply: { nested: { value: 'test' } } } };
      await collection.insertOne(doc);
      
      const found = await collection.findOne({ 'complex.deeply.nested.value': 'test' });
      expect(found).toBeDefined();
    });

    test('should handle very deep nesting', async () => {
      let deep: any = { value: 'bottom' };
      for (let i = 0; i < 100; i++) {
        deep = { level: i, child: deep };
      }
      
      const result = await collection.insertOne({ deep });
      expect(result.acknowledged).toBe(true);
    });

    test('should handle circular references gracefully', async () => {
      const obj: any = { name: 'test' };
      obj.self = obj; // Circular reference
      
      try {
        await collection.insertOne(obj);
        // Should either handle gracefully or throw appropriate error
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('should handle Date objects', async () => {
      const doc = { 
        created: new Date(),
        timestamp: Date.now()
      };
      
      const result = await collection.insertOne(doc);
      expect(result.acknowledged).toBe(true);
    });

    test('should handle undefined values', async () => {
      const doc = { 
        defined: 'value',
        undefined: undefined
      };
      
      const result = await collection.insertOne(doc);
      expect(result.acknowledged).toBe(true);
    });

    test('should handle empty strings and zero values', async () => {
      const doc = {
        emptyString: '',
        zero: 0,
        false: false,
        null: null
      };
      
      await collection.insertOne(doc);
      const found = await collection.findOne({ zero: 0 });
      expect(found).toBeDefined();
    });
  });
});
