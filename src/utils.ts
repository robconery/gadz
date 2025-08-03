import pluralize from "pluralize";
import { getDatabase } from "./connection.js";
import type { Constructor, Filter, QueryOperators } from "./types.js";

export function getCollectionName<T>(classConstructor: Constructor<T>): string {
  return pluralize(classConstructor.name.toLowerCase());
}

export function ensureTable<T>(classConstructor: Constructor<T>): void {
  const db = getDatabase();
  const tableName = getCollectionName(classConstructor);
  
  // Create table if it doesn't exist
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;
  
  db.exec(createTableQuery);
}

export function buildWhereClause(filter: Filter<any>, tableName?: string): { whereClause: string; params: any[] } {
  if (!filter || Object.keys(filter).length === 0) {
    return { whereClause: "", params: [] };
  }

  const db = getDatabase();
  const conditions: string[] = [];
  const params: any[] = [];
  
  // Get table info to check for dedicated columns
  let columnNames: string[] = [];
  if (tableName) {
    try {
      const columns = db.query(`PRAGMA table_info(${tableName})`).all() as any[];
      columnNames = columns.map(col => col.name);
    } catch (error) {
      // Table might not exist yet, ignore
    }
  }

  for (const [key, value] of Object.entries(filter)) {
    const hasColumn = columnNames.includes(key);
    const fieldRef = hasColumn ? key : `JSON_EXTRACT(data, '$.${key}')`;
    
    if (value && typeof value === "object" && !Array.isArray(value)) {
      // Handle query operators
      const operators = value as QueryOperators<any>;
      
      for (const [op, opValue] of Object.entries(operators)) {
        switch (op) {
          case "$eq":
            conditions.push(`${fieldRef} = ?`);
            params.push(opValue);
            break;
          case "$ne":
            conditions.push(`${fieldRef} != ?`);
            params.push(opValue);
            break;
          case "$gt":
            conditions.push(`${fieldRef} > ?`);
            params.push(opValue);
            break;
          case "$gte":
            conditions.push(`${fieldRef} >= ?`);
            params.push(opValue);
            break;
          case "$lt":
            conditions.push(`${fieldRef} < ?`);
            params.push(opValue);
            break;
          case "$lte":
            conditions.push(`${fieldRef} <= ?`);
            params.push(opValue);
            break;
          case "$in":
            if (Array.isArray(opValue) && opValue.length > 0) {
              const placeholders = opValue.map(() => "?").join(",");
              conditions.push(`${fieldRef} IN (${placeholders})`);
              params.push(...opValue);
            }
            break;
          case "$nin":
            if (Array.isArray(opValue) && opValue.length > 0) {
              const placeholders = opValue.map(() => "?").join(",");
              conditions.push(`${fieldRef} NOT IN (${placeholders})`);
              params.push(...opValue);
            }
            break;
          case "$exists":
            if (opValue) {
              conditions.push(`${fieldRef} IS NOT NULL`);
            } else {
              conditions.push(`${fieldRef} IS NULL`);
            }
            break;
        }
      }
    } else {
      // Direct value comparison
      conditions.push(`${fieldRef} = ?`);
      params.push(value);
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { whereClause, params };
}

export function serializeDocument(doc: any): string {
  const { id, ...data } = doc;
  return JSON.stringify(data);
}

export function deserializeDocument<T>(row: { id: number; data: string; created_at?: string; updated_at?: string }): T & { id: number } {
  const data = JSON.parse(row.data);
  return { id: row.id, ...data };
}

export function flattenArray<T>(items: (T | T[])[]): T[] {
  const result: T[] = [];
  for (const item of items) {
    if (Array.isArray(item)) {
      result.push(...item);
    } else {
      result.push(item);
    }
  }
  return result;
}
