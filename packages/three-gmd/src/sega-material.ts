/**
 * SEGA Old Engine material for Three.js.
 *
 * Uses MeshStandardMaterial with onBeforeCompile to handle:
 * - _tn green normal maps (X+ in alpha, Y+ in green, Z derived)
 */
import {
  MeshStandardMaterial, DoubleSide, TangentSpaceNormalMap,
  type Texture, type Side, type ColorRepresentation,
} from 'three';

export interface SEGAMaterialOptions {
  diffuseMap?: Texture;
  normalMap?: Texture;
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
  const mat = new MeshStandardMaterial(matOpts);

  // Patch normal map decoding for SEGA green format via onBeforeCompile
  if (opts.normalMap) {
    mat.onBeforeCompile = (shader) => {
      // Three.js standard normal decode:
      //   texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0
      // Replace with SEGA green format (X from alpha, Y from green, Z derived)
      // Target the tangent-space normal decode specifically (not object-space)
      const standard = 'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;';
      const replacement = `vec3 mapN = (${SEGA_GREEN_NORMAL_DECODE});`;
      shader.fragmentShader = shader.fragmentShader.replace(standard, replacement);
    };
    mat.customProgramCacheKey = () => 'SEGA_GreenNormal';
  }

  const depth = opts.layerDepth ?? 0;
  if (depth !== 0) {
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = depth;
    mat.polygonOffsetUnits = depth;
  }

  return mat;
}
