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

// TODO: Validation and indexing (to be implemented)
// export { 
//   isUnique, 
//   createIndex, 
//   unique, 
//   checkConstraint,
//   raw
// } from "./src/validation";
