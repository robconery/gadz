import { withConnection, withTransaction } from "./connection";
import { validateDocument } from "./validation";
import { ensureTable } from "./table-utils";
import pluralize from "pluralize";

// Type definitions for MongoDB-style operations
interface Filter {
  [key: string]: any;
}

interface UpdateFilter {
  $set?: { [key: string]: any };
  $unset?: { [key: string]: any };
  $inc?: { [key: string]: number };
  $push?: { [key: string]: any };
  $pull?: { [key: string]: any };
}

interface SaveOptions {
  upsert?: boolean;
}

interface FindOptions {
  limit?: number;
  skip?: number;
  sort?: { [key: string]: 1 | -1 };
}

// Add timestamp fields to all returned documents
interface DocumentWithMeta {
  id: number;
  created_at: string;
  updated_at: string;
}

// Helper function to get collection name from class constructor
function getCollectionName<T>(constructor: new (...args: any[]) => T): string {
  return pluralize(constructor.name.toLowerCase());
}

// Helper function to get collection name from instance
function getCollectionNameFromInstance(instance: any): string {
  return pluralize(instance.constructor.name.toLowerCase());
}

// Helper function to build WHERE clause from MongoDB-style filter
function buildWhereClause(filter: Filter): { clause: string; params: any[] } {
  if (!filter || Object.keys(filter).length === 0) {
    return { clause: "", params: [] };
  }

  const conditions: string[] = [];
  const params: any[] = [];

  for (const [key, value] of Object.entries(filter)) {
    if (key === "id" || key === "_id") {
      // Handle ID queries directly
      conditions.push("id = ?");
      params.push(value);
    } else if (typeof value === "object" && value !== null) {
      // Handle MongoDB operators
      for (const [operator, operatorValue] of Object.entries(value)) {
        switch (operator) {
          case "$eq":
            conditions.push(`JSON_EXTRACT(data, '$.${key}') = ?`);
            if (typeof operatorValue === "boolean") {
              params.push(operatorValue ? 1 : 0);
            } else if (typeof operatorValue === "string") {
              params.push(operatorValue);
            } else {
              params.push(JSON.stringify(operatorValue));
            }
            break;
          case "$ne":
            conditions.push(`JSON_EXTRACT(data, '$.${key}') != ?`);
            if (typeof operatorValue === "boolean") {
              params.push(operatorValue ? 1 : 0);
            } else if (typeof operatorValue === "string") {
              params.push(operatorValue);
            } else {
              params.push(JSON.stringify(operatorValue));
            }
            break;
          case "$gt":
            conditions.push(`CAST(JSON_EXTRACT(data, '$.${key}') AS REAL) > ?`);
            params.push(operatorValue);
            break;
          case "$gte":
            conditions.push(`CAST(JSON_EXTRACT(data, '$.${key}') AS REAL) >= ?`);
            params.push(operatorValue);
            break;
          case "$lt":
            conditions.push(`CAST(JSON_EXTRACT(data, '$.${key}') AS REAL) < ?`);
            params.push(operatorValue);
            break;
          case "$lte":
            conditions.push(`CAST(JSON_EXTRACT(data, '$.${key}') AS REAL) <= ?`);
            params.push(operatorValue);
            break;
          case "$in":
            if (Array.isArray(operatorValue)) {
              const placeholders = operatorValue.map(() => "?").join(", ");
              conditions.push(`JSON_EXTRACT(data, '$.${key}') IN (${placeholders})`);
              params.push(...operatorValue.map(v => {
                if (typeof v === "boolean") return v ? 1 : 0;
                if (typeof v === "string") return v;
                return JSON.stringify(v);
              }));
            }
            break;
          case "$nin":
            if (Array.isArray(operatorValue)) {
              const placeholders = operatorValue.map(() => "?").join(", ");
              conditions.push(`JSON_EXTRACT(data, '$.${key}') NOT IN (${placeholders})`);
              params.push(...operatorValue.map(v => {
                if (typeof v === "boolean") return v ? 1 : 0;
                if (typeof v === "string") return v;
                return JSON.stringify(v);
              }));
            }
            break;
          case "$exists":
            if (operatorValue) {
              conditions.push(`JSON_EXTRACT(data, '$.${key}') IS NOT NULL`);
            } else {
              conditions.push(`JSON_EXTRACT(data, '$.${key}') IS NULL`);
            }
            break;
          default:
            throw new Error(`Unsupported operator: ${operator}`);
        }
      }
    } else {
      // Simple equality - handle different types
      if (typeof value === "boolean") {
        conditions.push(`JSON_EXTRACT(data, '$.${key}') = ?`);
        params.push(value ? 1 : 0);
      } else if (typeof value === "string") {
        conditions.push(`JSON_EXTRACT(data, '$.${key}') = ?`);
        params.push(value);
      } else {
        conditions.push(`JSON_EXTRACT(data, '$.${key}') = ?`);
        params.push(JSON.stringify(value));
      }
    }
  }

  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    params
  };
}

// Helper function to build ORDER BY clause
function buildOrderClause(sort?: { [key: string]: 1 | -1 }): string {
  if (!sort || Object.keys(sort).length === 0) {
    return "";
  }

  const orderParts = Object.entries(sort).map(([key, direction]) => {
    const dir = direction === 1 ? "ASC" : "DESC";
    if (key === "id" || key === "_id") {
      return `id ${dir}`;
    }
    return `JSON_EXTRACT(data, '$.${key}') ${dir}`;
  });

  return `ORDER BY ${orderParts.join(", ")}`;
}

/**
 * Save a document (UPSERT operation)
 * Follows late checkout/early checkin pattern
 */
export async function save<T>(document: T, options: SaveOptions = { upsert: true }): Promise<T & DocumentWithMeta> {
  let tableName: string;
  
  // Handle case where document is a plain object (from spreading) but has an ID
  const constructorName = (document as any).constructor.name;
  if (constructorName === 'Object' && (document as any).id) {
    // For plain objects with ID, we need to find which table contains this ID
    // We'll scan common table names - this is a fallback for spread objects
    const possibleTables = await withConnection(async (pooledDb) => {
      const query = pooledDb.db.query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
      const tables = query.all() as { name: string }[];
      return tables.map(t => t.name);
    });
    
    let foundTable: string | null = null;
    for (const table of possibleTables) {
      const exists = await withConnection(async (pooledDb) => {
        try {
          const query = pooledDb.db.query(`SELECT 1 FROM ${table} WHERE id = ? LIMIT 1`);
          return query.get((document as any).id) !== null;
        } catch {
          return false;
        }
      });
      if (exists) {
        foundTable = table;
        break;
      }
    }
    
    if (!foundTable) {
      throw new Error('Cannot determine collection name from plain object with unknown ID. Please use a proper class instance.');
    }
    tableName = foundTable;
  } else {
    tableName = getCollectionNameFromInstance(document);
  }
  
  // Ensure table exists
  await ensureTable(tableName);
  
  // Call _validate method if it exists on the document
  await validateDocument(document);
  
  return await withTransaction(async (pooledDb) => {
    // Remove timestamp fields from document data before storing
    const { id, created_at, updated_at, ...docWithoutMeta } = document as any;
    const docData = JSON.stringify(docWithoutMeta);
    const hasId = (document as any).id;
    
    if (hasId) {
      // Use INSERT ... ON CONFLICT for proper upsert behavior
      const upsertQuery = pooledDb.db.query(`
        INSERT INTO ${tableName} (id, data) 
        VALUES (?, ?)
        ON CONFLICT(id) DO UPDATE SET 
          data = excluded.data,
          updated_at = datetime('now')
        RETURNING id, data, created_at, updated_at
      `);
      
      const row = upsertQuery.get(hasId, docData) as { 
        id: number; 
        data: string; 
        created_at: string; 
        updated_at: string; 
      };
      
      const parsedData = JSON.parse(row.data);
      return {
        ...parsedData,
        id: row.id,
        created_at: row.created_at,
        updated_at: row.updated_at
      } as T & DocumentWithMeta;
    } else {
      // Insert new document using RETURNING to get inserted data
      const insertQuery = pooledDb.db.query(`
        INSERT INTO ${tableName} (data) 
        VALUES (?)
        RETURNING id, data, created_at, updated_at
      `);
      
      const row = insertQuery.get(docData) as { 
        id: number; 
        data: string; 
        created_at: string; 
        updated_at: string; 
      };
      
      const parsedData = JSON.parse(row.data);
      return {
        ...parsedData,
        id: row.id,
        created_at: row.created_at,
        updated_at: row.updated_at
      } as T & DocumentWithMeta;
    }
  });
}

/**
 * Get a document by ID
 * Follows late checkout/early checkin pattern
 */
export async function get<T>(
  constructor: new (...args: any[]) => T, 
  id: number
): Promise<(T & DocumentWithMeta) | null> {
  const tableName = getCollectionName(constructor);
  
  // Ensure table exists
  await ensureTable(tableName);
  
  return await withConnection(async (pooledDb) => {
    const query = pooledDb.db.query(`
      SELECT id, data, created_at, updated_at 
      FROM ${tableName} 
      WHERE id = ?
    `);
    
    const row = query.get(id) as { 
      id: number; 
      data: string; 
      created_at: string; 
      updated_at: string; 
    } | null;
    
    if (!row) {
      return null;
    }
    
    const parsedData = JSON.parse(row.data);
    return {
      ...parsedData,
      id: row.id,
      created_at: row.created_at,
      updated_at: row.updated_at
    } as T & DocumentWithMeta;
  });
}

/**
 * Find documents matching a filter
 * Follows late checkout/early checkin pattern
 */
export async function find<T>(
  constructor: new (...args: any[]) => T,
  filter: Filter = {},
  options: FindOptions = {}
): Promise<(T & DocumentWithMeta)[]> {
  const tableName = getCollectionName(constructor);
  
  // Ensure table exists
  await ensureTable(tableName);
  
  return await withConnection(async (pooledDb) => {
    const { clause: whereClause, params } = buildWhereClause(filter);
    const orderClause = buildOrderClause(options.sort);
    
    let sql = `SELECT id, data, created_at, updated_at FROM ${tableName} ${whereClause} ${orderClause}`;
    
    if (options.limit) {
      sql += ` LIMIT ${options.limit}`;
    }
    
    if (options.skip) {
      sql += ` OFFSET ${options.skip}`;
    }
    
    const query = pooledDb.db.query(sql);
    const rows = query.all(...params) as {
      id: number;
      data: string;
      created_at: string;
      updated_at: string;
    }[];
    
    return rows.map(row => {
      const parsedData = JSON.parse(row.data);
      return {
        ...parsedData,
        id: row.id,
        created_at: row.created_at,
        updated_at: row.updated_at
      } as T & DocumentWithMeta;
    });
  });
}

/**
 * Find one document matching a filter
 * Follows late checkout/early checkin pattern
 */
export async function findOne<T>(
  constructor: new (...args: any[]) => T,
  filter: Filter = {}
): Promise<(T & DocumentWithMeta) | null> {
  const results = await find(constructor, filter, { limit: 1 });
  return results.length > 0 ? results[0] : null;
}

// Export types
export type { Filter, UpdateFilter, SaveOptions, FindOptions, DocumentWithMeta };
