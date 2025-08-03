// Collection class - implements MongoDB collection API for Gadz
import { Database } from 'bun:sqlite';
import { GadzObjectId } from './objectid.js';
import { QueryBuilder } from './query-builder.js';
import type {
  Document,
  InsertOneResult,
  InsertManyResult,
  UpdateResult,
  DeleteResult,
  FindOptions,
  UpdateOptions,
  QueryFilter,
  IndexSpec,
  CreateIndexOptions
} from './types.js';

export class Collection {
  private db: Database;
  private name: string;

  constructor(db: Database, name: string) {
    this.db = db;
    this.name = name;
    this.ensureCollectionExists();
  }

  private ensureCollectionExists(): void {
    // Create table if it doesn't exist
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS "${this.name}" (
        _id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    this.db.run(createTableSql);

    // Create trigger for updated_at
    const triggerSql = `
      CREATE TRIGGER IF NOT EXISTS "${this.name}_updated_at"
      AFTER UPDATE ON "${this.name}"
      BEGIN
        UPDATE "${this.name}" SET updated_at = CURRENT_TIMESTAMP WHERE _id = NEW._id;
      END
    `;
    this.db.run(triggerSql);
  }

  // Insert operations
  insertOne(document: Document): InsertOneResult {
    const doc = { ...document };
    
    if (!doc._id) {
      doc._id = new GadzObjectId();
    }

    const id = doc._id!.toString();
    const { _id, ...data } = doc;

    const stmt = this.db.prepare(`INSERT INTO "${this.name}" (_id, data) VALUES (?, ?)`);
    
    try {
      stmt.run(id, JSON.stringify(data));
      return {
        acknowledged: true,
        insertedId: doc._id!
      };
    } catch (error) {
      if ((error as any).message?.includes('UNIQUE constraint failed')) {
        throw new Error(`Document with _id ${id} already exists`);
      }
      throw error;
    }
  }

  insertMany(documents: Document[]): InsertManyResult {
    const insertedIds: (GadzObjectId | string)[] = [];
    const stmt = this.db.prepare(`INSERT INTO "${this.name}" (_id, data) VALUES (?, ?)`);
    
    // Use Bun SQLite transaction
    this.db.run('BEGIN TRANSACTION');
    try {
      for (const document of documents) {
        const doc = { ...document };
        
        if (!doc._id) {
          doc._id = new GadzObjectId();
        }

        const id = doc._id!.toString();
        const { _id, ...data } = doc;

        stmt.run(id, JSON.stringify(data));
        insertedIds.push(doc._id!);
      }
      this.db.run('COMMIT');
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    }

    return {
      acknowledged: true,
      insertedCount: documents.length,
      insertedIds
    };
  }

  // Find operations
  findOne(filter: QueryFilter = {}, options: FindOptions = {}): Document | null {
    const { sql: whereClause, params } = QueryBuilder.buildWhereClause(filter);
    const projection = QueryBuilder.buildProjection(options.projection);
    
    const queryParts = [`SELECT ${projection} FROM "${this.name}"`];
    if (whereClause) queryParts.push(whereClause);
    queryParts.push('LIMIT 1');
    
    const query = queryParts.join(' ');
    const stmt = this.db.prepare(query);
    const result = stmt.get(...params) as any;

    if (!result) return null;

    return this.deserializeDocument(result, options.projection);
  }

  find(filter: QueryFilter = {}, options: FindOptions = {}): Document[] {
    const { sql: whereClause, params } = QueryBuilder.buildWhereClause(filter);
    const projection = QueryBuilder.buildProjection(options.projection);
    const orderClause = QueryBuilder.buildOrderClause(options.sort);
    const limitClause = QueryBuilder.buildLimitClause(options);
    
    const queryParts = [`SELECT ${projection} FROM "${this.name}"`];
    if (whereClause) queryParts.push(whereClause);
    if (orderClause) queryParts.push(orderClause);
    if (limitClause) queryParts.push(limitClause);
    
    const query = queryParts.join(' ');
    const stmt = this.db.prepare(query);
    const results = stmt.all(...params) as any[];

    return results.map(result => this.deserializeDocument(result, options.projection));
  }

  // Update operations
  updateOne(filter: QueryFilter, update: any, options: UpdateOptions = {}): UpdateResult {
    return this.updateDocuments(filter, update, { ...options, multi: false });
  }

  updateMany(filter: QueryFilter, update: any, options: UpdateOptions = {}): UpdateResult {
    return this.updateDocuments(filter, update, { ...options, multi: true });
  }

  private updateDocuments(filter: QueryFilter, update: any, options: UpdateOptions): UpdateResult {
    const { sql: whereClause, params: whereParams } = QueryBuilder.buildWhereClause(filter);
    
    // Handle different update operators
    if (update.$set || update.$unset || update.$inc) {
      return this.handleUpdateOperators(filter, update, options);
    }

    // Simple replacement
    const { _id, ...updateData } = update;
    const limitClause = options.multi ? '' : 'LIMIT 1';
    
    const queryParts = [`UPDATE "${this.name}" SET data = ?`];
    if (whereClause) queryParts.push(whereClause);
    if (limitClause) queryParts.push(limitClause);
    
    const updateSql = queryParts.join(' ');
    const stmt = this.db.prepare(updateSql);
    const result = stmt.run(JSON.stringify(updateData), ...whereParams);

    return {
      acknowledged: true,
      matchedCount: result.changes || 0,
      modifiedCount: result.changes || 0,
      upsertedCount: 0
    };
  }

  private handleUpdateOperators(filter: QueryFilter, update: any, options: UpdateOptions): UpdateResult {
    // For now, implement a simple version - fetch, modify, update
    const documents = this.find(filter, { limit: options.multi ? undefined : 1 });
    
    if (documents.length === 0 && options.upsert) {
      // Handle upsert
      const newDoc = { ...filter };
      if (update.$set) {
        Object.assign(newDoc, update.$set);
      }
      const insertResult = this.insertOne(newDoc);
      return {
        acknowledged: true,
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: 1,
        upsertedId: insertResult.insertedId
      };
    }

    let modifiedCount = 0;
    const stmt = this.db.prepare(`UPDATE "${this.name}" SET data = ? WHERE _id = ?`);

    for (const doc of documents) {
      const modifiedDoc = { ...doc };
      delete modifiedDoc._id;

      if (update.$set) {
        for (const [field, value] of Object.entries(update.$set)) {
          this.setNestedField(modifiedDoc, field, value);
        }
      }
      if (update.$unset) {
        for (const field of Object.keys(update.$unset)) {
          delete modifiedDoc[field];
        }
      }
      if (update.$inc) {
        for (const [field, increment] of Object.entries(update.$inc)) {
          modifiedDoc[field] = (modifiedDoc[field] || 0) + (increment as number);
        }
      }

      stmt.run(JSON.stringify(modifiedDoc), doc._id!.toString());
      modifiedCount++;
    }

    return {
      acknowledged: true,
      matchedCount: documents.length,
      modifiedCount,
      upsertedCount: 0
    };
  }

  // Delete operations
  deleteOne(filter: QueryFilter): DeleteResult {
    const { sql: whereClause, params } = QueryBuilder.buildWhereClause(filter);
    
    const queryParts = [`DELETE FROM "${this.name}"`];
    if (whereClause) queryParts.push(whereClause);
    queryParts.push('LIMIT 1');
    
    const query = queryParts.join(' ');
    const stmt = this.db.prepare(query);
    const result = stmt.run(...params);

    return {
      acknowledged: true,
      deletedCount: result.changes || 0
    };
  }

  deleteMany(filter: QueryFilter): DeleteResult {
    const { sql: whereClause, params } = QueryBuilder.buildWhereClause(filter);
    
    const queryParts = [`DELETE FROM "${this.name}"`];
    if (whereClause) queryParts.push(whereClause);
    
    const query = queryParts.join(' ');
    const stmt = this.db.prepare(query);
    const result = stmt.run(...params);

    return {
      acknowledged: true,
      deletedCount: result.changes || 0
    };
  }

  // Index operations
  createIndex(indexSpec: IndexSpec, options: CreateIndexOptions = {}): string {
    const indexName = options.name || this.generateIndexName(indexSpec);
    const fields = Object.keys(indexSpec);
    
    // For JSON fields, we need to extract them
    const indexFields = fields.map(field => {
      if (field === '_id') {
        return '_id';
      }
      return `JSON_EXTRACT(data, '$.${field}')`;
    }).join(', ');

    const uniqueClause = options.unique ? 'UNIQUE' : '';
    const createIndexSql = `CREATE ${uniqueClause} INDEX IF NOT EXISTS "${indexName}" ON "${this.name}" (${indexFields})`;
    
    this.db.run(createIndexSql);
    return indexName;
  }

  dropIndex(indexName: string): void {
    this.db.run(`DROP INDEX IF EXISTS "${indexName}"`);
  }

  // Utility methods
  private deserializeDocument(row: any, projection?: Record<string, 0 | 1>): Document {
    const doc: Document = {
      _id: row._id
    };

    if (row.data) {
      const data = JSON.parse(row.data);
      Object.assign(doc, data);
    }

    // Apply projection
    if (projection && Object.keys(projection).length > 0) {
      const include = Object.entries(projection).filter(([_, include]) => include === 1);
      const exclude = Object.entries(projection).filter(([_, include]) => include === 0);
      
      if (include.length > 0) {
        // Include only specified fields
        const newDoc: Document = {};
        for (const [field] of include) {
          if (field === '_id') {
            newDoc._id = doc._id;
          } else if (doc[field] !== undefined) {
            newDoc[field] = doc[field];
          }
        }
        return newDoc;
      } else if (exclude.length > 0) {
        // Exclude specified fields
        for (const [field] of exclude) {
          if (field === '_id') {
            delete doc._id;
          } else {
            delete doc[field];
          }
        }
      }
    }

    return doc;
  }

  private generateIndexName(indexSpec: IndexSpec): string {
    const fields = Object.keys(indexSpec).join('_');
    return `idx_${this.name}_${fields}`;
  }

  private setNestedField(obj: any, field: string, value: any): void {
    const keys = field.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
        current[key] = {};
      }
      current = current[key];
    }
    
    current[keys[keys.length - 1]] = value;
  }

  // Get collection stats
  countDocuments(filter: QueryFilter = {}): number {
    const { sql: whereClause, params } = QueryBuilder.buildWhereClause(filter);
    
    const queryParts = [`SELECT COUNT(*) as count FROM "${this.name}"`];
    if (whereClause) queryParts.push(whereClause);
    
    const query = queryParts.join(' ');
    try {
      const stmt = this.db.prepare(query);
      const result = stmt.get(...params) as { count: number };
      return result.count;
    } catch (error) {
      // If table doesn't exist, return 0
      if ((error as any).message?.includes('no such table')) {
        return 0;
      }
      throw error;
    }
  }

  // Drop collection
  drop(): boolean {
    try {
      this.db.run(`DROP TABLE IF EXISTS "${this.name}"`);
      return true;
    } catch {
      return false;
    }
  }
}
