# Gadz 🚀

A MongoDB-compatible API with SQLite backend for TypeScript applications. Gadz provides type-safe database operations with automatic collection name derivation from class constructors. 🎯

## Features ✨

- **🗃️ MongoDB-compatible API** - Familiar methods like `insertOne`, `findOne`, `updateMany`
- **⚡ SQLite backend** - Fast, reliable, and serverless database storage
- **🔒 Type-safe operations** - Full TypeScript support with generic types
- **🎨 Automatic collection naming** - Uses pluralized class names as collection names
- **✅ Built-in validation** - Supports both sync and async validation methods
- **🏃‍♂️ Bun-optimized** - Built for Bun runtime with Node.js compatibility
- **⚙️ Zero configuration** - Works out of the box with sensible defaults

## Installation 📦

```bash
bun add gadz
```

## Quick Start 🚀

```typescript
import { save, find, findOne, Client } from 'gadz';

// Define your model
class User {
  email!: string;
  name?: string;
  active!: boolean;
  
  constructor(args: { email: string; name?: string; active: boolean }) {
    this.email = args.email;
    this.name = args.name;
    this.active = args.active;
  }
}

// Save documents - collection name automatically derived as 'users'
const user = new User({ email: 'john@example.com', active: true });
await save(user);

// Query documents
const activeUsers = find(User, { active: true });
const john = findOne(User, { email: 'john@example.com' });
```

## API Reference 📚

### Document Operations 💾

#### `save<T>(document: T): Promise<InsertOneResult>` 💾
Saves a single document to the database.

```typescript
const user = new User({ email: 'jane@example.com', active: true });
const result = await save(user);
console.log(result.insertedId);
```

#### `saveMany<T>(documents: T[]): Promise<InsertManyResult>` 📝
Saves multiple documents in a transaction.

```typescript
const users = [
  new User({ email: 'user1@example.com', active: true }),
  new User({ email: 'user2@example.com', active: false })
];
const result = await saveMany(users);
console.log(result.insertedCount);
```

#### `get<T>(type: Constructor<T>, id: string | number): T | null` 🔍
Finds a document by its ID.

```typescript
const user = get(User, 'some-id');
```

#### `find<T>(type: Constructor<T>, filter?: QueryFilter, options?: FindOptions): T[]` 🔎
Finds multiple documents matching the filter.

```typescript
// Find all active users
const activeUsers = find(User, { active: true });

// With options
const recentUsers = find(User, {}, { limit: 10, sort: { _id: -1 } });
```

#### `findOne<T>(type: Constructor<T>, filter?: QueryFilter, options?: FindOptions): T | null` 🎯
Finds a single document matching the filter.

```typescript
const user = findOne(User, { email: 'john@example.com' });
```

#### `isUnique<T>(type: Constructor<T>, filter: QueryFilter): boolean` ✨
Checks if a value is unique in the collection.

```typescript
const emailIsUnique = isUnique(User, { email: 'new@example.com' });
```

### Query Builder 🏗️

#### `where<T>(type: Constructor<T>)` 🔧
Returns a query builder for advanced queries.

```typescript
const activeUsers = where(User).find({ active: true }, { limit: 5 });
const specificUser = where(User).findOne({ email: 'john@example.com' });
```

### Client Management ⚙️

#### `setDefaultClient(client: Client, databaseName?: string): void` 🔧
Sets a custom client and database for operations.

```typescript
const client = new Client({ filename: './my-database.db' });
setDefaultClient(client, 'production');
```

## Validation ✅

Gadz automatically calls `validate()` methods on your models before saving:

```typescript
class User {
  email!: string;
  active!: boolean;
  
  constructor(args: any) {
    Object.assign(this, args);
  }
  
  // Sync validation
  validate() {
    if (!this.email.includes('@')) {
      throw new Error('Invalid email format');
    }
  }
  
  // Or async validation
  async validate() {
    if (!this.email.includes('@')) {
      throw new Error('Invalid email format');
    }
    
    // Check uniqueness
    if (!isUnique(User, { email: this.email })) {
      throw new Error('Email already exists');
    }
  }
}
```

## Collection Naming 🏷️

Collection names are automatically derived from class names using pluralization:

- `User` → `users` 👤
- `Person` → `people` 👥
- `Company` → `companies` 🏢
- `Product` → `products` 📦

## Advanced Usage 🔧

### Custom Client Configuration ⚙️

```typescript
import { Client, setDefaultClient } from 'gadz';

// File-based database
const client = new Client({ filename: './app.db' });
setDefaultClient(client);

// In-memory database (default)
const memoryClient = new Client({ filename: ':memory:' });
setDefaultClient(memoryClient);
```

### Direct Database Access 🗃️

```typescript
import { Client } from 'gadz';

const client = new Client();
const db = client.db('myapp');
const collection = db.collection('users');

// MongoDB-style operations
const result = collection.insertOne({ name: 'John', email: 'john@example.com' });
const users = collection.find({ active: true });
```

### Raw SQL Access 💻

```typescript
const client = new Client();
const results = client.executeSQL('myapp', 'SELECT COUNT(*) FROM users');
```

## Testing 🧪

```bash
bun test
```

## Database File Location 📁

- **🔧 Development**: Uses in-memory database by default
- **🚀 Production**: Specify file path via `Client({ filename: './app.db' })`
- **📊 Multiple databases**: Each database name creates a separate file

## TypeScript Support 💪

Gadz is built with TypeScript and provides full type safety:

```typescript
// Type-safe queries
const users: User[] = find(User, { active: true });
const user: User | null = findOne(User, { email: 'john@example.com' });

// Type-safe results
const result: InsertOneResult = await save(user);
```

## Requirements 📋

- **🏃‍♂️ Bun** 1.0+ (recommended) or **🟢 Node.js** 18+
- **🔷 TypeScript** 5.0+

## License 📄

MIT

## Contributing 🤝

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on contributing to this project.