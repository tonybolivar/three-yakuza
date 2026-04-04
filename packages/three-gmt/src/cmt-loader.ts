/**
 * Three.js Loader for CMT camera animation files.
 */
import {
  Loader, FileLoader, AnimationClip, VectorKeyframeTrack,
  NumberKeyframeTrack, QuaternionKeyframeTrack,
} from 'three';
import { parseCMT, type CMTDocument, CMTFormat } from '@three-yakuza/gmt-parser';

export interface CMTLoadResult {
  readonly document: CMTDocument;
  readonly clips: AnimationClip[];
}

export class CMTLoader extends Loader<CMTLoadResult> {
  load(
    url: string,
    onLoad: (result: CMTLoadResult) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void,
  ): void {
    const loader = new FileLoader(this.manager);
    loader.setPath(this.path);
    loader.setResponseType('arraybuffer');
    loader.setRequestHeader(this.requestHeader);
    loader.setWithCredentials(this.withCredentials);

    loader.load(
      url,
      (data) => {
        try {
          onLoad(this.parse(data as ArrayBuffer));
        } catch (e) {
          if (onError) onError(e);
          else console.error(e);
          this.manager.itemError(url);
        }
      },
      onProgress,
      onError,
    );
  }

  parse(buffer: ArrayBuffer): CMTLoadResult {
    const document = parseCMT(buffer);
    const clips = document.animations.map((anim, i) => {
      const frameRate = anim.frameRate || 30;
      const tracks: (VectorKeyframeTrack | NumberKeyframeTrack | QuaternionKeyframeTrack)[] = [];

      const times: number[] = [];
      const positions: number[] = [];
      const fovValues: number[] = [];
      const rotations: number[] = [];

      for (let f = 0; f < anim.frames.length; f++) {
        const frame = anim.frames[f]!;
        times.push(f / frameRate);
        positions.push(frame.location[0], frame.location[1], frame.location[2]);
        fovValues.push(frame.fov);
        rotations.push(frame.rotation[0], frame.rotation[1], frame.rotation[2], frame.rotation[3]);
      }

      tracks.push(new VectorKeyframeTrack('.position', times, positions));
      tracks.push(new NumberKeyframeTrack('.fov', times, fovValues));

      // Only add rotation track for formats that provide it
      if (anim.format !== CMTFormat.FOC_ROLL) {
        tracks.push(new QuaternionKeyframeTrack('.quaternion', times, rotations));
      }

      // For FOC_ROLL, add focus point and roll tracks
      if (anim.format === CMTFormat.FOC_ROLL) {
        const focusPositions: number[] = [];
        const rollValues: number[] = [];
        for (const frame of anim.frames) {
          if (frame.focusPoint) {
            focusPositions.push(frame.focusPoint[0], frame.focusPoint[1], frame.focusPoint[2]);
          }
          if (frame.roll !== null) {
            rollValues.push(frame.roll);
          }
        }
        if (focusPositions.length > 0) {
          tracks.push(new VectorKeyframeTrack('.userData.focusPoint', times, focusPositions));
        }
        if (rollValues.length > 0) {
          tracks.push(new NumberKeyframeTrack('.userData.roll', times, rollValues));
        }
      }

      const duration = anim.frames.length / frameRate;
      return new AnimationClip(`camera_${i}`, duration, tracks);
    });

    return { document, clips };
  }
}
