/**
 * SEGA Old Engine material for Three.js.
 *
 * Uses MeshStandardMaterial with onBeforeCompile to handle:
 * - _tn green normal maps (X+ in alpha, Y+ in green, Z derived)
 * - _mt specular/shininess map (G channel: bright = shiny = low roughness)
 */
import {
  MeshStandardMaterial, DoubleSide, TangentSpaceNormalMap,
  type Texture, type Side, type ColorRepresentation,
} from 'three';

export interface SEGAMaterialOptions {
  diffuseMap?: Texture;
  normalMap?: Texture;
  mtMap?: Texture;
  color?: ColorRepresentation;
  opacity?: number;
  side?: Side;
  transparent?: boolean;
  vertexColors?: boolean;
  layerDepth?: number;
}

/**
 * SEGA green normal map decode (replaces standard RGB decode):
 *   X+ stored in alpha channel
 *   Y+ stored in green channel
 *   Z derived: sqrt(max(0, 1 - dot(xy, xy)))
 */
const SEGA_GREEN_NORMAL_DECODE = /* glsl */
  `vec4 _segaTn = texture2D( normalMap, vNormalMapUv );
  vec3 mapN;
  mapN.x = 1.0 - 2.0 * _segaTn.a;
  mapN.y = 1.0 - 2.0 * _segaTn.g;
  mapN.z = sqrt( max( 0.0, 1.0 - dot( mapN.xy, mapN.xy ) ) )`;

export function createSEGAMaterial(opts: SEGAMaterialOptions): MeshStandardMaterial {
  const matOpts: ConstructorParameters<typeof MeshStandardMaterial>[0] = {
    color: opts.diffuseMap ? 0xffffff : (opts.color ?? 0x888888),
    side: opts.side ?? DoubleSide,
    opacity: opts.opacity ?? 1,
    transparent: opts.transparent ?? false,
    metalness: 0,
    roughness: 0.5,
    vertexColors: opts.vertexColors ?? false,
  };
  if (opts.diffuseMap) {
    matOpts.map = opts.diffuseMap;
  }
  if (opts.normalMap) {
    matOpts.normalMap = opts.normalMap;
    matOpts.normalMapType = TangentSpaceNormalMap;
  }
  if (opts.mtMap) {
    // _mt G channel controls shininess. Use as roughnessMap — the onBeforeCompile
    // patch below inverts it so bright G = shiny = low roughness.
    matOpts.roughnessMap = opts.mtMap;
    matOpts.roughness = 1.0; // Base rough, _mt reduces it
    opts.mtMap.channel = 0;
  }
  const mat = new MeshStandardMaterial(matOpts);

  // Build shader patches
  const hasNormalPatch = !!opts.normalMap;
  const hasMtPatch = !!opts.mtMap;

  if (hasNormalPatch || hasMtPatch) {
    mat.onBeforeCompile = (shader) => {
      // Patch green normal map decode
      if (hasNormalPatch) {
        const standard = 'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;';
        const replacement = `vec3 mapN = (${SEGA_GREEN_NORMAL_DECODE});`;
        shader.fragmentShader = shader.fragmentShader.replace(standard, replacement);
      }

      // Patch roughness map to invert: bright _mt G = shiny = LOW roughness
      if (hasMtPatch) {
        shader.fragmentShader = shader.fragmentShader.replace(
          'float roughnessFactor = roughness;',
          `float roughnessFactor = roughness;
          // SEGA _mt inversion applied below`,
        );
        // Replace the roughnessMap sampling to invert the value
        shader.fragmentShader = shader.fragmentShader.replace(
          'roughnessFactor *= texelRoughness.g;',
          'roughnessFactor *= (1.0 - texelRoughness.g);',
        );
      }
    };

    const key = [
      hasNormalPatch ? 'GN' : '',
      hasMtPatch ? 'MT' : '',
    ].join('_');
    mat.customProgramCacheKey = () => 'SEGA_' + key;
  }

  const depth = opts.layerDepth ?? 0;
  if (depth !== 0) {
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = depth;
    mat.polygonOffsetUnits = depth;
  }

  return mat;
}
