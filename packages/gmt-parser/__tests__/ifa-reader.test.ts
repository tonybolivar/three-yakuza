import { describe, it, expect } from 'vitest';
import { parseIFA } from '../src/ifa-reader.js';

/** Build a minimal IFA buffer with N bones. */
function buildIFA(bones: { name: string; parent: string; rot: number[]; loc: number[] }[]): ArrayBuffer {
  // Header: 0x20 bytes
  // Per bone: 32 (name RGG) + 32 (parent RGG) + 16 (rotation) + 12 (location) + 20 (padding) = 112 bytes
  const boneSize = 32 + 32 + 16 + 12 + 20;
  const size = 0x20 + bones.length * boneSize;
  const ab = new ArrayBuffer(size);
  const dv = new DataView(ab);
  const bytes = new Uint8Array(ab);

  // Header: 4 null bytes magic
  // 0x04: endian marker = 0x02 (big-endian)
  bytes[0x04] = 0x02;
  // 0x05: endian flag = 0x01
  bytes[0x05] = 0x01;
  // 0x10: bone count
  dv.setUint32(0x10, bones.length, false);

  let o = 0x20;
  for (const bone of bones) {
    // RGG string: name
    o = writeRGG(bytes, dv, o, bone.name, false);
    // RGG string: parent
    o = writeRGG(bytes, dv, o, bone.parent, false);
    // Rotation (4 floats)
    for (const v of bone.rot) { dv.setFloat32(o, v, false); o += 4; }
    // Location (3 floats)
    for (const v of bone.loc) { dv.setFloat32(o, v, false); o += 4; }
    // 20 bytes padding
    o += 20;
  }

  return ab;
}

function writeRGG(bytes: Uint8Array, dv: DataView, offset: number, str: string, le: boolean): number {
  const encoded: number[] = [];
  for (let i = 0; i < str.length; i++) encoded.push(str.charCodeAt(i));
  const checksum = encoded.reduce((a, b) => a + b, 0);
  dv.setUint16(offset, checksum, le);
  encoded.forEach((b, i) => { bytes[offset + 2 + i] = b; });
  return offset + 32;
}

describe('parseIFA', () => {
  it('parses a single bone', () => {
    const buf = buildIFA([
      { name: '_jaw_c_n', parent: 'head', rot: [0, 0, 0, 1], loc: [0, 0.5, 0] },
    ]);
    const doc = parseIFA(buf);
    expect(doc.bones).toHaveLength(1);
    expect(doc.bones[0]!.name).toBe('_jaw_c_n');
    expect(doc.bones[0]!.parentName).toBe('head');
    expect(doc.bones[0]!.rotation).toEqual([0, 0, 0, 1]);
    expect(doc.bones[0]!.location).toEqual([0, 0.5, 0]);
  });

  it('parses multiple bones', () => {
    const buf = buildIFA([
      { name: 'bone_a', parent: 'root', rot: [0, 0, 0, 1], loc: [1, 0, 0] },
      { name: 'bone_b', parent: 'bone_a', rot: [0.5, 0.5, 0.5, 0.5], loc: [0, 1, 0] },
    ]);
    const doc = parseIFA(buf);
    expect(doc.bones).toHaveLength(2);
    expect(doc.bones[0]!.name).toBe('bone_a');
    expect(doc.bones[1]!.name).toBe('bone_b');
    expect(doc.bones[1]!.parentName).toBe('bone_a');
  });

  it('parses empty IFA (0 bones)', () => {
    const buf = buildIFA([]);
    const doc = parseIFA(buf);
    expect(doc.bones).toHaveLength(0);
  });

  it('throws on invalid magic', () => {
    const ab = new ArrayBuffer(64);
    new Uint8Array(ab).set([0x47, 0x53, 0x47, 0x54]); // "GSGT" instead of nulls
    expect(() => parseIFA(ab)).toThrow('Invalid IFA magic');
  });
});
