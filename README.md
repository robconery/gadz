# 🥁 Bongo

A MongoDB-compatible API with SQLite backend for Bun and Node.js. Get the familiar MongoDB developer experience with the simplicity and performance of SQLite.

## Features

- **📦 MongoDB-Compatible API**: Drop-in replacement for basic MongoDB operations
- **🚀 SQLite Backend**: Fast, serverless, and self-contained database
- **🔧 Zero Configuration**: Works out of the box with sensible defaults
- **💾 File or Memory**: Support for both file-based and in-memory databases
- **🔍 Rich Querying**: Support for MongoDB query operators ($gt, $lt, $in, etc.)
- **📊 Indexing**: Create indexes for better query performance
- **🧪 TypeScript**: Full TypeScript support with type definitions
- **⚡ Bun Optimized**: Built specifically for Bun runtime

## Installation

```bash
bun add bongo
```

## Quick Start

```typescript
import { BongoClient } from 'bongo';

// Create client
const client = new BongoClient({
  filename: './myapp.db' // or ':memory:' for in-memory
});

// Get database and collection
const db = client.db('myapp');
const users = db.collection('users');

// Insert documents
const result = users.insertOne({
  name: 'John Doe',
  email: 'john@example.com',
  age: 30
});

// Query documents
const user = users.findOne({ email: 'john@example.com' });
const youngUsers = users.find({ age: { $lt: 25 } });

// Update documents
users.updateOne(
  { email: 'john@example.com' },
  { $set: { age: 31 } }
);

// Delete documents
users.deleteOne({ email: 'john@example.com' });

// Clean up
await client.close();
```

## API Reference

### BongoClient

```typescript
const client = new BongoClient(options);
```

**Options:**
- `filename?: string` - Database file path (default: ':memory:')
- `readonly?: boolean` - Open in read-only mode
- `timeout?: number` - Query timeout in milliseconds
- `verbose?: boolean` - Log SQL queries

**Methods:**
- `db(name: string): BongoDatabase` - Get database instance
- `connect(): Promise<void>` - Connect to database (compatibility method)
- `close(): Promise<void>` - Close all connections
- `listDatabases()` - List all databases

### BongoDatabase

**Methods:**
- `collection(name: string): BongoCollection` - Get collection instance
- `createCollection(name: string): BongoCollection` - Create collection
- `dropCollection(name: string): Promise<boolean>` - Drop collection
- `listCollections(): string[]` - List all collections
- `stats()` - Get database statistics

### BongoCollection

#### Insert Operations
```typescript
insertOne(document: Document): InsertOneResult
insertMany(documents: Document[]): InsertManyResult
```

#### Find Operations
```typescript
findOne(filter?: QueryFilter, options?: FindOptions): Document | null
find(filter?: QueryFilter, options?: FindOptions): Document[]
countDocuments(filter?: QueryFilter): number
```

**FindOptions:**
- `limit?: number` - Limit number of results
- `skip?: number` - Skip number of documents
- `sort?: Record<string, 1 | -1>` - Sort order
- `projection?: Record<string, 0 | 1>` - Field projection

#### Update Operations
```typescript
updateOne(filter: QueryFilter, update: any, options?: UpdateOptions): UpdateResult
updateMany(filter: QueryFilter, update: any, options?: UpdateOptions): UpdateResult
```

**Update Operators:**
- `$set` - Set field values
- `$unset` - Remove fields
- `$inc` - Increment numeric values

#### Delete Operations
```typescript
deleteOne(filter: QueryFilter): DeleteResult
deleteMany(filter: QueryFilter): DeleteResult
```

#### Index Operations
```typescript
createIndex(indexSpec: IndexSpec, options?: CreateIndexOptions): string
dropIndex(indexName: string): void
```

## Query Operators

Bongo supports most common MongoDB query operators:

### Comparison Operators
- `$eq` - Equal to
- `$ne` - Not equal to
- `$gt` - Greater than
- `$gte` - Greater than or equal
- `$lt` - Less than
- `$lte` - Less than or equal
- `$in` - In array
- `$nin` - Not in array

### Logical Operators
- `$exists` - Field exists

### Examples

```typescript
// Comparison queries
users.find({ age: { $gt: 18 } });
users.find({ age: { $gte: 18, $lt: 65 } });
users.find({ status: { $in: ['active', 'pending'] } });

// Existence queries
users.find({ phone: { $exists: true } });

// Nested field queries
users.find({ 'address.city': 'San Francisco' });

// Complex queries
users.find({
  age: { $gte: 18 },
  status: 'active',
  'profile.verified': true
});
```

## ObjectId

Bongo includes a MongoDB-compatible ObjectId implementation:

```typescript
import { BongoObjectId } from 'bongo';

// Generate new ObjectId
const id = new BongoObjectId();

// Create from string
const id2 = new BongoObjectId('507f1f77bcf86cd799439011');

// Utility methods
console.log(id.toString()); // Hex string
console.log(id.getTimestamp()); // Creation date
console.log(BongoObjectId.isValid('507f1f77bcf86cd799439011')); // true
```

## Advanced Usage

### Raw SQL Access

For advanced use cases, you can access the underlying SQLite connection:

```typescript
const client = new BongoClient({ filename: './app.db' });
const connection = client.getSQLiteConnection('mydb');

// Execute raw SQL
const results = client.executeSQL('mydb', 'SELECT * FROM users WHERE age > ?', [18]);
```

### Transactions

Bongo leverages SQLite's transaction support automatically for multi-document operations.

### Performance Tips

1. **Create Indexes**: Use `createIndex()` for frequently queried fields
2. **Use Projections**: Limit returned fields with projection options
3. **Batch Operations**: Use `insertMany()` for bulk inserts
4. **File vs Memory**: Use file-based databases for persistence, memory for temporary data

## Limitations

- **Aggregation Pipeline**: Not yet implemented
- **GridFS**: Not supported (use file system instead)
- **Regex Queries**: Depends on SQLite build (may require extension)
- **Transactions**: Limited to single collection operations
- **Replica Sets**: Not applicable (SQLite is single-node)

## Running Examples

```bash
# Run the example
bun run example

# Run tests
bun test

# Watch mode during development
bun run dev
```

## Contributing

1. Fork the repository
2. Create your feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Why Bongo?

- **Familiar API**: Use MongoDB knowledge with SQLite performance
- **Zero Dependencies**: No MongoDB server setup required
- **Single File**: Entire database in one file (or memory)
- **ACID Compliance**: SQLite's proven reliability
- **Cross Platform**: Works everywhere SQLite works
- **Embedded**: Perfect for desktop apps, mobile apps, and edge computing

Bongo is perfect for:
- Desktop applications
- Mobile applications  
- Edge computing
- Development and testing
- Small to medium web applications
- Data analysis and prototyping

Get started with Bongo today! 🥁

## Model Class with Generics

Bongo also provides a powerful Model class with TypeScript generics for even more developer-friendly, type-safe operations:

```typescript
import { BongoClient, BongoModel, BaseDocument } from 'bongo';

// Define your document interface
interface User extends BaseDocument {
  name: string;
  email: string;
  age: number;
  status: 'active' | 'inactive';
  profile: {
    bio: string;
    location: string;
  };
}

// Create client and model
const client = new BongoClient({ filename: './app.db' });
const db = client.db('myapp');
const UserModel = new BongoModel<User>(db.collection('users'), 'User');

// Type-safe operations
const user = UserModel.create({
  name: 'John Doe',
  email: 'john@example.com',
  age: 30,
  status: 'active',
  profile: {
    bio: 'Developer',
    location: 'SF'
  }
});

// Fluent query builder with full TypeScript support
const activeUsers = UserModel
  .query()
  .where('status', 'active')
  .gte('age', 18)
  .sort('name', 1)
  .limit(10)
  .exec();

// Convenient methods
const user = UserModel.findById('...');
const exists = UserModel.exists({ email: 'john@example.com' });
const count = UserModel.countDocuments({ status: 'active' });
const locations = UserModel.distinct('profile.location');
```

### Model Features

- **Full Type Safety**: TypeScript generics ensure compile-time type checking
- **Fluent Query Builder**: Chainable methods for building complex queries
- **Automatic Timestamps**: Optional `createdAt` and `updatedAt` fields
- **Model Registry**: Register and retrieve models globally
- **Convenient Methods**: `exists()`, `distinct()`, `countDocuments()`, etc.
- **Validation Hooks**: Built-in validation system (extensible)
- **Direct Collection Access**: Access underlying collection for advanced operations

Run `bun run model-example.ts` to see the Model class in action!
