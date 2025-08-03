import { test, expect, beforeEach, afterAll } from "bun:test";
import { connect, close, get, find, findOne, where, save, saveMany, updateMany, deleteMany } from "../index.js";

class User {
  id?: number;
  email: string;
  name?: string;
  age: number = 18;
  active: boolean = true;

  constructor(args: { email: string; name?: string; age?: number; active?: boolean }) {
    this.email = args.email;
    if (args.name !== undefined) this.name = args.name;
    if (args.age !== undefined) this.age = args.age;
    if (args.active !== undefined) this.active = args.active;
  }
}

beforeEach(() => {
  process.env.NODE_ENV = "test";
  connect();
});

afterAll(() => {
  close();
});

test("save and get operations", async () => {
  const user = new User({ email: "john@example.com", name: "John Doe", age: 25 });
  
  const saved = await save(user, User);
  expect(saved.id).toBeDefined();
  expect(saved.email).toBe("john@example.com");
  expect(saved.name).toBe("John Doe");
  expect(saved.age).toBe(25);
  
  const retrieved = await get<User>(saved.id!, User);
  expect(retrieved).toBeDefined();
  expect(retrieved!.email).toBe("john@example.com");
  expect(retrieved!.name).toBe("John Doe");
  expect(retrieved!.age).toBe(25);
});

test("find operations with filters", async () => {
  await deleteMany<User>({}, User);
  
  const users = [
    new User({ email: "user1@test.com", name: "User One", age: 20, active: true }),
    new User({ email: "user2@test.com", name: "User Two", age: 30, active: false }),
    new User({ email: "user3@test.com", name: "User Three", age: 25, active: true })
  ];
  
  await saveMany(...users);
  
  // Test find all
  const allUsers = await find<User>({}, {}, User);
  expect(allUsers.length).toBe(3);
  
  // Test find with filter
  const activeUsers = await find<User>({ active: true }, {}, User);
  expect(activeUsers.length).toBe(2);
  
  // Test findOne
  const firstActiveUser = await findOne<User>({ active: true }, User);
  expect(firstActiveUser).toBeDefined();
  expect(firstActiveUser!.active).toBe(true);
  
  // Test where function
  const whereResults = await where<User>({ age: 25 }, User);
  expect(whereResults.length).toBe(1);
  expect(whereResults[0].age).toBe(25);
});

test("comparison operators", async () => {
  await deleteMany<User>({}, User);
  
  const users = [
    new User({ email: "user1@test.com", age: 18 }),
    new User({ email: "user2@test.com", age: 25 }),
    new User({ email: "user3@test.com", age: 30 }),
    new User({ email: "user4@test.com", age: 35 })
  ];
  
  await saveMany(...users);
  
  // Test $gt
  const older = await find<User>({ age: { $gt: 25 } }, {}, User);
  expect(older.length).toBe(2);
  
  // Test $gte
  const olderOrEqual = await find<User>({ age: { $gte: 25 } }, {}, User);
  expect(olderOrEqual.length).toBe(3);
  
  // Test $lt
  const younger = await find<User>({ age: { $lt: 30 } }, {}, User);
  expect(younger.length).toBe(2);
  
  // Test $lte
  const youngerOrEqual = await find<User>({ age: { $lte: 25 } }, {}, User);
  expect(youngerOrEqual.length).toBe(2);
  
  // Test $ne
  const notTwentyFive = await find<User>({ age: { $ne: 25 } }, {}, User);
  expect(notTwentyFive.length).toBe(3);
  
  // Test $in
  const inAges = await find<User>({ age: { $in: [18, 30] } }, {}, User);
  expect(inAges.length).toBe(2);
  
  // Test $nin
  const notInAges = await find<User>({ age: { $nin: [18, 30] } }, {}, User);
  expect(notInAges.length).toBe(2);
});

test("existence operator", async () => {
  await deleteMany<User>({}, User);
  
  const users = [
    new User({ email: "user1@test.com", name: "Has Name" }),
    new User({ email: "user2@test.com" }) // No name
  ];
  
  await saveMany(...users);
  
  // Test $exists: true
  const withName = await find<User>({ name: { $exists: true } }, {}, User);
  expect(withName.length).toBe(1);
  expect(withName[0].name).toBe("Has Name");
  
  // Test $exists: false
  const withoutName = await find<User>({ name: { $exists: false } }, {}, User);
  expect(withoutName.length).toBe(1);
  expect(withoutName[0].name).toBeUndefined();
});

test("complex queries", async () => {
  await deleteMany<User>({}, User);
  
  const users = [
    new User({ email: "user1@test.com", age: 18, active: true }),
    new User({ email: "user2@test.com", age: 25, active: false }),
    new User({ email: "user3@test.com", age: 30, active: true }),
    new User({ email: "user4@test.com", age: 35, active: false })
  ];
  
  await saveMany(...users);
  
  // Test multiple conditions (AND)
  const activeAndOld = await find<User>({
    age: { $gte: 25 },
    active: true
  }, {}, User);
  expect(activeAndOld.length).toBe(1);
  expect(activeAndOld[0].age).toBe(30);
});

test("update operations", async () => {
  await deleteMany<User>({}, User);
  
  const user = new User({ email: "update@test.com", name: "Update Test", active: false });
  await save(user, User);
  
  const result = await updateMany<User>(
    { email: "update@test.com" },
    { $set: { active: true, age: 35 } },
    {},
    User
  );
  
  expect(result.acknowledged).toBe(true);
  expect(result.modifiedCount).toBe(1);
  
  const updated = await findOne<User>({ email: "update@test.com" }, User);
  expect(updated!.active).toBe(true);
  expect(updated!.age).toBe(35);
  expect(updated!.name).toBe("Update Test"); // Unchanged field
});

test("upsert operations", async () => {
  await deleteMany<User>({}, User);
  
  const result = await updateMany<User>(
    { email: "nonexistent@test.com" },
    { $set: { email: "nonexistent@test.com", name: "New User", age: 25 } },
    { upsert: true },
    User
  );
  
  expect(result.acknowledged).toBe(true);
  expect(result.upsertedCount).toBe(1);
  expect(result.upsertedId).toBeDefined();
  
  const created = await findOne<User>({ email: "nonexistent@test.com" }, User);
  expect(created).toBeDefined();
  expect(created!.name).toBe("New User");
  expect(created!.age).toBe(25);
});

test("delete operations", async () => {
  await deleteMany<User>({}, User);
  
  const users = [
    new User({ email: "delete1@test.com", age: 20 }),
    new User({ email: "delete2@test.com", age: 30 }),
    new User({ email: "keep@test.com", age: 40 })
  ];
  
  await saveMany(...users);
  
  const result = await deleteMany<User>({ age: { $lt: 35 } }, User);
  expect(result.acknowledged).toBe(true);
  expect(result.deletedCount).toBe(2);
  
  const remaining = await find<User>({}, {}, User);
  expect(remaining.length).toBe(1);
  expect(remaining[0].email).toBe("keep@test.com");
});

test("find options - sorting and pagination", async () => {
  await deleteMany<User>({}, User);
  
  const users = [
    new User({ email: "user3@test.com", name: "Charlie", age: 30 }),
    new User({ email: "user1@test.com", name: "Alice", age: 20 }),
    new User({ email: "user2@test.com", name: "Bob", age: 25 })
  ];
  
  await saveMany(...users);
  
  // Test sorting by age ascending
  const sortedByAge = await find<User>({}, { sort: { age: 1 } }, User);
  expect(sortedByAge[0].age).toBe(20);
  expect(sortedByAge[1].age).toBe(25);
  expect(sortedByAge[2].age).toBe(30);
  
  // Test sorting by age descending
  const sortedByAgeDesc = await find<User>({}, { sort: { age: -1 } }, User);
  expect(sortedByAgeDesc[0].age).toBe(30);
  expect(sortedByAgeDesc[1].age).toBe(25);
  expect(sortedByAgeDesc[2].age).toBe(20);
  
  // Test limit
  const limited = await find<User>({}, { limit: 2 }, User);
  expect(limited.length).toBe(2);
  
  // Test skip
  const skipped = await find<User>({}, { skip: 1, limit: 1 }, User);
  expect(skipped.length).toBe(1);
});
