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

// TODO: Core operations (to be implemented)
// export { 
//   get, 
//   find, 
//   findOne, 
//   where, 
//   save, 
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
