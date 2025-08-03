# Gadz

A MongoDB-compatible API with SQLite backend for TypeScript applications.

## The Model Idea

I want to create a model that looks like this:

```ts
import {saveMany, get, findOne, where, save} from "gadz"
class User {
  email: unique_string
  name: string
  active: boolean
  constructor(args){
    email = args.email;
    name = args.name ? name : null;
  }
}
const joe = new User({email: "joe@test.com"})
const jill = new User({email: "jill@test.com"})

//saveMany will reflect on joe and jill using
//pluralize to figure out their collection names
//everything runs in a transaction
//you can also save different types in here
save(joe);
saveMany([joe,jill]);
get<User>(1) //find by ID
find<User>({active: true})
findOne<User>({email: "joe@test.com"})
where<User> // the where bits
```