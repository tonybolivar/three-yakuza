import { describe, it, expect } from 'vitest';
import { BinaryReader } from '../src/binary-reader.js';
import { readRGGString } from '../src/rgg-string.js';

/** Build a 32-byte RGG string buffer from an ASCII string. */
function makeRGGBuffer(str: string): ArrayBuffer {
  const ab = new ArrayBuffer(32);
  const view = new DataView(ab);
  const bytes = new Uint8Array(ab);

  // Encode string as ASCII bytes
  const encoded: number[] = [];
  for (let i = 0; i < str.length; i++) {
    encoded.push(str.charCodeAt(i));
  }

  // Checksum: sum of all encoded bytes (uint16, big-endian by default)
  const checksum = encoded.reduce((a, b) => a + b, 0);
  view.setUint16(0, checksum, false); // big-endian

  // String data at offset 2, up to 30 bytes, null-padded
  for (let i = 0; i < encoded.length && i < 30; i++) {
    bytes[2 + i] = encoded[i]!;
  }

  return ab;
}

describe('readRGGString', () => {
  it('decodes ASCII bone name', () => {
    const ab = makeRGGBuffer('center');
    const br = new BinaryReader(ab, false);
    expect(readRGGString(br)).toBe('center');
    expect(br.position).toBe(32);
  });

  it('decodes another ASCII name', () => {
    const ab = makeRGGBuffer('ude_r_1');
    const br = new BinaryReader(ab, false);
    expect(readRGGString(br)).toBe('ude_r_1');
  });

  it('handles max length string (30 chars)', () => {
    const str = 'a'.repeat(30);
    const ab = makeRGGBuffer(str);
    const br = new BinaryReader(ab, false);
    expect(readRGGString(br)).toBe(str);
  });

  it('handles empty string (all zeros)', () => {
    const ab = new ArrayBuffer(32);
    const br = new BinaryReader(ab, false);
    expect(readRGGString(br)).toBe('');
  });

  it('advances position by exactly 32 bytes', () => {
    // Two RGG strings back to back
    const ab = new ArrayBuffer(64);
    const bytes = new Uint8Array(ab);

    // First string: "kosi"
    const s1 = [0x6b, 0x6f, 0x73, 0x69]; // ASCII: k, o, s, i
    const checksum1 = s1.reduce((a, b) => a + b, 0);
    new DataView(ab).setUint16(0, checksum1, false);
    s1.forEach((b, i) => { bytes[2 + i] = b; });

    // Second string: "mune"
    const s2 = [0x6d, 0x75, 0x6e, 0x65]; // ASCII: m, u, n, e
    const checksum2 = s2.reduce((a, b) => a + b, 0);
    new DataView(ab).setUint16(32, checksum2, false);
    s2.forEach((b, i) => { bytes[34 + i] = b; });

    const br = new BinaryReader(ab, false);
    expect(readRGGString(br)).toBe('kosi');
    expect(br.position).toBe(32);
    expect(readRGGString(br)).toBe('mune');
    expect(br.position).toBe(64);
  });
});
