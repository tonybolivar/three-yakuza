/**
 * Three.js Loader for IFA facial pose files.
 * Converts IFA bone poses into a Three.js Skeleton with rest pose transforms.
 */
import {
  Loader, FileLoader, Bone, Skeleton,
} from 'three';
import { parseIFA, type IFADocument } from '@three-yakuza/gmt-parser';

export interface IFALoadResult {
  readonly document: IFADocument;
  readonly skeleton: Skeleton;
}

export class IFALoader extends Loader<IFALoadResult> {
  load(
    url: string,
    onLoad: (result: IFALoadResult) => void,
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

  parse(buffer: ArrayBuffer): IFALoadResult {
    const document = parseIFA(buffer);

    // Build bones from IFA data
    const boneMap = new Map<string, Bone>();
    const bones: Bone[] = [];

    for (const ifaBone of document.bones) {
      const bone = new Bone();
      bone.name = ifaBone.name;
      bone.position.set(ifaBone.location[0], ifaBone.location[1], ifaBone.location[2]);
      bone.quaternion.set(
        ifaBone.rotation[0], ifaBone.rotation[1],
        ifaBone.rotation[2], ifaBone.rotation[3],
      );
      boneMap.set(ifaBone.name, bone);
      bones.push(bone);
    }

    // Build hierarchy from parent names
    for (const ifaBone of document.bones) {
      if (ifaBone.parentName) {
        const parent = boneMap.get(ifaBone.parentName);
        const child = boneMap.get(ifaBone.name);
        if (parent && child) {
          parent.add(child);
        }
      }
    }

    const skeleton = new Skeleton(bones);
    return { document, skeleton };
  }
}
