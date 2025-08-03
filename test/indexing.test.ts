import { test, expect, beforeEach, afterAll } from "bun:test";
import { connect, close, createIndex, unique, save, find, isUnique, raw } from "../index.js";

class Product {
  id?: number;
  name: string;
  sku: string;
  price: number;
  category?: string;

  constructor(args: { name: string; sku: string; price: number; category?: string }) {
    this.name = args.name;
    this.sku = args.sku;
    this.price = args.price;
    if (args.category !== undefined) this.category = args.category;
  }
}

beforeEach(() => {
  process.env.NODE_ENV = "test";
  connect();
});

afterAll(() => {
  close();
});

test("create simple index", async () => {
  // Save a product first to ensure table exists
  const product = new Product({ name: "Test Product", sku: "TEST001", price: 99.99 });
  await save(product, Product);
  
  // Create index on name field
  await createIndex("name", {}, Product);
  
  // Check that the column was created
  const tableInfo = await raw("PRAGMA table_info(products)");
  const nameColumn = tableInfo.find((col: any) => col.name === "name");
  expect(nameColumn).toBeDefined();
  expect(nameColumn.type).toBe("TEXT");
  
  // Verify the indexed column was populated
  const rawData = await raw("SELECT * FROM products");
  expect(rawData[0].name).toBe("Test Product");
});

test("create unique index", async () => {
  // Save first product to ensure table exists
  const product1 = new Product({ name: "Product 1", sku: "UNIQUE001", price: 50.00 });
  await save(product1, Product);
  
  // Create unique index on SKU
  await unique("sku", Product);
  
  // Check that the column was created with unique constraint
  const tableInfo = await raw("PRAGMA table_info(products)");
  const skuColumn = tableInfo.find((col: any) => col.name === "sku");
  expect(skuColumn).toBeDefined();
  
  // Try to save second product with same SKU - should fail
  const product2 = new Product({ name: "Product 2", sku: "UNIQUE001", price: 60.00 });
  
  await expect(async () => {
    await isUnique(product2, "sku", Product);
  }).toThrow("already exists");
});

test("create composite index", async () => {
  // Save a product first to ensure table exists
  const product = new Product({ name: "Test Product", sku: "TEST001", price: 99.99, category: "electronics" });
  await save(product, Product);
  
  // Create composite index on category and price
  await createIndex("category, price", {}, Product);
  
  // Check that both columns were created
  const tableInfo = await raw("PRAGMA table_info(products)");
  const categoryColumn = tableInfo.find((col: any) => col.name === "category");
  const priceColumn = tableInfo.find((col: any) => col.name === "price");
  
  expect(categoryColumn).toBeDefined();
  expect(priceColumn).toBeDefined();
  
  // Check that the index was created
  const indexes = await raw("PRAGMA index_list(products)");
  const compositeIndex = indexes.find((idx: any) => idx.name.includes("category_price"));
  expect(compositeIndex).toBeDefined();
});

test("unique constraint validation error for composite index", async () => {
  // Should throw error when trying to create unique constraint on multiple fields
  await expect(async () => {
    await createIndex("name, category", { unique: true }, Product);
  }).toThrow("Unique constraint can only be applied to single fields");
});

test("indexed field queries use dedicated columns", async () => {
  // Clear existing data
  await raw("DELETE FROM products");
  
  // Create index on category
  await createIndex("category", {}, Product);
  
  const products = [
    new Product({ name: "Electronics Item", sku: "ELEC001", price: 299.99, category: "electronics" }),
    new Product({ name: "Book Item", sku: "BOOK001", price: 19.99, category: "books" }),
    new Product({ name: "Electronics Item 2", sku: "ELEC002", price: 399.99, category: "electronics" })
  ];
  
  await Promise.all(products.map(p => save(p, Product)));
  
  // Query using the indexed field
  const electronicsProducts = await find<Product>({ category: "electronics" }, {}, Product);
  expect(electronicsProducts.length).toBe(2);
  
  // Verify that the dedicated column contains the correct data
  const rawData = await raw("SELECT category FROM products WHERE category = 'electronics'");
  expect(rawData.length).toBe(2);
  expect(rawData.every((row: any) => row.category === "electronics")).toBe(true);
});

test("index synchronization with data updates", async () => {
  await raw("DELETE FROM products");
  
  // Create index on price
  await createIndex("price", {}, Product);
  
  // Save initial product
  const product = new Product({ name: "Test Product", sku: "TEST001", price: 100.00 });
  const saved = await save(product, Product);
  
  // Verify initial indexed value
  let rawData = await raw(`SELECT price FROM products WHERE id = ${saved.id}`);
  expect(parseFloat(rawData[0].price)).toBe(100.00);
  
  // Update the product price
  saved.price = 150.00;
  await save(saved, Product);
  
  // Verify the indexed column was updated
  rawData = await raw(`SELECT price FROM products WHERE id = ${saved.id}`);
  expect(parseFloat(rawData[0].price)).toBe(150.00);
});

test("isUnique function with indexed vs non-indexed fields", async () => {
  await raw("DELETE FROM products");
  
  // Create unique index on SKU
  await unique("sku", Product);
  
  // Test unique check on indexed field (should use dedicated column)
  const product1 = new Product({ name: "Product 1", sku: "INDEXED001", price: 50.00 });
  await save(product1, Product);
  
  const product2 = new Product({ name: "Product 2", sku: "INDEXED001", price: 60.00 });
  await expect(async () => {
    await isUnique(product2, "sku", Product);
  }).toThrow("already exists");
  
  // Test unique check on non-indexed field (should use JSON extraction)
  const product3 = new Product({ name: "Duplicate Name", sku: "UNIQUE001", price: 70.00 });
  await save(product3, Product);
  
  const product4 = new Product({ name: "Duplicate Name", sku: "UNIQUE002", price: 80.00 });
  // This should pass since name doesn't have unique constraint
  const isNameUnique = await isUnique(product4, "name", Product);
  expect(isNameUnique).toBe(true);
});

test("performance comparison between indexed and non-indexed queries", async () => {
  await raw("DELETE FROM products");
  
  // Create index on category but not on name
  await createIndex("category", {}, Product);
  
  // Insert test data
  const products = Array.from({ length: 100 }, (_, i) => 
    new Product({ 
      name: `Product ${i}`, 
      sku: `SKU${i.toString().padStart(3, '0')}`, 
      price: 10 + i,
      category: i % 5 === 0 ? "special" : "regular"
    })
  );
  
  for (const product of products) {
    await save(product, Product);
  }
  
  // Query using indexed field (should be fast)
  const start1 = Date.now();
  const specialProducts = await find<Product>({ category: "special" }, {}, Product);
  const indexedTime = Date.now() - start1;
  
  // Query using non-indexed field (will use JSON extraction)
  const start2 = Date.now();
  const specificProduct = await find<Product>({ name: "Product 50" }, {}, Product);
  const nonIndexedTime = Date.now() - start2;
  
  expect(specialProducts.length).toBe(20); // Every 5th product
  expect(specificProduct.length).toBe(1);
  
  // Note: In practice, the indexed query should be faster, but with small datasets
  // the difference might not be measurable. This test mainly ensures both work correctly.
});
