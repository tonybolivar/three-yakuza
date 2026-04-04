/**
 * CMT format enumerations.
 * Ported from gmt_lib/gmt/structure/enums/cmt_enum.py (MIT).
 */

export const CMTVersion = {
  KENZAN: 0x010001,
  YAKUZA3: 0x020000,
  YAKUZA4: 0x030000,
  YAKUZA5: 0x040000,
} as const;
export type CMTVersion = (typeof CMTVersion)[keyof typeof CMTVersion];

/** Base frame format (lower 16 bits of format flags). */
export const CMTFormat = {
  ROT_FLOAT: 0x00,
  DIST_ROT_SHORT: 0x01,
  DIST_ROT_XYZ: 0x02,
  FOC_ROLL: 0x04,
} as const;
export type CMTFormat = (typeof CMTFormat)[keyof typeof CMTFormat];

/** Flag indicating clip range data is present (OR'd with base format). */
export const CMT_CLIP_RANGE_FLAG = 0x010000;
