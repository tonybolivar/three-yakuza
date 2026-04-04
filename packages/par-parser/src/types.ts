/** Top-level parsed PAR archive. */
export interface PARArchive {
  readonly version: number;
  readonly folders: readonly PARFolder[];
  readonly files: readonly PARFile[];
  /** The root folder (first folder entry). */
  readonly root: PARFolder;
}

/** A folder within the PAR archive. */
export interface PARFolder {
  readonly name: string;
  readonly childFolderStartIndex: number;
  readonly childFolderCount: number;
  readonly childFileStartIndex: number;
  readonly childFileCount: number;
  readonly attributes: number;
}

/** A file entry within the PAR archive. */
export interface PARFile {
  readonly name: string;
  /** 0 = uncompressed, non-zero = SLLZ compressed. */
  readonly compression: number;
  /** Decompressed size in bytes. */
  readonly size: number;
  /** Compressed size in bytes (equals size if uncompressed). */
  readonly compressedSize: number;
  /** Absolute byte offset of file data within the PAR archive. */
  readonly dataOffset: number;
  readonly attributes: number;
  readonly timestamp: number;
}
