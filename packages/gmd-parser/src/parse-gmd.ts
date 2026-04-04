/**
 * GMD (Game Model Data) binary format parser.
 */
import { BinaryReader, readRGGString } from '@three-yakuza/binary-reader';
import type {
  GMDDocument, GMDVersion, GMDNode, GMDMesh, GMDMaterial, GMDVertexBuffer,
} from './types.js';
import { parseVertexLayout, extractVertexBuffer } from './vertex-layout.js';

const GMD_MAGIC = 'GSGM';

/**
 * Parse a GMD model file from an ArrayBuffer.
 */
export function parseGMD(buffer: ArrayBuffer): GMDDocument {
  let br = new BinaryReader(buffer, false);

  // -- Base header --
  // Magic: "GSGM" (same RGG convention as "GSGT" for GMT)
  const magic = String.fromCharCode(
    br.readUint8(), br.readUint8(), br.readUint8(), br.readUint8(),
  );
  if (magic !== GMD_MAGIC) {
    throw new Error(`Invalid GMD magic: expected "GSGM", got "${JSON.stringify(magic)}"`);
  }

  // 0x04: vertex_endian_check, 0x05: file_endian_check
  // Values: 0x00 = little-endian, 0x01 or 0x02 = big-endian
  br.skip(1); // vertex endian (used for vertex data, skip for now)
  const fileEndian = br.readUint8();
  const littleEndian = fileEndian === 0;
  if (littleEndian) {
    br = br.withEndianness(true);
  }

  br.skip(2); // padding

  // 0x08: version
  const versionCombined = br.readUint32();
  const version: GMDVersion = {
    major: (versionCombined >> 16) & 0xffff,
    minor: versionCombined & 0xffff,
  };

  // 0x0C: file size
  br.skip(4);

  // 0x10: model name (RGG string: uint16 checksum + 30 bytes Shift-JIS)
  const name = readRGGString(br);

  // -- Version-specific header (0x30+) --
  // Read section pointers (ArrayPointers and SizedPointers)
  const nodeArr = readArrayPointer(br);
  readArrayPointer(br); // objArr (unused)
  const meshArr = readArrayPointer(br);
  const attrArr = readArrayPointer(br);
  const materialArr = readArrayPointer(br);
  const matrixArr = readArrayPointer(br);
  const vbLayoutArr = readArrayPointer(br);
  const vertexData = readSizedPointer(br);
  const textureArr = readArrayPointer(br);
  const shaderArr = readArrayPointer(br);
  const nodeNameArr = readArrayPointer(br);
  const indexData = readArrayPointer(br);
  readSizedPointer(br); // objectDrawlistBytes (unused)
  const meshMatrixlistData = readSizedPointer(br);

  // Skip remaining header fields (draw lists, matrix lists, bounds, unknowns, flags)
  // These vary by version but we don't need them for basic mesh extraction

  // -- Parse sections --

  // Node names
  br.seek(nodeNameArr.offset);
  const nodeNames: string[] = [];
  for (let i = 0; i < nodeNameArr.count; i++) {
    nodeNames.push(readRGGString(br));
  }

  // Textures
  br.seek(textureArr.offset);
  const textures: string[] = [];
  for (let i = 0; i < textureArr.count; i++) {
    textures.push(readRGGString(br));
  }

  // Shaders
  br.seek(shaderArr.offset);
  const shaders: string[] = [];
  for (let i = 0; i < shaderArr.count; i++) {
    shaders.push(readRGGString(br));
  }

  // Nodes
  br.seek(nodeArr.offset);
  const nodes: GMDNode[] = [];
  for (let i = 0; i < nodeArr.count; i++) {
    nodes.push(readNode(br, nodeNames));
  }

  // Meshes
  br.seek(meshArr.offset);
  const meshes: GMDMesh[] = [];
  for (let i = 0; i < meshArr.count; i++) {
    meshes.push(readMesh(br));
  }

  // Materials (attribute + material structs)
  const isDragon = version.major >= 4;
  const materials = readMaterials(br, attrArr, materialArr, isDragon);

  // Matrices
  br.seek(matrixArr.offset);
  const matrices: Float32Array[] = [];
  for (let i = 0; i < matrixArr.count; i++) {
    const mat = new Float32Array(16);
    for (let j = 0; j < 16; j++) {
      mat[j] = br.readFloat32();
    }
    matrices.push(mat);
  }

  // Vertex buffer layouts → extract vertex data
  br.seek(vbLayoutArr.offset);
  const vertexBuffers: GMDVertexBuffer[] = [];
  for (let i = 0; i < vbLayoutArr.count; i++) {
    const vbIndex = br.readUint32();
    const vbVertexCount = br.readUint32();
    // vertex_packing_flags is a uint64. Word order depends on endianness.
    const flagsWord0 = br.readUint32();
    const flagsWord1 = br.readUint32();
    const flagsLow = littleEndian ? flagsWord0 : flagsWord1;
    const flagsHigh = littleEndian ? flagsWord1 : flagsWord0;
    const vbDataOffset = br.readUint32();
    br.skip(4); // vbDataLength
    const bytesPerVertex = br.readUint32();
    br.skip(4); // padding

    const layout = parseVertexLayout(flagsLow, flagsHigh, bytesPerVertex);
    const vb = extractVertexBuffer(
      buffer, vertexData.offset + vbDataOffset, vbVertexCount, layout, vbIndex, littleEndian,
    );
    vertexBuffers.push(vb);
  }

  // Index buffer
  br.seek(indexData.offset);
  const indexBuffer = new Uint16Array(indexData.count);
  for (let i = 0; i < indexData.count; i++) {
    indexBuffer[i] = br.readUint16();
  }

  // Mesh matrix list — uint8 bone index mapping
  br.seek(meshMatrixlistData.offset);
  const meshMatrixList = br.readBytes(meshMatrixlistData.size);

  return {
    name,
    version,
    nodes,
    meshes,
    materials,
    textures,
    shaders,
    matrices,
    vertexBuffers,
    indexBuffer,
    meshMatrixList,
  };
}

// -- Internal helpers --

interface ArrayPointer { offset: number; count: number; }
interface SizedPointer { offset: number; size: number; }

function readArrayPointer(br: BinaryReader): ArrayPointer {
  return { offset: br.readUint32(), count: br.readUint32() };
}

function readSizedPointer(br: BinaryReader): SizedPointer {
  return { offset: br.readUint32(), size: br.readUint32() };
}

function readNode(br: BinaryReader, names: string[]): GMDNode {
  const index = br.readInt32();
  const parentOf = br.readInt32();
  const siblingOf = br.readInt32();
  const objectIndex = br.readInt32();
  const matrixIndex = br.readInt32();
  br.skip(4); // stackOp
  const nameIndex = br.readInt32();
  const nodeType = br.readInt32();

  const position: [number, number, number, number] = [
    br.readFloat32(), br.readFloat32(), br.readFloat32(), br.readFloat32(),
  ];
  const rotation: [number, number, number, number] = [
    br.readFloat32(), br.readFloat32(), br.readFloat32(), br.readFloat32(),
  ];
  const scale: [number, number, number, number] = [
    br.readFloat32(), br.readFloat32(), br.readFloat32(), br.readFloat32(),
  ];
  const worldPosition: [number, number, number, number] = [
    br.readFloat32(), br.readFloat32(), br.readFloat32(), br.readFloat32(),
  ];

  // anim_axis + flags = 32 more bytes
  br.skip(32);

  return {
    index, parentOf, siblingOf, objectIndex, matrixIndex,
    nameIndex, nodeType,
    name: names[nameIndex] ?? `node_${index}`,
    position, rotation, scale, worldPosition,
  };
}

function readMesh(br: BinaryReader): GMDMesh {
  return {
    index: br.readUint32(),
    attributeIndex: br.readUint32(),
    vertexBufferIndex: br.readUint32(),
    vertexCount: br.readUint32(),
    triangleListCount: br.readUint32(),
    triangleListOffset: br.readUint32(),
    noResetStripCount: br.readUint32(),
    noResetStripOffset: br.readUint32(),
    resetStripCount: br.readUint32(),
    resetStripOffset: br.readUint32(),
    matrixListLength: br.readUint32(),
    matrixListOffset: br.readUint32(),
    nodeIndex: br.readUint32(),
    objectIndex: br.readUint32(),
    vertexOffsetFromIndex: br.readUint32(),
    minIndex: br.readUint32(),
  };
}

function readMaterials(
  br: BinaryReader,
  attrArr: ArrayPointer,
  materialArr: ArrayPointer,
  isDragon: boolean,
): GMDMaterial[] {
  // Read raw materials first
  br.seek(materialArr.offset);
  const rawMaterials: { diffuse: [number, number, number]; specular: [number, number, number]; opacity: number; shininess: number }[] = [];
  for (let i = 0; i < materialArr.count; i++) {
    const shininess = br.readFloat16(); // power/shininess (float16)
    br.skip(2); // unk1
    const specular: [number, number, number] = [
      br.readUint8() / 255, br.readUint8() / 255, br.readUint8() / 255,
    ];
    br.skip(1); // padding
    const diffuse: [number, number, number] = [
      br.readUint8() / 255, br.readUint8() / 255, br.readUint8() / 255,
    ];
    const opacity = br.readUint8() / 255;
    br.skip(4); // unk2
    rawMaterials.push({ diffuse, specular, opacity, shininess });
  }

  // Read attributes (link material → shader → textures)
  br.seek(attrArr.offset);
  const materials: GMDMaterial[] = [];
  // YK1 AttributeStruct = 128 bytes per yk_gmd_io:
  // 0x00-0x1F: header (index, materialIndex, shaderIndex, meshIndices, flags)
  // 0x20-0x3F: 8 texture slots × 4 bytes (uint16 padding + int16 tex_index)
  // 0x40-0x7F: 16 extra float properties
  const attrSize = 128;

  for (let i = 0; i < attrArr.count; i++) {
    const attrStart = attrArr.offset + i * attrSize;
    br.seek(attrStart);

    br.skip(4); // attrIndex
    const materialIndex = br.readUint32();
    const shaderIndex = br.readUint32();
    br.skip(8); // mesh indices start/count
    br.skip(4); // texture init count

    if (isDragon) {
      br.skip(8); // flags (uint64)
    } else {
      br.skip(8); // unk1/2/flags/unk3
    }

    // Read texture slots: 8 × TextureIndexStruct (4 bytes each)
    // Layout: uint16 padding + int16 tex_index (-1 = unused)
    // Slots: [diffuse, refl, multi, rm, ts, normal, rt, rd]
    const textureIndices: number[] = [];
    for (let t = 0; t < 8; t++) {
      br.skip(2); // padding
      const texIdx = br.readInt16();
      if (texIdx >= 0) {
        textureIndices.push(texIdx);
      }
    }

    const rawMat = rawMaterials[materialIndex];
    materials.push({
      index: i,
      shaderIndex,
      textureIndices,
      diffuse: rawMat?.diffuse ?? [1, 1, 1],
      specular: rawMat?.specular ?? [0, 0, 0],
      opacity: rawMat?.opacity ?? 1,
      shininess: rawMat?.shininess ?? 30,
    });
  }

  return materials;
}
