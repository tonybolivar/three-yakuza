// GMT
export { parseGMT } from './parse-gmt.js';
export type {
  GMTDocument,
  GMTAnimation,
  GMTBone,
  GMTCurve,
  GMTKeyframe,
} from './types.js';
export {
  GMTVersion,
  GMTCurveType,
  GMTCurveChannel,
  GMTCurveFormat,
} from './enums.js';
export { GMTParseError } from './errors.js';

// CMT
export { parseCMT } from './cmt-reader.js';
export type { CMTDocument, CMTAnimation, CMTFrame } from './cmt-types.js';
export { CMTVersion, CMTFormat, CMT_CLIP_RANGE_FLAG } from './cmt-enums.js';

// IFA
export { parseIFA } from './ifa-reader.js';
export type { IFADocument, IFABone } from './ifa-types.js';
