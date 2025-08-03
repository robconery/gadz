import { test, expect, beforeEach, afterAll } from "bun:test";
import { connect, close, checkConstraint, unique, save, raw } from "../index.js";

class Employee {
  id?: number;
  email: string;
  name: string;
  age: number;
  salary: number;
  department?: string;

  constructor(args: { email: string; name: string; age: number; salary: number; department?: string }) {
    this.email = args.email;
    this.name = args.name;
    this.age = args.age;
    this.salary = args.salary;
    if (args.department !== undefined) this.department = args.department;
  }
}

beforeEach(() => {
  process.env.NODE_ENV = "test";
  connect();
});

afterAll(() => {
  close();
});

test("unique constraint creation and enforcement", async () => {
  // Save an employee first to ensure table exists
  const tempEmployee = new Employee({ 
    email: "temp@company.com", 
    name: "Temp Employee", 
    age: 30, 
    salary: 50000 
  });
  await save(tempEmployee, Employee);
  
  // Create unique constraint on email
  await unique("email", Employee);
  
  // Verify the column was created
  const tableInfo = await raw("PRAGMA table_info(employees)");
  const emailColumn = tableInfo.find((col: any) => col.name === "email");
  expect(emailColumn).toBeDefined();
  expect(emailColumn.type).toBe("TEXT");
  
  // Save first employee
  const employee1 = new Employee({ 
    email: "unique@company.com", 
    name: "First Employee", 
    age: 30, 
    salary: 50000 
  });
  await save(employee1, Employee);
  
  // Try to save second employee with same email - should fail at database level
  const employee2 = new Employee({ 
    email: "unique@company.com", 
    name: "Second Employee", 
    age: 25, 
    salary: 45000 
  });
  
  await expect(async () => {
    await save(employee2, Employee);
  }).toThrow(); // Should fail due to unique constraint
});

test("check constraint on age", async () => {
  // Save an employee first to ensure table exists
  const tempEmployee = new Employee({ 
    email: "temp2@company.com", 
    name: "Temp Employee", 
    age: 30, 
    salary: 50000 
  });
  await save(tempEmployee, Employee);
  
  // Add check constraint for minimum age
  await checkConstraint("age", "age >= 18", Employee);
  
  // Verify the column was created
  const tableInfo = await raw("PRAGMA table_info(employees)");
  const ageColumn = tableInfo.find((col: any) => col.name === "age");
  expect(ageColumn).toBeDefined();
  
  // Try to save employee with valid age (should succeed)
  const validEmployee = new Employee({ 
    email: "valid@company.com", 
    name: "Valid Employee", 
    age: 25, 
    salary: 50000 
  });
  const saved = await save(validEmployee, Employee);
  expect(saved.id).toBeDefined();
  
  // Try to save employee with invalid age (should fail)
  const invalidEmployee = new Employee({ 
    email: "invalid@company.com", 
    name: "Invalid Employee", 
    age: 16, // Below minimum age
    salary: 30000 
  });
  
  await expect(async () => {
    await save(invalidEmployee, Employee);
  }).toThrow(); // Should fail due to check constraint
});

test("check constraint on salary range", async () => {
  // Save an employee first to ensure table exists
  const tempEmployee = new Employee({ 
    email: "temp3@company.com", 
    name: "Temp Employee", 
    age: 30, 
    salary: 50000 
  });
  await save(tempEmployee, Employee);
  
  // Add check constraints for salary range
  await checkConstraint("salary", "salary > 0", Employee);
  await checkConstraint("salary", "salary <= 1000000", Employee);
  
  // Try to save employee with valid salary
  const validEmployee = new Employee({ 
    email: "goodsalary@company.com", 
    name: "Good Salary Employee", 
    age: 30, 
    salary: 75000 
  });
  const saved = await save(validEmployee, Employee);
  expect(saved.id).toBeDefined();
  
  // Try to save employee with negative salary (should fail)
  const negativeSalaryEmployee = new Employee({ 
    email: "negative@company.com", 
    name: "Negative Salary", 
    age: 30, 
    salary: -1000 
  });
  
  await expect(async () => {
    await save(negativeSalaryEmployee, Employee);
  }).toThrow(); // Should fail due to salary > 0 constraint
  
  // Try to save employee with excessive salary (should fail)
  const excessiveSalaryEmployee = new Employee({ 
    email: "excessive@company.com", 
    name: "Excessive Salary", 
    age: 30, 
    salary: 2000000 
  });
  
  await expect(async () => {
    await save(excessiveSalaryEmployee, Employee);
  }).toThrow(); // Should fail due to salary <= 1000000 constraint
});

test("multiple constraints on the same field", async () => {
  // Clear any existing data
  await raw("DELETE FROM employees WHERE 1=1").catch(() => {});
  
  // Save an employee first to ensure table exists
  const tempEmployee = new Employee({ 
    email: "temp4@company.com", 
    name: "Temp Employee", 
    age: 30, 
    salary: 50000 
  });
  await save(tempEmployee, Employee);
  
  // Add multiple age constraints
  await checkConstraint("age", "age >= 18", Employee);
  await checkConstraint("age", "age <= 65", Employee);
  
  // Valid age should work
  const validEmployee = new Employee({ 
    email: "validage@company.com", 
    name: "Valid Age", 
    age: 35, 
    salary: 60000 
  });
  const saved = await save(validEmployee, Employee);
  expect(saved.id).toBeDefined();
  
  // Too young should fail
  const tooYoung = new Employee({ 
    email: "tooyoung@company.com", 
    name: "Too Young", 
    age: 16, 
    salary: 40000 
  });
  
  await expect(async () => {
    await save(tooYoung, Employee);
  }).toThrow();
  
  // Too old should fail
  const tooOld = new Employee({ 
    email: "tooold@company.com", 
    name: "Too Old", 
    age: 70, 
    salary: 80000 
  });
  
  await expect(async () => {
    await save(tooOld, Employee);
  }).toThrow();
});

test("constraint on optional field", async () => {
  // Save an employee first to ensure table exists
  const tempEmployee = new Employee({ 
    email: "temp5@company.com", 
    name: "Temp Employee", 
    age: 30, 
    salary: 50000 
  });
  await save(tempEmployee, Employee);
  
  // Add constraint on optional department field
  await checkConstraint("department", "department IN ('engineering', 'sales', 'marketing', 'hr')", Employee);
  
  // Employee without department should work (NULL values typically bypass constraints)
  const noDeptEmployee = new Employee({ 
    email: "nodept@company.com", 
    name: "No Department", 
    age: 30, 
    salary: 50000 
  });
  const saved1 = await save(noDeptEmployee, Employee);
  expect(saved1.id).toBeDefined();
  
  // Employee with valid department should work
  const validDeptEmployee = new Employee({ 
    email: "validdept@company.com", 
    name: "Valid Department", 
    age: 30, 
    salary: 50000,
    department: "engineering"
  });
  const saved2 = await save(validDeptEmployee, Employee);
  expect(saved2.id).toBeDefined();
  
  // Employee with invalid department should fail
  const invalidDeptEmployee = new Employee({ 
    email: "invaliddept@company.com", 
    name: "Invalid Department", 
    age: 30, 
    salary: 50000,
    department: "invalid_dept"
  });
  
  await expect(async () => {
    await save(invalidDeptEmployee, Employee);
  }).toThrow();
});

test("constraint column synchronization", async () => {
  // Save an employee first to ensure table exists
  const tempEmployee = new Employee({ 
    email: "temp6@company.com", 
    name: "Temp Employee", 
    age: 30, 
    salary: 50000 
  });
  await save(tempEmployee, Employee);
  
  // Add constraint on salary
  await checkConstraint("salary", "salary >= 30000", Employee);
  
  // Save employee with valid salary
  const employee = new Employee({ 
    email: "sync@company.com", 
    name: "Sync Test", 
    age: 30, 
    salary: 50000 
  });
  const saved = await save(employee, Employee);
  
  // Verify the constraint column was populated
  const rawData = await raw(`SELECT salary FROM employees WHERE id = ${saved.id}`);
  expect(parseFloat(rawData[0].salary)).toBe(50000);
  
  // Update the employee salary
  saved.salary = 60000;
  await save(saved, Employee);
  
  // Verify the constraint column was updated
  const updatedData = await raw(`SELECT salary FROM employees WHERE id = ${saved.id}`);
  expect(parseFloat(updatedData[0].salary)).toBe(60000);
  
  // Try to update to invalid salary (should fail)
  saved.salary = 20000; // Below minimum
  await expect(async () => {
    await save(saved, Employee);
  }).toThrow();
});

test("complex constraint expressions", async () => {
  // Save an employee first to ensure table exists
  const tempEmployee = new Employee({ 
    email: "temp7@company.com", 
    name: "Temp Employee", 
    age: 30, 
    salary: 50000 
  });
  await save(tempEmployee, Employee);
  
  // Add complex constraint involving multiple field references in the constraint
  await checkConstraint("age", "age * 1000 <= salary", Employee);
  
  // Valid case: age 30, salary 40000 (30 * 1000 = 30000 <= 40000)
  const validEmployee = new Employee({ 
    email: "complex1@company.com", 
    name: "Complex Valid", 
    age: 30, 
    salary: 40000 
  });
  const saved = await save(validEmployee, Employee);
  expect(saved.id).toBeDefined();
  
  // Invalid case: age 50, salary 30000 (50 * 1000 = 50000 > 30000)
  const invalidEmployee = new Employee({ 
    email: "complex2@company.com", 
    name: "Complex Invalid", 
    age: 50, 
    salary: 30000 
  });
  
  await expect(async () => {
    await save(invalidEmployee, Employee);
  }).toThrow();
});

test("constraint error messages", async () => {
  // Save an employee first to ensure table exists
  const tempEmployee = new Employee({ 
    email: "temp8@company.com", 
    name: "Temp Employee", 
    age: 30, 
    salary: 50000 
  });
  await save(tempEmployee, Employee);
  
  await checkConstraint("age", "age >= 21", Employee);
  
  const underageEmployee = new Employee({ 
    email: "underage@company.com", 
    name: "Underage", 
    age: 18, 
    salary: 35000 
  });
  
  try {
    await save(underageEmployee, Employee);
    // Should not reach here
    expect(true).toBe(false);
  } catch (error) {
    // Error message should mention the constraint violation
    const errorMessage = error instanceof Error ? error.message : String(error);
    expect(errorMessage).toContain("Check constraint violated");
    expect(errorMessage).toContain("age >= 21");
  }
});
