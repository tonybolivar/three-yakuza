/**
 * Vertex buffer layout parsing — interprets the 64-bit vertex_packing_flags.
 * Ported from yk_gmd_io/gmdlib/abstract/gmd_shader.py (MIT confirmed by author).
 */
import { BinaryReader } from '@three-yakuza/binary-reader';
import type { GMDVertexBuffer } from './types.js';

interface VertexComponent {
  name: string;
  offset: number;
  /** Number of components (1-4). */
  count: number;
  /** 0=float32, 1=float16, 2=unorm8, 3=snorm8 */
  format: number;
}

interface VertexLayout {
  components: VertexComponent[];
  bytesPerVertex: number;
}

/**
 * Parse the 64-bit vertex packing flags into a structured layout.
 */
export function parseVertexLayout(flagsLow: number, flagsHigh: number, bytesPerVertex: number): VertexLayout {
  const components: VertexComponent[] = [];
  let offset = 0;

  // Position: bits 0-3
  const posCount = flagsLow & 0x07; // 3 or 4 components
  const posFormat = (flagsLow >> 3) & 0x01; // 0=float32, 1=float16
  if (posCount > 0) {
    components.push({ name: 'position', offset, count: posCount, format: posFormat });
    offset += posCount * (posFormat === 1 ? 2 : 4);
  }

  // Weights: bits 4-8
  const weightsFlag = (flagsLow >> 4) & 0x1f;
  if (weightsFlag !== 0) {
    const wFormat = (weightsFlag >> 1) & 0x03;
    components.push({ name: 'weights', offset, count: 4, format: wFormat });
    offset += 4 * formatSize(wFormat);
  }

  // Bones: bit 9
  if (flagsLow & 0x200) {
    components.push({ name: 'bones', offset, count: 4, format: 2 }); // always uint8
    offset += 4;
  }

  // Normal: bits 10-12
  const normalFlag = (flagsLow >> 10) & 0x07;
  if (normalFlag !== 0) {
    const nFormat = (normalFlag >> 1) & 0x03;
    const nCount = 4; // normals are stored as 4 components (padded)
    components.push({ name: 'normal', offset, count: nCount, format: nFormat });
    offset += nCount * formatSize(nFormat);
  }

  // Tangent: bits 13-15
  const tangentFlag = (flagsLow >> 13) & 0x07;
  if (tangentFlag !== 0) {
    const tFormat = (tangentFlag >> 1) & 0x03;
    components.push({ name: 'tangent', offset, count: 4, format: tFormat });
    offset += 4 * formatSize(tFormat);
  }

  // Unknown: bits 16-18
  const unkFlag = (flagsLow >> 16) & 0x07;
  if (unkFlag !== 0) {
    const uFormat = (unkFlag >> 1) & 0x03;
    components.push({ name: 'unknown', offset, count: 4, format: uFormat });
    offset += 4 * formatSize(uFormat);
  }

  // Color0: bits 21-23
  const col0Flag = (flagsLow >> 21) & 0x07;
  if (col0Flag !== 0) {
    const c0Format = (col0Flag >> 1) & 0x03;
    components.push({ name: 'color0', offset, count: 4, format: c0Format });
    offset += 4 * formatSize(c0Format);
  }

  // Color1: bits 24-26
  const col1Flag = (flagsLow >> 24) & 0x07;
  if (col1Flag !== 0) {
    const c1Format = (col1Flag >> 1) & 0x03;
    components.push({ name: 'color1', offset, count: 4, format: c1Format });
    offset += 4 * formatSize(c1Format);
  }

  // UVs: bit 27 = enabled, bits 28-31 = count
  const uvEnabled = (flagsLow >> 27) & 0x01;
  if (uvEnabled) {
    const uvCount = (flagsLow >>> 28) & 0x0f;
    // UV slot descriptors are in flagsHigh (bits 32-63 of the 64-bit value)
    for (let i = 0; i < uvCount; i++) {
      const slot = (flagsHigh >> (i * 4)) & 0x0f;
      if (slot === 0x0f) continue; // unused slot
      const uvCompCount = (slot & 0x03) === 0 ? 2 : (slot & 0x03) + 1;
      const uvFormat = (slot >> 2) & 0x03;
      components.push({ name: `uv${i}`, offset, count: uvCompCount, format: uvFormat });
      offset += uvCompCount * formatSize(uvFormat);
    }
  }

  if (offset !== bytesPerVertex) {
    console.warn(
      `[GMD] Vertex layout stride mismatch: computed ${offset} bytes, expected ${bytesPerVertex}.`,
      `flagsLow=0x${flagsLow.toString(16)}, flagsHigh=0x${flagsHigh.toString(16)}`,
      components.map(c => `${c.name}@${c.offset}(fmt${c.format}×${c.count})`).join(', '),
    );
  }
  return { components, bytesPerVertex };
}

function formatSize(format: number): number {
  switch (format) {
    case 0: return 4; // float32
    case 1: return 2; // float16
    case 2: return 1; // unorm8
    case 3: return 1; // snorm8
    default: return 4;
  }
}

/**
 * Extract vertex attributes from raw vertex data using the parsed layout.
 */
export function extractVertexBuffer(
  rawData: ArrayBuffer,
  dataOffset: number,
  vertexCount: number,
  layout: VertexLayout,
  index: number,
  littleEndian: boolean,
): GMDVertexBuffer {
  const { bytesPerVertex, components } = layout;
  const br = new BinaryReader(rawData, littleEndian);

  // Find components
  const posComp = components.find(c => c.name === 'position');
  const normalComp = components.find(c => c.name === 'normal');
  const tangentComp = components.find(c => c.name === 'tangent');
  const uv0Comp = components.find(c => c.name === 'uv0');
  const bonesComp = components.find(c => c.name === 'bones');
  const weightsComp = components.find(c => c.name === 'weights');
  const col0Comp = components.find(c => c.name === 'color0');

  // Allocate output arrays
  const positions = new Float32Array(vertexCount * 3);
  const normals = normalComp ? new Float32Array(vertexCount * 3) : null;
  const tangents = tangentComp ? new Float32Array(vertexCount * 4) : null;
  const uvs = uv0Comp ? new Float32Array(vertexCount * 2) : null;
  const boneIndices = bonesComp ? new Uint8Array(vertexCount * 4) : null;
  const boneWeights = weightsComp ? new Float32Array(vertexCount * 4) : null;
  const colors = col0Comp ? new Float32Array(vertexCount * 4) : null;

  for (let v = 0; v < vertexCount; v++) {
    const vertexStart = dataOffset + v * bytesPerVertex;

    // Position (always extract as 3 components)
    if (posComp) {
      const vals = readComponent(br, vertexStart + posComp.offset, posComp, littleEndian);
      positions[v * 3] = vals[0]!;
      positions[v * 3 + 1] = vals[1]!;
      positions[v * 3 + 2] = vals[2]!;
    }

    // Normal — renormalize after snorm8 quantization.
    // Stored normals point outward (correct). No negation needed.
    if (normalComp && normals) {
      const vals = readComponent(br, vertexStart + normalComp.offset, normalComp, littleEndian);
      let nx = normalComp.format === 2 ? vals[0]! * 2 - 1 : vals[0]!;
      let ny = normalComp.format === 2 ? vals[1]! * 2 - 1 : vals[1]!;
      let nz = normalComp.format === 2 ? vals[2]! * 2 - 1 : vals[2]!;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len > 0) { nx /= len; ny /= len; nz /= len; }
      normals[v * 3] = nx;
      normals[v * 3 + 1] = ny;
      normals[v * 3 + 2] = nz;
    }

    // Tangent — renormalize XYZ, keep W sign (handedness)
    if (tangentComp && tangents) {
      const vals = readComponent(br, vertexStart + tangentComp.offset, tangentComp, littleEndian);
      let tx = tangentComp.format === 2 ? vals[0]! * 2 - 1 : vals[0]!;
      let ty = tangentComp.format === 2 ? vals[1]! * 2 - 1 : vals[1]!;
      let tz = tangentComp.format === 2 ? vals[2]! * 2 - 1 : vals[2]!;
      const tw = tangentComp.format === 2 ? vals[3]! * 2 - 1 : vals[3]!;
      const len = Math.sqrt(tx * tx + ty * ty + tz * tz);
      if (len > 0) { tx /= len; ty /= len; tz /= len; }
      tangents[v * 4] = tx;
      tangents[v * 4 + 1] = ty;
      tangents[v * 4 + 2] = tz;
      tangents[v * 4 + 3] = tw < 0 ? -1 : 1;
    }

    // UV0
    if (uv0Comp && uvs) {
      const vals = readComponent(br, vertexStart + uv0Comp.offset, uv0Comp, littleEndian);
      uvs[v * 2] = vals[0]!;
      uvs[v * 2 + 1] = vals[1]!;
    }

    // Bones (always uint8)
    if (bonesComp && boneIndices) {
      br.seek(vertexStart + bonesComp.offset);
      boneIndices[v * 4] = br.readUint8();
      boneIndices[v * 4 + 1] = br.readUint8();
      boneIndices[v * 4 + 2] = br.readUint8();
      boneIndices[v * 4 + 3] = br.readUint8();
    }

    // Weights
    if (weightsComp && boneWeights) {
      const vals = readComponent(br, vertexStart + weightsComp.offset, weightsComp, littleEndian);
      boneWeights[v * 4] = vals[0]!;
      boneWeights[v * 4 + 1] = vals[1]!;
      boneWeights[v * 4 + 2] = vals[2]!;
      boneWeights[v * 4 + 3] = vals[3]!;
    }

    // Color0
    if (col0Comp && colors) {
      const vals = readComponent(br, vertexStart + col0Comp.offset, col0Comp, littleEndian);
      colors[v * 4] = vals[0]!;
      colors[v * 4 + 1] = vals[1]!;
      colors[v * 4 + 2] = vals[2]!;
      colors[v * 4 + 3] = vals[3]!;
    }
  }

  return { index, vertexCount, bytesPerVertex, positions, normals, tangents, uvs, boneIndices, boneWeights, colors };
}

function readComponent(br: BinaryReader, offset: number, comp: VertexComponent, _le: boolean): number[] {
  br.seek(offset);
  const values: number[] = [];
  for (let i = 0; i < comp.count; i++) {
    switch (comp.format) {
      case 0: values.push(br.readFloat32()); break;
      case 1: values.push(br.readFloat16()); break;
      case 2: values.push(br.readUint8() / 255); break; // unorm8
      case 3: values.push(br.readInt8() / 127); break;   // snorm8
    }
  }
  return values;
}
