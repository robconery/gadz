// Comprehensive tests for query building and edge cases
import { test, expect, describe } from 'bun:test';
import { QueryBuilder } from '../src/query-builder.js';

describe('QueryBuilder', () => {
  describe('buildWhereClause', () => {
    test('should handle empty filter', () => {
      const result = QueryBuilder.buildWhereClause({});
      expect(result.sql).toBe('');
      expect(result.params).toHaveLength(0);
    });

    test('should handle null filter', () => {
      const result = QueryBuilder.buildWhereClause(null as any);
      expect(result.sql).toBe('');
      expect(result.params).toHaveLength(0);
    });

    test('should handle undefined filter', () => {
      const result = QueryBuilder.buildWhereClause(undefined as any);
      expect(result.sql).toBe('');
      expect(result.params).toHaveLength(0);
    });

    test('should handle simple equality', () => {
      const result = QueryBuilder.buildWhereClause({ name: 'John' });
      expect(result.sql).toBe("WHERE JSON_EXTRACT(data, '$.name') = ?");
      expect(result.params).toEqual(['John']);
    });

    test('should handle _id field specially', () => {
      const result = QueryBuilder.buildWhereClause({ _id: 'abc123' });
      expect(result.sql).toBe('WHERE _id = ?');
      expect(result.params).toEqual(['abc123']);
    });

    test('should handle nested fields', () => {
      const result = QueryBuilder.buildWhereClause({ 'user.profile.name': 'John' });
      expect(result.sql).toBe("WHERE JSON_EXTRACT(data, '$.user.profile.name') = ?");
      expect(result.params).toEqual(['John']);
    });

    test('should handle array values', () => {
      const result = QueryBuilder.buildWhereClause({ tags: ['a', 'b'] });
      expect(result.sql).toBe("WHERE JSON_EXTRACT(data, '$.tags') = ?");
      expect(result.params).toEqual(['["a","b"]']);
    });

    test('should handle object values', () => {
      const result = QueryBuilder.buildWhereClause({ profile: { name: 'John', age: 30 } });
      expect(result.sql).toBe("WHERE JSON_EXTRACT(data, '$.profile') = ?");
      expect(result.params).toEqual(['{"name":"John","age":30}']);
    });

    test('should handle null values', () => {
      const result = QueryBuilder.buildWhereClause({ value: null });
      expect(result.sql).toBe("WHERE JSON_EXTRACT(data, '$.value') = ?");
      expect(result.params).toEqual([null]);
    });

    test('should handle boolean values', () => {
      const result = QueryBuilder.buildWhereClause({ active: true });
      expect(result.sql).toBe("WHERE JSON_EXTRACT(data, '$.active') = ?");
      expect(result.params).toEqual([true]);
    });

    test('should handle multiple conditions', () => {
      const result = QueryBuilder.buildWhereClause({ 
        name: 'John', 
        age: 30,
        active: true 
      });
      expect(result.sql).toContain('WHERE');
      expect(result.sql).toContain('AND');
      expect(result.params).toHaveLength(3);
    });

    test('should handle $gt operator', () => {
      const result = QueryBuilder.buildWhereClause({ age: { $gt: 18 } });
      expect(result.sql).toBe("WHERE JSON_EXTRACT(data, '$.age') > ?");
      expect(result.params).toEqual([18]);
    });

    test('should handle $gte operator', () => {
      const result = QueryBuilder.buildWhereClause({ age: { $gte: 18 } });
      expect(result.sql).toBe("WHERE JSON_EXTRACT(data, '$.age') >= ?");
      expect(result.params).toEqual([18]);
    });

    test('should handle $lt operator', () => {
      const result = QueryBuilder.buildWhereClause({ age: { $lt: 65 } });
      expect(result.sql).toBe("WHERE JSON_EXTRACT(data, '$.age') < ?");
      expect(result.params).toEqual([65]);
    });

    test('should handle $lte operator', () => {
      const result = QueryBuilder.buildWhereClause({ age: { $lte: 65 } });
      expect(result.sql).toBe("WHERE JSON_EXTRACT(data, '$.age') <= ?");
      expect(result.params).toEqual([65]);
    });

    test('should handle $ne operator', () => {
      const result = QueryBuilder.buildWhereClause({ status: { $ne: 'inactive' } });
      expect(result.sql).toBe("WHERE JSON_EXTRACT(data, '$.status') != ?");
      expect(result.params).toEqual(['inactive']);
    });

    test('should handle $in operator', () => {
      const result = QueryBuilder.buildWhereClause({ status: { $in: ['active', 'pending'] } });
      expect(result.sql).toContain('EXISTS (SELECT 1 FROM JSON_EACH(data');
      expect(result.params).toEqual(['active', 'pending']);
    });

    test('should handle $nin operator', () => {
      const result = QueryBuilder.buildWhereClause({ status: { $nin: ['inactive', 'banned'] } });
      expect(result.sql).toContain('NOT IN');
      expect(result.params).toEqual(['inactive', 'banned']);
    });

    test('should handle $exists operator', () => {
      const result = QueryBuilder.buildWhereClause({ phone: { $exists: true } });
      expect(result.sql).toBe("WHERE JSON_EXTRACT(data, '$.phone') IS NOT NULL");
      expect(result.params).toHaveLength(0);
    });

    test('should handle $exists false', () => {
      const result = QueryBuilder.buildWhereClause({ phone: { $exists: false } });
      expect(result.sql).toBe("WHERE JSON_EXTRACT(data, '$.phone') IS NULL");
      expect(result.params).toHaveLength(0);
    });

    test('should handle $regex operator', () => {
      const result = QueryBuilder.buildWhereClause({ email: { $regex: '.*@gmail\\.com' } });
      expect(result.sql).toBe("WHERE JSON_EXTRACT(data, '$.email') LIKE ?");
      expect(result.params).toEqual(['%.*@gmail\\.com%']);
    });

    test('should handle multiple operators on same field', () => {
      const result = QueryBuilder.buildWhereClause({ 
        age: { $gte: 18, $lt: 65 } 
      });
      expect(result.sql).toContain('>=');
      expect(result.sql).toContain('<');
      expect(result.sql).toContain('AND');
      expect(result.params).toEqual([18, 65]);
    });

    test('should handle complex nested conditions', () => {
      const result = QueryBuilder.buildWhereClause({
        name: 'John',
        age: { $gte: 18, $lt: 65 },
        status: { $in: ['active', 'pending'] },
        'profile.verified': true
      });
      expect(result.sql).toContain('WHERE');
      expect(result.sql.split('AND')).toHaveLength(5);
    });

    test('should handle _id with operators', () => {
      const result = QueryBuilder.buildWhereClause({ 
        _id: { $in: ['id1', 'id2', 'id3'] } 
      });
      expect(result.sql).toBe('WHERE _id IN (?, ?, ?)');
      expect(result.params).toEqual(['id1', 'id2', 'id3']);
    });

    test('should handle empty arrays in $in', () => {
      const result = QueryBuilder.buildWhereClause({ 
        status: { $in: [] } 
      });
      // Should handle gracefully - exact behavior may vary
      expect(result.sql).toContain('WHERE');
    });
  });

  describe('buildOrderClause', () => {
    test('should handle empty sort', () => {
      const result = QueryBuilder.buildOrderClause();
      expect(result).toBe('');
    });

    test('should handle null sort', () => {
      const result = QueryBuilder.buildOrderClause(null as any);
      expect(result).toBe('');
    });

    test('should handle undefined sort', () => {
      const result = QueryBuilder.buildOrderClause(undefined);
      expect(result).toBe('');
    });

    test('should handle empty sort object', () => {
      const result = QueryBuilder.buildOrderClause({});
      expect(result).toBe('');
    });

    test('should handle ascending sort', () => {
      const result = QueryBuilder.buildOrderClause({ name: 1 });
      expect(result).toBe("ORDER BY JSON_EXTRACT(data, '$.name') ASC");
    });

    test('should handle descending sort', () => {
      const result = QueryBuilder.buildOrderClause({ age: -1 });
      expect(result).toBe("ORDER BY JSON_EXTRACT(data, '$.age') DESC");
    });

    test('should handle _id sort specially', () => {
      const result = QueryBuilder.buildOrderClause({ _id: 1 });
      expect(result).toBe('ORDER BY _id ASC');
    });

    test('should handle multiple sort fields', () => {
      const result = QueryBuilder.buildOrderClause({ 
        status: 1, 
        name: -1,
        age: 1 
      });
      expect(result).toContain('ORDER BY');
      expect(result).toContain('ASC');
      expect(result).toContain('DESC');
      expect(result).toContain('status');
      expect(result).toContain('name');
      expect(result).toContain('age');
    });

    test('should handle nested field sort', () => {
      const result = QueryBuilder.buildOrderClause({ 'profile.name': 1 });
      expect(result).toBe("ORDER BY JSON_EXTRACT(data, '$.profile.name') ASC");
    });
  });

  describe('buildLimitClause', () => {
    test('should handle no options', () => {
      const result = QueryBuilder.buildLimitClause();
      expect(result).toBe('');
    });

    test('should handle empty options', () => {
      const result = QueryBuilder.buildLimitClause({});
      expect(result).toBe('');
    });

    test('should handle limit only', () => {
      const result = QueryBuilder.buildLimitClause({ limit: 10 });
      expect(result).toBe('LIMIT 10');
    });

    test('should handle skip only', () => {
      const result = QueryBuilder.buildLimitClause({ skip: 5 });
      expect(result).toBe('LIMIT 999999999 OFFSET 5');
    });

    test('should handle both limit and skip', () => {
      const result = QueryBuilder.buildLimitClause({ limit: 10, skip: 5 });
      expect(result).toBe('LIMIT 10 OFFSET 5');
    });

    test('should handle zero values', () => {
      const result = QueryBuilder.buildLimitClause({ limit: 0, skip: 0 });
      expect(result).toBe('LIMIT 0 OFFSET 0');
    });

    test('should handle large numbers', () => {
      const result = QueryBuilder.buildLimitClause({ 
        limit: 1000000, 
        skip: 500000 
      });
      expect(result).toBe('LIMIT 1000000 OFFSET 500000');
    });
  });

  describe('buildProjection', () => {
    test('should always return basic projection', () => {
      const result = QueryBuilder.buildProjection();
      expect(result).toBe('_id, data');
    });

    test('should handle empty projection', () => {
      const result = QueryBuilder.buildProjection({});
      expect(result).toBe('_id, data');
    });

    test('should handle null projection', () => {
      const result = QueryBuilder.buildProjection(null as any);
      expect(result).toBe('_id, data');
    });

    test('should handle include projection', () => {
      const result = QueryBuilder.buildProjection({ name: 1, email: 1 });
      expect(result).toBe('_id, data');
    });

    test('should handle exclude projection', () => {
      const result = QueryBuilder.buildProjection({ password: 0 });
      expect(result).toBe('_id, data');
    });

    // Note: Projection is handled at application level, so SQL always returns full data
  });
});
