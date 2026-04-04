import { describe, it, expect } from 'vitest';
import { parseCMT } from '../src/cmt-reader.js';
import { CMTVersion, CMTFormat } from '../src/cmt-enums.js';

/** Build a minimal CMT buffer with a given frame format. */
function buildCMT(options: {
  format: number;
  frameCount: number;
  writeFrames: (dv: DataView, offset: number) => number;
}): ArrayBuffer {
  const headerSize = 0x20;
  const animEntrySize = 0x10;
  const dataOffset = headerSize + animEntrySize;
  const totalSize = dataOffset + 256; // plenty of room
  const ab = new ArrayBuffer(totalSize);
  const dv = new DataView(ab);
  const bytes = new Uint8Array(ab);

  // Header
  bytes[0] = 0x43; bytes[1] = 0x4d; bytes[2] = 0x54; bytes[3] = 0x50; // "CMTP"
  bytes[0x05] = 1; // big-endian
  dv.setUint32(0x08, CMTVersion.YAKUZA5, false); // version
  dv.setUint32(0x0c, totalSize, false);
  dv.setUint32(0x10, 1, false); // 1 animation

  // Animation entry at 0x20
  dv.setFloat32(0x20, 30.0, false); // frameRate
  dv.setUint32(0x24, options.frameCount, false);
  dv.setUint32(0x28, dataOffset, false);
  dv.setUint32(0x2c, options.format, false);

  // Frame data
  options.writeFrames(dv, dataOffset);

  return ab;
}

describe('parseCMT', () => {
  it('parses a ROT_FLOAT frame', () => {
    const buf = buildCMT({
      format: CMTFormat.ROT_FLOAT,
      frameCount: 1,
      writeFrames: (dv, o) => {
        // location (3 floats)
        dv.setFloat32(o, 1.0, false); o += 4;
        dv.setFloat32(o, 2.0, false); o += 4;
        dv.setFloat32(o, 3.0, false); o += 4;
        // fov
        dv.setFloat32(o, 60.0, false); o += 4;
        // rotation quaternion (4 floats)
        dv.setFloat32(o, 0.0, false); o += 4;
        dv.setFloat32(o, 0.0, false); o += 4;
        dv.setFloat32(o, 0.0, false); o += 4;
        dv.setFloat32(o, 1.0, false);
        return o + 4;
      },
    });

    const doc = parseCMT(buf);
    expect(doc.version).toBe(CMTVersion.YAKUZA5);
    expect(doc.animations).toHaveLength(1);

    const anim = doc.animations[0]!;
    expect(anim.frameRate).toBe(30);
    expect(anim.format).toBe(CMTFormat.ROT_FLOAT);
    expect(anim.frames).toHaveLength(1);

    const frame = anim.frames[0]!;
    expect(frame.location).toEqual([1, 2, 3]);
    expect(frame.fov).toBe(60);
    expect(frame.rotation).toEqual([0, 0, 0, 1]);
    expect(frame.distance).toBeNull();
    expect(frame.focusPoint).toBeNull();
  });

  it('parses DIST_ROT_SHORT with scaled quaternion', () => {
    const buf = buildCMT({
      format: CMTFormat.DIST_ROT_SHORT,
      frameCount: 1,
      writeFrames: (dv, o) => {
        // location
        dv.setFloat32(o, 0, false); o += 4;
        dv.setFloat32(o, 0, false); o += 4;
        dv.setFloat32(o, 0, false); o += 4;
        // fov
        dv.setFloat32(o, 45.0, false); o += 4;
        // distance
        dv.setFloat32(o, 5.0, false); o += 4;
        // padding
        o += 4;
        // scaled quaternion: 16384 = 1.0
        dv.setInt16(o, 0, false); o += 2;
        dv.setInt16(o, 0, false); o += 2;
        dv.setInt16(o, 0, false); o += 2;
        dv.setInt16(o, 16384, false);
        return o + 2;
      },
    });

    const doc = parseCMT(buf);
    const frame = doc.animations[0]!.frames[0]!;
    expect(frame.distance).toBe(5);
    expect(frame.rotation).toEqual([0, 0, 0, 1]);
  });

  it('parses FOC_ROLL with focus point', () => {
    const buf = buildCMT({
      format: CMTFormat.FOC_ROLL,
      frameCount: 1,
      writeFrames: (dv, o) => {
        // location
        dv.setFloat32(o, 0, false); o += 4;
        dv.setFloat32(o, 1, false); o += 4;
        dv.setFloat32(o, 5, false); o += 4;
        // fov
        dv.setFloat32(o, 50.0, false); o += 4;
        // focus point
        dv.setFloat32(o, 0, false); o += 4;
        dv.setFloat32(o, 1, false); o += 4;
        dv.setFloat32(o, 0, false); o += 4;
        // roll
        dv.setFloat32(o, 0.1, false);
        return o + 4;
      },
    });

    const doc = parseCMT(buf);
    const frame = doc.animations[0]!.frames[0]!;
    expect(frame.focusPoint).toEqual([0, 1, 0]);
    expect(frame.roll).toBeCloseTo(0.1);
  });

  it('throws on invalid magic', () => {
    const ab = new ArrayBuffer(64);
    new Uint8Array(ab).set([0x00, 0x00, 0x00, 0x00]);
    expect(() => parseCMT(ab)).toThrow('Invalid CMT magic');
  });
});
