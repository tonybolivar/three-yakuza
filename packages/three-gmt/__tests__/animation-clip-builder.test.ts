import { describe, it, expect } from 'vitest';
import { GMTAnimationClipBuilder } from '../src/animation-clip-builder.js';
import { GMTCurveType, GMTCurveChannel } from '@three-yakuza/gmt-parser';
import type { GMTAnimation } from '@three-yakuza/gmt-parser';

function makeAnimation(overrides?: Partial<GMTAnimation>): GMTAnimation {
  return {
    name: 'test_anim',
    frameRate: 30,
    startFrame: 0,
    endFrame: 60,
    bones: new Map(),
    ...overrides,
  };
}

describe('GMTAnimationClipBuilder', () => {
  const builder = new GMTAnimationClipBuilder();

  it('produces an AnimationClip with correct name and duration', () => {
    const anim = makeAnimation();
    const clip = builder.buildClip(anim);
    expect(clip.name).toBe('test_anim');
    expect(clip.duration).toBeCloseTo(2.0); // 60 frames / 30 fps
  });

  it('converts location ALL curve to VectorKeyframeTrack', () => {
    const anim = makeAnimation({
      bones: new Map([
        [
          'center',
          {
            name: 'center',
            curves: [
              {
                type: GMTCurveType.LOCATION,
                channel: GMTCurveChannel.ALL,
                keyframes: [
                  { frame: 0, value: [0, 0, 0] },
                  { frame: 30, value: [1, 2, 3] },
                  { frame: 60, value: [0, 0, 0] },
                ],
              },
            ],
          },
        ],
      ]),
    });

    const clip = builder.buildClip(anim);
    expect(clip.tracks).toHaveLength(1);

    const track = clip.tracks[0]!;
    expect(track.name).toBe('center.position');
    // 3 keyframes × 3 components
    expect(track.values).toHaveLength(9);
    // Times: 0/30=0, 30/30=1, 60/30=2
    expect(Array.from(track.times)).toEqual([0, 1, 2]);
    // Values: [0,0,0, 1,2,3, 0,0,0]
    expect(Array.from(track.values)).toEqual([0, 0, 0, 1, 2, 3, 0, 0, 0]);
  });

  it('converts rotation ALL curve to QuaternionKeyframeTrack', () => {
    const anim = makeAnimation({
      bones: new Map([
        [
          'kosi',
          {
            name: 'kosi',
            curves: [
              {
                type: GMTCurveType.ROTATION,
                channel: GMTCurveChannel.ALL,
                keyframes: [
                  { frame: 0, value: [0, 0, 0, 1] },
                  { frame: 60, value: [0.707, 0, 0, 0.707] },
                ],
              },
            ],
          },
        ],
      ]),
    });

    const clip = builder.buildClip(anim);
    expect(clip.tracks).toHaveLength(1);

    const track = clip.tracks[0]!;
    expect(track.name).toBe('kosi.quaternion');
    expect(track.values).toHaveLength(8); // 2 × 4 components
    expect(Array.from(track.times)).toEqual([0, 2]);
  });

  it('handles single-channel location curves', () => {
    const anim = makeAnimation({
      bones: new Map([
        [
          'center',
          {
            name: 'center',
            curves: [
              {
                type: GMTCurveType.LOCATION,
                channel: GMTCurveChannel.X,
                keyframes: [
                  { frame: 0, value: [5] },
                  { frame: 60, value: [10] },
                ],
              },
            ],
          },
        ],
      ]),
    });

    const clip = builder.buildClip(anim);
    expect(clip.tracks).toHaveLength(1);

    const track = clip.tracks[0]!;
    // X=5 with Y=0, Z=0, then X=10 with Y=0, Z=0
    expect(Array.from(track.values)).toEqual([5, 0, 0, 10, 0, 0]);
  });

  it('handles multiple bones in one animation', () => {
    const anim = makeAnimation({
      bones: new Map([
        [
          'center',
          {
            name: 'center',
            curves: [
              {
                type: GMTCurveType.LOCATION,
                channel: GMTCurveChannel.ALL,
                keyframes: [{ frame: 0, value: [1, 2, 3] }],
              },
            ],
          },
        ],
        [
          'kosi',
          {
            name: 'kosi',
            curves: [
              {
                type: GMTCurveType.ROTATION,
                channel: GMTCurveChannel.ALL,
                keyframes: [{ frame: 0, value: [0, 0, 0, 1] }],
              },
            ],
          },
        ],
      ]),
    });

    const clip = builder.buildClip(anim);
    expect(clip.tracks).toHaveLength(2);

    const trackNames = clip.tracks.map((t) => t.name);
    expect(trackNames).toContain('center.position');
    expect(trackNames).toContain('kosi.quaternion');
  });

  it('buildClips converts multiple animations', () => {
    const anims = [
      makeAnimation({ name: 'anim_a' }),
      makeAnimation({ name: 'anim_b' }),
    ];
    const clips = builder.buildClips(anims);
    expect(clips).toHaveLength(2);
    expect(clips[0]!.name).toBe('anim_a');
    expect(clips[1]!.name).toBe('anim_b');
  });
});
