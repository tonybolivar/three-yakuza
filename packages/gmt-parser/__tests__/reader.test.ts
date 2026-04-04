import { describe, it, expect } from 'vitest';
import { BinaryReader } from '@three-yakuza/binary-reader';
import { parseHeader, parseGroups, parseCurves } from '../src/reader.js';
import { GMTVersion } from '../src/enums.js';

/** Helper: write a minimal valid GMT header into an ArrayBuffer. */
function writeMinimalHeader(options?: {
  magic?: string;
  littleEndian?: boolean;
  version?: number;
  faceGmt?: boolean;
}): ArrayBuffer {
  const {
    magic = 'GSGT',
    littleEndian = false,
    version = GMTVersion.YAKUZA5,
    faceGmt = false,
  } = options ?? {};

  const ab = new ArrayBuffer(0x80);
  const dv = new DataView(ab);
  const bytes = new Uint8Array(ab);

  // Magic (4 bytes ASCII)
  for (let i = 0; i < 4; i++) {
    bytes[i] = magic.charCodeAt(i);
  }

  // Endian marker at 0x04
  bytes[0x04] = littleEndian ? 0x21 : 0x02;
  // Endian flag at 0x05
  bytes[0x05] = littleEndian ? 0x00 : 0x01;

  const le = littleEndian;

  // Version at 0x08
  dv.setUint32(0x08, version, le);
  // Data size at 0x0C
  dv.setUint32(0x0c, 0x80, le);

  // Name (RGG string at 0x10): checksum + "test"
  const nameBytes = [0x74, 0x65, 0x73, 0x74]; // "test"
  const checksum = nameBytes.reduce((a, b) => a + b, 0);
  dv.setUint16(0x10, checksum, le);
  nameBytes.forEach((b, i) => { bytes[0x12 + i] = b; });

  // Section counts/offsets (all zero for minimal header)
  // 0x30-0x6F: 16 uint32 values
  // 0x70-0x7B: 3 uint32 padding

  // Flags at 0x7C
  if (faceGmt) {
    bytes[0x7c] = 0x07;
    bytes[0x7d] = 0x21;
  }

  return ab;
}

describe('parseHeader', () => {
  it('parses a valid big-endian header', () => {
    const ab = writeMinimalHeader();
    const { header } = parseHeader(ab);

    expect(header.name).toBe('test');
    expect(header.version).toBe(GMTVersion.YAKUZA5);
    expect(header.isFaceGmt).toBe(false);
    expect(header.littleEndian).toBe(false);
  });

  it('parses a little-endian header', () => {
    const ab = writeMinimalHeader({ littleEndian: true });
    const { header } = parseHeader(ab);

    expect(header.name).toBe('test');
    expect(header.version).toBe(GMTVersion.YAKUZA5);
    expect(header.littleEndian).toBe(true);
  });

  it('detects face GMT from flags', () => {
    const ab = writeMinimalHeader({ faceGmt: true });
    const { header } = parseHeader(ab);
    expect(header.isFaceGmt).toBe(true);
  });

  it('throws on invalid magic', () => {
    const ab = writeMinimalHeader({ magic: 'NOPE' });
    expect(() => parseHeader(ab)).toThrow('Invalid magic');
  });
});

describe('parseGroups', () => {
  it('reads uint16 index + uint16 count pairs', () => {
    const ab = new ArrayBuffer(8);
    const dv = new DataView(ab);
    // Group 0: index=5, count=3
    dv.setUint16(0, 5, false);
    dv.setUint16(2, 3, false);
    // Group 1: index=10, count=1
    dv.setUint16(4, 10, false);
    dv.setUint16(6, 1, false);

    const br = new BinaryReader(ab, false);
    const groups = parseGroups(br, 2);
    expect(groups).toEqual([
      { index: 5, count: 3 },
      { index: 10, count: 1 },
    ]);
  });
});

describe('parseCurves', () => {
  it('extracts format, channel, and type from packed field', () => {
    const ab = new ArrayBuffer(16);
    const dv = new DataView(ab);
    // graphIndex=2, dataOffset=0x100, format=0x06 (LOC_XYZ)
    // channelType: channel=0 (ALL) in upper 16, type=1 (LOCATION) in lower 16
    dv.setUint32(0, 2, false);
    dv.setUint32(4, 0x100, false);
    dv.setUint32(8, 0x06, false);
    dv.setUint32(12, (0 << 16) | 1, false);

    const br = new BinaryReader(ab, false);
    const curves = parseCurves(br, 1);
    expect(curves[0]).toEqual({
      graphIndex: 2,
      dataOffset: 0x100,
      format: 0x06,
      channel: 0,
      type: 1,
    });
  });

  it('extracts non-zero channel from upper bits', () => {
    const ab = new ArrayBuffer(16);
    const dv = new DataView(ab);
    dv.setUint32(0, 0, false);
    dv.setUint32(4, 0, false);
    dv.setUint32(8, 0x01, false); // ROT_QUAT_XYZ_FLOAT
    // channel=1 (X), type=0 (ROTATION)
    dv.setUint32(12, (1 << 16) | 0, false);

    const br = new BinaryReader(ab, false);
    const curves = parseCurves(br, 1);
    expect(curves[0]!.channel).toBe(1);
    expect(curves[0]!.type).toBe(0);
  });
});
