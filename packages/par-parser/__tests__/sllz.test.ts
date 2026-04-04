import { describe, it, expect } from 'vitest';
import { decompressSLLZ } from '../src/sllz.js';

/** Build an SLLZ compressed buffer with raw bytes (no actual compression). */
function buildSLLZ(uncompressedData: number[]): ArrayBuffer {
  // SLLZ v1 with all literal bytes (no copy references)
  // Each flag byte controls 8 operations. 0 bits = literal.
  const payload: number[] = [];
  let i = 0;
  while (i < uncompressedData.length) {
    // Flag byte: all zeros = 8 literals
    payload.push(0x00);
    for (let bit = 0; bit < 8 && i < uncompressedData.length; bit++) {
      payload.push(uncompressedData[i]!);
      i++;
    }
  }

  // Header: 16 bytes
  const size = 16 + payload.length;
  const ab = new ArrayBuffer(size);
  const dv = new DataView(ab);
  const bytes = new Uint8Array(ab);

  // Magic "SLLZ"
  bytes[0] = 0x53; bytes[1] = 0x4c; bytes[2] = 0x4c; bytes[3] = 0x5a;
  // Endianness: big-endian
  bytes[4] = 1;
  // Version: 1
  bytes[5] = 1;
  // Header size
  dv.setUint16(6, 16, false);
  // Decompressed size
  dv.setUint32(8, uncompressedData.length, false);
  // Compressed payload size
  dv.setUint32(12, payload.length, false);

  // Write payload
  payload.forEach((b, idx) => { bytes[16 + idx] = b; });

  return ab;
}

/** Build SLLZ with copy references for testing LZ77 decompression. */
function buildSLLZWithCopy(): ArrayBuffer {
  // Decompress to: [0xAA, 0xBB, 0xCC, 0xAA, 0xBB, 0xCC]
  // Strategy: 3 literals, then 1 copy (distance=3, count=3)
  // Flag byte: 0b00010000 = 0x10 (bits 0-2 literal, bit 3 copy, rest unused)
  // Actually flag bits go MSB first: bit 7 is first operation
  // We want: literal, literal, literal, copy
  // So flag = 0b00010000 = 0x10 (first 3 ops = 0 = literal, 4th = 1 = copy)
  const payload: number[] = [];
  // Flag: bits 7,6,5 = 0 (literal), bit 4 = 1 (copy)
  payload.push(0x10);
  // 3 literals
  payload.push(0xaa);
  payload.push(0xbb);
  payload.push(0xcc);
  // Copy reference: distance=3 (high 12 bits = 2, since distance = 1 + val),
  // count=3 (low 4 bits = 0, since count = 3 + val)
  // copyFlags = (2 << 4) | 0 = 0x0020 → little-endian bytes: 0x20, 0x00
  payload.push(0x20); // lo byte
  payload.push(0x00); // hi byte

  const decompressedSize = 6;
  const size = 16 + payload.length;
  const ab = new ArrayBuffer(size);
  const dv = new DataView(ab);
  const bytes = new Uint8Array(ab);

  bytes[0] = 0x53; bytes[1] = 0x4c; bytes[2] = 0x4c; bytes[3] = 0x5a;
  bytes[4] = 1; // big-endian
  bytes[5] = 1; // version 1
  dv.setUint16(6, 16, false);
  dv.setUint32(8, decompressedSize, false);
  dv.setUint32(12, payload.length, false);

  payload.forEach((b, idx) => { bytes[16 + idx] = b; });
  return ab;
}

describe('decompressSLLZ', () => {
  it('decompresses all-literal data', () => {
    const data = [1, 2, 3, 4, 5];
    const compressed = buildSLLZ(data);
    const result = decompressSLLZ(compressed);
    expect(Array.from(result)).toEqual(data);
  });

  it('decompresses with copy references', () => {
    const compressed = buildSLLZWithCopy();
    const result = decompressSLLZ(compressed);
    expect(Array.from(result)).toEqual([0xaa, 0xbb, 0xcc, 0xaa, 0xbb, 0xcc]);
  });

  it('handles empty data', () => {
    const compressed = buildSLLZ([]);
    const result = decompressSLLZ(compressed);
    expect(result.length).toBe(0);
  });

  it('throws on invalid magic', () => {
    const ab = new ArrayBuffer(16);
    expect(() => decompressSLLZ(ab)).toThrow('Invalid SLLZ magic');
  });
});
