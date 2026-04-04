import { BinaryReader } from './binary-reader.js';

const RGG_STRING_TOTAL_SIZE = 32; // uint16 checksum + 30 bytes string data
const RGG_STRING_DATA_SIZE = 30;

const shiftJISDecoder = new TextDecoder('shift-jis');

/**
 * Read an RGG string (32 bytes): uint16 checksum + 30 bytes CP932/Shift-JIS.
 * Returns the decoded, null-trimmed string.
 */
export function readRGGString(br: BinaryReader): string {
  // Skip the uint16 checksum (informational, not validated)
  br.skip(2);

  const bytes = br.readBytes(RGG_STRING_DATA_SIZE);

  // Find null terminator
  let end = bytes.indexOf(0);
  if (end === -1) end = RGG_STRING_DATA_SIZE;

  const slice = bytes.subarray(0, end);
  return shiftJISDecoder.decode(slice);
}

/** Total byte size of an RGG string structure. */
export const RGG_STRING_SIZE = RGG_STRING_TOTAL_SIZE;
