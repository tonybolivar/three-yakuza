/** Error thrown when GMT binary parsing fails. Includes the byte offset. */
export class GMTParseError extends Error {
  constructor(
    message: string,
    public readonly offset: number,
  ) {
    super(`[GMT @ 0x${offset.toString(16).padStart(8, '0')}] ${message}`);
    this.name = 'GMTParseError';
  }
}
