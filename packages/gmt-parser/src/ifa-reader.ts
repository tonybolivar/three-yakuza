/**
 * IFA (facial pose / skeletal data) binary format parser.
 * Ported from gmt_lib/gmt/structure/br/br_ifa.py (MIT).
 */
import { BinaryReader, readRGGString } from '@three-yakuza/binary-reader';
import type { IFADocument, IFABone } from './ifa-types.js';
import { GMTParseError } from './errors.js';

/**
 * Parse an IFA file from an ArrayBuffer.
 * IFA files contain static bone poses (no animation frames).
 */
export function parseIFA(buffer: ArrayBuffer): IFADocument {
  let br = new BinaryReader(buffer, false);

  // 0x00: Magic — 4 null bytes for IFA
  const m0 = br.readUint8();
  const m1 = br.readUint8();
  const m2 = br.readUint8();
  const m3 = br.readUint8();
  if (m0 !== 0 || m1 !== 0 || m2 !== 0 || m3 !== 0) {
    throw new GMTParseError(
      `Invalid IFA magic: expected 4 null bytes, got [${m0}, ${m1}, ${m2}, ${m3}]`,
      0,
    );
  }

  // 0x04: endianness marker (0x02 = big-endian)
  const endianMarker = br.readUint8();
  const littleEndian = endianMarker !== 0x02;
  // 0x05: endianness flag
  br.skip(1);

  if (littleEndian) {
    br = br.withEndianness(true);
  }

  // 0x06-0x0F: padding (10 bytes)
  br.skip(10);

  // 0x10: bone count
  const boneCount = br.readUint32();

  // 0x14-0x1F: padding (12 bytes)
  br.skip(12);

  // Parse bone entries sequentially (starting at 0x20)
  const bones: IFABone[] = [];
  for (let i = 0; i < boneCount; i++) {
    const name = readRGGString(br);
    const parentName = readRGGString(br);

    const rotation: [number, number, number, number] = [
      br.readFloat32(), br.readFloat32(), br.readFloat32(), br.readFloat32(),
    ];
    const location: [number, number, number] = [
      br.readFloat32(), br.readFloat32(), br.readFloat32(),
    ];

    // Skip 20 bytes padding between bone entries
    br.skip(20);

    bones.push({ name, parentName, rotation, location });
  }

  return { bones };
}
