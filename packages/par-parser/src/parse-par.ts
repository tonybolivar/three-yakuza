/**
 * PAR archive format parser.
 * Ported from Yakuza-PAR-py (MIT).
 */
import { BinaryReader } from '@three-yakuza/binary-reader';
import type { PARArchive, PARFolder, PARFile } from './types.js';
import { decompressSLLZ } from './sllz.js';

const PAR_MAGIC = 'PARC';
const NAME_SIZE = 64; // Fixed-width Shift-JIS encoded names

const shiftJISDecoder = new TextDecoder('shift-jis');

/**
 * Parse a PAR archive from an ArrayBuffer.
 * Returns the archive structure (folders, files) without extracting file data.
 */
export function parsePAR(buffer: ArrayBuffer): PARArchive {
  let br = new BinaryReader(buffer, false);

  // Magic: "PARC" (4 bytes)
  const magic = String.fromCharCode(
    br.readUint8(), br.readUint8(), br.readUint8(), br.readUint8(),
  );
  if (magic !== PAR_MAGIC) {
    throw new Error(`Invalid PAR magic: expected "PARC", got "${magic}"`);
  }

  // 0x04: padding
  br.skip(1);
  // 0x05: endianness (0 = little, 1 = big)
  const endianFlag = br.readUint8();
  const littleEndian = endianFlag === 0;
  if (littleEndian) {
    br = br.withEndianness(true);
  }
  // 0x06: padding
  br.skip(2);

  // 0x08: version
  const version = br.readUint32();
  // 0x0C: padding
  br.skip(4);
  // 0x10: folder count
  const folderCount = br.readUint32();
  // 0x14: folder offset
  const folderOffset = br.readUint32();
  // 0x18: file count
  const fileCount = br.readUint32();
  // 0x1C: file offset
  const fileOffset = br.readUint32();

  // Read names section (at 0x20): folder names then file names, 64 bytes each
  const names: string[] = [];
  for (let i = 0; i < folderCount + fileCount; i++) {
    const nameBytes = br.readBytes(NAME_SIZE);
    const nullIdx = nameBytes.indexOf(0);
    const slice = nullIdx >= 0 ? nameBytes.subarray(0, nullIdx) : nameBytes;
    names.push(shiftJISDecoder.decode(slice));
  }

  // Parse folder entries
  br.seek(folderOffset);
  const folders: PARFolder[] = [];
  for (let i = 0; i < folderCount; i++) {
    const childFolderCount = br.readUint32();
    const childFolderStartIndex = br.readUint32();
    const childFileCount = br.readUint32();
    const childFileStartIndex = br.readUint32();
    const attributes = br.readUint32();
    br.skip(12); // padding

    folders.push({
      name: names[i] ?? '',
      childFolderCount,
      childFolderStartIndex,
      childFileCount,
      childFileStartIndex,
      attributes,
    });
  }

  // Parse file entries
  br.seek(fileOffset);
  const files: PARFile[] = [];
  for (let i = 0; i < fileCount; i++) {
    const compression = br.readUint32();
    const size = br.readUint32();
    const compressedSize = br.readUint32();
    const baseOffset = br.readUint32();
    const fileAttributes = br.readUint32();
    const extendedOffset = br.readUint32();
    // Timestamp: read as two uint32s and combine
    const tsLow = br.readUint32();
    const tsHigh = br.readUint32();
    const timestamp = tsHigh * 0x100000000 + tsLow;

    // 64-bit data offset
    const dataOffset = extendedOffset * 0x100000000 + baseOffset;

    files.push({
      name: names[folderCount + i] ?? '',
      compression,
      size,
      compressedSize,
      dataOffset,
      attributes: fileAttributes,
      timestamp,
    });
  }

  return {
    version,
    folders,
    files,
    root: folders[0]!,
  };
}

/**
 * Extract a file's data from the PAR archive buffer.
 * Handles SLLZ decompression automatically if the file is compressed.
 */
export function extractFile(archive: ArrayBuffer, file: PARFile): Uint8Array {
  const compressedData = archive.slice(file.dataOffset, file.dataOffset + file.compressedSize);

  if (file.compression !== 0) {
    return decompressSLLZ(compressedData);
  }

  return new Uint8Array(compressedData);
}
