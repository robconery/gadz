// MongoDB-compatible types and interfaces
import { BongoObjectId } from './objectid.js';

export interface ObjectId {
  toString(): string;
  toHexString(): string;
  equals(other: ObjectId): boolean;
}

export interface Document {
  _id?: BongoObjectId | string;
  [key: string]: any;
}

export interface InsertOneResult {
  acknowledged: boolean;
  insertedId: BongoObjectId | string;
}

export interface InsertManyResult {
  acknowledged: boolean;
  insertedCount: number;
  insertedIds: (BongoObjectId | string)[];
}

export interface UpdateResult {
  acknowledged: boolean;
  matchedCount: number;
  modifiedCount: number;
  upsertedCount: number;
  upsertedId?: BongoObjectId | string;
}

export interface DeleteResult {
  acknowledged: boolean;
  deletedCount: number;
}

export interface FindOptions {
  limit?: number;
  skip?: number;
  sort?: Record<string, 1 | -1>;
  projection?: Record<string, 0 | 1>;
}

export interface UpdateOptions {
  upsert?: boolean;
  multi?: boolean;
}

export interface QueryFilter {
  [key: string]: any;
}

export interface AggregationPipeline {
  [key: string]: any;
}

export interface IndexSpec {
  [key: string]: 1 | -1 | "text";
}

export interface CreateIndexOptions {
  unique?: boolean;
  sparse?: boolean;
  name?: string;
}
