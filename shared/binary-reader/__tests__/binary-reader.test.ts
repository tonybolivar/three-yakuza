import { describe, it, expect } from 'vitest';
import { BinaryReader, decodeFloat16 } from '../src/index.js';

/** Helper: create an ArrayBuffer from a Uint8Array. */
function buf(...bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

/** Helper: create an ArrayBuffer from a DataView writer callback. */
function bufFrom(size: number, write: (dv: DataView) => void): ArrayBuffer {
  const ab = new ArrayBuffer(size);
  write(new DataView(ab));
  return ab;
}

describe('BinaryReader', () => {
  describe('readUint8 / readInt8', () => {
    it('reads unsigned bytes', () => {
      const br = new BinaryReader(buf(0x00, 0x7f, 0x80, 0xff));
      expect(br.readUint8()).toBe(0);
      expect(br.readUint8()).toBe(127);
      expect(br.readUint8()).toBe(128);
      expect(br.readUint8()).toBe(255);
    });

    it('reads signed bytes', () => {
      const br = new BinaryReader(buf(0x00, 0x7f, 0x80, 0xff));
      expect(br.readInt8()).toBe(0);
      expect(br.readInt8()).toBe(127);
      expect(br.readInt8()).toBe(-128);
      expect(br.readInt8()).toBe(-1);
    });
  });

  describe('readUint16 / readInt16', () => {
    it('reads big-endian uint16', () => {
      const br = new BinaryReader(buf(0x01, 0x02));
      expect(br.readUint16()).toBe(0x0102);
    });

    it('reads little-endian uint16', () => {
      const br = new BinaryReader(buf(0x01, 0x02), true);
      expect(br.readUint16()).toBe(0x0201);
    });

    it('reads big-endian int16', () => {
      const br = new BinaryReader(buf(0xff, 0xfe));
      expect(br.readInt16()).toBe(-2);
    });

    it('reads little-endian int16', () => {
      const br = new BinaryReader(buf(0xfe, 0xff), true);
      expect(br.readInt16()).toBe(-2);
    });
  });

  describe('readUint32 / readInt32', () => {
    it('reads big-endian uint32', () => {
      const br = new BinaryReader(buf(0x00, 0x01, 0x00, 0x00));
      expect(br.readUint32()).toBe(0x00010000);
    });

    it('reads little-endian uint32', () => {
      const br = new BinaryReader(buf(0x00, 0x00, 0x01, 0x00), true);
      expect(br.readUint32()).toBe(0x00010000);
    });

    it('reads big-endian int32 negative', () => {
      const br = new BinaryReader(buf(0xff, 0xff, 0xff, 0xff));
      expect(br.readInt32()).toBe(-1);
    });
  });

  describe('readFloat32', () => {
    it('reads 1.0 big-endian', () => {
      // IEEE 754: 1.0 = 0x3F800000
      const br = new BinaryReader(buf(0x3f, 0x80, 0x00, 0x00));
      expect(br.readFloat32()).toBe(1.0);
    });

    it('reads -1.0 little-endian', () => {
      // -1.0 = 0xBF800000
      const br = new BinaryReader(buf(0x00, 0x00, 0x80, 0xbf), true);
      expect(br.readFloat32()).toBe(-1.0);
    });

    it('reads 0.0', () => {
      const br = new BinaryReader(buf(0x00, 0x00, 0x00, 0x00));
      expect(br.readFloat32()).toBe(0.0);
    });
  });

  describe('readFloat16 / decodeFloat16', () => {
    it('decodes 1.0 (0x3C00)', () => {
      expect(decodeFloat16(0x3c00)).toBe(1.0);
    });

    it('decodes -1.0 (0xBC00)', () => {
      expect(decodeFloat16(0xbc00)).toBe(-1.0);
    });

    it('decodes 0.5 (0x3800)', () => {
      expect(decodeFloat16(0x3800)).toBe(0.5);
    });

    it('decodes 0.0 (0x0000)', () => {
      expect(decodeFloat16(0x0000)).toBe(0.0);
    });

    it('decodes -0.0 (0x8000)', () => {
      expect(Object.is(decodeFloat16(0x8000), -0)).toBe(true);
    });

    it('decodes Infinity (0x7C00)', () => {
      expect(decodeFloat16(0x7c00)).toBe(Infinity);
    });

    it('decodes -Infinity (0xFC00)', () => {
      expect(decodeFloat16(0xfc00)).toBe(-Infinity);
    });

    it('decodes NaN (0x7E00)', () => {
      expect(decodeFloat16(0x7e00)).toBeNaN();
    });

    it('decodes subnormal (smallest positive: 0x0001)', () => {
      // 2^-14 * (1/1024) = 2^-24 ≈ 5.96e-8
      expect(decodeFloat16(0x0001)).toBeCloseTo(5.960464477539063e-8, 15);
    });

    it('reads float16 via BinaryReader big-endian', () => {
      // 1.0 = 0x3C00 big-endian
      const br = new BinaryReader(buf(0x3c, 0x00));
      expect(br.readFloat16()).toBe(1.0);
    });

    it('reads float16 via BinaryReader little-endian', () => {
      // 1.0 = 0x3C00, stored little-endian as [0x00, 0x3C]
      const br = new BinaryReader(buf(0x00, 0x3c), true);
      expect(br.readFloat16()).toBe(1.0);
    });
  });

  describe('readBytes', () => {
    it('returns correct slice and advances position', () => {
      const br = new BinaryReader(buf(0x01, 0x02, 0x03, 0x04, 0x05));
      br.skip(1);
      const bytes = br.readBytes(3);
      expect(Array.from(bytes)).toEqual([0x02, 0x03, 0x04]);
      expect(br.position).toBe(4);
    });
  });

  describe('position tracking', () => {
    it('starts at 0', () => {
      const br = new BinaryReader(buf(0x00));
      expect(br.position).toBe(0);
    });

    it('advances after reads', () => {
      const br = new BinaryReader(buf(0, 0, 0, 0, 0, 0, 0));
      br.readUint8();
      expect(br.position).toBe(1);
      br.readUint16();
      expect(br.position).toBe(3);
      br.readFloat32();
      expect(br.position).toBe(7);
    });

    it('seek moves to absolute position', () => {
      const br = new BinaryReader(buf(0, 0, 0, 0, 0));
      br.seek(3);
      expect(br.position).toBe(3);
    });

    it('seek to out of bounds throws', () => {
      const br = new BinaryReader(buf(0x00));
      expect(() => br.seek(5)).toThrow(RangeError);
      expect(() => br.seek(-1)).toThrow(RangeError);
    });

    it('skip advances by N bytes', () => {
      const br = new BinaryReader(buf(0, 0, 0, 0, 0));
      br.skip(3);
      expect(br.position).toBe(3);
    });

    it('remaining reflects bytes left', () => {
      const br = new BinaryReader(buf(0, 0, 0, 0, 0));
      expect(br.remaining).toBe(5);
      br.skip(2);
      expect(br.remaining).toBe(3);
    });

    it('length is buffer size', () => {
      const br = new BinaryReader(buf(0, 0, 0, 0));
      expect(br.length).toBe(4);
    });
  });

  describe('align', () => {
    it('aligns to 4 from offset 1', () => {
      const br = new BinaryReader(new ArrayBuffer(16));
      br.seek(1);
      br.align(4);
      expect(br.position).toBe(4);
    });

    it('does not move if already aligned', () => {
      const br = new BinaryReader(new ArrayBuffer(16));
      br.seek(4);
      br.align(4);
      expect(br.position).toBe(4);
    });

    it('aligns to 32 from offset 5', () => {
      const br = new BinaryReader(new ArrayBuffer(64));
      br.seek(5);
      br.align(32);
      expect(br.position).toBe(32);
    });

    it('aligns to 4 from offset 3', () => {
      const br = new BinaryReader(new ArrayBuffer(16));
      br.seek(3);
      br.align(4);
      expect(br.position).toBe(4);
    });
  });

  describe('withEndianness', () => {
    it('creates reader with different endianness at same position', () => {
      const ab = bufFrom(4, (dv) => {
        dv.setUint16(0, 0x0102, false); // big-endian
        dv.setUint16(2, 0x0102, false);
      });
      const br = new BinaryReader(ab, false);
      br.readUint16(); // advance to offset 2

      const le = br.withEndianness(true);
      expect(le.position).toBe(2);
      // Reading 0x01 0x02 as little-endian gives 0x0201
      expect(le.readUint16()).toBe(0x0201);
    });
  });
});
