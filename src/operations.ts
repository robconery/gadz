import { getDatabase } from "./connection.js";
import type { Constructor, Filter, UpdateOperators, UpdateOptions, DeleteResult, UpdateResult, FindOptions, Document } from "./types.js";
import { getCollectionName, ensureTable, buildWhereClause, serializeDocument, deserializeDocument, flattenArray } from "./utils.js";

// Get a document by ID
export async function get<T extends Document>(id: number, classConstructor?: Constructor<T>): Promise<T | null> {
  if (!classConstructor) {
    throw new Error("Class constructor is required for get operation");
  }
  
  const db = getDatabase();
  const tableName = getCollectionName(classConstructor);
  ensureTable(classConstructor);
  
  const query = db.query(`SELECT * FROM ${tableName} WHERE id = ?`);
  const row = query.get(id) as { id: number; data: string } | null;
  
  if (!row) return null;
  return deserializeDocument<T>(row);
}

// Find multiple documents
export async function find<T extends Document>(
  filter: Filter<T> = {},
  options: FindOptions = {},
  classConstructor?: Constructor<T>
): Promise<T[]> {
  if (!classConstructor) {
    throw new Error("Class constructor is required for find operation");
  }
  
  const db = getDatabase();
  const tableName = getCollectionName(classConstructor);
  ensureTable(classConstructor);
  
  const { whereClause, params } = buildWhereClause(filter, tableName);
  
  let queryStr = `SELECT * FROM ${tableName} ${whereClause}`;
  
  // Add sorting
  if (options.sort) {
    const sortClauses = Object.entries(options.sort).map(([field, direction]) => {
      const dir = direction === 1 ? "ASC" : "DESC";
      return `JSON_EXTRACT(data, '$.${field}') ${dir}`;
    });
    queryStr += ` ORDER BY ${sortClauses.join(", ")}`;
  }
  
  // Add limit and offset
  if (options.limit) {
    queryStr += ` LIMIT ${options.limit}`;
  }
  if (options.skip) {
    queryStr += ` OFFSET ${options.skip}`;
  }
  
  const query = db.query(queryStr);
  const rows = query.all(...params) as { id: number; data: string }[];
  
  return rows.map(row => deserializeDocument<T>(row));
}

// Find one document
export async function findOne<T extends Document>(
  filter: Filter<T> = {},
  classConstructor?: Constructor<T>
): Promise<T | null> {
  const results = await find(filter, { limit: 1 }, classConstructor);
  return results[0] || null;
}

// Where function (alias for find with different semantics)
export async function where<T extends Document>(
  filter: Filter<T>,
  classConstructor?: Constructor<T>
): Promise<T[]> {
  return find(filter, {}, classConstructor);
}

// Save a document (upsert)
export async function save<T extends Document>(doc: T, classConstructor?: Constructor<T>): Promise<T> {
  if (!classConstructor && !doc.constructor) {
    throw new Error("Class constructor is required for save operation");
  }
  
  const constructor = classConstructor || (doc.constructor as Constructor<T>);
  const db = getDatabase();
  const tableName = getCollectionName(constructor);
  ensureTable(constructor);
  
  if (doc.id) {
    // Update existing document
    const updateQuery = db.query(`
      UPDATE ${tableName} 
      SET data = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);
    updateQuery.run(serializeDocument(doc), doc.id);
    return doc;
  } else {
    // Insert new document
    const insertQuery = db.query(`
      INSERT INTO ${tableName} (data) 
      VALUES (?)
    `);
    const result = insertQuery.run(serializeDocument(doc));
    return { ...doc, id: Number(result.lastInsertRowid) } as T;
  }
}

// Save many documents in a transaction
export async function saveMany<T extends Document>(...items: (T | T[])[]): Promise<T[]> {
  const docs = flattenArray(items);
  if (docs.length === 0) return [];
  
  const constructor = docs[0].constructor as Constructor<T>;
  const db = getDatabase();
  const tableName = getCollectionName(constructor);
  ensureTable(constructor);
  
  return db.transaction(() => {
    const results: T[] = [];
    for (const doc of docs) {
      if (doc.id) {
        // Update existing document
        const updateQuery = db.query(`
          UPDATE ${tableName} 
          SET data = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `);
        updateQuery.run(serializeDocument(doc), doc.id);
        results.push(doc);
      } else {
        // Insert new document
        const insertQuery = db.query(`
          INSERT INTO ${tableName} (data) 
          VALUES (?)
        `);
        const result = insertQuery.run(serializeDocument(doc));
        results.push({ ...doc, id: Number(result.lastInsertRowid) } as T);
      }
    }
    return results;
  })();
}

// Update many documents
export async function updateMany<T extends Document>(
  filter: Filter<T>,
  update: UpdateOperators<T>,
  options: UpdateOptions = {},
  classConstructor?: Constructor<T>
): Promise<UpdateResult> {
  if (!update.$set) {
    throw new Error("$set operator is required for updateMany");
  }
  
  if (!classConstructor) {
    throw new Error("Class constructor is required for updateMany operation");
  }
  
  const db = getDatabase();
  const tableName = getCollectionName(classConstructor);
  ensureTable(classConstructor);
  
  return db.transaction(() => {
    let modifiedCount = 0;
    let upsertedCount = 0;
    let upsertedId: number | undefined;
    
    // Find existing documents
    const { whereClause, params } = buildWhereClause(filter, tableName);
    const selectQuery = db.query(`SELECT * FROM ${tableName} ${whereClause}`);
    const existingRows = selectQuery.all(...params) as { id: number; data: string }[];
    
    if (existingRows.length === 0 && options.upsert) {
      // Create new document if upsert is true
      const newDoc = { ...filter, ...update.$set } as T;
      const insertQuery = db.query(`INSERT INTO ${tableName} (data) VALUES (?)`);
      const result = insertQuery.run(serializeDocument(newDoc));
      upsertedCount = 1;
      upsertedId = Number(result.lastInsertRowid);
    } else {
      // Update existing documents
      for (const row of existingRows) {
        const doc = deserializeDocument<T>(row);
        const updatedDoc = { ...doc, ...update.$set };
        
        const updateQuery = db.query(`
          UPDATE ${tableName} 
          SET data = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `);
        updateQuery.run(serializeDocument(updatedDoc), row.id);
        modifiedCount++;
        
        if (!options.multi) break;
      }
    }
    
    return {
      acknowledged: true,
      modifiedCount,
      upsertedCount,
      upsertedId
    };
  })();
}

// Delete many documents
export async function deleteMany<T extends Document>(
  filter: Filter<T>,
  classConstructor?: Constructor<T>
): Promise<DeleteResult> {
  if (!classConstructor) {
    throw new Error("Class constructor is required for deleteMany operation");
  }
  
  const db = getDatabase();
  const tableName = getCollectionName(classConstructor);
  ensureTable(classConstructor);
  
  const { whereClause, params } = buildWhereClause(filter, tableName);
  
  return db.transaction(() => {
    // Count documents to be deleted
    const countQuery = db.query(`SELECT COUNT(*) as count FROM ${tableName} ${whereClause}`);
    const countResult = countQuery.get(...params) as { count: number };
    
    // Delete documents
    const deleteQuery = db.query(`DELETE FROM ${tableName} ${whereClause}`);
    deleteQuery.run(...params);
    
    return {
      acknowledged: true,
      deletedCount: countResult.count
    };
  })();
}
