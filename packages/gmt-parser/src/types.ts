import type { GMTVersion, GMTCurveType, GMTCurveChannel } from './enums.js';

/** Top-level parsed GMT document. */
export interface GMTDocument {
  readonly name: string;
  readonly version: GMTVersion;
  readonly isFaceGmt: boolean;
  readonly animations: readonly GMTAnimation[];
}

/** A single animation within a GMT file. */
export interface GMTAnimation {
  readonly name: string;
  readonly frameRate: number;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly bones: ReadonlyMap<string, GMTBone>;
}

/** A bone's animation data within an animation. */
export interface GMTBone {
  readonly name: string;
  readonly curves: readonly GMTCurve[];
}

/** A single animation curve (location, rotation, or pattern). */
export interface GMTCurve {
  readonly type: GMTCurveType;
  readonly channel: GMTCurveChannel;
  readonly keyframes: readonly GMTKeyframe[];
}

/** A single keyframe: frame number + value tuple. */
export interface GMTKeyframe {
  readonly frame: number;
  /** 1-4 components depending on curve type/format. */
  readonly value: readonly number[];
}
