import { withConnection } from "./connection";

/**
 * Ensure a table exists with the standard schema
 * This is a shared utility to avoid repeating table creation logic
 */
export async function ensureTable(tableName: string): Promise<void> {
  await withConnection(async (connection) => {
    // Create table if it doesn't exist with id and data columns
    connection.db.exec(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create trigger to update updated_at
    connection.db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_${tableName}_updated_at
      AFTER UPDATE ON ${tableName}
      FOR EACH ROW
      BEGIN
        UPDATE ${tableName} SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END
    `);
  });
}
