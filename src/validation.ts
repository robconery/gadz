import { withConnection } from "./connection";
import { ensureTable } from "./table-utils";
import pluralize from "pluralize";

/**
 * Get collection name from class constructor
 */
function getCollectionName<T>(constructor: new (...args: any[]) => T): string {
  return pluralize(constructor.name.toLowerCase());
}

/**
 * Get collection name from instance
 */
function getCollectionNameFromInstance(instance: any): string {
  return pluralize(instance.constructor.name.toLowerCase());
}

/**
 * Check if a field value is unique in the collection
 * Used in _validate methods to ensure uniqueness constraints
 */
export async function isUnique<T>(
  document: T,
  fieldName: string
): Promise<boolean> {
  const tableName = getCollectionNameFromInstance(document);
  const fieldValue = (document as any)[fieldName];
  const documentId = (document as any).id;
  
  // Ensure table exists before querying
  await ensureTable(tableName);
  
  return await withConnection(async (connection) => {
    let query: string;
    let params: any[];
    
    if (documentId) {
      // For updates, exclude the current document from the uniqueness check
      query = `
        SELECT COUNT(*) as count 
        FROM ${tableName} 
        WHERE JSON_EXTRACT(data, '$.${fieldName}') = ? AND id != ?
      `;
      params = [fieldValue, documentId];
    } else {
      // For new documents, check if any document has this value
      query = `
        SELECT COUNT(*) as count 
        FROM ${tableName} 
        WHERE JSON_EXTRACT(data, '$.${fieldName}') = ?
      `;
      params = [fieldValue];
    }
    
    const result = connection.db.prepare(query).get(...params) as { count: number };
    return result.count === 0;
  });
}

/**
 * Call the _validate method on a document if it exists
 * Returns true if validation passes, throws if validation fails
 */
export async function validateDocument<T>(document: T): Promise<void> {
  const validateMethod = (document as any)._validate;
  
  if (typeof validateMethod === 'function') {
    try {
      const result = await validateMethod.call(document);
      
      // If _validate returns false, throw an error
      if (result === false) {
        throw new Error('Document validation failed');
      }
      
      // If _validate returns a truthy value or undefined, validation passes
      // If it throws, let the error bubble up
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Validation failed: ${error}`);
    }
  }
  
  // If no _validate method exists, validation passes
}
