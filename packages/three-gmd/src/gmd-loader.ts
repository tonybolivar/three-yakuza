/**
 * Three.js Loader for GMD model files.
 */
import {
  Loader, FileLoader, Group, Mesh, BufferGeometry, BufferAttribute, Bone, Color,
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
    const scene = buildScene(document, textures, matched, missing);
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

  for (const [attrIdx, subMeshes] of meshesByAttr) {
    const matDef = doc.materials[attrIdx];
    const shaderName = matDef ? (doc.shaders[matDef.shaderIndex] ?? '') : '';

    const allPositions: number[] = [];
    const allNormals: number[] = [];
    const allUVs: number[] = [];
    const allIndices: number[] = [];
    let vertexOffset = 0;
    let hasNormals = false;

    for (const meshDef of subMeshes) {
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

      const indices = doc.indexBuffer.slice(
        meshDef.triangleListOffset,
        meshDef.triangleListOffset + meshDef.triangleListCount,
      );
      for (let i = 0; i < indices.length; i++) {
        allIndices.push(indices[i]! - meshDef.minIndex + vertexOffset);
      }
      vertexOffset += vCount;
    }

    if (allPositions.length === 0) continue;

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(allPositions), 3));
    if (allUVs.length > 0) {
      geometry.setAttribute('uv', new BufferAttribute(new Float32Array(allUVs), 2));
    }
    geometry.setIndex(new BufferAttribute(new Uint32Array(allIndices), 1));
    if (hasNormals) {
      geometry.setAttribute('normal', new BufferAttribute(new Float32Array(allNormals), 3));
    } else {
      geometry.computeVertexNormals();
    }

    // Find diffuse texture
    let diffuseMap: Texture | undefined;
    if (matDef && textures && textures.size > 0) {
      for (const texIdx of matDef.textureIndices) {
        const texName = doc.textures[texIdx];
        if (!texName) continue;
        const texture = textures.get(texName);
        if (!texture) { missing.add(texName); continue; }
        matched.add(texName);
        if (getTextureSuffix(texName) === 'di' && !diffuseMap) {
          diffuseMap = texture;
        }
      }
    }

    const layerDepth = getLayerDepth(shaderName);
    const material = createSEGAMaterial({
      diffuseMap,
      color: matDef ? new Color(matDef.diffuse[0], matDef.diffuse[1], matDef.diffuse[2]) : 0x888888,
      opacity: matDef?.opacity ?? 1,
      transparent: (matDef?.opacity ?? 1) < 1,
      layerDepth,
    });

    const mesh = new Mesh(geometry, material);
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
function getLayerDepth(shaderName: string): number {
  if (shaderName.includes('[skin]')) return 4;
  if (shaderName.includes('[mouth]')) return 5;
  if (shaderName.includes('[rd]')) return -2;
  if (shaderName.includes('[rs]') || shaderName.includes('[rt]')) return -1;
  return 0;
}
