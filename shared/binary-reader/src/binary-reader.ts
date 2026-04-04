/**
 * DataView wrapper with position tracking and endianness support.
 * Ported from PyBinaryReader used by gmt_lib (MIT).
 */
export class BinaryReader {
  private readonly view: DataView;
  private readonly littleEndian: boolean;
  private _offset: number;

  // Feature-detect DataView.getFloat16 (available in Node 22+, modern browsers)
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  private static readonly HAS_FLOAT16 =
    typeof (DataView.prototype as any).getFloat16 === 'function'; // eslint-disable-line @typescript-eslint/no-explicit-any

  constructor(buffer: ArrayBuffer, littleEndian = false) {
    this.view = new DataView(buffer);
    this.littleEndian = littleEndian;
    this._offset = 0;
  }

  /** Create a new BinaryReader sharing the same buffer but with different endianness. */
  withEndianness(littleEndian: boolean): BinaryReader {
    const br = new BinaryReader(this.view.buffer as ArrayBuffer, littleEndian);
    br._offset = this._offset;
    return br;
  }

  get position(): number {
    return this._offset;
  }

  get length(): number {
    return this.view.byteLength;
  }

  get remaining(): number {
    return this.view.byteLength - this._offset;
  }

  seek(offset: number): void {
    if (offset < 0 || offset > this.view.byteLength) {
      throw new RangeError(
        `Seek to ${offset} out of bounds [0, ${this.view.byteLength}]`,
      );
    }
    this._offset = offset;
  }

  skip(bytes: number): void {
    this.seek(this._offset + bytes);
  }

  /** Align position forward to the next multiple of `boundary`. */
  align(boundary: number): void {
    const remainder = this._offset % boundary;
    if (remainder !== 0) {
      this._offset += boundary - remainder;
    }
  }

  // -- Unsigned integers --

  readUint8(): number {
    const val = this.view.getUint8(this._offset);
    this._offset += 1;
    return val;
  }

  readUint16(): number {
    const val = this.view.getUint16(this._offset, this.littleEndian);
    this._offset += 2;
    return val;
  }

  readUint32(): number {
    const val = this.view.getUint32(this._offset, this.littleEndian);
    this._offset += 4;
    return val;
  }

  // -- Signed integers --

  readInt8(): number {
    const val = this.view.getInt8(this._offset);
    this._offset += 1;
    return val;
  }

  readInt16(): number {
    const val = this.view.getInt16(this._offset, this.littleEndian);
    this._offset += 2;
    return val;
  }

  readInt32(): number {
    const val = this.view.getInt32(this._offset, this.littleEndian);
    this._offset += 4;
    return val;
  }

  // -- Floating point --

  readFloat32(): number {
    const val = this.view.getFloat32(this._offset, this.littleEndian);
    this._offset += 4;
    return val;
  }

  /** Read a 16-bit half-precision float (IEEE 754). */
  readFloat16(): number {
    if (BinaryReader.HAS_FLOAT16) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const val = (this.view as any).getFloat16(this._offset, this.littleEndian) as number;
      this._offset += 2;
      return val;
    }
    return this.readFloat16Manual();
  }

  private readFloat16Manual(): number {
    const bits = this.view.getUint16(this._offset, this.littleEndian);
    this._offset += 2;
    return decodeFloat16(bits);
  }

  // -- Bytes --

  readBytes(count: number): Uint8Array {
    const slice = new Uint8Array(this.view.buffer as ArrayBuffer, this.view.byteOffset + this._offset, count);
    this._offset += count;
    return slice;
  }
}

/** Decode a 16-bit half-precision float from its raw uint16 bits. */
export function decodeFloat16(bits: number): number {
  const sign = (bits >> 15) & 1;
  const exponent = (bits >> 10) & 0x1f;
  const mantissa = bits & 0x3ff;

  if (exponent === 0) {
    // Subnormal or zero
    return (sign ? -1 : 1) * Math.pow(2, -14) * (mantissa / 1024);
  } else if (exponent === 0x1f) {
    // Infinity or NaN
    return mantissa ? NaN : sign ? -Infinity : Infinity;
  }

  return (sign ? -1 : 1) * Math.pow(2, exponent - 15) * (1 + mantissa / 1024);
}
