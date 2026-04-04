/**
 * Three.js Loader for GMD model files.
 */
import {
  Loader, FileLoader, Group, Mesh, SkinnedMesh, Skeleton,
  BufferGeometry, BufferAttribute, Bone, Color,
  type Texture,
} from 'three';
import { parseGMD, type GMDDocument } from '@three-yakuza/gmd-parser';
import { createSEGAMaterial } from './sega-material.js';

export interface GMDLoadResult {
  readonly document: GMDDocument;
  readonly scene: Group;
  readonly matchedTextures: string[];
  readonly missingTextures: string[];
}

export class GMDLoader extends Loader<GMDLoadResult> {
  private commonTextures: Map<string, Texture> = new Map();

  /** Set common/shared textures (e.g. from tex_common_w64.par) used as fallback. */
  setCommonTextures(textures: Map<string, Texture>): this {
    this.commonTextures = textures;
    return this;
  }

  load(
    url: string,
    onLoad: (result: GMDLoadResult) => void,
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

  parse(buffer: ArrayBuffer, textures?: Map<string, Texture>): GMDLoadResult {
    const document = parseGMD(buffer);
    const matched = new Set<string>();
    const missing = new Set<string>();
    // Merge: common textures as fallback, provided textures override
    const merged = new Map(this.commonTextures);
    if (textures) {
      for (const [k, v] of textures) merged.set(k, v);
    }
    const scene = buildScene(document, merged, matched, missing);
    return {
      document, scene,
      matchedTextures: [...matched],
      missingTextures: [...missing],
    };
  }
}

function buildScene(
  doc: GMDDocument,
  textures: Map<string, Texture> | undefined,
  matched: Set<string>,
  missing: Set<string>,
): Group {
  const root = new Group();
  root.name = doc.name;

  // Build bones from nodes
  const bones: Bone[] = doc.nodes.map((node) => {
    const bone = new Bone();
    bone.name = node.name;
    bone.position.set(node.position[0], node.position[1], node.position[2]);
    bone.quaternion.set(node.rotation[1], node.rotation[2], node.rotation[3], node.rotation[0]);
    bone.scale.set(node.scale[0], node.scale[1], node.scale[2]);
    return bone;
  });

  for (const node of doc.nodes) {
    if (node.parentOf >= 0 && node.parentOf < bones.length) {
      bones[node.parentOf]!.add(bones[node.index]!);
    } else {
      root.add(bones[node.index]!);
    }
  }

  // Group sub-meshes by attribute — one merged geometry per attribute
  const meshesByAttr = new Map<number, typeof doc.meshes[number][]>();
  for (const meshDef of doc.meshes) {
    if (meshDef.triangleListCount === 0) continue;
    const list = meshesByAttr.get(meshDef.attributeIndex) ?? [];
    list.push(meshDef);
    meshesByAttr.set(meshDef.attributeIndex, list);
  }

  // Find the max node index — sub-meshes at this node are often hidden extras
  const maxNodeIndex = doc.meshes.reduce((max, m) => Math.max(max, m.nodeIndex), 0);

  for (const [attrIdx, subMeshes] of meshesByAttr) {
    const matDef = doc.materials[attrIdx];
    const shaderName = matDef ? (doc.shaders[matDef.shaderIndex] ?? '') : '';

    // Skip all sub-meshes at the last node — these are hidden attachment meshes
    // (body under clothing, suit/shirt extras). Verified against clean Blender exports.
    const filtered = subMeshes.filter(m => m.nodeIndex !== maxNodeIndex);

    const allPositions: number[] = [];
    const allNormals: number[] = [];
    const allUVs: number[] = [];
    const allBoneIndices: number[] = [];
    const allBoneWeights: number[] = [];
    const allColors: number[] = [];
    const allIndices: number[] = [];
    let vertexOffset = 0;
    let hasNormals = false;
    let hasSkinning = false;
    let hasColors = false;

    for (const meshDef of filtered) {
      const vb = doc.vertexBuffers[meshDef.vertexBufferIndex];
      if (!vb) continue;
      const vStart = meshDef.minIndex;
      const vCount = meshDef.vertexCount;

      for (let i = vStart * 3; i < (vStart + vCount) * 3; i++) {
        allPositions.push(vb.positions[i]!);
      }
      if (vb.normals) {
        hasNormals = true;
        for (let i = vStart * 3; i < (vStart + vCount) * 3; i++) {
          allNormals.push(vb.normals[i]!);
        }
      }
      if (vb.uvs) {
        for (let i = vStart * 2; i < (vStart + vCount) * 2; i++) {
          allUVs.push(vb.uvs[i]!);
        }
      }
      if (vb.colors) {
        hasColors = true;
        for (let i = vStart * 4; i < (vStart + vCount) * 4; i++) {
          allColors.push(vb.colors[i]!);
        }
      }
      if (vb.boneIndices && vb.boneWeights) {
        hasSkinning = true;
        for (let i = vStart * 4; i < (vStart + vCount) * 4; i++) {
          allBoneIndices.push(vb.boneIndices[i]!);
          allBoneWeights.push(vb.boneWeights[i]!);
        }
      }

      // Triangle list indices
      const triListIndices = doc.indexBuffer.slice(
        meshDef.triangleListOffset,
        meshDef.triangleListOffset + meshDef.triangleListCount,
      );
      for (let i = 0; i < triListIndices.length; i++) {
        allIndices.push(triListIndices[i]! - meshDef.minIndex + vertexOffset);
      }

      // Triangle strip with reset (0xFFFF marks strip boundaries)
      if (meshDef.resetStripCount > 0) {
        const strip = doc.indexBuffer.slice(
          meshDef.resetStripOffset,
          meshDef.resetStripOffset + meshDef.resetStripCount,
        );
        expandTriangleStrip(strip, meshDef.minIndex, vertexOffset, allIndices, true);
      }

      // Triangle strip without reset (degenerate triangles mark boundaries)
      if (meshDef.noResetStripCount > 0) {
        const strip = doc.indexBuffer.slice(
          meshDef.noResetStripOffset,
          meshDef.noResetStripOffset + meshDef.noResetStripCount,
        );
        expandTriangleStrip(strip, meshDef.minIndex, vertexOffset, allIndices, false);
      }
      vertexOffset += vCount;
    }

    if (allPositions.length === 0) continue;

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(allPositions), 3));
    if (allUVs.length > 0) {
      geometry.setAttribute('uv', new BufferAttribute(new Float32Array(allUVs), 2));
    }
    if (hasColors) {
      geometry.setAttribute('color', new BufferAttribute(new Float32Array(allColors), 4));
    }
    geometry.setIndex(new BufferAttribute(new Uint32Array(allIndices), 1));
    // Blended shaders (hair, eyelashes) store inverted normals for double-sided
    // game rendering. Compute outward-facing normals for standard Three.js materials.
    const isBlended = shaderName.startsWith('s_b') || shaderName.includes('[nrev]');
    if (hasNormals && !isBlended) {
      geometry.setAttribute('normal', new BufferAttribute(new Float32Array(allNormals), 3));
    } else {
      geometry.computeVertexNormals();
    }

    // Find textures by role
    let diffuseMap: Texture | undefined;
    let normalMap: Texture | undefined;
    let mtMap: Texture | undefined;
    if (matDef && textures && textures.size > 0) {
      for (const texIdx of matDef.textureIndices) {
        const texName = doc.textures[texIdx];
        if (!texName) continue;
        const texture = textures.get(texName) ?? textures.get(texName.toLowerCase());
        if (!texture) { missing.add(texName); continue; }
        matched.add(texName);
        const suffix = getTextureSuffix(texName);
        if (suffix === 'di' && !diffuseMap) diffuseMap = texture;
        else if (suffix === 'tn' && !normalMap) normalMap = texture;
        else if (suffix === 'mt' && !mtMap) mtMap = texture;
      }
    }

    // Reflection/alpha passes without diffuse textures render as transparent overlays
    const isRefPass = !diffuseMap && shaderName.includes('[ref]');
    const opacity = isRefPass ? 0.3 : (matDef?.opacity ?? 1);

    const layerDepth = getLayerDepth(shaderName);
    const material = createSEGAMaterial({
      diffuseMap,
      normalMap,
      mtMap,
      color: matDef ? new Color(matDef.diffuse[0], matDef.diffuse[1], matDef.diffuse[2]) : 0x888888,
      opacity,
      transparent: opacity < 1,
      vertexColors: hasColors,
      layerDepth,
    });

    let mesh: Mesh;
    if (hasSkinning && bones.length > 0) {
      geometry.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(allBoneIndices), 4));
      geometry.setAttribute('skinWeight', new BufferAttribute(new Float32Array(allBoneWeights), 4));
      const skinnedMesh = new SkinnedMesh(geometry, material);
      const skeleton = new Skeleton(bones);
      skinnedMesh.bind(skeleton);
      mesh = skinnedMesh;
    } else {
      mesh = new Mesh(geometry, material);
    }
    mesh.name = `attr_${attrIdx}`;
    mesh.renderOrder = layerDepth;
    root.add(mesh);
  }

  return root;
}

function getTextureSuffix(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('nmap')) return 'nmap';
  const match = /_([a-z]{2,3})$/.exec(lower);
  return match?.[1] ?? '';
}

/**
 * Determine clothing layer depth from shader name for z-fighting resolution.
 * Parsed from shader brackets — general across all GMD models.
 */
/**
 * Expand a triangle strip into a triangle list.
 * Handles both reset-style (0xFFFF delimiter) and degenerate-style strips.
 */
function expandTriangleStrip(
  strip: Uint16Array,
  minIndex: number,
  vertexOffset: number,
  out: number[],
  hasReset: boolean,
): void {
  let a = 0, b = 0, c = 0;
  let count = 0;

  for (let i = 0; i < strip.length; i++) {
    const idx = strip[i]!;

    // Reset marker
    if (hasReset && idx === 0xffff) {
      count = 0;
      continue;
    }

    c = idx;
    count++;

    if (count >= 3) {
      // Skip degenerate triangles (two or more identical vertices)
      if (a !== b && b !== c && a !== c) {
        if (count % 2 === 1) {
          // Odd triangle — normal winding
          out.push(a - minIndex + vertexOffset);
          out.push(b - minIndex + vertexOffset);
          out.push(c - minIndex + vertexOffset);
        } else {
          // Even triangle — reversed winding
          out.push(b - minIndex + vertexOffset);
          out.push(a - minIndex + vertexOffset);
          out.push(c - minIndex + vertexOffset);
        }
      }
    }

    a = b;
    b = c;
  }
}

function getLayerDepth(shaderName: string): number {
  if (shaderName.includes('[skin]')) return 4;
  if (shaderName.includes('[mouth]')) return 5;
  if (shaderName.includes('[rd]')) return -2;
  if (shaderName.includes('[rs]') || shaderName.includes('[rt]')) return -1;
  return 0;
}
