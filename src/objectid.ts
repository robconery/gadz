// MongoDB-compatible ObjectId implementation
import { randomBytes } from 'crypto';

export class GadzObjectId {
  private _id: Buffer;
  private static _counter = Math.floor(Math.random() * 0xFFFFFF);
  private static _machineId = randomBytes(3);
  private static _processId = process.pid & 0xFFFF;

  constructor(id?: string | Buffer | GadzObjectId) {
    if (id === undefined) {
      this._id = this._generate();
    } else if (typeof id === 'string') {
      if (id.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(id)) {
        throw new Error('Invalid ObjectId string');
      }
      this._id = Buffer.from(id, 'hex');
    } else if (Buffer.isBuffer(id)) {
      if (id.length !== 12) {
        throw new Error('Invalid ObjectId buffer');
      }
      this._id = Buffer.from(id);
    } else if (id instanceof GadzObjectId) {
      this._id = Buffer.from(id._id);
    } else {
      throw new Error('Invalid ObjectId input');
    }
  }

  private _generate(): Buffer {
    const buffer = Buffer.alloc(12);
    
    // 4-byte timestamp
    buffer.writeUInt32BE(Math.floor(Date.now() / 1000), 0);
    
    // 3-byte machine identifier
    GadzObjectId._machineId.copy(buffer, 4);
    
    // 2-byte process identifier
    buffer.writeUInt16BE(GadzObjectId._processId, 7);
    
    // 3-byte counter
    const counter = (GadzObjectId._counter = (GadzObjectId._counter + 1) % 0xFFFFFF);
    buffer.writeUIntBE(counter, 9, 3);
    
    return buffer;
  }

  toString(): string {
    return this._id.toString('hex');
  }

  toHexString(): string {
    return this.toString();
  }

  equals(other: GadzObjectId | string): boolean {
    if (typeof other === 'string') {
      return this.toString() === other;
    }
    return this._id.equals(other._id);
  }

  getTimestamp(): Date {
    return new Date(this._id.readUInt32BE(0) * 1000);
  }

  static isValid(id: string | Buffer | GadzObjectId): boolean {
    try {
      new GadzObjectId(id);
      return true;
    } catch {
      return false;
    }
  }
}
