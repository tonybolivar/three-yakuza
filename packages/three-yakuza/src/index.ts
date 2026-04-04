// Parsers
export { parseGMT, parseCMT, parseIFA, GMTParseError } from '@three-yakuza/gmt-parser';
export { GMTVersion, GMTCurveType, GMTCurveChannel, GMTCurveFormat } from '@three-yakuza/gmt-parser';
export { CMTVersion, CMTFormat, CMT_CLIP_RANGE_FLAG } from '@three-yakuza/gmt-parser';
export type {
  GMTDocument, GMTAnimation, GMTBone, GMTCurve, GMTKeyframe,
  CMTDocument, CMTAnimation, CMTFrame,
  IFADocument, IFABone,
} from '@three-yakuza/gmt-parser';

export { parseGMD } from '@three-yakuza/gmd-parser';
export type { GMDDocument, GMDVersion, GMDNode, GMDMesh, GMDMaterial, GMDVertexBuffer } from '@three-yakuza/gmd-parser';

export { parsePAR, extractFile, decompressSLLZ } from '@three-yakuza/par-parser';
export type { PARArchive, PARFolder, PARFile } from '@three-yakuza/par-parser';

// Three.js loaders
export { GMTLoader } from '@three-yakuza/three-gmt';
export { GMTAnimationClipBuilder } from '@three-yakuza/three-gmt';
export type { GMTLoadResult } from '@three-yakuza/three-gmt';

export { GMDLoader } from '@three-yakuza/three-gmd';
export { createSEGAMaterial } from '@three-yakuza/three-gmd';
export type { GMDLoadResult, SEGAMaterialOptions } from '@three-yakuza/three-gmd';
