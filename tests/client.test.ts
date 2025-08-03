// Basic functionality tests for Client
import { test, expect, describe } from 'bun:test';
import { Client, GadzObjectId } from '../index.js';
import { rmSync } from 'fs';

describe('Client', () => {
  test('should create in-memory database by default', async () => {
    const client = new Client();
    await client.connect();
    
    const db = client.db('test');
    expect(db).toBeDefined();
    expect(db.getName()).toBe('test');
    
    await client.close();
  });

  test('should create file-based database', async () => {
    const filename = './test-client.db';
    const client = new Client({ filename });
    
    const db = client.db('test');
    const collection = db.collection('users');
    
    // Insert something to create the file
    collection.insertOne({ name: 'test' });
    
    await client.close();
    
    // Clean up
    rmSync(filename, { force: true });
  });

  test('should handle multiple databases', async () => {
    const client = new Client();
    
    const db1 = client.db('db1');
    const db2 = client.db('db2');
    
    expect(db1.getName()).toBe('db1');
    expect(db2.getName()).toBe('db2');
    expect(db1).not.toBe(db2);
    
    await client.close();
  });

  test('should list databases', async () => {
    const client = new Client();
    
    const db1 = client.db('db1');
    const db2 = client.db('db2');
    
    // Create some data to ensure databases exist
    db1.collection('test').insertOne({ test: 1 });
    db2.collection('test').insertOne({ test: 2 });
    
    const databases = client.listDatabases();
    expect(databases).toHaveLength(2);
    expect(databases.map(d => d.name)).toEqual(['db1', 'db2']);
    
    await client.close();
  });

  test('should handle client options', () => {
    const client = new Client({
      filename: ':memory:',
      readonly: false,
      create: true,
      readwrite: true
    });
    
    expect(client).toBeDefined();
  });

  test('should execute raw SQL', async () => {
    const client = new Client();
    const db = client.db('test');
    
    // Create a collection first
    const collection = db.collection('users');
    collection.insertOne({ name: 'John', age: 30 });
    
    // Execute raw SQL
    const results = client.executeSQL('test', 'SELECT COUNT(*) as count FROM users');
    expect(results).toHaveLength(1);
    expect(results[0].count).toBe(1);
    
    await client.close();
  });

  test('should throw error for non-existent database in executeSQL', async () => {
    const client = new Client();
    
    expect(() => {
      client.executeSQL('nonexistent', 'SELECT 1');
    }).toThrow('Database nonexistent not found');
    
    await client.close();
  });

  test('should get SQLite connection', async () => {
    const client = new Client();
    const db = client.db('test');
    
    const connection = client.getSQLiteConnection('test');
    expect(connection).toBeDefined();
    
    const nonExistent = client.getSQLiteConnection('nonexistent');
    expect(nonExistent).toBeUndefined();
    
    await client.close();
  });
});
