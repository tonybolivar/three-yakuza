/**
 * SEGA Old Engine material for Three.js.
 * Uses MeshStandardMaterial with proper PBR settings matching Blender exports.
 */
import {
  MeshStandardMaterial, DoubleSide,
  type Texture, type Side, type ColorRepresentation,
} from 'three';

export interface SEGAMaterialOptions {
  diffuseMap?: Texture;
  aoMap?: Texture;
  color?: ColorRepresentation;
  opacity?: number;
  side?: Side;
  transparent?: boolean;
  layerDepth?: number;
}

export function createSEGAMaterial(opts: SEGAMaterialOptions): MeshStandardMaterial {
  const matOpts: ConstructorParameters<typeof MeshStandardMaterial>[0] = {
    color: opts.diffuseMap ? 0xffffff : (opts.color ?? 0x888888),
    side: opts.side ?? DoubleSide,
    opacity: opts.opacity ?? 1,
    transparent: opts.transparent ?? false,
    metalness: 0,
    roughness: 0.5,
  };
  if (opts.diffuseMap) {
    matOpts.map = opts.diffuseMap;
  }
  const mat = new MeshStandardMaterial(matOpts);

  if (opts.aoMap) {
    mat.aoMap = opts.aoMap;
    mat.aoMapIntensity = 1.0;
    opts.aoMap.channel = 0;
  }

  const depth = opts.layerDepth ?? 0;
  if (depth !== 0) {
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = depth;
    mat.polygonOffsetUnits = depth;
  }

  return mat;
}
