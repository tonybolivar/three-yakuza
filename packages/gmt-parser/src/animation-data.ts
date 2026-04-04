/**
 * Keyframe value deserialization for each GMT curve format.
 * Ported from gmt_lib/gmt/structure/br/br_gmt_anm_data.py (MIT).
 */
import { BinaryReader } from '@three-yakuza/binary-reader';
import { GMTCurveFormat, GMTVersion } from './enums.js';

/**
 * Deserialize keyframe values from the binary animation data section.
 * Returns an array of value tuples (one per keyframe).
 */
export function deserializeKeyframes(
  br: BinaryReader,
  format: GMTCurveFormat,
  version: GMTVersion,
  count: number,
): number[][] {
  switch (format) {
    case GMTCurveFormat.LOC_XYZ:
      return readLocXYZ(br, count);
    case GMTCurveFormat.LOC_CHANNEL:
      return readLocChannel(br, count);
    case GMTCurveFormat.ROT_QUAT_XYZ_FLOAT:
      return readQuatXYZFloat(br, count);
    case GMTCurveFormat.ROT_XYZW_SHORT:
      return version === GMTVersion.KENZAN
        ? readQuatHalfFloat(br, count)
        : readQuatScaledShort(br, count);
    case GMTCurveFormat.ROT_XW_FLOAT:
      return readPartialQuatFloat(br, count, 0); // x, w
    case GMTCurveFormat.ROT_YW_FLOAT:
      return readPartialQuatFloat(br, count, 1); // y, w
    case GMTCurveFormat.ROT_ZW_FLOAT:
      return readPartialQuatFloat(br, count, 2); // z, w
    case GMTCurveFormat.ROT_XW_SHORT:
      return version === GMTVersion.KENZAN
        ? readPartialQuatHalfFloat(br, count, 0)
        : readPartialQuatScaledShort(br, count, 0);
    case GMTCurveFormat.ROT_YW_SHORT:
      return version === GMTVersion.KENZAN
        ? readPartialQuatHalfFloat(br, count, 1)
        : readPartialQuatScaledShort(br, count, 1);
    case GMTCurveFormat.ROT_ZW_SHORT:
      return version === GMTVersion.KENZAN
        ? readPartialQuatHalfFloat(br, count, 2)
        : readPartialQuatScaledShort(br, count, 2);
    case GMTCurveFormat.ROT_QUAT_XYZ_INT:
      return readQuatXYZInt(br, count);
    case GMTCurveFormat.PATTERN_HAND:
      return readPatternHand(br, count);
    case GMTCurveFormat.PATTERN_UNK:
      return readPatternUnk(br, count);
    default:
      throw new Error(`Unknown curve format: 0x${(format as number).toString(16)}`);
  }
}

// -- Location formats --

/** LOC_XYZ (0x06): 3 x float32 per keyframe. */
function readLocXYZ(br: BinaryReader, count: number): number[][] {
  const result: number[][] = [];
  for (let i = 0; i < count; i++) {
    result.push([br.readFloat32(), br.readFloat32(), br.readFloat32()]);
  }
  return result;
}

/** LOC_CHANNEL (0x04): 1 x float32 per keyframe. */
function readLocChannel(br: BinaryReader, count: number): number[][] {
  const result: number[][] = [];
  for (let i = 0; i < count; i++) {
    result.push([br.readFloat32()]);
  }
  return result;
}

// -- Rotation formats --

/** ROT_QUAT_XYZ_FLOAT (0x01): 3 x float32, w = sqrt(1 - x² - y² - z²). */
function readQuatXYZFloat(br: BinaryReader, count: number): number[][] {
  const result: number[][] = [];
  for (let i = 0; i < count; i++) {
    const x = br.readFloat32();
    const y = br.readFloat32();
    const z = br.readFloat32();
    const w = Math.sqrt(Math.max(0, 1.0 - x * x - y * y - z * z));
    result.push([x, y, z, w]);
  }
  return result;
}

/** ROT_XYZW_SHORT (0x02) for KENZAN: 4 x float16. */
function readQuatHalfFloat(br: BinaryReader, count: number): number[][] {
  const result: number[][] = [];
  for (let i = 0; i < count; i++) {
    result.push([br.readFloat16(), br.readFloat16(), br.readFloat16(), br.readFloat16()]);
  }
  return result;
}

/** ROT_XYZW_SHORT (0x02) for post-KENZAN: 4 x int16 / 16384. */
function readQuatScaledShort(br: BinaryReader, count: number): number[][] {
  const result: number[][] = [];
  for (let i = 0; i < count; i++) {
    result.push([
      br.readInt16() / 16384,
      br.readInt16() / 16384,
      br.readInt16() / 16384,
      br.readInt16() / 16384,
    ]);
  }
  return result;
}

/** ROT_XW/YW/ZW_FLOAT: 2 x float32 for one axis + w. axis: 0=x, 1=y, 2=z. */
function readPartialQuatFloat(br: BinaryReader, count: number, axis: number): number[][] {
  const result: number[][] = [];
  for (let i = 0; i < count; i++) {
    const a = br.readFloat32();
    const w = br.readFloat32();
    result.push(buildPartialQuat(axis, a, w));
  }
  return result;
}

/** ROT_XW/YW/ZW_SHORT for post-KENZAN: 2 x int16 / 16384. */
function readPartialQuatScaledShort(
  br: BinaryReader,
  count: number,
  axis: number,
): number[][] {
  const result: number[][] = [];
  for (let i = 0; i < count; i++) {
    const a = br.readInt16() / 16384;
    const w = br.readInt16() / 16384;
    result.push(buildPartialQuat(axis, a, w));
  }
  return result;
}

/** ROT_XW/YW/ZW_SHORT for KENZAN: 2 x float16. */
function readPartialQuatHalfFloat(
  br: BinaryReader,
  count: number,
  axis: number,
): number[][] {
  const result: number[][] = [];
  for (let i = 0; i < count; i++) {
    const a = br.readFloat16();
    const w = br.readFloat16();
    result.push(buildPartialQuat(axis, a, w));
  }
  return result;
}

/** Build a full [x, y, z, w] quaternion from a single axis value + w. */
function buildPartialQuat(axis: number, value: number, w: number): number[] {
  const q = [0, 0, 0, w];
  q[axis] = value;
  return q;
}

/**
 * ROT_QUAT_XYZ_INT (0x1E): Packed quaternion compression.
 * Reads a base+scale quaternion header, then per-keyframe packed uint32 values.
 * Ported from gmt_lib's read_quat_xyz_int().
 */
function readQuatXYZInt(br: BinaryReader, count: number): number[][] {
  // Read base and scale quaternions (header for all keyframes in this curve)
  const baseQuat = [
    br.readInt16() / 32768,
    br.readInt16() / 32768,
    br.readInt16() / 32768,
    br.readInt16() / 32768,
  ];
  const scaleQuat = [
    br.readUint16() / 32768,
    br.readUint16() / 32768,
    br.readUint16() / 32768,
    br.readUint16() / 32768,
  ];

  // Bit masks for extracting 10-bit fields from the packed uint32
  const masks = [0x3ff00000, 0x000ffc00, 0x000003ff];
  // Magic multipliers (from decompiled game code)
  const mults = buildMagicMultipliers();

  const result: number[][] = [];
  for (let i = 0; i < count; i++) {
    const packed = br.readUint32();
    const axisIndex = packed & 3; // lower 2 bits: which axis to derive
    const f = packed >>> 2; // remaining 30 bits: packed component data

    // The 3 indices that are explicitly stored (not the derived axis)
    const indices = [0, 1, 2, 3];
    indices.splice(axisIndex, 1);

    const components = [0, 0, 0, 0];
    for (let j = 0; j < 3; j++) {
      const idx = indices[j]!;
      components[idx] = (f & masks[j]!) * mults[j]! * scaleQuat[idx]! + baseQuat[idx]!;
    }

    // Derive the missing axis from unit quaternion constraint
    const sumSq =
      indices.reduce((acc, idx) => acc + components[idx]! * components[idx]!, 0);
    components[axisIndex] = Math.sqrt(Math.max(0, 1.0 - sumSq));

    result.push(components);
  }
  return result;
}

/**
 * Build the magic float multipliers used in ROT_QUAT_XYZ_INT decoding.
 * These specific bit patterns come from decompiled SEGA game code.
 */
function buildMagicMultipliers(): [number, number, number] {
  const buf0 = new ArrayBuffer(4);
  const buf1 = new ArrayBuffer(4);
  const buf2 = new ArrayBuffer(4);

  new Uint8Array(buf0).set([0x00, 0x00, 0x80, 0x30]);
  new Uint8Array(buf1).set([0x00, 0x00, 0x80, 0x35]);
  new Uint8Array(buf2).set([0x00, 0x00, 0x80, 0x3a]);

  return [
    new Float32Array(buf0)[0]!,
    new Float32Array(buf1)[0]!,
    new Float32Array(buf2)[0]!,
  ];
}

// -- Pattern formats --

/** PATTERN_HAND (0x1C): 2 x int16 per keyframe. */
function readPatternHand(br: BinaryReader, count: number): number[][] {
  const result: number[][] = [];
  for (let i = 0; i < count; i++) {
    result.push([br.readInt16(), br.readInt16()]);
  }
  return result;
}

/** PATTERN_UNK (0x1D): 1 x int8 per keyframe, aligned to 4 bytes after all. */
function readPatternUnk(br: BinaryReader, count: number): number[][] {
  const result: number[][] = [];
  for (let i = 0; i < count; i++) {
    result.push([br.readInt8()]);
  }
  br.align(4);
  return result;
}
