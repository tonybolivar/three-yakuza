/**
 * GMT binary format section parsing.
 * Ported from gmt_lib/gmt/structure/br/br_gmt.py (MIT).
 */
import { BinaryReader, readRGGString } from '@three-yakuza/binary-reader';
import type { GMTVersion, GMTCurveFormat, GMTCurveType, GMTCurveChannel } from './enums.js';
import { GMTParseError } from './errors.js';

// -- Internal raw types (not exported from package) --

export interface GMTHeader {
  name: string;
  version: GMTVersion;
  isFaceGmt: boolean;
  littleEndian: boolean;
  animationCount: number;
  animationOffset: number;
  graphCount: number;
  graphOffset: number;
  graphDataSize: number;
  graphDataOffset: number;
  stringCount: number;
  stringOffset: number;
  boneGroupCount: number;
  boneGroupOffset: number;
  curveGroupCount: number;
  curveGroupOffset: number;
  curveCount: number;
  curveOffset: number;
  animationDataSize: number;
  animationDataOffset: number;
}

export interface RawAnimation {
  startFrame: number;
  endFrame: number;
  index: number;
  frameRate: number;
  nameIndex: number;
  boneGroupIndex: number;
  curveGroupsIndex: number;
  curveGroupsCount: number;
  curvesCount: number;
  graphsIndex: number;
  graphsCount: number;
  animationDataSize: number;
  animationDataOffset: number;
  graphDataSize: number;
  graphDataOffset: number;
}

export interface RawGroup {
  index: number;
  count: number;
}

export interface RawCurve {
  graphIndex: number;
  dataOffset: number;
  format: GMTCurveFormat;
  channel: GMTCurveChannel;
  type: GMTCurveType;
}

const GMT_MAGIC = 'GSGT';

/**
 * Parse the 128-byte GMT header.
 * Detects endianness from the marker byte and returns a BinaryReader with correct endianness.
 */
export function parseHeader(buffer: ArrayBuffer): { header: GMTHeader; br: BinaryReader } {
  // Start reading big-endian to check the endian marker
  let br = new BinaryReader(buffer, false);

  // Magic: "GSGT" (4 bytes ASCII)
  const magic = String.fromCharCode(br.readUint8(), br.readUint8(), br.readUint8(), br.readUint8());
  if (magic !== GMT_MAGIC) {
    throw new GMTParseError(`Invalid magic: expected "GSGT", got "${magic}"`, 0);
  }

  // Endian marker at 0x04: 0x02 = big-endian, 0x21 = little-endian
  const endianMarker = br.readUint8();
  const littleEndian = endianMarker === 0x21;

  // Re-create with correct endianness
  if (littleEndian) {
    br = br.withEndianness(true);
  }

  // Skip endian flag (0x05) + padding (0x06-0x07)
  br.seek(0x08);

  const version = br.readUint32() as GMTVersion;
  br.skip(4); // 0x0C: data size (file size without trailing padding)

  // 0x10: File name (RGG String: 32 bytes)
  const name = readRGGString(br);

  // 0x30: Section offsets and counts
  const animationCount = br.readUint32();
  const animationOffset = br.readUint32();
  const graphCount = br.readUint32();
  const graphOffset = br.readUint32();
  const graphDataSize = br.readUint32();
  const graphDataOffset = br.readUint32();
  const stringCount = br.readUint32();
  const stringOffset = br.readUint32();
  const boneGroupCount = br.readUint32();
  const boneGroupOffset = br.readUint32();
  const curveGroupCount = br.readUint32();
  const curveGroupOffset = br.readUint32();
  const curveCount = br.readUint32();
  const curveOffset = br.readUint32();
  const animationDataSize = br.readUint32();
  const animationDataOffset = br.readUint32();

  // 0x70: 3 x uint32 padding
  br.skip(12);

  // 0x7C: Flags (4 x uint8)
  const flag0 = br.readUint8();
  const flag1 = br.readUint8();
  const isFaceGmt = flag0 === 0x07 && flag1 === 0x21;

  return {
    header: {
      name,
      version,
      isFaceGmt,
      littleEndian,
      animationCount,
      animationOffset,
      graphCount,
      graphOffset,
      graphDataSize,
      graphDataOffset,
      stringCount,
      stringOffset,
      boneGroupCount,
      boneGroupOffset,
      curveGroupCount,
      curveGroupOffset,
      curveCount,
      curveOffset,
      animationDataSize,
      animationDataOffset,
    },
    br,
  };
}

/** Parse animation structs (64 bytes each). */
export function parseAnimations(br: BinaryReader, count: number): RawAnimation[] {
  const result: RawAnimation[] = [];
  for (let i = 0; i < count; i++) {
    result.push({
      startFrame: br.readUint32(),
      endFrame: br.readUint32(),
      index: br.readUint32(),
      frameRate: br.readFloat32(),
      nameIndex: br.readUint32(),
      boneGroupIndex: br.readUint32(),
      curveGroupsIndex: br.readUint32(),
      curveGroupsCount: br.readUint32(),
      curvesCount: br.readUint32(),
      graphsIndex: br.readUint32(),
      graphsCount: br.readUint32(),
      animationDataSize: br.readUint32(),
      animationDataOffset: br.readUint32(),
      graphDataSize: br.readUint32(),
      graphDataOffset: br.readUint32(),
    });
    br.skip(4); // padding
  }
  return result;
}

/**
 * Parse graph structs (variable size).
 * Each graph: uint16 count + uint16[count] frame numbers + 0xFFFF delimiter.
 */
export function parseGraphs(br: BinaryReader, count: number): number[][] {
  const result: number[][] = [];
  for (let i = 0; i < count; i++) {
    const frameCount = br.readUint16();
    const frames: number[] = [];
    for (let j = 0; j < frameCount; j++) {
      frames.push(br.readUint16());
    }
    // Read and discard the 0xFFFF delimiter
    br.readUint16();
    result.push(frames);
  }
  return result;
}

/** Parse RGG strings (32 bytes each). */
export function parseStrings(br: BinaryReader, count: number): string[] {
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    result.push(readRGGString(br));
  }
  return result;
}

/** Parse group structs (4 bytes each): uint16 index + uint16 count. */
export function parseGroups(br: BinaryReader, count: number): RawGroup[] {
  const result: RawGroup[] = [];
  for (let i = 0; i < count; i++) {
    result.push({
      index: br.readUint16(),
      count: br.readUint16(),
    });
  }
  return result;
}

/** Parse curve structs (16 bytes each). */
export function parseCurves(br: BinaryReader, count: number): RawCurve[] {
  const result: RawCurve[] = [];
  for (let i = 0; i < count; i++) {
    const graphIndex = br.readUint32();
    const dataOffset = br.readUint32();
    const format = br.readUint32() as GMTCurveFormat;
    const channelType = br.readUint32();
    result.push({
      graphIndex,
      dataOffset,
      format,
      channel: ((channelType >> 16) & 0xffff) as GMTCurveChannel,
      type: (channelType & 0xffff) as GMTCurveType,
    });
  }
  return result;
}
