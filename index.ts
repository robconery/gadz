// Connection management
export { 
  connect, 
  close, 
  collections, 
  withConnection, 
  withTransaction, 
  getConnectionStatus, 
  isConnected, 
  maintenance,
  getDatabaseStats,
  resetConnection,
  type DatabaseConnection, 
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
  where,
  save,
  saveMany,
  updateMany,
  deleteMany,
  deleteOne,
  raw,
  type Filter,
  type SaveOptions,
  type FindOptions,
  type DocumentWithMeta
} from "./src/operations";

// Validation functions
export { 
  isUnique 
} from "./src/validation";

// Collection base class
export { 
  Collection 
} from "./src/collection";

// TODO: Indexing and other validation (to be implemented)
// export { 
//   createIndex, 
//   unique, 
//   raw
// } from "./src/validation";
