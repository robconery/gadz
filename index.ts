// Connection management
export { 
  connect, 
  close, 
  collections, 
  withConnection, 
  withTransaction, 
  getPoolStatus, 
  isConnected, 
  maintenance,
  getDatabaseStats,
  type PooledDatabase, 
  type ConnectionConfig 
} from "./src/connection";

// Table utilities
export { 
  ensureTable 
} from "./src/table-utils";

// Core operations
export { 
  get, 
  find, 
  findOne,
  save,
  type Filter,
  type SaveOptions,
  type FindOptions,
  type DocumentWithMeta
} from "./src/operations";

// TODO: Additional operations (to be implemented)
// export { 
//   where, 
//   saveMany, 
//   updateMany, 
//   deleteMany 
// } from "./src/operations";

// Validation functions
export { 
  isUnique 
} from "./src/validation";

// TODO: Indexing and other validation (to be implemented)
// export { 
//   createIndex, 
//   unique, 
//   raw
// } from "./src/validation";
