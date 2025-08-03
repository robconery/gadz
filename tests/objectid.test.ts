// Comprehensive tests for GadzObjectId
import { test, expect, describe } from 'bun:test';
import { GadzObjectId } from '../index.js';

describe('GadzObjectId', () => {
  test('should generate unique ObjectIds', () => {
    const id1 = new GadzObjectId();
    const id2 = new GadzObjectId();
    
    expect(id1.toString()).not.toBe(id2.toString());
    expect(id1.toString()).toHaveLength(24);
    expect(id2.toString()).toHaveLength(24);
  });

  test('should create from valid hex string', () => {
    const hexString = '507f1f77bcf86cd799439011';
    const id = new GadzObjectId(hexString);
    
    expect(id.toString()).toBe(hexString);
    expect(id.toHexString()).toBe(hexString);
  });

  test('should create from Buffer', () => {
    const buffer = Buffer.from('507f1f77bcf86cd799439011', 'hex');
    const id = new GadzObjectId(buffer);
    
    expect(id.toString()).toBe('507f1f77bcf86cd799439011');
  });

  test('should create from another ObjectId', () => {
    const id1 = new GadzObjectId();
    const id2 = new GadzObjectId(id1);
    
    expect(id1.toString()).toBe(id2.toString());
    expect(id1).not.toBe(id2); // Different instances
  });

  test('should throw on invalid string length', () => {
    expect(() => new GadzObjectId('invalid')).toThrow('Invalid ObjectId string');
    expect(() => new GadzObjectId('507f1f77bcf86cd79943901')).toThrow('Invalid ObjectId string'); // Too short
    expect(() => new GadzObjectId('507f1f77bcf86cd7994390112')).toThrow('Invalid ObjectId string'); // Too long
  });

  test('should throw on invalid hex characters', () => {
    expect(() => new GadzObjectId('507f1f77bcf86cd79943901g')).toThrow('Invalid ObjectId string');
    expect(() => new GadzObjectId('507f1f77bcf86cd79943901Z')).toThrow('Invalid ObjectId string');
  });

  test('should throw on invalid Buffer length', () => {
    const shortBuffer = Buffer.from('507f1f77bcf86cd799439', 'hex');
    const longBuffer = Buffer.from('507f1f77bcf86cd7994390112233', 'hex');
    
    expect(() => new GadzObjectId(shortBuffer)).toThrow('Invalid ObjectId buffer');
    expect(() => new GadzObjectId(longBuffer)).toThrow('Invalid ObjectId buffer');
  });

  test('should compare ObjectIds correctly', () => {
    const id1 = new GadzObjectId();
    const id2 = new GadzObjectId(id1);
    const id3 = new GadzObjectId();
    
    expect(id1.equals(id2)).toBe(true);
    expect(id1.equals(id3)).toBe(false);
    
    // String comparison
    expect(id1.equals(id1.toString())).toBe(true);
    expect(id1.equals(id3.toString())).toBe(false);
  });

  test('should extract timestamp correctly', () => {
    const beforeTime = new Date();
    const id = new GadzObjectId();
    const afterTime = new Date();
    
    const timestamp = id.getTimestamp();
    expect(timestamp.getTime()).toBeGreaterThanOrEqual(Math.floor(beforeTime.getTime() / 1000) * 1000);
    expect(timestamp.getTime()).toBeLessThanOrEqual(Math.ceil(afterTime.getTime() / 1000) * 1000);
  });

  test('should validate ObjectId strings', () => {
    expect(GadzObjectId.isValid('507f1f77bcf86cd799439011')).toBe(true);
    expect(GadzObjectId.isValid('invalid')).toBe(false);
    expect(GadzObjectId.isValid('')).toBe(false);
    expect(GadzObjectId.isValid('507f1f77bcf86cd79943901g')).toBe(false);
  });

  test('should validate ObjectId buffers', () => {
    const validBuffer = Buffer.from('507f1f77bcf86cd799439011', 'hex');
    const invalidBuffer = Buffer.from('507f1f77bcf86cd799439', 'hex');
    
    expect(GadzObjectId.isValid(validBuffer)).toBe(true);
    expect(GadzObjectId.isValid(invalidBuffer)).toBe(false);
  });

  test('should validate ObjectId instances', () => {
    const id = new GadzObjectId();
    expect(GadzObjectId.isValid(id)).toBe(true);
  });

  test('should generate sequential ObjectIds', () => {
    const ids = Array.from({ length: 10 }, () => new GadzObjectId());
    
    // All should have same timestamp (within same second)
    const timestamps = ids.map(id => id.getTimestamp().getTime());
    const uniqueTimestamps = [...new Set(timestamps)];
    expect(uniqueTimestamps.length).toBeLessThanOrEqual(2); // Allow for second boundary
    
    // All should be unique
    const hexStrings = ids.map(id => id.toString());
    const uniqueHexStrings = [...new Set(hexStrings)];
    expect(uniqueHexStrings.length).toBe(10);
  });

  test('should handle edge cases in construction', () => {
    // Undefined should create new ObjectId
    const id1 = new GadzObjectId(undefined);
    expect(id1.toString()).toHaveLength(24);
    
    // Empty string should throw
    expect(() => new GadzObjectId('')).toThrow();
    
    // Non-string, non-buffer, non-ObjectId should throw
    expect(() => new GadzObjectId(123 as any)).toThrow('Invalid ObjectId input');
    expect(() => new GadzObjectId({} as any)).toThrow('Invalid ObjectId input');
    expect(() => new GadzObjectId(null as any)).toThrow('Invalid ObjectId input');
  });

  test('should maintain counter correctly', () => {
    // Generate many ObjectIds quickly to test counter
    const ids = Array.from({ length: 1000 }, () => new GadzObjectId());
    const hexStrings = ids.map(id => id.toString());
    const uniqueHexStrings = [...new Set(hexStrings)];
    
    // All should be unique even when generated quickly
    expect(uniqueHexStrings.length).toBe(1000);
  });

  test('should handle toString and toHexString identically', () => {
    const id = new GadzObjectId();
    expect(id.toString()).toBe(id.toHexString());
  });
});
