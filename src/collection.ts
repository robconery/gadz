import { 
  get as _get,
  find as _find,
  findOne as _findOne,
  where as _where,
  save as _save,
  saveMany as _saveMany,
  updateMany as _updateMany,
  deleteMany as _deleteMany,
  deleteOne as _deleteOne,
  type Filter,
  type SaveOptions,
  type FindOptions,
  type DocumentWithMeta
} from "./operations";

/**
 * Base Collection class that provides MongoDB-style ActiveRecord pattern
 * for SQLite document storage.
 * 
 * Usage:
 * ```ts
 * class User extends Collection<User> {
 *   email: string;
 *   name?: string;
 *   age: number = 18;
 * }
 * 
 * const users = await User.find({ age: { $gt: 18 } });
 * const user = await User.get(1);
 * user.email = "new@email.com";
 * await user.save();
 * ```
 */
export abstract class Collection<T extends Collection<T>> {
  // Instance properties that will be added after save/load
  id?: number;
  created_at?: string;
  updated_at?: string;

  // Static methods for querying
  
  /**
   * Find a document by its ID
   */
  static async get<T extends Collection<T>>(
    this: new (...args: any[]) => T,
    id: number
  ): Promise<(T & DocumentWithMeta) | null> {
    return await _get<T>(this, id);
  }

  /**
   * Find multiple documents matching the filter
   */
  static async find<T extends Collection<T>>(
    this: new (...args: any[]) => T,
    filter: Filter = {},
    options?: FindOptions
  ): Promise<(T & DocumentWithMeta)[]> {
    return await _find<T>(this, filter, options);
  }

  /**
   * Find the first document matching the filter
   */
  static async findOne<T extends Collection<T>>(
    this: new (...args: any[]) => T,
    filter: Filter = {}
  ): Promise<(T & DocumentWithMeta) | null> {
    return await _findOne<T>(this, filter);
  }

  /**
   * Find documents using MongoDB-style query operators
   * Alias for find() for backward compatibility
   */
  static async where<T extends Collection<T>>(
    this: new (...args: any[]) => T,
    filter: Filter = {},
    options?: FindOptions
  ): Promise<(T & DocumentWithMeta)[]> {
    return await _where<T>(this, filter, options);
  }

  // Static methods for bulk operations

  /**
   * Save multiple documents in a transaction
   */
  static async saveMany<T extends Collection<T>>(
    this: new (...args: any[]) => T,
    ...documents: (T | T[])[]
  ): Promise<(T & DocumentWithMeta)[]> {
    return await _saveMany<T>(...documents);
  }

  /**
   * Update multiple documents matching the filter
   */
  static async updateMany<T extends Collection<T>>(
    this: new (...args: any[]) => T,
    filter: Filter,
    update: { $set?: { [key: string]: any }; [key: string]: any },
    options?: SaveOptions
  ): Promise<{ matchedCount: number; modifiedCount: number; upsertedId?: number }> {
    return await _updateMany<T>(this, filter, update, options);
  }

  /**
   * Delete multiple documents matching the filter
   */
  static async deleteMany<T extends Collection<T>>(
    this: new (...args: any[]) => T,
    filter: Filter
  ): Promise<{ deletedCount: number }> {
    return await _deleteMany<T>(this, filter);
  }

  // Instance methods

  /**
   * Save this document (upsert)
   */
  async save(options: SaveOptions = { upsert: true }): Promise<T & DocumentWithMeta> {
    const result = await _save<T>(this as any, options);
    
    // Update this instance with the saved data
    Object.assign(this, result);
    
    return result;
  }

  /**
   * Delete this document
   */
  async delete(): Promise<boolean> {
    if (!this.id) {
      throw new Error("Cannot delete document without an ID");
    }
    
    const result = await _deleteOne<T>(this.constructor as any, { id: this.id });
    return result.deletedCount > 0;
  }

  /**
   * Reload this document from the database
   */
  async reload(): Promise<T & DocumentWithMeta> {
    if (!this.id) {
      throw new Error("Cannot reload document without an ID");
    }
    
    const reloaded = await _get<T>(this.constructor as any, this.id);
    if (!reloaded) {
      throw new Error(`Document with ID ${this.id} not found`);
    }
    
    // Update this instance with the reloaded data
    Object.assign(this, reloaded);
    
    return reloaded;
  }

  /**
   * Create a JSON representation of this document
   */
  toJSON(): any {
    const obj: any = {};
    for (const key in this) {
      if (this.hasOwnProperty(key) && typeof this[key] !== 'function') {
        obj[key] = this[key];
      }
    }
    return obj;
  }

  /**
   * Create a plain object representation without Collection methods
   */
  toObject(): Partial<T> {
    const obj: any = {};
    for (const key in this) {
      if (this.hasOwnProperty(key) && typeof this[key] !== 'function') {
        obj[key] = this[key];
      }
    }
    return obj;
  }
}

export default Collection;
