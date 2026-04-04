/**
 * GMT format enumerations.
 * Ported from gmt_lib/gmt/structure/enums/gmt_enum.py (MIT).
 */

/** GMT file version, stored as uint32 at header offset 0x08. */
export const GMTVersion = {
  KENZAN: 0x10001,
  YAKUZA3: 0x20000,
  /** Also used by Yakuza 0 and Yakuza Kiwami. */
  YAKUZA5: 0x20001,
  /** Also used by Dragon Engine games. */
  ISHIN: 0x20002,
} as const;
export type GMTVersion = (typeof GMTVersion)[keyof typeof GMTVersion];

/** Curve data type — lower 16 bits of the curve's channel_type field. */
export const GMTCurveType = {
  ROTATION: 0,
  LOCATION: 1,
  PATTERN_HAND: 4,
  PATTERN_UNK: 5,
  PATTERN_FACE: 6,
} as const;
export type GMTCurveType = (typeof GMTCurveType)[keyof typeof GMTCurveType];

/** Curve channel — upper 16 bits of the curve's channel_type field. */
export const GMTCurveChannel = {
  ALL: 0,
  X: 1,
  Y: 2,
  ZW: 3,
  Z: 4,
} as const;
export type GMTCurveChannel = (typeof GMTCurveChannel)[keyof typeof GMTCurveChannel];

/** Curve value encoding format — stored as uint32 in the curve struct. */
export const GMTCurveFormat = {
  /** 3 x float32 (x, y, z), w derived: sqrt(1 - x²- y² - z²) */
  ROT_QUAT_XYZ_FLOAT: 0x01,
  /** 4 x int16/16384 (post-KENZAN) or 4 x float16 (KENZAN) */
  ROT_XYZW_SHORT: 0x02,
  /** 1 x float32 per keyframe (single axis) */
  LOC_CHANNEL: 0x04,
  /** 3 x float32 per keyframe (x, y, z) */
  LOC_XYZ: 0x06,
  /** 2 x float32 (x, w) */
  ROT_XW_FLOAT: 0x10,
  /** 2 x float32 (y, w) */
  ROT_YW_FLOAT: 0x11,
  /** 2 x float32 (z, w) */
  ROT_ZW_FLOAT: 0x12,
  /** 2 x int16/16384 or float16 */
  ROT_XW_SHORT: 0x13,
  /** 2 x int16/16384 or float16 */
  ROT_YW_SHORT: 0x14,
  /** 2 x int16/16384 or float16 */
  ROT_ZW_SHORT: 0x15,
  /** 2 x int16 per keyframe (hand pose indices) */
  PATTERN_HAND: 0x1c,
  /** 1 x int8 per keyframe, aligned to 4 bytes */
  PATTERN_UNK: 0x1d,
  /** Packed quaternion: base/scale header + 10-bit fields per keyframe */
  ROT_QUAT_XYZ_INT: 0x1e,
} as const;
export type GMTCurveFormat = (typeof GMTCurveFormat)[keyof typeof GMTCurveFormat];
