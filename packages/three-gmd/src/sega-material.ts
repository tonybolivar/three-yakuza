/**
 * SEGA Old Engine material for Three.js.
 *
 * Uses MeshStandardMaterial with onBeforeCompile to properly handle:
 * - _mt texture as inverted roughness (bright=shiny=low roughness)
 */
import {
  MeshStandardMaterial, DoubleSide,
  type Texture, type Side, type ColorRepresentation,
} from 'three';

export interface SEGAMaterialOptions {
  diffuseMap?: Texture;
  mtMap?: Texture;
  color?: ColorRepresentation;
  opacity?: number;
  side?: Side;
  transparent?: boolean;
  layerDepth?: number;
}

// Patch: invert the roughness map sample so bright _mt = shiny = low roughness
const INVERT_ROUGHNESS = /* glsl */ `
float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
  vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
  // SEGA _mt: bright = shiny. Invert for PBR where bright = rough.
  roughnessFactor *= 1.0 - texelRoughness.g;
#endif
`;

export function createSEGAMaterial(opts: SEGAMaterialOptions): MeshStandardMaterial {
  const matOpts: ConstructorParameters<typeof MeshStandardMaterial>[0] = {
    color: opts.diffuseMap ? 0xffffff : (opts.color ?? 0x888888),
    side: opts.side ?? DoubleSide,
    opacity: opts.opacity ?? 1,
    transparent: opts.transparent ?? false,
    metalness: 0,
    roughness: 1.0, // Base roughness — _mt will reduce it where shiny
  };
  if (opts.diffuseMap) {
    matOpts.map = opts.diffuseMap;
  }
  const mat = new MeshStandardMaterial(matOpts);

  // Use _mt as inverted roughness map via onBeforeCompile
  if (opts.mtMap) {
    mat.roughnessMap = opts.mtMap;
    opts.mtMap.channel = 0;

    mat.onBeforeCompile = (shader) => {
      // Replace Three.js standard roughness sampling with inverted version
      const target = 'float roughnessFactor = roughness;';
      const before = shader.fragmentShader.length;
      shader.fragmentShader = shader.fragmentShader.replace(
        // Match the roughness block (standard Three.js pattern)
        /float roughnessFactor = roughness;\s*#ifdef USE_ROUGHNESSMAP[\s\S]*?#endif/,
        INVERT_ROUGHNESS.trim(),
      );
      // Fallback: simple string replace if regex didn't match
      if (shader.fragmentShader.length === before) {
        shader.fragmentShader = shader.fragmentShader.replace(
          target,
          target + '\n// SEGA: _mt inversion applied at roughnessMap sampling',
        );
      }
    };
    mat.customProgramCacheKey = () => 'SEGA_InvertRoughness';
  }

  const depth = opts.layerDepth ?? 0;
  if (depth !== 0) {
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = depth;
    mat.polygonOffsetUnits = depth;
  }

  return mat;
}
