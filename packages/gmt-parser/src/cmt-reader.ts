/**
 * CMT (Camera Motion) binary format parser.
 * Ported from gmt_lib/gmt/structure/br/br_cmt.py (MIT).
 */
import { BinaryReader } from '@three-yakuza/binary-reader';
import type { CMTDocument, CMTAnimation, CMTFrame } from './cmt-types.js';
import type { CMTVersion, CMTFormat } from './cmt-enums.js';
import { CMT_CLIP_RANGE_FLAG } from './cmt-enums.js';
import { GMTParseError } from './errors.js';

const CMT_MAGIC = 'CMTP';

/**
 * Parse a CMT camera animation file from an ArrayBuffer.
 */
export function parseCMT(buffer: ArrayBuffer): CMTDocument {
  let br = new BinaryReader(buffer, false);

  // Magic: "CMTP" (4 bytes)
  const magic = String.fromCharCode(
    br.readUint8(), br.readUint8(), br.readUint8(), br.readUint8(),
  );
  if (magic !== CMT_MAGIC) {
    throw new GMTParseError(`Invalid CMT magic: expected "CMTP", got "${magic}"`, 0);
  }

  // 0x04: padding (1 byte)
  br.skip(1);
  // 0x05: endianness flag (1 = big-endian, 0 = little-endian)
  const endianFlag = br.readUint8();
  const littleEndian = endianFlag === 0;
  if (littleEndian) {
    br = br.withEndianness(true);
  }

  // 0x06: padding (2 bytes)
  br.skip(2);
  // 0x08: version
  const version = br.readUint32() as CMTVersion;
  // 0x0C: total file size
  br.skip(4);
  // 0x10: animation count
  const animationCount = br.readUint32();
  // 0x14: padding (12 bytes)
  br.skip(12);

  // Parse animation entries (0x10 bytes each, starting at 0x20)
  const animations: CMTAnimation[] = [];
  const animEntries: { frameRate: number; frameCount: number; dataOffset: number; formatFlags: number }[] = [];

  for (let i = 0; i < animationCount; i++) {
    const frameRate = br.readFloat32();
    const frameCount = br.readUint32();
    const dataOffset = br.readUint32();
    const formatFlags = br.readUint32();
    animEntries.push({ frameRate, frameCount, dataOffset, formatFlags });
  }

  // Parse frame data for each animation
  for (const entry of animEntries) {
    const baseFormat = (entry.formatFlags & 0xffff) as CMTFormat;
    const hasClipRange = (entry.formatFlags & CMT_CLIP_RANGE_FLAG) !== 0;

    br.seek(entry.dataOffset);
    const frames: CMTFrame[] = [];

    for (let f = 0; f < entry.frameCount; f++) {
      frames.push(readFrame(br, baseFormat));
    }

    // Read clip range data if present (after all frame data)
    if (hasClipRange) {
      for (let f = 0; f < entry.frameCount; f++) {
        const near = br.readFloat32();
        const far = br.readFloat32();
        // Mutate the frame to add clip range
        (frames[f] as { clipRange: readonly [number, number] | null }).clipRange = [near, far];
      }
    }

    animations.push({
      frameRate: entry.frameRate,
      format: baseFormat,
      frames,
    });
  }

  return { version, animations };
}

function readFrame(br: BinaryReader, format: CMTFormat): CMTFrame {
  // All formats start with location (3 floats) + fov (1 float)
  const location: [number, number, number] = [
    br.readFloat32(), br.readFloat32(), br.readFloat32(),
  ];
  const fov = br.readFloat32();

  switch (format) {
    case 0x00: // ROT_FLOAT: 4 float quaternion
      return {
        location, fov,
        rotation: [br.readFloat32(), br.readFloat32(), br.readFloat32(), br.readFloat32()],
        distance: null, focusPoint: null, roll: null, clipRange: null,
      };

    case 0x01: { // DIST_ROT_SHORT: distance + 4 scaled int16 quaternion
      const distance = br.readFloat32();
      br.skip(4); // padding
      const rotation: [number, number, number, number] = [
        br.readInt16() / 16384,
        br.readInt16() / 16384,
        br.readInt16() / 16384,
        br.readInt16() / 16384,
      ];
      return {
        location, fov, rotation, distance,
        focusPoint: null, roll: null, clipRange: null,
      };
    }

    case 0x02: { // DIST_ROT_XYZ: distance + 3 float xyz, w derived
      const distance = br.readFloat32();
      const x = br.readFloat32();
      const y = br.readFloat32();
      const z = br.readFloat32();
      const w = Math.sqrt(Math.max(0, 1.0 - x * x - y * y - z * z));
      return {
        location, fov, rotation: [x, y, z, w], distance,
        focusPoint: null, roll: null, clipRange: null,
      };
    }

    case 0x04: { // FOC_ROLL: focus point + roll
      const focusPoint: [number, number, number] = [
        br.readFloat32(), br.readFloat32(), br.readFloat32(),
      ];
      const roll = br.readFloat32();
      // Derive rotation from location → focusPoint direction + roll
      // Store as identity for now; consumers should use focusPoint/roll directly
      return {
        location, fov, rotation: [0, 0, 0, 1],
        distance: null, focusPoint, roll, clipRange: null,
      };
    }

    default:
      throw new GMTParseError(
        `Unknown CMT frame format: 0x${(format as number).toString(16)}`,
        br.position,
      );
  }
}
