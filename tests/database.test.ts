// Database functionality tests
import { test, expect, describe } from 'bun:test';
import { Client } from '../index.js';

describe('BongoDatabase', () => {
  test('should create and manage collections', async () => {
    const client = new Client();
    const db = client.db('test');
    
    const collection1 = db.collection('users');
    const collection2 = db.collection('posts');
    
    expect(collection1).toBeDefined();
    expect(collection2).toBeDefined();
    expect(collection1).not.toBe(collection2);
    
    // Same name should return same instance
    const collection1Again = db.collection('users');
    expect(collection1).toBe(collection1Again);
    
    await client.close();
  });

  test('should list collections', async () => {
    const client = new Client();
    const db = client.db('test');
    
    // Initially no collections
    expect(db.listCollections()).toHaveLength(0);
    
    // Create collections by inserting data
    db.collection('users').insertOne({ name: 'test' });
    db.collection('posts').insertOne({ title: 'test' });
    
    const collections = db.listCollections();
    expect(collections).toHaveLength(2);
    expect(collections).toContain('users');
    expect(collections).toContain('posts');
    
    await client.close();
  });

  test('should drop collections', async () => {
    const client = new Client();
    const db = client.db('test');
    
    const collection = db.collection('users');
    collection.insertOne({ name: 'test' });
    
    expect(db.listCollections()).toContain('users');
    
    const dropped = await db.dropCollection('users');
    expect(dropped).toBe(true);
    expect(db.listCollections()).not.toContain('users');
    
    await client.close();
  });

  test('should provide database stats', async () => {
    const client = new Client();
    const db = client.db('test');
    
    const stats = db.stats();
    expect(stats).toHaveProperty('db', 'test');
    expect(stats).toHaveProperty('collections');
    expect(stats).toHaveProperty('objects');
    expect(stats).toHaveProperty('dataSize');
    
    // Add some data and check stats change
    db.collection('users').insertMany([
      { name: 'User 1' },
      { name: 'User 2' },
      { name: 'User 3' }
    ]);
    
    const newStats = db.stats();
    expect(newStats.objects).toBe(3);
    expect(newStats.collections).toBe(1);
    
    await client.close();
  });

  test('should handle createCollection', async () => {
    const client = new Client();
    const db = client.db('test');
    
    const collection = db.createCollection('explicit');
    expect(collection).toBeDefined();
    
    // Should be in collection list after data is inserted
    collection.insertOne({ test: true });
    expect(db.listCollections()).toContain('explicit');
    
    await client.close();
  });

  test('should get database name', async () => {
    const client = new Client();
    const db = client.db('myTestDatabase');
    
    expect(db.getName()).toBe('myTestDatabase');
    
    await client.close();
  });
});
