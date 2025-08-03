// Gadz - MongoDB-compatible API with SQLite backend
export { Client } from './src/client.js';
export { GadzDatabase } from './src/database.js';
export { Collection } from './src/collection.js';
export { GadzObjectId } from './src/objectid.js';
export { QueryBuilder } from './src/query-builder.js';

export type {
  Document,
  InsertOneResult,
  InsertManyResult,
  UpdateResult,
  DeleteResult,
  FindOptions,
  UpdateOptions,
  QueryFilter,
  IndexSpec,
  CreateIndexOptions,
  ObjectId
} from './src/types.js';

export type { 
  ClientOptions 
} from './src/client.js';

// Simple DB methods that derive collection names from types
import pluralize from 'pluralize';
import { Client } from './src/client.js';
import { GadzDatabase } from './src/database.js';
import { Collection } from './src/collection.js';
import type { Document, InsertOneResult, InsertManyResult, QueryFilter, FindOptions } from './src/types.js';

let defaultClient: Client | null = null;
let defaultDatabase: GadzDatabase | null = null;

function getCollectionName<T>(constructor: new (...args: any[]) => T): string {
  return pluralize(constructor.name.toLowerCase());
}

function getDefaultDatabase(): GadzDatabase {
  if (!defaultDatabase) {
    if (!defaultClient) {
      defaultClient = new Client();
    }
    defaultDatabase = defaultClient.db('default');
  }
  return defaultDatabase;
}

function getCollection<T>(type: new (...args: any[]) => T): Collection {
  const collectionName = getCollectionName(type);
  return getDefaultDatabase().collection(collectionName);
}

export function setDefaultClient(client: Client, databaseName = 'default'): void {
  defaultClient = client;
  defaultDatabase = client.db(databaseName);
}

// Reset function for testing
export function resetDefaultClient(): void {
  defaultClient = null;
  defaultDatabase = null;
}

export async function save<T extends Document>(document: T): Promise<InsertOneResult> {
  if (!document.constructor || document.constructor === Object) {
    throw new Error('Document must have a constructor to derive collection name');
  }
  
  // Check if document has a validate method and call it
  if (typeof (document as any).validate === 'function') {
    const validationResult = (document as any).validate();
    if (validationResult instanceof Promise) {
      await validationResult;
    } else {
      // Call it directly if it's not a promise (sync validation)
      validationResult;
    }
  }
  
  const collection = getCollection(document.constructor as new (...args: any[]) => T);
  
  // Use upsert logic with ON CONFLICT
  const doc = { ...document };
  
  // Generate ID if not present
  if (!doc._id) {
    const { GadzObjectId } = await import('./src/objectid.js');
    doc._id = new GadzObjectId();
  }

  const id = doc._id!.toString();
  const { _id, ...data } = doc;
  
  // Get direct database access
  const db = (collection as any).db;
  const tableName = (collection as any).name;
  
  // Use INSERT ... ON CONFLICT DO UPDATE for upsert
  const stmt = db.prepare(`
    INSERT INTO "${tableName}" (_id, data, created_at, updated_at) 
    VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(_id) DO UPDATE SET 
      data = excluded.data,
      updated_at = CURRENT_TIMESTAMP
  `);
  
  stmt.run(id, JSON.stringify(data));
  
  return {
    acknowledged: true,
    insertedId: doc._id!
  };
}

export async function saveMany<T extends Document>(documents: T[]): Promise<InsertManyResult> {
  if (documents.length === 0) {
    return {
      acknowledged: true,
      insertedCount: 0,
      insertedIds: []
    };
  }

  const firstDoc = documents[0];
  if (!firstDoc.constructor || firstDoc.constructor === Object) {
    throw new Error('Documents must have a constructor to derive collection name');
  }

  // Validate all documents
  for (const doc of documents) {
    if (typeof (doc as any).validate === 'function') {
      const validationResult = (doc as any).validate();
      if (validationResult instanceof Promise) {
        await validationResult;
      } else {
        validationResult;
      }
    }
  }

  const collection = getCollection(firstDoc.constructor as new (...args: any[]) => T);
  
  // Get direct database access for custom transaction with upsert
  const db = (collection as any).db;
  const tableName = (collection as any).name;
  const insertedIds: any[] = [];
  
  // Prepare upsert statement
  const stmt = db.prepare(`
    INSERT INTO "${tableName}" (_id, data, created_at, updated_at) 
    VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(_id) DO UPDATE SET 
      data = excluded.data,
      updated_at = CURRENT_TIMESTAMP
  `);
  
  // Start transaction
  db.run('BEGIN TRANSACTION');
  try {
    for (const document of documents) {
      const doc = { ...document };
      
      // Generate ID if not present
      if (!doc._id) {
        const { GadzObjectId } = await import('./src/objectid.js');
        doc._id = new GadzObjectId();
      }

      const id = doc._id!.toString();
      const { _id, ...data } = doc;

      // Execute upsert
      stmt.run(id, JSON.stringify(data));
      insertedIds.push(doc._id!);
    }
    
    // Commit transaction
    db.run('COMMIT');
    
    return {
      acknowledged: true,
      insertedCount: documents.length,
      insertedIds
    };
  } catch (error) {
    // Rollback on any error
    db.run('ROLLBACK');
    throw error;
  }
}

export function get<T>(type: new (...args: any[]) => T, id: string | number): T | null {
  const collection = getCollection(type);
  const result = collection.findOne({ _id: id.toString() });
  
  if (!result) return null;
  
  const instance = new type();
  return Object.assign(instance as any, result) as T;
}

export function find<T>(type: new (...args: any[]) => T, filter: QueryFilter = {}, options: FindOptions = {}): T[] {
  const collection = getCollection(type);
  const results = collection.find(filter, options);
  
  return results.map((result: any) => {
    const instance = new type();
    return Object.assign(instance as any, result) as T;
  });
}

export function findOne<T>(type: new (...args: any[]) => T, filter: QueryFilter = {}, options: FindOptions = {}): T | null {
  const collection = getCollection(type);
  const result = collection.findOne(filter, options);
  
  if (!result) return null;
  
  const instance = new type();
  return Object.assign(instance as any, result) as T;
}

export function where<T>(type: new (...args: any[]) => T) {
  const collection = getCollection(type);
  
  return {
    find: (filter: QueryFilter = {}, options: FindOptions = {}): T[] => {
      const results = collection.find(filter, options);
      return results.map((result: any) => {
        const instance = new type();
        return Object.assign(instance as any, result) as T;
      });
    },
    
    findOne: (filter: QueryFilter = {}, options: FindOptions = {}): T | null => {
      const result = collection.findOne(filter, options);
      if (!result) return null;
      
      const instance = new type();
      return Object.assign(instance as any, result) as T;
    }
  };
}

export function isUnique<T>(type: new (...args: any[]) => T, filter: QueryFilter): boolean {
  const collection = getCollection(type);
  const result = collection.findOne(filter);
  return result === null;
}

// Default export for convenience
export default Client;