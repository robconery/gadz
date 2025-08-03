# Instructions

The SQLite database will live in `db/dev.db`
NEVER edit `package.json` to add modules, ALWAYS run `npm i` or `bun add`

## The MongoDB API for SQLite

I'm trying to put a type-safe abstraction over SQLite to turn it into a viable document database. Here is a sample API:

```ts
import {get, find, findOne, where, save, saveMany, delete, deleteMany, isUnique} from "gadz"

class User {
  email: string!
  name: string?
  aga: number = 10;
  active: true

  contructor(args){
    email = args.email;
    //rest of assignments, checking if present
  }

  async _validate(){
    await isUnique(this, "email"); //will throw if not
    //more checks here
  }
}

//operations
const userOne = await get(1);
const activeUsers = await find<User>({active: true});
const activeUser = await findOne<User>({active: true});
const oldUsers = await where<User>({
  "$gt": {ag}
})

```

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
find<User>({ age: { $gt: 18 } });
find<User>({ age: { $gte: 18, $lt: 65 } });
find<User>({ status: { $in: ['active', 'pending'] } });

// Existence queries
find<User>({ phone: { $exists: true } });

// Nested field queries
find<User>({ 'address.city': 'San Francisco' });

// Complex queries
find<User>({
  age: { $gte: 18 },
  status: 'active',
  'profile.verified': true
});
```