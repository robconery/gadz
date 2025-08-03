// Query operators
export interface ComparisonOperators<T> {
  $eq?: T;
  $ne?: T;
  $gt?: T;
  $gte?: T;
  $lt?: T;
  $lte?: T;
  $in?: T[];
  $nin?: T[];
}

export interface LogicalOperators {
  $exists?: boolean;
}

export type QueryOperators<T> = ComparisonOperators<T> & LogicalOperators;

// Query filter type
export type Filter<T> = {
  [P in keyof T]?: T[P] | QueryOperators<T[P]>;
} & {
  [key: string]: any;
};

// Update operators
export interface UpdateOperators<T> {
  $set?: Partial<T>;
  $unset?: { [P in keyof T]?: 1 | true }[];
  $inc?: { [P in keyof T]?: number };
}

// Options for operations
export interface FindOptions {
  limit?: number;
  skip?: number;
  sort?: Record<string, 1 | -1>;
}

export interface UpdateOptions {
  upsert?: boolean;
  multi?: boolean;
}

export interface IndexOptions {
  unique?: boolean;
}

// Document with optional id
export interface Document {
  id?: number;
  [key: string]: any;
}

// Constructor type for classes
export type Constructor<T = {}> = new (...args: any[]) => T;

// Result types
export interface UpdateResult {
  acknowledged: boolean;
  modifiedCount: number;
  upsertedCount: number;
  upsertedId?: number;
}

export interface DeleteResult {
  acknowledged: boolean;
  deletedCount: number;
}
