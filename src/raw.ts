import { getDatabase } from "./connection.js";

// Execute raw SQL queries
export async function raw<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const db = getDatabase();
  
  // Determine if this is a SELECT query or other type
  const trimmedSql = sql.trim().toLowerCase();
  const isSelect = trimmedSql.startsWith('select');
  
  if (isSelect) {
    const query = db.query(sql);
    return query.all(...params) as T[];
  } else {
    // For non-SELECT queries, execute and return empty array
    const query = db.query(sql);
    query.run(...params);
    return [];
  }
}
