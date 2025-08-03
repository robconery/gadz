# Instructions

 - The SQLite database will live in `db/dev.db`
 - NEVER edit `package.json` to add modules, ALWAYS run `npm i` or `bun add`
 - Try to adhere to the MongoDB API as much as possible, but types are more important.
 - SQLite will be managed using Bun's built-in SQLite stuff.
 - Divide and separate the functionality as needed, but the API for Gadz should come from one place: `index.ts` in the root.
 - DO NOT create extra documents, like READMEs, examples, or tests. I'll create those when ready
 - Tests should live in the `test` directory and use Bun's testing tools.

## Docs

Any time you create a markdown document, add emojis for readability and a bit of fun.

## The MongoDB API for SQLite

I'm trying to put a type-safe abstraction over SQLite to turn it into a viable document database. Here is a sample API:

```ts
import {
  get, 
  find, 
  findOne,
  where, 
  save, 
  saveMany, 
  delete, 
  deleteMany, 
  updateMany,
  isUnique, 
  raw
} from "gadz"

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
    return () => this.age > 0 && this.age < 120;
  }
}

//operations use generics, which use the pluralize package to figure out
//the collection name, which is the plural of the class name
const userOne = await get(1);
const activeUsers = await find<User>({active: true});
const activeUser = await findOne<User>({active: true});
const oldUsers = await where<User>({
  "$gt": {ag}
})

//save will UPSERT a document
await save(userOne)

//save many will UPSERT many documents in a transaction
//and accept a variadic argument which will be flattened to
//a single array
await saveMany(userOne,activeUsers,oldUsers)

//transactionally run a partial update
//ensure $set is present, throw if not
//filter is first argument
//options is the last argument and follows MongoDB
await updateMany<User>({active: false}, $set: {active: true}, {upsert: true})

//transaction as well
await deleteMany<User>({active: true})
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

// Complex queries using AND
find<User>({
  age: { $gte: 18 },
  status: 'active',
  'profile.verified': true
});
```

## Connection Management

This library needs to be usable in multi-process environments, with process managers like PM2. To that end, connections should:

 - Pooled using a pooling library.
 - Opened late, closed early and returned to the pool.

If we're saving a document, the flow should be something like this:

```ts
export function save = (doc) {
  //validations
  //check out the connection from the pool
  //run the query
  //release the connection to the pool
}
```

The connection manager should also manage connections with open transactions, using methods like `beginTransaction`, `commitTransaction`, and `rollbackTransaction`.

## Raw SQL

Pretty simple I suppose:

```ts
const users = await raw<User>("select * from users"); //typed return
//or more freeform
const emails = await raw<any>("select email from users"); //returns array
```

## Connection Management

The connection should be a singleton that is handled in a single location:

```ts
import {connect} from "gadz"

//create connection based on ENV 
let db = null;
if(process.env.NODE_ENV === "test"){
  //set db to in-memory
}else{
  //check if there's an ENV for SQLITE_PATH
  //if not, pop it in db/dev/db
}

//export a close function for the db var if it's created
//export the db client
//export the collections list as a function, which is a list of the tables
```