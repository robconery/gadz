# Contributing to Gadz

Thank you for your interest in contributing to Gadz! This document provides guidelines and information for contributors.

## Development Setup

### Prerequisites

- [Bun](https://bun.sh/) 1.0+ (recommended) or Node.js 18+
- TypeScript 5.0+

### Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/your-username/gadz.git
   cd gadz
   ```

3. Install dependencies:
   ```bash
   bun install
   ```

4. Run tests to ensure everything works:
   ```bash
   bun test
   ```

## Project Structure

```
gadz/
├── src/                 # Core library source code
│   ├── client.ts       # Database client implementation
│   ├── database.ts     # Database operations
│   ├── collection.ts   # Collection operations
│   ├── objectid.ts     # ObjectId implementation
│   ├── query-builder.ts # SQL query building
│   └── types.ts        # TypeScript type definitions
├── tests/              # Test files
├── index.ts            # Main entry point with convenience functions
└── package.json        # Package configuration
```

## Core Architecture

- **Client**: MongoDB-compatible client that manages SQLite connections
- **Database**: Represents a database with multiple collections
- **Collection**: Implements MongoDB collection API with SQLite backend
- **ObjectId**: MongoDB-compatible object ID implementation
- **QueryBuilder**: Translates MongoDB queries to SQL
- **Type-safe API**: Top-level functions that derive collection names from classes

## Development Guidelines

### Code Style

- Use TypeScript for all code
- Follow existing code formatting and patterns
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Prefer explicit types over `any`

### Testing

- Write tests for all new features
- Maintain or improve test coverage
- Use descriptive test names
- Test both success and error cases
- Run the full test suite before submitting PRs

```bash
# Run all tests
bun test

# Run specific test file
bun test tests/client.test.ts

# Run tests in watch mode
bun test --watch
```

### API Design Principles

1. **MongoDB Compatibility**: Keep the API as close to MongoDB as possible
2. **Type Safety**: Leverage TypeScript for compile-time safety
3. **Developer Experience**: Prioritize ease of use and clear error messages
4. **Performance**: Optimize for SQLite's strengths
5. **Simplicity**: Avoid unnecessary complexity

## Making Changes

### Before You Start

1. Check existing issues and PRs to avoid duplicating work
2. For large changes, consider opening an issue to discuss the approach
3. Make sure you understand the existing codebase

### Development Process

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes:
   - Write code following the project patterns
   - Add or update tests as needed
   - Update documentation if necessary

3. Test your changes:
   ```bash
   bun test
   ```

4. Commit your changes with a clear message:
   ```bash
   git commit -m "feat: add support for compound indexes"
   ```

### Commit Message Format

Use conventional commit format:

- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation changes
- `test:` for test additions/changes
- `refactor:` for code refactoring
- `perf:` for performance improvements

## Pull Request Process

1. **Before submitting:**
   - Ensure all tests pass
   - Update documentation if needed
   - Rebase your branch on the latest `main`

2. **PR Description:**
   - Describe what changes you made and why
   - Reference any related issues
   - Include screenshots for UI changes (if applicable)
   - List any breaking changes

3. **Review Process:**
   - PRs require at least one approval
   - Address any feedback from reviewers
   - Keep PRs focused and reasonably sized

## Testing Guidelines

### Test Structure

- Each source file should have a corresponding test file
- Group related tests using `describe` blocks
- Use clear, descriptive test names
- Test both happy path and error conditions

### Test Categories

1. **Unit Tests**: Test individual functions and classes
2. **Integration Tests**: Test component interactions
3. **Type Tests**: Verify TypeScript type safety

### Example Test

```typescript
describe('save function', () => {
  test('should save document with auto-generated ID', async () => {
    const user = new User({ email: 'test@example.com', active: true });
    
    const result = await save(user);
    
    expect(result.acknowledged).toBe(true);
    expect(result.insertedId).toBeDefined();
  });

  test('should throw error for invalid document', async () => {
    const invalidUser = { email: 'invalid' };
    
    await expect(save(invalidUser as any))
      .rejects.toThrow('Document must have a constructor');
  });
});
```

## Documentation

- Keep README.md up to date with new features
- Add JSDoc comments for public APIs
- Update type definitions when changing interfaces
- Include code examples in documentation

## Performance Considerations

- Profile database operations for performance
- Optimize SQL queries generated by QueryBuilder
- Consider SQLite-specific optimizations
- Benchmark changes that affect core operations

## Debugging

### Common Issues

1. **SQLite-specific behaviors**: Remember SQLite differences from MongoDB
2. **Type inference**: Ensure TypeScript can properly infer types
3. **Collection naming**: Verify pluralization works correctly
4. **Transaction handling**: Ensure proper rollback on errors

### Debugging Tools

```bash
# Enable verbose logging
DEBUG=gadz* bun test

# Run single test with debugging
bun test --debug tests/client.test.ts
```

## Release Process

Releases are handled by maintainers:

1. Version bump following semver
2. Update CHANGELOG.md
3. Create release tag
4. Publish to npm registry

## Getting Help

- Open an issue for bugs or feature requests
- Check existing issues and documentation first
- Be specific about your environment and use case
- Provide minimal reproduction examples

## Recognition

Contributors will be acknowledged in the project README and release notes.

Thank you for contributing to Gadz!