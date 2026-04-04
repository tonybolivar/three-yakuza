/**
 * SEGA Old Engine material for Three.js.
 * Uses MeshPhongMaterial for diffuse + AO rendering with scene lights.
 * Applies polygon offset based on shader layer depth to resolve z-fighting.
 */
import {
  MeshPhongMaterial, DoubleSide,
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

export function createSEGAMaterial(opts: SEGAMaterialOptions): MeshPhongMaterial {
  const matOpts: ConstructorParameters<typeof MeshPhongMaterial>[0] = {
    color: opts.diffuseMap ? 0xffffff : (opts.color ?? 0x888888),
    side: opts.side ?? DoubleSide,
    opacity: opts.opacity ?? 1,
    transparent: opts.transparent ?? false,
    specular: 0x000000,
    shininess: 0,
  };
  if (opts.diffuseMap) {
    matOpts.map = opts.diffuseMap;
  }
  const mat = new MeshPhongMaterial(matOpts);

  // _mt map as ambient occlusion (R channel darkens crevices)
  if (opts.aoMap) {
    mat.aoMap = opts.aoMap;
    mat.aoMapIntensity = 1.0;
    opts.aoMap.channel = 0; // Use uv, not uv2
  }

  // Polygon offset resolves z-fighting between body/shirt/suit layers
  const depth = opts.layerDepth ?? 0;
  if (depth !== 0) {
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = depth;
    mat.polygonOffsetUnits = depth;
  }

  return mat;
}
