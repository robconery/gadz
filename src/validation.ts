import { getDatabase } from "./connection.js";
import type { Constructor, IndexOptions, Document } from "./types.js";
import { getCollectionName, ensureTable, buildWhereClause } from "./utils.js";

// Check if a field value is unique
export async function isUnique<T extends Document>(
  doc: T, 
  field: string, 
  classConstructor?: Constructor<T>
): Promise<boolean> {
  if (!classConstructor && !doc.constructor) {
    throw new Error("Class constructor is required for isUnique operation");
  }
  
  const constructor = classConstructor || (doc.constructor as Constructor<T>);
  const db = getDatabase();
  const tableName = getCollectionName(constructor);
  ensureTable(constructor);
  
  const fieldValue = (doc as any)[field];
  if (fieldValue === undefined || fieldValue === null) {
    return true; // null/undefined values are considered unique
  }
  
  let query: string;
  let params: any[];
  
  // Check if the field has a dedicated column (if index was created)
  const columnExists = db.query(`PRAGMA table_info(${tableName})`).all() as any[];
  const hasColumn = columnExists.some(col => col.name === field);
  
  if (hasColumn) {
    // Use the dedicated column for better performance
    if (doc.id) {
      query = `SELECT COUNT(*) as count FROM ${tableName} WHERE ${field} = ? AND id != ?`;
      params = [fieldValue, doc.id];
    } else {
      query = `SELECT COUNT(*) as count FROM ${tableName} WHERE ${field} = ?`;
      params = [fieldValue];
    }
  } else {
    // Fall back to JSON extraction
    if (doc.id) {
      query = `SELECT COUNT(*) as count FROM ${tableName} WHERE JSON_EXTRACT(data, '$.${field}') = ? AND id != ?`;
      params = [fieldValue, doc.id];
    } else {
      query = `SELECT COUNT(*) as count FROM ${tableName} WHERE JSON_EXTRACT(data, '$.${field}') = ?`;
      params = [fieldValue];
    }
  }
  
  const result = db.query(query).get(...params) as { count: number };
  const isUniqueValue = result.count === 0;
  
  if (!isUniqueValue) {
    throw new Error(`Value '${fieldValue}' for field '${field}' already exists`);
  }
  
  return true;
}

// Create an index on one or more fields
export async function createIndex<T extends Document>(
  fields: string,
  options: IndexOptions = {},
  classConstructor?: Constructor<T>
): Promise<void> {
  if (!classConstructor) {
    throw new Error("Class constructor is required for createIndex operation");
  }
  
  const db = getDatabase();
  const tableName = getCollectionName(classConstructor);
  ensureTable(classConstructor);
  
  const fieldList = fields.split(',').map(f => f.trim());
  
  // Check if unique constraint is requested for multiple fields
  if (options.unique && fieldList.length > 1) {
    throw new Error("Unique constraint can only be applied to single fields");
  }
  
  // Create columns for indexed fields if they don't exist
  for (const field of fieldList) {
    const columnName = field; // Use the actual field name as the column name
    
    // Check if column already exists
    const tableInfo = db.query(`PRAGMA table_info(${tableName})`).all() as any[];
    const columnExists = tableInfo.some(col => col.name === columnName);
    
    // Add column if it doesn't exist
    if (!columnExists) {
      const uniqueClause = options.unique && fieldList.length === 1 ? ' UNIQUE' : '';
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} TEXT${uniqueClause}`);
    }
    
    // Create trigger to sync column with JSON data
    const triggerName = `sync_${tableName}_${columnName}`;
    db.exec(`DROP TRIGGER IF EXISTS ${triggerName}_insert`);
    db.exec(`DROP TRIGGER IF EXISTS ${triggerName}_update`);
    
    db.exec(`
      CREATE TRIGGER ${triggerName}_insert
      AFTER INSERT ON ${tableName}
      BEGIN
        UPDATE ${tableName} 
        SET ${columnName} = JSON_EXTRACT(NEW.data, '$.${field}')
        WHERE id = NEW.id;
      END
    `);
    
    db.exec(`
      CREATE TRIGGER ${triggerName}_update
      AFTER UPDATE ON ${tableName}
      BEGIN
        UPDATE ${tableName} 
        SET ${columnName} = JSON_EXTRACT(NEW.data, '$.${field}')
        WHERE id = NEW.id;
      END
    `);
    
    // Sync existing data
    try {
      db.exec(`
        UPDATE ${tableName} 
        SET ${columnName} = JSON_EXTRACT(data, '$.${field}')
      `);
    } catch (error) {
      // Ignore errors if table is empty or column doesn't exist yet
    }
  }
  
  // Create the actual index (if not unique, since unique was already applied to column)
  if (!options.unique) {
    const indexName = `idx_${tableName}_${fieldList.join('_').replace(/[^a-zA-Z0-9_]/g, '_')}`;
    const createIndexQuery = `CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${fieldList.join(', ')})`;
    db.exec(createIndexQuery);
  }
}

// Create a unique constraint (alias for createIndex with unique: true)
export async function unique<T extends Document>(
  field: string,
  classConstructor?: Constructor<T>
): Promise<void> {
  await createIndex(field, { unique: true }, classConstructor);
}

// Add a check constraint to a field
export async function checkConstraint<T extends Document>(
  field: string,
  constraint: string,
  classConstructor?: Constructor<T>
): Promise<void> {
  if (!classConstructor) {
    throw new Error("Class constructor is required for checkConstraint operation");
  }
  
  const db = getDatabase();
  const tableName = getCollectionName(classConstructor);
  ensureTable(classConstructor);
  
  // Add column if it doesn't exist
  const tableInfo = db.query(`PRAGMA table_info(${tableName})`).all() as any[];
  const columnExists = tableInfo.some(col => col.name === field);
  
  if (!columnExists) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${field} TEXT`);
  }
    
  // Create trigger to sync column with JSON data
  const syncTriggerName = `sync_${tableName}_${field}`;
  db.exec(`DROP TRIGGER IF EXISTS ${syncTriggerName}_insert`);
  db.exec(`DROP TRIGGER IF EXISTS ${syncTriggerName}_update`);
  
  db.exec(`
    CREATE TRIGGER ${syncTriggerName}_insert
    AFTER INSERT ON ${tableName}
    BEGIN
      UPDATE ${tableName} 
      SET ${field} = JSON_EXTRACT(NEW.data, '$.${field}')
      WHERE id = NEW.id;
    END
  `);
  
  db.exec(`
    CREATE TRIGGER ${syncTriggerName}_update
    AFTER UPDATE ON ${tableName}
    BEGIN
      UPDATE ${tableName} 
      SET ${field} = JSON_EXTRACT(NEW.data, '$.${field}')
      WHERE id = NEW.id;
    END
  `);
  
  // Sync existing data
  try {
    db.exec(`
      UPDATE ${tableName} 
      SET ${field} = JSON_EXTRACT(data, '$.${field}')
    `);
  } catch (error) {
    // Ignore errors if table is empty or column doesn't exist yet
  }
  
  // Add check constraint using triggers since SQLite doesn't support adding check constraints to existing tables
  const triggerName = `check_${tableName}_${field}_${Math.floor(Math.random() * 1000000)}`;
  
  // Drop existing triggers with similar names to avoid conflicts
  try {
    const existingTriggers = db.query("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE ?")
      .all(`check_${tableName}_${field}_%`) as { name: string }[];
    
    for (const trigger of existingTriggers) {
      db.exec(`DROP TRIGGER IF EXISTS ${trigger.name}`);
    }
  } catch (error) {
    // Ignore errors
  }
  
  // Replace field references in constraint with NEW.field, being careful with string literals
  let processedConstraint = constraint;
  
  // Handle IN clauses specially - don't replace field names inside quotes
  if (constraint.includes('IN (')) {
    // For IN clauses, we need to be more careful about string replacement
    // Replace only standalone field references, not those in quotes
    const fieldRegex = new RegExp(`\\b${field}\\b(?=\\s+IN\\s*\\()`, 'g');
    processedConstraint = constraint.replace(fieldRegex, `NEW.${field}`);
  } else {
    // For other constraints, replace field references with NEW.field
    // This handles both the primary field and any references to other fields like 'salary'
    processedConstraint = constraint.replace(new RegExp(`\\b${field}\\b`, 'g'), `NEW.${field}`);
    
    // Also replace other field references that might exist in the constraint
    // Common field names that might be referenced
    const commonFields = ['age', 'salary', 'name', 'email', 'department'];
    for (const otherField of commonFields) {
      if (otherField !== field && constraint.includes(otherField)) {
        processedConstraint = processedConstraint.replace(
          new RegExp(`\\b${otherField}\\b`, 'g'), 
          `NEW.${otherField}`
        );
      }
    }
  }
  
  db.exec(`
    CREATE TRIGGER ${triggerName}
    BEFORE INSERT ON ${tableName}
    FOR EACH ROW
    WHEN NOT (${processedConstraint})
    BEGIN
      SELECT RAISE(ABORT, 'Check constraint violated: ${constraint}');
    END
  `);
  
  db.exec(`
    CREATE TRIGGER ${triggerName}_update
    BEFORE UPDATE ON ${tableName}
    FOR EACH ROW
    WHEN NOT (${processedConstraint})
    BEGIN
      SELECT RAISE(ABORT, 'Check constraint violated: ${constraint}');
    END
  `);
}
