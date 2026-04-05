/**
 * Three.js Loader for GMD model files.
 */
import {
  Loader, FileLoader, Group, Mesh, SkinnedMesh, Skeleton,
  BufferGeometry, BufferAttribute, Bone, Color, Matrix4,
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
    bone.quaternion.set(node.rotation[0], node.rotation[1], node.rotation[2], node.rotation[3]);
    bone.scale.set(node.scale[0], node.scale[1], node.scale[2]);
    return bone;
  });

  // Build hierarchy from child/sibling linked list.
  // Field "parentOf" = first child index, "siblingOf" = next sibling index.
  for (const node of doc.nodes) {
    let childIdx = node.parentOf;
    while (childIdx >= 0 && childIdx < bones.length) {
      bones[node.index]!.add(bones[childIdx]!);
      childIdx = doc.nodes[childIdx]!.siblingOf;
    }
  }
  // Add root nodes (those not parented by the loop above)
  for (let i = 0; i < bones.length; i++) {
    if (!bones[i]!.parent) root.add(bones[i]!);
  }

  root.updateMatrixWorld(true);
  const skeleton = new Skeleton(bones, []);

  // Group sub-meshes by attribute - one merged geometry per attribute
  const meshesByAttr = new Map<number, typeof doc.meshes[number][]>();
  for (const meshDef of doc.meshes) {
    if (meshDef.triangleListCount === 0) continue;
    const list = meshesByAttr.get(meshDef.attributeIndex) ?? [];
    list.push(meshDef);
    meshesByAttr.set(meshDef.attributeIndex, list);
  }

  // Find the max node index - sub-meshes at this node are often hidden extras
  const maxNodeIndex = doc.meshes.reduce((max, m) => Math.max(max, m.nodeIndex), 0);

  for (const [attrIdx, subMeshes] of meshesByAttr) {
    const matDef = doc.materials[attrIdx];
    const shaderName = matDef ? (doc.shaders[matDef.shaderIndex] ?? '') : '';

    // Skip all sub-meshes at the last node - these are hidden attachment meshes
    // (body under clothing, suit/shirt extras). Verified against clean Blender exports.
    const filtered = subMeshes.filter(m => m.nodeIndex !== maxNodeIndex);

    // Compute the unified vertex range across all sub-meshes sharing this VB.
    // Sub-meshes are split by bone palette but share a single contiguous vertex
    // buffer region.  Copying each sub-mesh's vertices independently would
    // duplicate seam vertices and break smooth-normal sharing across sub-mesh
    // boundaries.  Instead, copy the whole contiguous region once and remap
    // indices against the global start.
    const firstVB = filtered.length > 0
      ? doc.vertexBuffers[filtered[0]!.vertexBufferIndex]
      : undefined;
    let globalVStart = Infinity;
    let globalVEnd = 0;
    for (const meshDef of filtered) {
      globalVStart = Math.min(globalVStart, meshDef.minIndex);
      globalVEnd = Math.max(globalVEnd, meshDef.minIndex + meshDef.vertexCount);
    }
    const globalVCount = globalVEnd - globalVStart;

    const allPositions: number[] = [];
    const allNormals: number[] = [];
    const allTangents: number[] = [];
    const allUVs: number[] = [];
    const allColors: number[] = [];
    const allIndices: number[] = [];
    let hasNormals = false;
    let hasTangents = false;
    let hasColors = false;
    const allSkinIndices: number[] = [];
    const allSkinWeights: number[] = [];
    let hasBones = false;

    // Copy the unified vertex range once from the VB.
    if (firstVB) {
      const vb = firstVB;
      for (let i = globalVStart * 3; i < globalVEnd * 3; i++) {
        allPositions.push(vb.positions[i]!);
      }
      if (vb.normals) {
        hasNormals = true;
        for (let i = globalVStart * 3; i < globalVEnd * 3; i++) {
          allNormals.push(vb.normals[i]!);
        }
      }
      if (vb.tangents) {
        hasTangents = true;
        for (let i = globalVStart * 4; i < globalVEnd * 4; i++) {
          allTangents.push(vb.tangents[i]!);
        }
      }
      if (vb.uvs) {
        for (let i = globalVStart * 2; i < globalVEnd * 2; i++) {
          allUVs.push(vb.uvs[i]!);
        }
      }
      if (vb.colors) {
        hasColors = true;
        for (let i = globalVStart * 4; i < globalVEnd * 4; i++) {
          allColors.push(vb.colors[i]!);
        }
      }

      // Bone data — remap local bone indices through each sub-mesh's palette.
      // Each sub-mesh owns a non-overlapping slice of the vertex range and has
      // its own matrixList (bone palette).  We iterate sub-meshes in order and
      // remap bone indices for the vertices belonging to each one.
      if (vb.boneIndices && vb.boneWeights) {
        // Pre-fill with zeros; each sub-mesh will overwrite its own range.
        for (let v = 0; v < globalVCount * 4; v++) {
          allSkinIndices.push(0);
          allSkinWeights.push(0);
        }
        for (const meshDef of filtered) {
          if (meshDef.matrixListLength <= 0) continue;
          hasBones = true;
          const mlOffset = meshDef.matrixListOffset;
          const vStart = meshDef.minIndex;
          const vCount = meshDef.vertexCount;
          for (let v = vStart; v < vStart + vCount; v++) {
            const outIdx = v - globalVStart;
            for (let j = 0; j < 4; j++) {
              const localIdx = vb.boneIndices[v * 4 + j]!;
              const weight = vb.boneWeights[v * 4 + j]!;
              if (weight > 0 && localIdx < meshDef.matrixListLength) {
                allSkinIndices[outIdx * 4 + j] = doc.meshMatrixList[mlOffset + 1 + localIdx]!;
              }
              allSkinWeights[outIdx * 4 + j] = weight;
            }
          }
        }
      }
    }

    // Build index buffer — all indices are remapped against the unified range.
    for (const meshDef of filtered) {
      if (!doc.vertexBuffers[meshDef.vertexBufferIndex]) continue;

      if (meshDef.triangleListCount > 0) {
        const triListIndices = doc.indexBuffer.slice(
          meshDef.triangleListOffset,
          meshDef.triangleListOffset + meshDef.triangleListCount,
        );
        for (let i = 0; i < triListIndices.length; i++) {
          allIndices.push(triListIndices[i]! - globalVStart);
        }
      } else if (meshDef.resetStripCount > 0) {
        const strip = doc.indexBuffer.slice(
          meshDef.resetStripOffset,
          meshDef.resetStripOffset + meshDef.resetStripCount,
        );
        expandTriangleStrip(strip, globalVStart, 0, allIndices, true);
      } else if (meshDef.noResetStripCount > 0) {
        const strip = doc.indexBuffer.slice(
          meshDef.noResetStripOffset,
          meshDef.noResetStripOffset + meshDef.noResetStripCount,
        );
        expandTriangleStrip(strip, globalVStart, 0, allIndices, false);
      }
    }

    if (allPositions.length === 0) continue;

    // Weld duplicate vertices that share the same position and normal.
    // The game engine splits meshes by bone palette, duplicating boundary
    // vertices.  Without welding, these duplicates create hard seams in
    // Three.js because adjacent triangles from different sub-meshes cannot
    // share a vertex index.
    if (hasNormals && filtered.length > 1) {
      weldVertices(allPositions, allNormals, allUVs, allColors,
        allSkinIndices, allSkinWeights, allIndices, globalVCount);
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(allPositions), 3));
    if (allUVs.length > 0) {
      geometry.setAttribute('uv', new BufferAttribute(new Float32Array(allUVs), 2));
    }
    if (hasColors) {
      geometry.setAttribute('color', new BufferAttribute(new Float32Array(allColors), 4));
    }
    if (hasBones) {
      geometry.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(allSkinIndices), 4));
      geometry.setAttribute('skinWeight', new BufferAttribute(new Float32Array(allSkinWeights), 4));
    }
    geometry.setIndex(new BufferAttribute(new Uint32Array(allIndices), 1));
    // Head-area meshes: stored normals have smoothness issues with Three.js.
    // Use computeVertexNormals() which produces correct smooth results.
    // Body/clothing: stored normals work correctly.
    const needsComputedNormals = shaderName.includes('[skin]')
      || shaderName.includes('[mouth]')
      || shaderName.includes('[eye]')
      || shaderName.includes('[iris]')
      || shaderName.startsWith('s_b');
    if (hasNormals && !needsComputedNormals) {
      geometry.setAttribute('normal', new BufferAttribute(new Float32Array(allNormals), 3));
      if (hasTangents) {
        geometry.setAttribute('tangent', new BufferAttribute(new Float32Array(allTangents), 4));
      }
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
    // Mouth/eye interior geometry faces inward — needs DoubleSide to be visible
    const needsDoubleSide = shaderName.includes('[mouth]')
      || shaderName.includes('[iris]');
    const material = createSEGAMaterial({
      diffuseMap,
      normalMap,
      mtMap,
      color: matDef ? new Color(matDef.diffuse[0], matDef.diffuse[1], matDef.diffuse[2]) : 0x888888,
      opacity,
      transparent: opacity < 1,
      vertexColors: hasColors,
      layerDepth,
      ...(needsDoubleSide ? { side: 2 } : {}), // 2 = DoubleSide
    });
    if (shaderName.includes('[aref]')) {
      material.alphaTest = 0.5;
    }

    let mesh3d: Mesh;
    if (hasBones) {
      const sm = new SkinnedMesh(geometry, material);
      sm.bind(skeleton, new Matrix4());
      sm.frustumCulled = false;
      mesh3d = sm;
    } else {
      mesh3d = new Mesh(geometry, material);
    }
    mesh3d.name = `attr_${attrIdx}`;
    mesh3d.renderOrder = layerDepth;
    root.add(mesh3d);
  }

  return root;
}

function getTextureSuffix(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('nmap')) return 'nmap';
  const match = /_([a-z]{2,3})$/.exec(lower);
  return match?.[1] ?? '';
}

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
    if (hasReset && idx === 0xffff) { count = 0; continue; }
    c = idx;
    count++;
    if (count >= 3 && a !== b && b !== c && a !== c) {
      if (count % 2 === 1) {
        out.push(a - minIndex + vertexOffset, b - minIndex + vertexOffset, c - minIndex + vertexOffset);
      } else {
        out.push(b - minIndex + vertexOffset, a - minIndex + vertexOffset, c - minIndex + vertexOffset);
      }
    }
    a = b;
    b = c;
  }
}

/**
 * Weld duplicate vertices that share position and normal.
 *
 * Game engines split meshes by bone palette, duplicating vertices at the
 * boundary.  These duplicates have identical position and normal but
 * different VB indices, causing hard seams in Three.js.  This function
 * builds a canonical-index map (position+normal hash -> first occurrence)
 * and rewrites the index buffer so all references to duplicates point to
 * the canonical vertex.  Vertex attribute arrays are left as-is (the
 * unreferenced duplicates just become dead data in the typed arrays).
 */
function weldVertices(
  positions: number[],
  normals: number[],
  _uvs: number[],
  _colors: number[],
  _skinIndices: number[],
  _skinWeights: number[],
  indices: number[],
  vertexCount: number,
): void {
  // Build a map from quantised (position+normal) to canonical vertex index.
  // Quantise to ~0.001 precision (multiply by 1000 and round) which is far
  // below any visible difference but catches floating-point duplicates.
  const canonMap = new Map<string, number>();
  const remap = new Uint32Array(vertexCount);

  for (let v = 0; v < vertexCount; v++) {
    const px = Math.round(positions[v * 3]! * 1e4);
    const py = Math.round(positions[v * 3 + 1]! * 1e4);
    const pz = Math.round(positions[v * 3 + 2]! * 1e4);
    const nx = Math.round(normals[v * 3]! * 1e3);
    const ny = Math.round(normals[v * 3 + 1]! * 1e3);
    const nz = Math.round(normals[v * 3 + 2]! * 1e3);
    const key = `${px},${py},${pz},${nx},${ny},${nz}`;
    const existing = canonMap.get(key);
    if (existing !== undefined) {
      remap[v] = existing;
    } else {
      canonMap.set(key, v);
      remap[v] = v;
    }
  }

  // Rewrite indices in-place.
  for (let i = 0; i < indices.length; i++) {
    indices[i] = remap[indices[i]!]!;
  }
}

function getLayerDepth(shaderName: string): number {
  if (shaderName.includes('[skin]')) return 4;
  if (shaderName.includes('[mouth]')) return 5;
  if (shaderName.includes('[rd]')) return -2;
  if (shaderName.includes('[rs]') || shaderName.includes('[rt]')) return -1;
  return 0;
}
