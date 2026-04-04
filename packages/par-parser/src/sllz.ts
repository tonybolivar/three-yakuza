/**
 * SLLZ decompression (LZ77-style).
 * Ported from Yakuza-PAR-py (MIT).
 */
import { BinaryReader } from '@three-yakuza/binary-reader';

const SLLZ_MAGIC = 'SLLZ';

/**
 * Decompress an SLLZ-compressed data block.
 * @param data The compressed data (starting with the SLLZ header).
 * @returns The decompressed bytes.
 */
export function decompressSLLZ(data: ArrayBuffer): Uint8Array {
  const br = new BinaryReader(data, false);

  // Validate magic
  const magic = String.fromCharCode(
    br.readUint8(), br.readUint8(), br.readUint8(), br.readUint8(),
  );
  if (magic !== SLLZ_MAGIC) {
    throw new Error(`Invalid SLLZ magic: expected "SLLZ", got "${magic}"`);
  }

  // 0x04: endianness
  const endian = br.readUint8();
  const littleEndian = endian === 0;
  // 0x05: compression version
  const version = br.readUint8();
  // 0x06: header size
  br.skip(2);

  if (littleEndian) {
    // Re-read size fields with correct endianness
    const leBr = new BinaryReader(data, true);
    leBr.seek(8);
    return decompressPayload(leBr, version, data);
  }

  return decompressPayload(br, version, data);
}

function decompressPayload(br: BinaryReader, version: number, data: ArrayBuffer): Uint8Array {
  // 0x08: decompressed size
  const decompressedSize = br.readUint32();
  // 0x0C: compressed payload size
  br.readUint32();

  if (version === 1) {
    return decompressV1(new Uint8Array(data), br.position, decompressedSize);
  }

  throw new Error(`Unsupported SLLZ version: ${version}`);
}

/**
 * SLLZ v1 decompression: LZ77 with a continuous flag bit stream.
 *
 * The flag byte is consumed one bit at a time (MSB first). After each bit is
 * consumed, the flag is shifted and the count decremented. When all 8 bits are
 * used, the next byte from the input stream becomes the new flag byte — this
 * happens BEFORE reading data for the current operation, not at block boundaries.
 */
function decompressV1(
  input: Uint8Array,
  startOffset: number,
  decompressedSize: number,
): Uint8Array {
  const output = new Uint8Array(decompressedSize);
  let inPos = startOffset;
  let outPos = 0;

  // Read initial flag byte
  let flag = input[inPos]!;
  inPos++;
  let flagCount = 8;

  while (outPos < decompressedSize) {
    const isCopy = (flag & 0x80) !== 0;

    // Consume this bit and potentially refill the flag
    flag = (flag << 1) & 0xff;
    flagCount--;
    if (flagCount === 0) {
      flag = input[inPos]!;
      inPos++;
      flagCount = 8;
    }

    if (isCopy) {
      // Copy mode: read 2 bytes (little-endian) for distance + count
      const lo = input[inPos]!;
      const hi = input[inPos + 1]!;
      inPos += 2;
      const copyFlags = lo | (hi << 8);

      const copyDistance = 1 + (copyFlags >> 4);
      const copyCount = 3 + (copyFlags & 0x0f);

      for (let j = 0; j < copyCount && outPos < decompressedSize; j++) {
        output[outPos] = output[outPos - copyDistance]!;
        outPos++;
      }
    } else {
      // Literal mode: copy one byte directly
      output[outPos] = input[inPos]!;
      inPos++;
      outPos++;
    }
  }

  return output;
}
