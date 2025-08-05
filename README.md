# 🚀 Gadz

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![SQLite](https://img.shields.io/badge/SQLite-3.0+-003B57?logo=sqlite&logoColor=white)](https://sqlite.org/)
[![Jest](https://img.shields.io/badge/Jest-29+-C21325?logo=jest&logoColor=white)](https://jestjs.io/)

A MongoDB-compatible API with SQLite backend for TypeScript applications. Provides type-safe document storage with familiar MongoDB query syntax.

Built for Node.js 18+ with better-sqlite3 for optimal performance and reliability.

## ✨ Features

- **MongoDB-Style API**: Use familiar MongoDB operations like `find()`, `save()`, `updateMany()`
- **Type Safety**: Full TypeScript support with generic types
- **SQLite Backend**: Fast, embedded database with WAL mode for concurrent access (powered by better-sqlite3)
- **Multi-Process Ready**: Optimized for concurrent access across multiple Node.js processes
- **Collection Class**: ActiveRecord-style ORM pattern
- **Query Operators**: Support for `$gt`, `$lt`, `$in`, `$exists`, and more
- **Built-in Validation**: Automatic document validation with `_validate()` method and uniqueness checks
- **Transactions**: Built-in transaction support with nested transaction capability

## 📋 Requirements

- **Node.js**: 18.0.0 or higher
- **TypeScript**: 5.0.0 or higher (peer dependency)

## 📦 Installation

```bash
npm install gadz
```

## 🎯 Quick Start

### Functional API

```typescript
import { connect, save, find, get, where } from "gadz";

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

// Raw SQL WHERE clauses
const adults = await where(User, "age > ?", [18]);
const activeUsers = await where(User, "active = ? AND age > ?", [true, 21]);
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

// Raw SQL WHERE clauses (also available on Collection classes)
const adults = await User.where("age > ?", [18]);
const activeAdults = await User.where("age > ? AND active = ?", [18, true]);

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

## 🎯 Raw SQL WHERE Clauses

The `where()` method supports both MongoDB-style filters and raw SQL WHERE clauses with automatic JSON field conversion. This gives you the flexibility to write SQL-like queries while maintaining type safety.

### Basic WHERE Clauses

```typescript
import { where } from "gadz";

// Simple field comparisons (automatically converted to JSON_EXTRACT)
const adults = await where(User, "age > ?", [18]);
const activeUsers = await where(User, "active = ?", [true]);
const gmailUsers = await where(User, "email LIKE ?", ["%@gmail.com"]);

// Complex conditions
const eligibleUsers = await where(User, "age >= ? AND active = ?", [21, true]);
const searchResults = await where(User, "name LIKE ? OR email LIKE ?", ["%john%", "%john%"]);
```

### Nested Field Access

```typescript
// Dot notation for nested objects
const verifiedUsers = await where(User, "profile.verified = ?", [true]);
const nyUsers = await where(User, "address.city = ?", ["New York"]);
const premiumMembers = await where(User, "subscription.tier = ? AND subscription.active = ?", ["premium", true]);
```

### Advanced SQL Operations

```typescript
// IN and NOT IN operations
const teamMembers = await where(User, "role IN (?, ?)", ["admin", "moderator"]);
const excludedUsers = await where(User, "status NOT IN (?, ?)", ["banned", "suspended"]);

// NULL checks
const usersWithPhones = await where(User, "phone IS NOT NULL");
const incompleteProfiles = await where(User, "profile.bio IS NULL");

// Complex boolean logic
const targetAudience = await where(User, "(age BETWEEN ? AND ?) AND (active = ? OR premium = ?)", [25, 45, true, true]);
```

### Query Options

```typescript
// Combine WHERE clauses with sorting, limiting, and pagination
const results = await where(
  User, 
  "age > ? AND active = ?", 
  [18, true], 
  { 
    sort: { created_at: -1 }, 
    limit: 10, 
    skip: 20 
  }
);

// Alternative syntax when no params needed
const allActive = await where(User, "active = 1", [], { sort: { name: 1 } });
```

### Automatic JSON_EXTRACT Conversion

Behind the scenes, Gadz automatically converts field references to proper SQLite JSON operations:

```typescript
// You write this:
await where(User, "age > ? AND profile.verified = ?", [25, true]);

// Gadz converts it to:
// WHERE CAST(JSON_EXTRACT(data, '$.age') AS REAL) > ? AND JSON_EXTRACT(data, '$.profile.verified') = ?
```

### System Columns

System columns (`id`, `created_at`, `updated_at`) are used directly without JSON conversion:

```typescript
// Direct column access (no JSON_EXTRACT needed)
const recentUsers = await where(User, "created_at > ?", ["2024-01-01"]);
const specificUser = await where(User, "id = ?", [123]);
const updatedRecently = await where(User, "updated_at > ? AND active = ?", ["2024-12-01", true]);
```

### WHERE Keyword Handling

The method intelligently handles the WHERE keyword:

```typescript
// These are all equivalent:
await where(User, "age > ?", [18]);           // Adds WHERE automatically
await where(User, "WHERE age > ?", [18]);     // Uses as-is
await where(User, "where age > ?", [18]);     // Case-insensitive detection
```

### Mixing with MongoDB-Style Queries

You can still use the original MongoDB-style syntax - both approaches work seamlessly:

```typescript
// MongoDB-style (original)
const users1 = await where(User, { age: { $gt: 18 }, active: true });

// SQL-style (new)
const users2 = await where(User, "age > ? AND active = ?", [18, true]);

// Both return the same results!
```

## ✅ Validation

Gadz supports automatic document validation through the `_validate()` method. When you define this method in your classes, it will be automatically called before saving documents.

### Basic Validation

```typescript
class User {
  email: string;
  age: number;
  name?: string;

  constructor(data: { email: string; age: number; name?: string }) {
    this.email = data.email;
    this.age = data.age;
    this.name = data.name;
  }

  async _validate(): Promise<void> {
    // Required field validation
    if (!this.email || this.email.length === 0) {
      throw new Error("Email is required");
    }

    // Business logic validation
    if (this.age < 0 || this.age > 120) {
      throw new Error("Age must be between 0 and 120");
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.email)) {
      throw new Error("Invalid email format");
    }
  }
}

// Validation runs automatically on save
const user = new User({ email: "invalid-email", age: 25 });
await save(user); // Throws: "Invalid email format"
```

### Uniqueness Validation

Use the `isUnique()` helper function to ensure field uniqueness:

```typescript
import { isUnique } from "gadz";

class User {
  email: string;
  username: string;

  constructor(data: { email: string; username: string }) {
    this.email = data.email;
    this.username = data.username;
  }

  async _validate(): Promise<void> {
    // Check email uniqueness
    const emailUnique = await isUnique(this, "email");
    if (!emailUnique) {
      throw new Error(`Email '${this.email}' already exists`);
    }

    // Check username uniqueness
    const usernameUnique = await isUnique(this, "username");
    if (!usernameUnique) {
      throw new Error(`Username '${this.username}' is taken`);
    }
  }
}
```

### Validation Return Types

Your `_validate()` method can:

1. **Throw an Error**: Validation fails with specific message
2. **Return `false`**: Generic validation failure
3. **Return nothing/undefined**: Validation passes
4. **Return truthy value**: Validation passes

```typescript
class Product {
  name: string;
  price: number;

  constructor(data: { name: string; price: number }) {
    this.name = data.name;
    this.price = data.price;
  }

  async _validate(): Promise<boolean> {
    // Return false for generic failure
    if (this.price <= 0) return false;
    
    // Return true for success
    return this.name.length > 0;
  }
}
```

### Validation with Updates

The `isUnique()` function automatically handles updates by excluding the current document from uniqueness checks:

```typescript
// Save initial user
const user = new User({ email: "john@example.com", username: "john" });
const saved = await save(user);

// Update same user - validation passes
saved.username = "john_updated";
await save(saved); // ✅ Works - excludes current document from uniqueness check

// Try to create new user with same email
const newUser = new User({ email: "john@example.com", username: "different" });
await save(newUser); // ❌ Throws: Email already exists
```

### Inheritance and Custom Validation

```typescript
class BaseUser {
  email: string;
  
  constructor(data: { email: string }) {
    this.email = data.email;
  }

  async _validate(): Promise<void> {
    if (!this.email) {
      throw new Error("Email is required");
    }
  }
}

class AdminUser extends BaseUser {
  permissions: string[];

  constructor(data: { email: string; permissions: string[] }) {
    super(data);
    this.permissions = data.permissions;
  }

  async _validate(): Promise<void> {
    // Call parent validation first
    await super._validate();

    // Add admin-specific validation
    if (!this.permissions || this.permissions.length === 0) {
      throw new Error("Admin users must have at least one permission");
    }

    if (!this.permissions.includes('admin')) {
      throw new Error("Admin users must have admin permission");
    }
  }
}
```

### When Validation Runs

- ✅ Automatically before `save()` operations
- ✅ Automatically before `saveMany()` operations  
- ✅ Works with both functional API and Collection class
- ❌ Does **not** run on `updateMany()` operations (by design)

### Optional Validation

If a class doesn't define `_validate()`, documents save without validation:

```typescript
class SimpleData {
  value: string;
  
  constructor(data: { value: string }) {
    this.value = data.value;
  }
  
  // No _validate method - saves without validation
}

const data = new SimpleData({ value: "" });
await save(data); // ✅ Saves successfully
```

## ⚙️ Configuration

```typescript
import { connect } from "gadz";

await connect({
  path: "db/production.db",           // Database file path
  maintenanceIntervalMs: 300000       // Maintenance interval (optional)
});
```

### Multi-Process Support

Gadz is optimized for multi-process environments (PM2, cluster mode, etc.):

- **WAL Mode**: Enabled by default for concurrent read/write access
- **Busy Timeout**: 60-second timeout handles process coordination
- **Shared Cache**: Reduces memory usage across processes
- **Auto-Recovery**: Connections auto-reconnect on database locks

## 🧪 Testing

```bash
npm test
```

All tests use isolated in-memory databases for fast, reliable testing. The project uses Jest as the testing framework.

## 📝 API Reference

### Connection Management
- `connect(config?)` - Connect to database
- `close()` - Close database connection
- `isConnected()` - Check connection status
- `getConnectionStatus()` - Get detailed connection info

### Functional API
- `save<T>(document, options?)` - Save/upsert document
- `get<T>(constructor, id)` - Get document by ID
- `find<T>(constructor, filter?, options?)` - Find multiple documents
- `findOne<T>(constructor, filter?)` - Find single document
- `where<T>(constructor, whereClause, params?, options?)` - Query with SQL WHERE clauses or MongoDB filters
- `updateMany<T>(constructor, filter, update, options?)` - Update multiple
- `deleteMany<T>(constructor, filter)` - Delete multiple
- `isUnique<T>(document, fieldName)` - Check field uniqueness for validation
- `raw<T>(sql)` - Execute raw SQL

### Collection Class
- Static: `find()`, `findOne()`, `get()`, `where()`, `saveMany()`, `updateMany()`, `deleteMany()`
- Instance: `save()`, `delete()`, `reload()`, `toJSON()`, `toObject()`

## 📊 Performance

- **better-sqlite3**: High-performance synchronous SQLite driver for Node.js
- **WAL Mode**: Concurrent read/write operations across multiple processes
- **Single Connection**: One optimized connection per Node.js process
- **JSON Storage**: Flexible document structure with SQLite's JSON functions
- **Optimized Queries**: Proper indexing on ID and timestamps
- **Nested Transactions**: Savepoint-based transaction nesting for complex operations

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.