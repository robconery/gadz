// Bongo - MongoDB-compatible API with SQLite backend
export { BongoClient } from './src/client.js';
export { BongoDatabase } from './src/database.js';
export { BongoCollection } from './src/collection.js';
export { BongoObjectId } from './src/objectid.js';
export { QueryBuilder } from './src/query-builder.js';

export type {
  Document,
  InsertOneResult,
  InsertManyResult,
  UpdateResult,
  DeleteResult,
  FindOptions,
  UpdateOptions,
  QueryFilter,
  IndexSpec,
  CreateIndexOptions,
  ObjectId
} from './src/types.js';

export type { 
  BongoClientOptions 
} from './src/client.js';

export type {
  BaseDocument,
  ModelOptions
} from './src/model.js';

// Default export for convenience
import { BongoClient } from './src/client.js';
export default BongoClient;