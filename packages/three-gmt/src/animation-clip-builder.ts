/**
 * Converts parsed GMT animation data into Three.js AnimationClips.
 */
import {
  AnimationClip,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
} from 'three';
import type { KeyframeTrack } from 'three';
import type { GMTAnimation, GMTCurve } from '@three-yakuza/gmt-parser';
import { GMTCurveType, GMTCurveChannel } from '@three-yakuza/gmt-parser';

export class GMTAnimationClipBuilder {
  /**
   * Bone rest positions for face GMT additive position blending.
   * Face GMT positions are tiny deltas that must be added to rest positions.
   * Map from bone name to [x, y, z].
   */
  boneRestPositions: Map<string, [number, number, number]> | null = null;

  /** Whether current clips are face GMT (positions are additive deltas). */
  isFaceGmt = false;

  /** Convert a single GMTAnimation to a Three.js AnimationClip. */
  buildClip(animation: GMTAnimation): AnimationClip {
    const tracks: KeyframeTrack[] = [];

    for (const [boneName, bone] of animation.bones) {
      // Skip pose labels (no curves) and face GMT metadata bones
      // that aren't in the skeleton (non, root, head, lip, param*, am_*)
      if (bone.curves.length === 0) continue;
      if (this.isFaceGmt && !boneName.startsWith('_')) continue;

      const locationCurves = bone.curves.filter(
        (c) => c.type === GMTCurveType.LOCATION,
      );
      if (locationCurves.length > 0) {
        const track = this.buildLocationTrack(boneName, locationCurves, animation.frameRate);
        if (track) tracks.push(track);
      }

      const rotationCurves = bone.curves.filter(
        (c) => c.type === GMTCurveType.ROTATION,
      );
      if (rotationCurves.length > 0) {
        const track = this.buildRotationTrack(boneName, rotationCurves, animation.frameRate);
        if (track) tracks.push(track);
      }
    }

    const duration = (animation.endFrame - animation.startFrame) / animation.frameRate;
    return new AnimationClip(animation.name, duration, tracks);
  }

  /** Convert all animations in a GMT document to AnimationClips. */
  buildClips(animations: readonly GMTAnimation[]): AnimationClip[] {
    return animations.map((a) => this.buildClip(a));
  }

  private buildLocationTrack(
    boneName: string,
    curves: GMTCurve[],
    frameRate: number,
  ): VectorKeyframeTrack | null {
    // Merge curves: ALL channel provides xyz, single-channel overrides one axis
    const merged = this.mergeLocationCurves(curves);
    if (merged.length === 0) return null;

    const times: number[] = [];
    const values: number[] = [];

    // Face GMT: position values are additive deltas — add rest position
    const rest = this.isFaceGmt && this.boneRestPositions
      ? this.boneRestPositions.get(boneName) ?? null
      : null;

    for (const kf of merged) {
      times.push(kf.frame / frameRate);
      if (rest) {
        values.push(kf.x + rest[0], kf.y + rest[1], kf.z + rest[2]);
      } else {
        values.push(kf.x, kf.y, kf.z);
      }
    }

    return new VectorKeyframeTrack(`${boneName}.position`, times, values);
  }

  private buildRotationTrack(
    boneName: string,
    curves: GMTCurve[],
    frameRate: number,
  ): QuaternionKeyframeTrack | null {
    const merged = this.mergeRotationCurves(curves);
    if (merged.length === 0) return null;

    const times: number[] = [];
    const values: number[] = [];

    for (const kf of merged) {
      times.push(kf.frame / frameRate);
      values.push(kf.x, kf.y, kf.z, kf.w);
    }

    return new QuaternionKeyframeTrack(`${boneName}.quaternion`, times, values);
  }

  /**
   * Merge location curves for a bone. If an ALL-channel curve exists, use it as base.
   * Single-channel curves (X, Y, Z) override the corresponding component.
   */
  private mergeLocationCurves(
    curves: GMTCurve[],
  ): { frame: number; x: number; y: number; z: number }[] {
    const allCurve = curves.find((c) => c.channel === GMTCurveChannel.ALL);

    if (allCurve) {
      // Start from ALL curve, apply any per-axis overrides
      const result = allCurve.keyframes.map((kf) => ({
        frame: kf.frame,
        x: kf.value[0] ?? 0,
        y: kf.value[1] ?? 0,
        z: kf.value[2] ?? 0,
      }));

      for (const curve of curves) {
        if (curve.channel === GMTCurveChannel.ALL) continue;
        this.applyLocationOverrides(result, curve);
      }
      return result;
    }

    // No ALL curve — build from single-channel curves
    // Collect all unique frames
    const frameSet = new Set<number>();
    for (const curve of curves) {
      for (const kf of curve.keyframes) {
        frameSet.add(kf.frame);
      }
    }
    const frames = [...frameSet].sort((a, b) => a - b);

    return frames.map((frame) => {
      const kf = { frame, x: 0, y: 0, z: 0 };
      for (const curve of curves) {
        const match = curve.keyframes.find((k) => k.frame === frame);
        if (match) {
          this.setLocationComponent(kf, curve.channel, match.value[0] ?? 0);
        }
      }
      return kf;
    });
  }

  private applyLocationOverrides(
    result: { frame: number; x: number; y: number; z: number }[],
    curve: GMTCurve,
  ): void {
    for (const kf of curve.keyframes) {
      const target = result.find((r) => r.frame === kf.frame);
      if (target) {
        this.setLocationComponent(target, curve.channel, kf.value[0] ?? 0);
      }
    }
  }

  private setLocationComponent(
    target: { x: number; y: number; z: number },
    channel: GMTCurve['channel'],
    value: number,
  ): void {
    switch (channel) {
      case GMTCurveChannel.X: target.x = value; break;
      case GMTCurveChannel.Y: target.y = value; break;
      case GMTCurveChannel.Z: target.z = value; break;
    }
  }

  /**
   * Merge rotation curves for a bone.
   * ALL-channel curves provide full xyzw quaternions.
   * Partial-channel curves (X/XW, Y/YW, ZW) provide partial components.
   */
  private mergeRotationCurves(
    curves: GMTCurve[],
  ): { frame: number; x: number; y: number; z: number; w: number }[] {
    const allCurve = curves.find((c) => c.channel === GMTCurveChannel.ALL);

    if (allCurve) {
      const result = allCurve.keyframes.map((kf) => ({
        frame: kf.frame,
        x: kf.value[0] ?? 0,
        y: kf.value[1] ?? 0,
        z: kf.value[2] ?? 0,
        w: kf.value[3] ?? 1,
      }));

      for (const curve of curves) {
        if (curve.channel === GMTCurveChannel.ALL) continue;
        this.applyRotationOverrides(result, curve);
      }
      return result;
    }

    // Build from partial curves
    const frameSet = new Set<number>();
    for (const curve of curves) {
      for (const kf of curve.keyframes) {
        frameSet.add(kf.frame);
      }
    }
    const frames = [...frameSet].sort((a, b) => a - b);

    return frames.map((frame) => {
      // Identity quaternion as default
      const kf = { frame, x: 0, y: 0, z: 0, w: 1 };
      for (const curve of curves) {
        const match = curve.keyframes.find((k) => k.frame === frame);
        if (match) {
          this.setRotationComponents(kf, curve.channel, match.value);
        }
      }
      return kf;
    });
  }

  private applyRotationOverrides(
    result: { frame: number; x: number; y: number; z: number; w: number }[],
    curve: GMTCurve,
  ): void {
    for (const kf of curve.keyframes) {
      const target = result.find((r) => r.frame === kf.frame);
      if (target) {
        this.setRotationComponents(target, curve.channel, kf.value);
      }
    }
  }

  private setRotationComponents(
    target: { x: number; y: number; z: number; w: number },
    channel: GMTCurve['channel'],
    value: readonly number[],
  ): void {
    switch (channel) {
      case GMTCurveChannel.X: // XW
        target.x = value[0] ?? 0;
        target.w = value[3] ?? target.w;
        break;
      case GMTCurveChannel.Y: // YW
        target.y = value[1] ?? 0;
        target.w = value[3] ?? target.w;
        break;
      case GMTCurveChannel.ZW:
        target.z = value[2] ?? 0;
        target.w = value[3] ?? target.w;
        break;
    }
  }
}
