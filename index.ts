// Connection management
export { connect, close, getDatabase, collections } from "./src/connection.js";

// Core operations
export { 
  get, 
  find, 
  findOne, 
  where, 
  save, 
  saveMany, 
  updateMany, 
  deleteMany 
} from "./src/operations.js";

// Validation and indexing
export { 
  isUnique, 
  createIndex, 
  unique, 
  checkConstraint 
} from "./src/validation.js";

// Raw SQL
export { raw } from "./src/raw.js";

// Types
export type {
  Filter,
  UpdateOperators,
  UpdateOptions,
  FindOptions,
  IndexOptions,
  Document,
  Constructor,
  UpdateResult,
  DeleteResult,
  ComparisonOperators,
  LogicalOperators,
  QueryOperators
} from "./src/types.js";
