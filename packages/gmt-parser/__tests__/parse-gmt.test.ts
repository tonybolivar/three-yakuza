import { describe, it, expect } from 'vitest';
import { parseGMT } from '../src/parse-gmt.js';
import { GMTVersion, GMTCurveType, GMTCurveChannel, GMTCurveFormat } from '../src/enums.js';

/**
 * Build a minimal synthetic GMT file in memory.
 * 1 animation, 1 bone ("center"), 1 LOC_XYZ curve with 3 keyframes.
 *
 * Layout (big-endian):
 *   0x0000 - 0x007F: Header (128 bytes)
 *   0x0080 - 0x00BF: Animation struct (64 bytes)
 *   0x00C0 - 0x00C9: Graph (2 + 3*2 + 2 = 10 bytes)
 *   0x00CA - 0x00DF: padding to 0xE0
 *   0x00E0 - 0x00FF: String 0 "anim_01" (32 bytes, RGG)
 *   0x0100 - 0x011F: String 1 "center" (32 bytes, RGG)
 *   0x0120 - 0x0123: Bone group (4 bytes)
 *   0x0124 - 0x0127: Curve group (4 bytes)
 *   0x0128 - 0x0137: Curve struct (16 bytes)
 *   0x0138 - 0x015B: Animation data: 3 keyframes * 12 bytes = 36 bytes
 *   0x015C+: padding
 */
function buildSyntheticGMT(): ArrayBuffer {
  const size = 0x0200;
  const ab = new ArrayBuffer(size);
  const dv = new DataView(ab);
  const bytes = new Uint8Array(ab);

  let o = 0;

  // -- Header (0x0000 - 0x007F) --
  // Magic "GSGT"
  bytes[0] = 0x47; bytes[1] = 0x53; bytes[2] = 0x47; bytes[3] = 0x54;
  // Endian marker: big-endian
  bytes[0x04] = 0x02;
  bytes[0x05] = 0x01;
  // Version: YAKUZA5
  dv.setUint32(0x08, GMTVersion.YAKUZA5, false);
  // Data size
  dv.setUint32(0x0c, size, false);

  // File name (RGG string at 0x10): "test_gmt"
  writeRGGString(bytes, dv, 0x10, 'test_gmt', false);

  // Section counts and offsets
  dv.setUint32(0x30, 1, false);    // animations_count = 1
  dv.setUint32(0x34, 0x80, false);  // animations_offset
  dv.setUint32(0x38, 1, false);    // graphs_count = 1
  dv.setUint32(0x3c, 0xc0, false);  // graphs_offset
  dv.setUint32(0x40, 10, false);   // graph_data_size
  dv.setUint32(0x44, 0xc0, false); // graph_data_offset (where frame data lives)
  dv.setUint32(0x48, 2, false);    // strings_count = 2
  dv.setUint32(0x4c, 0xe0, false);  // strings_offset
  dv.setUint32(0x50, 1, false);    // bone_groups_count = 1
  dv.setUint32(0x54, 0x120, false); // bone_groups_offset
  dv.setUint32(0x58, 1, false);    // curve_groups_count = 1
  dv.setUint32(0x5c, 0x124, false); // curve_groups_offset
  dv.setUint32(0x60, 1, false);    // curves_count = 1
  dv.setUint32(0x64, 0x128, false); // curves_offset
  dv.setUint32(0x68, 36, false);   // animation_data_size
  dv.setUint32(0x6c, 0x138, false); // animation_data_offset
  // 0x70: padding (3 x uint32)
  // 0x7C: flags (not face GMT)

  // -- Animation struct (0x0080 - 0x00BF) --
  o = 0x80;
  dv.setUint32(o, 0, false); o += 4;     // start_frame = 0
  dv.setUint32(o, 60, false); o += 4;    // end_frame = 60
  dv.setUint32(o, 0, false); o += 4;     // index = 0
  dv.setFloat32(o, 30.0, false); o += 4; // frame_rate = 30fps
  dv.setUint32(o, 0, false); o += 4;     // name_index = 0 (→ "anim_01")
  dv.setUint32(o, 0, false); o += 4;     // bone_group_index = 0
  dv.setUint32(o, 0, false); o += 4;     // curve_groups_index = 0
  dv.setUint32(o, 1, false); o += 4;     // curve_groups_count = 1
  dv.setUint32(o, 1, false); o += 4;     // curves_count = 1
  dv.setUint32(o, 0, false); o += 4;     // graphs_index = 0
  dv.setUint32(o, 1, false); o += 4;     // graphs_count = 1
  dv.setUint32(o, 36, false); o += 4;    // animation_data_size
  dv.setUint32(o, 0x138, false); o += 4; // animation_data_offset
  dv.setUint32(o, 0, false); o += 4;     // graph_data_size
  dv.setUint32(o, 0, false); o += 4;     // graph_data_offset
  // padding: 4 bytes
  o += 4;

  // -- Graph (0x00C0) --
  o = 0xc0;
  dv.setUint16(o, 3, false); o += 2;     // count = 3 keyframes
  dv.setUint16(o, 0, false); o += 2;     // frame 0
  dv.setUint16(o, 30, false); o += 2;    // frame 30
  dv.setUint16(o, 60, false); o += 2;    // frame 60
  dv.setUint16(o, 0xffff, false);         // delimiter

  // -- Strings (0x00E0) --
  writeRGGString(bytes, dv, 0xe0, 'anim_01', false);
  writeRGGString(bytes, dv, 0x100, 'center', false);

  // -- Bone group (0x0120): index=1 (string index for first bone), count=1 --
  dv.setUint16(0x120, 1, false);  // index into strings = 1 → "center"
  dv.setUint16(0x122, 1, false);  // count = 1 bone

  // -- Curve group (0x0124): index=0 (first curve), count=1 --
  dv.setUint16(0x124, 0, false);
  dv.setUint16(0x126, 1, false);

  // -- Curve struct (0x0128) --
  dv.setUint32(0x128, 0, false);    // graph_index = 0
  dv.setUint32(0x12c, 0x138, false); // animation_data_offset
  dv.setUint32(0x130, GMTCurveFormat.LOC_XYZ, false); // format
  // channelType: channel=ALL(0) upper, type=LOCATION(1) lower
  dv.setUint32(0x134, (GMTCurveChannel.ALL << 16) | GMTCurveType.LOCATION, false);

  // -- Animation data (0x0138): 3 keyframes of LOC_XYZ (3 x float32 each) --
  o = 0x138;
  // Keyframe 0: (0, 0, 0)
  dv.setFloat32(o, 0.0, false); o += 4;
  dv.setFloat32(o, 0.0, false); o += 4;
  dv.setFloat32(o, 0.0, false); o += 4;
  // Keyframe 1: (1, 2, 3)
  dv.setFloat32(o, 1.0, false); o += 4;
  dv.setFloat32(o, 2.0, false); o += 4;
  dv.setFloat32(o, 3.0, false); o += 4;
  // Keyframe 2: (0, 0, 0)
  dv.setFloat32(o, 0.0, false); o += 4;
  dv.setFloat32(o, 0.0, false); o += 4;
  dv.setFloat32(o, 0.0, false);

  return ab;
}

/** Write an ASCII string as an RGG string (32 bytes) at the given offset. */
function writeRGGString(
  bytes: Uint8Array,
  dv: DataView,
  offset: number,
  str: string,
  le: boolean,
): void {
  const encoded: number[] = [];
  for (let i = 0; i < str.length; i++) {
    encoded.push(str.charCodeAt(i));
  }
  const checksum = encoded.reduce((a, b) => a + b, 0);
  dv.setUint16(offset, checksum, le);
  encoded.forEach((b, i) => { bytes[offset + 2 + i] = b; });
}

describe('parseGMT (integration)', () => {
  it('parses a synthetic GMT file correctly', () => {
    const buffer = buildSyntheticGMT();
    const doc = parseGMT(buffer);

    expect(doc.name).toBe('test_gmt');
    expect(doc.version).toBe(GMTVersion.YAKUZA5);
    expect(doc.isFaceGmt).toBe(false);
    expect(doc.animations).toHaveLength(1);

    const anim = doc.animations[0]!;
    expect(anim.name).toBe('anim_01');
    expect(anim.frameRate).toBe(30);
    expect(anim.startFrame).toBe(0);
    expect(anim.endFrame).toBe(60);
    expect(anim.bones.size).toBe(1);

    const bone = anim.bones.get('center');
    expect(bone).toBeDefined();
    expect(bone!.name).toBe('center');
    expect(bone!.curves).toHaveLength(1);

    const curve = bone!.curves[0]!;
    expect(curve.type).toBe(GMTCurveType.LOCATION);
    expect(curve.channel).toBe(GMTCurveChannel.ALL);
    expect(curve.keyframes).toHaveLength(3);

    // Keyframe 0: frame=0, value=(0, 0, 0)
    expect(curve.keyframes[0]!.frame).toBe(0);
    expect(curve.keyframes[0]!.value).toEqual([0, 0, 0]);

    // Keyframe 1: frame=30, value=(1, 2, 3)
    expect(curve.keyframes[1]!.frame).toBe(30);
    expect(curve.keyframes[1]!.value).toEqual([1, 2, 3]);

    // Keyframe 2: frame=60, value=(0, 0, 0)
    expect(curve.keyframes[2]!.frame).toBe(60);
    expect(curve.keyframes[2]!.value).toEqual([0, 0, 0]);
  });
});
