/**
 * SEGA Old Engine material for Three.js.
 *
 * Uses MeshStandardMaterial with onBeforeCompile to handle:
 * - _tn green normal maps (X+ in alpha, Y+ in green, Z derived)
 * - _mt multi-map (R=specular intensity, G=glossiness, B=specular power)
 *
 * Patches target #include <...> directives (pre-expansion), which is how
 * onBeforeCompile works in Three.js r175+.
 */
import {
  MeshStandardMaterial, FrontSide, TangentSpaceNormalMap,
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
 * Custom normal_fragment_maps replacement for SEGA green normal maps.
 * X+ stored in alpha, Y+ stored in green, Z derived.
 */
const SEGA_NORMAL_FRAGMENT_MAPS = /* glsl */ `
#ifdef USE_NORMALMAP_TANGENTSPACE
  vec4 _segaTn = texture2D( normalMap, vNormalMapUv );
  vec3 mapN;
  mapN.x = 1.0 - 2.0 * _segaTn.a;
  mapN.y = 1.0 - 2.0 * _segaTn.g;
  mapN.z = sqrt( max( 0.0, 1.0 - dot( mapN.xy, mapN.xy ) ) );
  mapN.xy *= normalScale;
  normal = normalize( tbn * mapN );
#elif defined( USE_NORMALMAP_OBJECTSPACE )
  normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
  #ifdef FLIP_SIDED
    normal = - normal;
  #endif
  #ifdef DOUBLE_SIDED
    normal = normal * faceDirection;
  #endif
  normal = normalize( normalMatrix * normal );
#elif defined( USE_BUMPMAP )
  normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif
`;

/**
 * Custom roughnessmap_fragment for SEGA _mt multi-map.
 * Channel layout (from modding community):
 *   R = metallic (anisotropic rotation for hair)
 *   G = ambient occlusion (specular for hair)
 *   B = glossiness (bright = smooth/shiny)
 *   A = mask for repeating textures (secondary UV)
 */
const SEGA_ROUGHNESS_FRAGMENT = /* glsl */ `
float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
  vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
  // _mt B = glossiness. Map to PBR roughness [0.3, 1.0].
  roughnessFactor *= 1.0 - 0.7 * texelRoughness.b;
#endif
`;

export function createSEGAMaterial(opts: SEGAMaterialOptions): MeshStandardMaterial {
  const matOpts: ConstructorParameters<typeof MeshStandardMaterial>[0] = {
    color: opts.diffuseMap ? 0xffffff : (opts.color ?? 0x888888),
    side: opts.side ?? FrontSide,
    opacity: opts.opacity ?? 1,
    transparent: opts.transparent ?? false,
    metalness: 0,
    roughness: 1.0,
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
    matOpts.roughnessMap = opts.mtMap;
    opts.mtMap.channel = 0;
  }
  const mat = new MeshStandardMaterial(matOpts);

  const hasNormalPatch = !!opts.normalMap;
  const hasMtPatch = !!opts.mtMap;

  if (hasNormalPatch || hasMtPatch) {
    mat.onBeforeCompile = (shader) => {
      if (hasNormalPatch) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <normal_fragment_maps>',
          SEGA_NORMAL_FRAGMENT_MAPS,
        );
      }
      if (hasMtPatch) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <roughnessmap_fragment>',
          SEGA_ROUGHNESS_FRAGMENT,
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
