// Query builder to translate MongoDB queries to SQL
import type { QueryFilter, FindOptions } from './types.js';

export class QueryBuilder {
  private static operators = {
    $eq: '=',
    $ne: '!=',
    $gt: '>',
    $gte: '>=',
    $lt: '<',
    $lte: '<=',
    $in: 'IN',
    $nin: 'NOT IN',
    $exists: 'IS NOT NULL',
    $regex: 'REGEXP'
  };

  static buildWhereClause(filter: QueryFilter): { sql: string; params: any[] } {
    if (!filter || Object.keys(filter).length === 0) {
      return { sql: '', params: [] };
    }

    const conditions: string[] = [];
    const params: any[] = [];

    for (const [field, value] of Object.entries(filter)) {
      const { condition, conditionParams } = this.buildFieldCondition(field, value);
      if (condition.trim()) {
        conditions.push(condition);
        params.push(...conditionParams);
      }
    }

    return {
      sql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      params
    };
  }

  private static buildFieldCondition(field: string, value: any): { condition: string; conditionParams: any[] } {
    const params: any[] = [];

    // Handle ObjectId comparison
    if (field === '_id') {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return this.buildOperatorCondition('_id', value, params);
      }
      return {
        condition: '_id = ?',
        conditionParams: [value?.toString() || value]
      };
    }

    // Handle nested field access (e.g., "user.name")
    const jsonPath = field.includes('.') 
      ? `JSON_EXTRACT(data, '$.${field}')` 
      : `JSON_EXTRACT(data, '$.${field}')`;

    // Handle operator objects
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const operatorKeys = Object.keys(value).filter(key => key.startsWith('$'));
      if (operatorKeys.length > 0) {
        return this.buildOperatorCondition(jsonPath, value, params);
      }
    }

    // Handle array values (should be JSON)
    if (Array.isArray(value)) {
      return {
        condition: `${jsonPath} = ?`,
        conditionParams: [JSON.stringify(value)]
      };
    }

    // Simple equality - for primitives, compare directly; for objects, use JSON
    const compareValue = (value === null || typeof value !== 'object') ? value : JSON.stringify(value);
    return {
      condition: `${jsonPath} = ?`,
      conditionParams: [compareValue]
    };
  }

  private static buildOperatorCondition(field: string, operators: any, params: any[]): { condition: string; conditionParams: any[] } {
    const conditions: string[] = [];

    for (const [operator, operatorValue] of Object.entries(operators)) {
      switch (operator) {
        case '$eq':
          conditions.push(`${field} = ?`);
          params.push(typeof operatorValue === 'object' ? JSON.stringify(operatorValue) : operatorValue);
          break;
        
        case '$ne':
          conditions.push(`${field} != ?`);
          params.push(typeof operatorValue === 'object' ? JSON.stringify(operatorValue) : operatorValue);
          break;
        
        case '$gt':
        case '$gte':
        case '$lt':
        case '$lte':
          const sqlOp = this.operators[operator as keyof typeof this.operators];
          conditions.push(`${field} ${sqlOp} ?`);
          params.push(operatorValue);
          break;
        
        case '$in':
          if (Array.isArray(operatorValue)) {
            if (field.includes('JSON_EXTRACT')) {
              // For JSON fields, check if the value is in the array using JSON_EACH
              const fieldName = field.replace('JSON_EXTRACT(data, \'$.', '').replace('\')', '');
              const valueChecks = operatorValue.map(() => 
                `EXISTS (SELECT 1 FROM JSON_EACH(data, '$.${fieldName}') WHERE value = ?)`
              );
              conditions.push(`(${valueChecks.join(' OR ')})`);
              params.push(...operatorValue);
            } else {
              const placeholders = operatorValue.map(() => '?').join(', ');
              conditions.push(`${field} IN (${placeholders})`);
              params.push(...operatorValue);
            }
          }
          break;
        
        case '$nin':
          if (Array.isArray(operatorValue)) {
            const placeholders = operatorValue.map(() => '?').join(', ');
            conditions.push(`${field} NOT IN (${placeholders})`);
            params.push(...operatorValue);
          }
          break;
        
        case '$exists':
          if (operatorValue) {
            conditions.push(`${field} IS NOT NULL`);
          } else {
            conditions.push(`${field} IS NULL`);
          }
          break;
        
        case '$regex':
          // Use LIKE with SQL pattern matching as fallback if REGEXP not available
          conditions.push(`${field} LIKE ?`);
          // Convert regex pattern to SQL LIKE pattern (basic conversion)
          let likePattern = (operatorValue as string).toString();
          // Convert common regex patterns to LIKE patterns
          if (likePattern.startsWith('^')) {
            likePattern = likePattern.slice(1) + '%';
          } else if (likePattern.endsWith('$')) {
            likePattern = '%' + likePattern.slice(0, -1);
          } else {
            likePattern = '%' + likePattern + '%';
          }
          params.push(likePattern);
          break;
      }
    }

    return {
      condition: conditions.join(' AND '),
      conditionParams: params
    };
  }

  static buildOrderClause(sort?: Record<string, 1 | -1>): string {
    if (!sort || Object.keys(sort).length === 0) {
      return '';
    }

    const orderParts = Object.entries(sort).map(([field, direction]) => {
      const column = field === '_id' ? '_id' : `JSON_EXTRACT(data, '$.${field}')`;
      const dir = direction === 1 ? 'ASC' : 'DESC';
      return `${column} ${dir}`;
    });

    return `ORDER BY ${orderParts.join(', ')}`;
  }

  static buildLimitClause(options?: FindOptions): string {
    const parts: string[] = [];
    
    // SQLite requires LIMIT before OFFSET
    if (options?.limit !== undefined) {
      parts.push(`LIMIT ${options.limit}`);
      if (options?.skip !== undefined) {
        parts.push(`OFFSET ${options.skip}`);
      }
    } else if (options?.skip !== undefined) {
      // If we have OFFSET but no LIMIT, we need to use a very large LIMIT
      parts.push(`LIMIT 999999999 OFFSET ${options.skip}`);
    }
    
    return parts.join(' ');
  }

  static buildProjection(projection?: Record<string, 0 | 1>): string {
    // Always return full data - we'll handle projection in the application layer
    return '_id, data';
  }
}
