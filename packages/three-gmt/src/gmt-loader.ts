/**
 * Three.js Loader for GMT animation files.
 * Follows Three.js loader conventions (extends Loader).
 */
import { Loader, FileLoader, type AnimationClip } from 'three';
import { parseGMT, type GMTDocument } from '@three-yakuza/gmt-parser';
import { GMTAnimationClipBuilder } from './animation-clip-builder.js';

export interface GMTLoadResult {
  readonly document: GMTDocument;
  readonly animations: AnimationClip[];
}

export class GMTLoader extends Loader<GMTLoadResult> {
  private readonly builder = new GMTAnimationClipBuilder();

  load(
    url: string,
    onLoad: (result: GMTLoadResult) => void,
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
          const result = this.parse(data as ArrayBuffer);
          onLoad(result);
        } catch (e) {
          if (onError) {
            onError(e);
          } else {
            console.error(e);
          }
          this.manager.itemError(url);
        }
      },
      onProgress,
      onError,
    );
  }

  /** Parse a GMT file from an ArrayBuffer. */
  parse(buffer: ArrayBuffer): GMTLoadResult {
    const document = parseGMT(buffer);
    const animations = this.builder.buildClips(document.animations);
    return { document, animations };
  }
}
