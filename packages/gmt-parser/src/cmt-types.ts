import type { CMTVersion, CMTFormat } from './cmt-enums.js';

/** Top-level parsed CMT document. */
export interface CMTDocument {
  readonly version: CMTVersion;
  readonly animations: readonly CMTAnimation[];
}

/** A single camera animation within a CMT file. */
export interface CMTAnimation {
  readonly frameRate: number;
  readonly format: CMTFormat;
  readonly frames: readonly CMTFrame[];
}

/** A single camera frame. */
export interface CMTFrame {
  /** Camera position (x, y, z). */
  readonly location: readonly [number, number, number];
  /** Field of view in degrees. */
  readonly fov: number;
  /** Camera rotation quaternion (x, y, z, w). Present in all formats. */
  readonly rotation: readonly [number, number, number, number];
  /** Distance from camera to focus point. Present in DIST_ROT_SHORT and DIST_ROT_XYZ. */
  readonly distance: number | null;
  /** Focus/look-at point (x, y, z). Present in FOC_ROLL format. */
  readonly focusPoint: readonly [number, number, number] | null;
  /** Roll angle in radians. Present in FOC_ROLL format. */
  readonly roll: number | null;
  /** Near/far clipping planes. Present when CLIP_RANGE flag is set. */
  readonly clipRange: readonly [number, number] | null;
}
