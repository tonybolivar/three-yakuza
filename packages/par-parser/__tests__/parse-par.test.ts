import { describe, it, expect } from 'vitest';
import { parsePAR, extractFile } from '../src/parse-par.js';

/**
 * Build a minimal PAR archive with 1 folder and 2 files.
 *
 * Layout:
 *   0x0000: Header (32 bytes)
 *   0x0020: Names section (3 * 64 = 192 bytes)
 *   0x00E0: Folder entries (1 * 32 = 32 bytes)
 *   0x0100: File entries (2 * 32 = 64 bytes)
 *   0x0140: File data
 */
function buildMinimalPAR(): ArrayBuffer {
  const size = 0x200;
  const ab = new ArrayBuffer(size);
  const dv = new DataView(ab);
  const bytes = new Uint8Array(ab);

  // Header
  bytes[0] = 0x50; bytes[1] = 0x41; bytes[2] = 0x52; bytes[3] = 0x43; // "PARC"
  bytes[0x05] = 1; // big-endian
  dv.setUint32(0x08, 1, false); // version
  dv.setUint32(0x10, 1, false); // folder count
  dv.setUint32(0x14, 0xe0, false); // folder offset
  dv.setUint32(0x18, 2, false); // file count
  dv.setUint32(0x1c, 0x100, false); // file offset

  // Names at 0x20: 3 names (1 folder + 2 files), 64 bytes each
  writeName(bytes, 0x20, '.');
  writeName(bytes, 0x60, 'hello.txt');
  writeName(bytes, 0xa0, 'data.bin');

  // Folder entry at 0xE0 (32 bytes)
  dv.setUint32(0xe0, 0, false); // child folder count
  dv.setUint32(0xe4, 0, false); // child folder start
  dv.setUint32(0xe8, 2, false); // child file count
  dv.setUint32(0xec, 0, false); // child file start
  dv.setUint32(0xf0, 0, false); // attributes
  // 12 bytes padding

  // File entry 0 at 0x100 (32 bytes): uncompressed "hello.txt"
  dv.setUint32(0x100, 0, false); // compression = 0
  dv.setUint32(0x104, 5, false); // size = 5
  dv.setUint32(0x108, 5, false); // compressed size = 5
  dv.setUint32(0x10c, 0x140, false); // base offset
  dv.setUint32(0x110, 0, false); // attributes
  dv.setUint32(0x114, 0, false); // extended offset
  dv.setUint32(0x118, 0, false); // timestamp low
  dv.setUint32(0x11c, 0, false); // timestamp high

  // File entry 1 at 0x120 (32 bytes): uncompressed "data.bin"
  dv.setUint32(0x120, 0, false); // compression = 0
  dv.setUint32(0x124, 3, false); // size = 3
  dv.setUint32(0x128, 3, false); // compressed size = 3
  dv.setUint32(0x12c, 0x150, false); // base offset
  dv.setUint32(0x130, 0, false); // attributes
  dv.setUint32(0x134, 0, false); // extended offset
  dv.setUint32(0x138, 0, false); // timestamp low
  dv.setUint32(0x13c, 0, false); // timestamp high

  // File data
  bytes[0x140] = 0x48; // H
  bytes[0x141] = 0x65; // e
  bytes[0x142] = 0x6c; // l
  bytes[0x143] = 0x6c; // l
  bytes[0x144] = 0x6f; // o

  bytes[0x150] = 0x01;
  bytes[0x151] = 0x02;
  bytes[0x152] = 0x03;

  return ab;
}

function writeName(bytes: Uint8Array, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    bytes[offset + i] = str.charCodeAt(i);
  }
}

describe('parsePAR', () => {
  it('parses header and structure', () => {
    const buf = buildMinimalPAR();
    const archive = parsePAR(buf);

    expect(archive.version).toBe(1);
    expect(archive.folders).toHaveLength(1);
    expect(archive.files).toHaveLength(2);
  });

  it('reads folder names and structure', () => {
    const buf = buildMinimalPAR();
    const archive = parsePAR(buf);

    expect(archive.root.name).toBe('.');
    expect(archive.root.childFileCount).toBe(2);
    expect(archive.root.childFolderCount).toBe(0);
  });

  it('reads file names and metadata', () => {
    const buf = buildMinimalPAR();
    const archive = parsePAR(buf);

    expect(archive.files[0]!.name).toBe('hello.txt');
    expect(archive.files[0]!.size).toBe(5);
    expect(archive.files[0]!.compression).toBe(0);

    expect(archive.files[1]!.name).toBe('data.bin');
    expect(archive.files[1]!.size).toBe(3);
  });

  it('extracts uncompressed file data', () => {
    const buf = buildMinimalPAR();
    const archive = parsePAR(buf);

    const data = extractFile(buf, archive.files[0]!);
    expect(Array.from(data)).toEqual([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"

    const data2 = extractFile(buf, archive.files[1]!);
    expect(Array.from(data2)).toEqual([0x01, 0x02, 0x03]);
  });

  it('throws on invalid magic', () => {
    const ab = new ArrayBuffer(64);
    expect(() => parsePAR(ab)).toThrow('Invalid PAR magic');
  });
});
