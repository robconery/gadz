# 🚀 Gadz

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/Bun-1.0+-000000?logo=bun&logoColor=white)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![SQLite](https://img.shields.io/badge/SQLite-3.0+-003B57?logo=sqlite&logoColor=white)](https://sqlite.org/)

A MongoDB-compatible API with SQLite backend for TypeScript applications. Provides type-safe document storage with familiar MongoDB query syntax.

## ✨ Features

- **MongoDB-Style API**: Use familiar MongoDB operations like `find()`, `save()`, `updateMany()`
- **Type Safety**: Full TypeScript support with generic types
- **SQLite Backend**: Fast, embedded database with WAL mode for concurrent access
- **Connection Pooling**: Production-ready connection management
- **Collection Class**: ActiveRecord-style ORM pattern
- **Query Operators**: Support for `$gt`, `$lt`, `$in`, `$exists`, and more
- **Transactions**: Built-in transaction support for data consistency

## 📦 Installation

```bash
bun add gadz
```

## 🎯 Quick Start

### Functional API

```typescript
import { connect, save, find, get } from "gadz";

// Connect to database
await connect({ path: "db/app.db" });

// Define your model
class User {
  email: string;
  name?: string;
  age: number = 18;
  active: boolean = true;

  constructor(data: { email: string; name?: string; age?: number }) {
    this.email = data.email;
    this.name = data.name;
    if (data.age) this.age = data.age;
  }
}

// Save documents
const user = new User({ email: "john@example.com", age: 25 });
const saved = await save(user);

// Query documents
const users = await find<User>({ age: { $gt: 18 } });
const user = await get<User>(User, 1);
```

### Collection Class API

```typescript
import { Collection, connect } from "gadz";

await connect({ path: "db/app.db" });

class User extends Collection<User> {
  email: string;
  name?: string;
  age: number;
  active: boolean;

  constructor(data: { email: string; name?: string; age: number; active?: boolean }) {
    super();
    this.email = data.email;
    this.name = data.name;
    this.age = data.age;
    this.active = data.active ?? true;
  }
}

// Static methods
const users = await User.find({ age: { $gt: 18 } });
const user = await User.findOne({ email: "john@example.com" });
const found = await User.get(1);

// Instance methods
const user = new User({ email: "jane@example.com", age: 30 });
await user.save();
await user.delete();
await user.reload();

// Bulk operations
await User.saveMany(user1, user2, user3);
await User.updateMany({ active: false }, { $set: { active: true } });
await User.deleteMany({ age: { $lt: 18 } });
```

## 🔍 Query Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `$eq` | Equal to | `{ age: { $eq: 25 } }` |
| `$ne` | Not equal to | `{ status: { $ne: "inactive" } }` |
| `$gt` | Greater than | `{ age: { $gt: 18 } }` |
| `$gte` | Greater than or equal | `{ age: { $gte: 21 } }` |
| `$lt` | Less than | `{ age: { $lt: 65 } }` |
| `$lte` | Less than or equal | `{ age: { $lte: 64 } }` |
| `$in` | In array | `{ status: { $in: ["active", "pending"] } }` |
| `$nin` | Not in array | `{ role: { $nin: ["admin", "super"] } }` |
| `$exists` | Field exists | `{ phone: { $exists: true } }` |

## ⚙️ Configuration

```typescript
import { connect } from "gadz";

await connect({
  path: "db/production.db",           // Database file path
  poolMin: 2,                         // Minimum pool connections
  poolMax: 10,                        // Maximum pool connections
  poolAcquireTimeoutMs: 30000,        // Connection timeout
  poolIdleTimeoutMs: 300000,          // Idle timeout
  maintenanceIntervalMs: 300000       // Maintenance interval
});
```

## 🧪 Testing

```bash
bun test
```

All tests use isolated in-memory databases for fast, reliable testing.

## 📝 API Reference

### Connection Management
- `connect(config?)` - Connect to database
- `close()` - Close all connections
- `isConnected()` - Check connection status

### Functional API
- `save<T>(document, options?)` - Save/upsert document
- `get<T>(constructor, id)` - Get document by ID
- `find<T>(constructor, filter?, options?)` - Find multiple documents
- `findOne<T>(constructor, filter?)` - Find single document
- `updateMany<T>(constructor, filter, update, options?)` - Update multiple
- `deleteMany<T>(constructor, filter)` - Delete multiple
- `raw<T>(sql)` - Execute raw SQL

### Collection Class
- Static: `find()`, `findOne()`, `get()`, `saveMany()`, `updateMany()`, `deleteMany()`
- Instance: `save()`, `delete()`, `reload()`, `toJSON()`, `toObject()`

## 📊 Performance

- **WAL Mode**: Concurrent read/write operations
- **Connection Pooling**: Efficient resource management
- **JSON Storage**: Flexible document structure
- **Optimized Queries**: Proper indexing on ID and timestamps

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.