/**
 * SEGA Old Engine material for Three.js.
 * Uses MeshLambertMaterial for clean diffuse rendering with scene lights.
 * Applies polygon offset based on shader layer depth to resolve z-fighting.
 */
import {
  MeshLambertMaterial, DoubleSide,
  type Texture, type Side, type ColorRepresentation,
} from 'three';

export interface SEGAMaterialOptions {
  diffuseMap?: Texture;
  color?: ColorRepresentation;
  opacity?: number;
  side?: Side;
  transparent?: boolean;
  /** Parsed from shader name — controls polygon offset for z-fighting. */
  layerDepth?: number;
}

export function createSEGAMaterial(opts: SEGAMaterialOptions): MeshLambertMaterial {
  const matOpts: ConstructorParameters<typeof MeshLambertMaterial>[0] = {
    color: opts.diffuseMap ? 0xffffff : (opts.color ?? 0x888888),
    side: opts.side ?? DoubleSide,
    opacity: opts.opacity ?? 1,
    transparent: opts.transparent ?? false,
  };
  if (opts.diffuseMap) {
    matOpts.map = opts.diffuseMap;
  }
  const mat = new MeshLambertMaterial(matOpts);

  // Polygon offset resolves z-fighting between body/shirt/suit layers
  const depth = opts.layerDepth ?? 0;
  if (depth !== 0) {
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = depth;
    mat.polygonOffsetUnits = depth;
  }

  return mat;
}
