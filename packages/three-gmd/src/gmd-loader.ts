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


  interface PendingMesh {
    geometry: BufferGeometry;
    material: ReturnType<typeof createSEGAMaterial>;
    hasBones: boolean;
    attrIdx: number;
    layerDepth: number;
    needsComputedNormals: boolean;
  }
  const pendingMeshes: PendingMesh[] = [];

  for (const [attrIdx, subMeshes] of meshesByAttr) {
    const matDef = doc.materials[attrIdx];
    const shaderName = matDef ? (doc.shaders[matDef.shaderIndex] ?? '') : '';

    // Only keep LOD 0 meshes. Lower LOD meshes ([l2], [l3]) are simplified
    // duplicates that should not render alongside the high-detail geometry.
    const filtered = subMeshes.filter(m => {
      const nodeName = doc.nodes[m.nodeIndex]?.name ?? '';
      return nodeName.startsWith('[l0]') || !nodeName.startsWith('[l');
    });

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

    // Find textures by slot position (not suffix guessing)
    let diffuseMap: Texture | undefined;
    let normalMap: Texture | undefined;
    let mtMap: Texture | undefined;
    if (matDef && textures && textures.size > 0) {
      const slots = matDef.textureSlots;
      const lookup = (idx: number) => {
        if (idx < 0) return undefined;
        const name = doc.textures[idx];
        if (!name) return undefined;
        const tex = textures.get(name) ?? textures.get(name.toLowerCase());
        if (tex) { matched.add(name); } else { missing.add(name); }
        return tex;
      };
      diffuseMap = lookup(slots.diffuse);
      normalMap = lookup(slots.normal);
      mtMap = lookup(slots.multi);
    }

    // Material configuration based on shader type
    const isRefPass = !diffuseMap && shaderName.includes('[ref]');
    const isBlended = shaderName.startsWith('s_b');  // eyeshadow, eyelashes, facial hair
    const isAlphaRef = shaderName.includes('[aref]'); // eye surface (alpha-tested)
    const needsDoubleSide = shaderName.includes('[mouth]') || shaderName.includes('[iris]');

    const opacity = isRefPass ? 0.3 : (matDef?.opacity ?? 1);
    const isTransparent = opacity < 1 || isBlended || isRefPass;

    const layerDepth = getLayerDepth(shaderName);
    const material = createSEGAMaterial({
      diffuseMap,
      normalMap,
      mtMap,
      color: matDef ? new Color(matDef.diffuse[0], matDef.diffuse[1], matDef.diffuse[2]) : 0x888888,
      opacity,
      transparent: isTransparent,
      // Face/skin shaders: game ignores vertex RGB (often stored as 0,0,0),
      // but Three.js would multiply them in, turning the face black.
      vertexColors: hasColors && !needsComputedNormals,
      layerDepth,
      ...(needsDoubleSide ? { side: 2 } : {}), // 2 = DoubleSide
    });
    if (isAlphaRef) {
      material.alphaTest = 0.1; // low threshold to cut out transparent areas
      material.transparent = false;
    }
    if (isBlended) {
      material.depthWrite = false; // blended overlays shouldn't occlude
    }

    pendingMeshes.push({ geometry, material, hasBones, attrIdx, layerDepth, needsComputedNormals });
  }

  // Smooth normals across mesh boundaries: vertices at the same position
  // in different meshes get their normals averaged. This fixes seams at
  // face/body, face/mouth, etc. boundaries.
  smoothNormalsAcrossMeshes(pendingMeshes);

  for (const pm of pendingMeshes) {
    let mesh3d: Mesh;
    if (pm.hasBones) {
      const sm = new SkinnedMesh(pm.geometry, pm.material);
      sm.bind(skeleton, new Matrix4());
      sm.frustumCulled = false;
      mesh3d = sm;
    } else {
      mesh3d = new Mesh(pm.geometry, pm.material);
    }
    mesh3d.name = `attr_${pm.attrIdx}`;
    mesh3d.renderOrder = pm.layerDepth;
    root.add(mesh3d);
  }

  return root;
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
 * Smooth normals across mesh boundaries.
 *
 * Different attribute groups (face skin, body skin, mouth, etc.) are separate
 * Three.js meshes. Vertices at their boundaries share positions but have
 * independently computed normals, creating visible seams. This function
 * averages normals at shared positions across all meshes that used
 * computeVertexNormals().
 */
function smoothNormalsAcrossMeshes(meshes: { geometry: BufferGeometry; needsComputedNormals: boolean }[]): void {
  // Build position → accumulated normal map across all computed-normal meshes
  const normalAccum = new Map<string, { nx: number; ny: number; nz: number; count: number }>();
  const computedMeshes = meshes.filter(m => m.needsComputedNormals);
  if (computedMeshes.length < 2) return;

  // Pass 1: accumulate normals by quantized position
  for (const { geometry } of computedMeshes) {
    const pos = geometry.getAttribute('position');
    const nrm = geometry.getAttribute('normal');
    if (!pos || !nrm) continue;
    const pa = pos.array as Float32Array;
    const na = nrm.array as Float32Array;
    for (let i = 0; i < pos.count; i++) {
      const key = `${Math.round(pa[i * 3]! * 1e4)},${Math.round(pa[i * 3 + 1]! * 1e4)},${Math.round(pa[i * 3 + 2]! * 1e4)}`;
      const entry = normalAccum.get(key);
      if (entry) {
        entry.nx += na[i * 3]!;
        entry.ny += na[i * 3 + 1]!;
        entry.nz += na[i * 3 + 2]!;
        entry.count++;
      } else {
        normalAccum.set(key, { nx: na[i * 3]!, ny: na[i * 3 + 1]!, nz: na[i * 3 + 2]!, count: 1 });
      }
    }
  }

  // Pass 2: write back averaged normals for boundary vertices (count > 1)
  for (const { geometry } of computedMeshes) {
    const pos = geometry.getAttribute('position');
    const nrm = geometry.getAttribute('normal');
    if (!pos || !nrm) continue;
    const pa = pos.array as Float32Array;
    const na = nrm.array as Float32Array;
    let updated = false;
    for (let i = 0; i < pos.count; i++) {
      const key = `${Math.round(pa[i * 3]! * 1e4)},${Math.round(pa[i * 3 + 1]! * 1e4)},${Math.round(pa[i * 3 + 2]! * 1e4)}`;
      const entry = normalAccum.get(key);
      if (entry && entry.count > 1) {
        const len = Math.sqrt(entry.nx * entry.nx + entry.ny * entry.ny + entry.nz * entry.nz);
        if (len > 0) {
          na[i * 3] = entry.nx / len;
          na[i * 3 + 1] = entry.ny / len;
          na[i * 3 + 2] = entry.nz / len;
          updated = true;
        }
      }
    }
    if (updated) (nrm as BufferAttribute).needsUpdate = true;
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
  if (shaderName.includes('[iris]')) return 1;   // iris renders first (behind eye surface)
  if (shaderName.includes('[eye]')) return 2;     // eye surface renders after iris
  if (shaderName.includes('[skin]')) return 4;
  if (shaderName.includes('[mouth]')) return 5;
  if (shaderName.includes('[ref]')) return 6;     // reflections on top
  if (shaderName.includes('[rd]')) return -2;
  if (shaderName.includes('[rs]') || shaderName.includes('[rt]')) return -1;
  return 0;
}
