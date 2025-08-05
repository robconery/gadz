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
    const possibleTables = await withConnection(async (connection) => {
      const query = connection.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
      const tables = query.all() as { name: string }[];
      return tables.map(t => t.name);
    });
    
    let foundTable: string | null = null;
    for (const table of possibleTables) {
      const exists = await withConnection(async (connection) => {
        try {
          const query = connection.db.prepare(`SELECT 1 FROM ${table} WHERE id = ? LIMIT 1`);
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
  
  return await withTransaction(async (connection) => {
    // Remove timestamp fields from document data before storing
    const { id, created_at, updated_at, ...docWithoutMeta } = document as any;
    const docData = JSON.stringify(docWithoutMeta);
    const hasId = (document as any).id;
    
    if (hasId) {
      // Use INSERT ... ON CONFLICT for proper upsert behavior
      const upsertQuery = connection.db.prepare(`
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
      const insertQuery = connection.db.prepare(`
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
  
  return await withConnection(async (connection) => {
    const query = connection.db.prepare(`
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
  
  return await withConnection(async (connection) => {
    const { clause: whereClause, params } = buildWhereClause(filter);
    const orderClause = buildOrderClause(options.sort);
    
    let sql = `SELECT id, data, created_at, updated_at FROM ${tableName} ${whereClause} ${orderClause}`;
    
    if (options.limit) {
      sql += ` LIMIT ${options.limit}`;
    }
    
    if (options.skip) {
      sql += ` OFFSET ${options.skip}`;
    }
    
    const query = connection.db.prepare(sql);
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

// Helper function to convert field names to JSON_EXTRACT calls
function convertFieldsToJsonExtract(whereClause: string): string {
  // Don't convert if it already contains JSON_EXTRACT or if it's using reserved columns
  if (whereClause.includes('JSON_EXTRACT') || 
      whereClause.includes('id ') || 
      whereClause.includes('created_at') || 
      whereClause.includes('updated_at') ||
      whereClause.includes('data ')) {
    return whereClause;
  }
  
  // Regex to match field names that aren't SQL keywords or functions
  // This matches words that are followed by operators like =, >, <, etc.
  // More precise regex that doesn't match words inside string literals
  const fieldPattern = /\b([a-zA-Z_][a-zA-Z0-9_\.]*)\s*([><=!]+|LIKE|IN|NOT IN|IS|IS NOT)(?=\s)/gi;
  
  return whereClause.replace(fieldPattern, (match, fieldName, operator) => {
    // Skip if it's a SQL keyword or function
    const sqlKeywords = ['AND', 'OR', 'NOT', 'NULL', 'TRUE', 'FALSE', 'CAST', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END'];
    if (sqlKeywords.includes(fieldName.toUpperCase())) {
      return match;
    }
    
    // Handle nested field names (e.g., address.city)
    const jsonPath = fieldName.includes('.') ? `$.${fieldName}` : `$.${fieldName}`;
    
    // For numeric comparisons, cast to REAL
    if (['>', '<', '>=', '<='].includes(operator.trim())) {
      return `CAST(JSON_EXTRACT(data, '${jsonPath}') AS REAL) ${operator}`;
    } else {
      return `JSON_EXTRACT(data, '${jsonPath}') ${operator}`;
    }
  });
}

/**
 * Execute queries with raw SQL where clauses or MongoDB-style filters
 * Follows late checkout/early checkin pattern
 */
export async function where<T>(
  constructor: new (...args: any[]) => T,
  whereClause: string | Filter,
  params?: any[] | FindOptions,
  options?: FindOptions
): Promise<(T & DocumentWithMeta)[]> {
  // If whereClause is a string, treat it as raw SQL
  if (typeof whereClause === "string") {
    const sqlParams = Array.isArray(params) ? params : [];
    const findOptions = Array.isArray(params) ? (options || {}) : (params || {});
    
    const tableName = getCollectionName(constructor);
    await ensureTable(tableName);
    
    return await withConnection(async (connection) => {
      // Check if the string already starts with WHERE (case-insensitive)
      let finalWhereClause = whereClause.trim();
      if (!finalWhereClause.toLowerCase().startsWith('where')) {
        finalWhereClause = `WHERE ${finalWhereClause}`;
      }
      
      // Convert field names to JSON_EXTRACT calls
      finalWhereClause = convertFieldsToJsonExtract(finalWhereClause);
      
      const orderClause = buildOrderClause(findOptions.sort);
      let sql = `SELECT id, data, created_at, updated_at FROM ${tableName} ${finalWhereClause} ${orderClause}`;
      
      if (findOptions.limit) {
        sql += ` LIMIT ${findOptions.limit}`;
      }
      
      if (findOptions.skip) {
        sql += ` OFFSET ${findOptions.skip}`;
      }
      
      // Convert parameters to SQLite-compatible types
      const convertedParams = sqlParams.map(param => {
        if (typeof param === 'boolean') {
          return param ? 1 : 0;
        }
        return param;
      });
      
      const query = connection.db.prepare(sql);
      const rows = query.all(...convertedParams) as {
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
  
  // If whereClause is an object, use the original MongoDB-style filter logic
  const filter = whereClause as Filter;
  const findOptions = (Array.isArray(params) ? options : params) || {};
  return await find(constructor, filter, findOptions);
}

/**
 * Save multiple documents in a transaction (UPSERT operation)
 * Accepts variadic arguments which are flattened to a single array
 */
export async function saveMany<T>(...documents: (T | T[])[]): Promise<(T & DocumentWithMeta)[]> {
  // Flatten all arguments into a single array
  const flatDocs = documents.flat() as T[];
  
  if (flatDocs.length === 0) {
    return [];
  }
  
  // Get table name from first document
  const tableName = getCollectionNameFromInstance(flatDocs[0]);
  
  // Ensure table exists
  await ensureTable(tableName);
  
  return await withTransaction(async (connection) => {
    const results: (T & DocumentWithMeta)[] = [];
    
    for (const document of flatDocs) {
      // Call _validate method if it exists on the document
      await validateDocument(document);
      
      // Remove timestamp fields from document data before storing
      const { id, created_at, updated_at, ...docWithoutMeta } = document as any;
      const docData = JSON.stringify(docWithoutMeta);
      const hasId = (document as any).id;
      
      if (hasId) {
        // Use INSERT ... ON CONFLICT for proper upsert behavior
        const upsertQuery = connection.db.prepare(`
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
        results.push({
          ...parsedData,
          id: row.id,
          created_at: row.created_at,
          updated_at: row.updated_at
        } as T & DocumentWithMeta);
      } else {
        // Insert new document using RETURNING to get inserted data
        const insertQuery = connection.db.prepare(`
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
        results.push({
          ...parsedData,
          id: row.id,
          created_at: row.created_at,
          updated_at: row.updated_at
        } as T & DocumentWithMeta);
      }
    }
    
    return results;
  });
}

/**
 * Update multiple documents matching a filter
 * Requires $set operator and supports upsert option
 */
export async function updateMany<T>(
  constructor: new (...args: any[]) => T,
  filter: Filter,
  update: UpdateFilter,
  options: { upsert?: boolean } = {}
): Promise<{ matchedCount: number; modifiedCount: number; upsertedId?: number }> {
  if (!update.$set) {
    throw new Error("updateMany requires $set operator");
  }
  
  const tableName = getCollectionName(constructor);
  await ensureTable(tableName);
  
  return await withTransaction(async (connection) => {
    const { clause: whereClause, params: whereParams } = buildWhereClause(filter);
    
    // Update existing documents
    const selectQuery = connection.db.prepare(`
      SELECT id, data FROM ${tableName} ${whereClause || 'WHERE 1=1'}
    `);
    const existingDocs = selectQuery.all(...(whereParams || [])) as { id: number; data: string }[];
    
    if (existingDocs.length > 0) {
      let modifiedCount = 0;
      
      for (const doc of existingDocs) {
        const parsedData = JSON.parse(doc.data);
        const updatedData = { ...parsedData, ...update.$set };
        
        const updateQuery = connection.db.prepare(`
          UPDATE ${tableName} 
          SET data = ?, updated_at = datetime('now') 
          WHERE id = ?
        `);
        updateQuery.run(JSON.stringify(updatedData), doc.id);
        modifiedCount++;
      }
      
      return {
        matchedCount: existingDocs.length,
        modifiedCount: modifiedCount
      };
    } else if (options.upsert) {
      // No documents matched and upsert is true, create new document
      const newDoc = update.$set;
      const insertQuery = connection.db.prepare(`
        INSERT INTO ${tableName} (data) 
        VALUES (?)
        RETURNING id
      `);
      const result = insertQuery.get(JSON.stringify(newDoc)) as { id: number };
      
      return {
        matchedCount: 0,
        modifiedCount: 0,
        upsertedId: result.id
      };
    } else {
      return {
        matchedCount: 0,
        modifiedCount: 0
      };
    }
  });
}

/**
 * Delete multiple documents matching a filter
 * Transactional operation
 */
export async function deleteMany<T>(
  constructor: new (...args: any[]) => T,
  filter: Filter
): Promise<{ deletedCount: number }> {
  const tableName = getCollectionName(constructor);
  await ensureTable(tableName);
  
  return await withTransaction(async (connection) => {
    const { clause: whereClause, params } = buildWhereClause(filter);
    
    if (!whereClause) {
      throw new Error("deleteMany requires a filter to prevent accidental deletion of all documents");
    }
    
    const deleteQuery = connection.db.prepare(`
      DELETE FROM ${tableName} ${whereClause}
    `);
    const result = deleteQuery.run(...params);
    
    return {
      deletedCount: result.changes
    };
  });
}

/**
 * Delete a single document matching a filter
 */
export async function deleteOne<T>(
  constructor: new (...args: any[]) => T,
  filter: Filter
): Promise<{ deletedCount: number }> {
  const tableName = getCollectionName(constructor);
  await ensureTable(tableName);
  
  return await withConnection(async (connection) => {
    const { clause: whereClause, params } = buildWhereClause(filter);
    
    if (!whereClause) {
      throw new Error("deleteOne requires a filter");
    }
    
    const deleteQuery = connection.db.prepare(`
      DELETE FROM ${tableName} ${whereClause} LIMIT 1
    `);
    const result = deleteQuery.run(...params);
    
    return {
      deletedCount: result.changes
    };
  });
}

/**
 * Execute raw SQL with optional typing
 */
export async function raw<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  return await withConnection(async (connection) => {
    const query = connection.db.prepare(sql);
    
    // Check if this is a DDL/DML statement that doesn't return data
    const trimmedSql = sql.trim().toUpperCase();
    const isDataModification = trimmedSql.startsWith('CREATE') || 
                              trimmedSql.startsWith('DROP') || 
                              trimmedSql.startsWith('ALTER') ||
                              trimmedSql.startsWith('INSERT') ||
                              trimmedSql.startsWith('UPDATE') ||
                              trimmedSql.startsWith('DELETE');
    
    if (isDataModification) {
      query.run(...params);
      return [] as T[];
    } else {
      const results = query.all(...params);
      return results as T[];
    }
  });
}

// Export types
export type { Filter, UpdateFilter, SaveOptions, FindOptions, DocumentWithMeta };
