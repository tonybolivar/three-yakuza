import { describe, it, expect } from 'vitest';
import { BinaryReader } from '@three-yakuza/binary-reader';
import { deserializeKeyframes } from '../src/animation-data.js';
import { GMTCurveFormat, GMTVersion } from '../src/enums.js';

/** Helper: build an ArrayBuffer by writing floats/ints via DataView. */
function buildBuffer(write: (dv: DataView) => void, size: number): ArrayBuffer {
  const ab = new ArrayBuffer(size);
  write(new DataView(ab));
  return ab;
}

describe('deserializeKeyframes', () => {
  const V5 = GMTVersion.YAKUZA5;
  const KENZAN = GMTVersion.KENZAN;

  describe('LOC_XYZ (0x06)', () => {
    it('reads 3 floats per keyframe', () => {
      const ab = buildBuffer((dv) => {
        // Keyframe 0: (1.0, 2.0, 3.0)
        dv.setFloat32(0, 1.0, false);
        dv.setFloat32(4, 2.0, false);
        dv.setFloat32(8, 3.0, false);
        // Keyframe 1: (-1.0, 0.0, 0.5)
        dv.setFloat32(12, -1.0, false);
        dv.setFloat32(16, 0.0, false);
        dv.setFloat32(20, 0.5, false);
      }, 24);

      const br = new BinaryReader(ab, false);
      const result = deserializeKeyframes(br, GMTCurveFormat.LOC_XYZ, V5, 2);
      expect(result).toEqual([
        [1.0, 2.0, 3.0],
        [-1.0, 0.0, 0.5],
      ]);
    });
  });

  describe('LOC_CHANNEL (0x04)', () => {
    it('reads 1 float per keyframe', () => {
      const ab = buildBuffer((dv) => {
        dv.setFloat32(0, 5.5, false);
        dv.setFloat32(4, -3.2, false);
      }, 8);

      const br = new BinaryReader(ab, false);
      const result = deserializeKeyframes(br, GMTCurveFormat.LOC_CHANNEL, V5, 2);
      expect(result[0]).toEqual([5.5]);
      expect(result[1]![0]).toBeCloseTo(-3.2);
    });
  });

  describe('ROT_QUAT_XYZ_FLOAT (0x01)', () => {
    it('derives w from xyz', () => {
      // x=0, y=0, z=0 → w=1
      const ab = buildBuffer((dv) => {
        dv.setFloat32(0, 0.0, false);
        dv.setFloat32(4, 0.0, false);
        dv.setFloat32(8, 0.0, false);
      }, 12);

      const br = new BinaryReader(ab, false);
      const result = deserializeKeyframes(br, GMTCurveFormat.ROT_QUAT_XYZ_FLOAT, V5, 1);
      expect(result[0]).toEqual([0, 0, 0, 1]);
    });

    it('clamps w to 0 when sum exceeds 1', () => {
      // x=1, y=0, z=0 → w=0
      const ab = buildBuffer((dv) => {
        dv.setFloat32(0, 1.0, false);
        dv.setFloat32(4, 0.0, false);
        dv.setFloat32(8, 0.0, false);
      }, 12);

      const br = new BinaryReader(ab, false);
      const result = deserializeKeyframes(br, GMTCurveFormat.ROT_QUAT_XYZ_FLOAT, V5, 1);
      expect(result[0]).toEqual([1, 0, 0, 0]);
    });

    it('computes w correctly for non-trivial quaternion', () => {
      // x=0.5, y=0.5, z=0.5 → w = sqrt(1 - 0.75) = 0.5
      const ab = buildBuffer((dv) => {
        dv.setFloat32(0, 0.5, false);
        dv.setFloat32(4, 0.5, false);
        dv.setFloat32(8, 0.5, false);
      }, 12);

      const br = new BinaryReader(ab, false);
      const result = deserializeKeyframes(br, GMTCurveFormat.ROT_QUAT_XYZ_FLOAT, V5, 1);
      expect(result[0]![0]).toBeCloseTo(0.5);
      expect(result[0]![1]).toBeCloseTo(0.5);
      expect(result[0]![2]).toBeCloseTo(0.5);
      expect(result[0]![3]).toBeCloseTo(0.5);
    });
  });

  describe('ROT_XYZW_SHORT (0x02)', () => {
    it('reads 4 x int16/16384 for post-KENZAN', () => {
      const ab = buildBuffer((dv) => {
        // 16384 / 16384 = 1.0, 0, 0, 0
        dv.setInt16(0, 16384, false);
        dv.setInt16(2, 0, false);
        dv.setInt16(4, 0, false);
        dv.setInt16(6, 0, false);
      }, 8);

      const br = new BinaryReader(ab, false);
      const result = deserializeKeyframes(br, GMTCurveFormat.ROT_XYZW_SHORT, V5, 1);
      expect(result[0]).toEqual([1, 0, 0, 0]);
    });

    it('reads 4 x float16 for KENZAN', () => {
      const ab = buildBuffer((dv) => {
        // float16: 1.0 = 0x3C00, 0.0 = 0x0000
        dv.setUint16(0, 0x3c00, false);
        dv.setUint16(2, 0x0000, false);
        dv.setUint16(4, 0x0000, false);
        dv.setUint16(6, 0x3c00, false);
      }, 8);

      const br = new BinaryReader(ab, false);
      const result = deserializeKeyframes(br, GMTCurveFormat.ROT_XYZW_SHORT, KENZAN, 1);
      expect(result[0]).toEqual([1, 0, 0, 1]);
    });
  });

  describe('ROT_XW_FLOAT (0x10)', () => {
    it('reads x and w, other components zero', () => {
      const ab = buildBuffer((dv) => {
        dv.setFloat32(0, 0.7071, false);
        dv.setFloat32(4, 0.7071, false);
      }, 8);

      const br = new BinaryReader(ab, false);
      const result = deserializeKeyframes(br, GMTCurveFormat.ROT_XW_FLOAT, V5, 1);
      expect(result[0]![0]).toBeCloseTo(0.7071);
      expect(result[0]![1]).toBe(0);
      expect(result[0]![2]).toBe(0);
      expect(result[0]![3]).toBeCloseTo(0.7071);
    });
  });

  describe('ROT_YW_FLOAT (0x11)', () => {
    it('reads y and w', () => {
      const ab = buildBuffer((dv) => {
        dv.setFloat32(0, 0.5, false);
        dv.setFloat32(4, 0.866, false);
      }, 8);

      const br = new BinaryReader(ab, false);
      const result = deserializeKeyframes(br, GMTCurveFormat.ROT_YW_FLOAT, V5, 1);
      expect(result[0]![0]).toBe(0);
      expect(result[0]![1]).toBeCloseTo(0.5);
      expect(result[0]![2]).toBe(0);
      expect(result[0]![3]).toBeCloseTo(0.866);
    });
  });

  describe('ROT_ZW_FLOAT (0x12)', () => {
    it('reads z and w', () => {
      const ab = buildBuffer((dv) => {
        dv.setFloat32(0, 1.0, false);
        dv.setFloat32(4, 0.0, false);
      }, 8);

      const br = new BinaryReader(ab, false);
      const result = deserializeKeyframes(br, GMTCurveFormat.ROT_ZW_FLOAT, V5, 1);
      expect(result[0]).toEqual([0, 0, 1, 0]);
    });
  });

  describe('PATTERN_HAND (0x1C)', () => {
    it('reads 2 x int16 per keyframe', () => {
      const ab = buildBuffer((dv) => {
        dv.setInt16(0, 3, false);
        dv.setInt16(2, 7, false);
        dv.setInt16(4, 0, false);
        dv.setInt16(6, -1, false);
      }, 8);

      const br = new BinaryReader(ab, false);
      const result = deserializeKeyframes(br, GMTCurveFormat.PATTERN_HAND, V5, 2);
      expect(result).toEqual([
        [3, 7],
        [0, -1],
      ]);
    });
  });

  describe('PATTERN_UNK (0x1D)', () => {
    it('reads 1 x int8 per keyframe and aligns to 4', () => {
      // 3 bytes of data + 1 byte alignment padding
      const ab = buildBuffer((dv) => {
        dv.setInt8(0, 1);
        dv.setInt8(1, -2);
        dv.setInt8(2, 3);
      }, 8);

      const br = new BinaryReader(ab, false);
      const result = deserializeKeyframes(br, GMTCurveFormat.PATTERN_UNK, V5, 3);
      expect(result).toEqual([[1], [-2], [3]]);
      // Should be aligned to 4 after reading 3 bytes
      expect(br.position).toBe(4);
    });
  });

  describe('ROT_QUAT_XYZ_INT (0x1E)', () => {
    it('deserializes packed quaternion with identity-like base/scale', () => {
      // Build a buffer with base quat, scale quat, and one packed keyframe
      // Base: [0, 0, 0, 0] as int16/32768
      // Scale: [32768, 32768, 32768, 32768] as uint16/32768 = [1, 1, 1, 1]
      // Packed: axisIndex=3 (derive w), all stored components = 0
      const ab = buildBuffer((dv) => {
        let o = 0;
        // Base quat: 4 x int16 (all zero)
        for (let i = 0; i < 4; i++) { dv.setInt16(o, 0, false); o += 2; }
        // Scale quat: 4 x uint16 = 32768 each (1.0 when /32768)
        for (let i = 0; i < 4; i++) { dv.setUint16(o, 32768, false); o += 2; }
        // Packed keyframe: axisIndex=3, all component bits = 0
        // packed = (0 << 2) | 3 = 3
        dv.setUint32(o, 3, false);
      }, 20);

      const br = new BinaryReader(ab, false);
      const result = deserializeKeyframes(br, GMTCurveFormat.ROT_QUAT_XYZ_INT, V5, 1);
      // With base=0, scale=1, and all bits=0, stored components are all 0
      // Derived w = sqrt(1 - 0) = 1
      expect(result[0]![0]).toBeCloseTo(0, 3);
      expect(result[0]![1]).toBeCloseTo(0, 3);
      expect(result[0]![2]).toBeCloseTo(0, 3);
      expect(result[0]![3]).toBeCloseTo(1, 3);
    });
  });
});
