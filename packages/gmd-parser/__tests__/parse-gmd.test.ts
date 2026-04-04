import { describe, it, expect } from 'vitest';
import { parseGMD } from '../src/parse-gmd.js';

/** Build a minimal synthetic GMD with 1 node, 1 mesh, 3 vertices, 1 triangle. */
function buildMinimalGMD(): ArrayBuffer {
  const size = 0x800;
  const ab = new ArrayBuffer(size);
  const dv = new DataView(ab);
  const bytes = new Uint8Array(ab);

  // -- Base header (0x00-0x2F) --
  bytes[0] = 0x47; bytes[1] = 0x53; bytes[2] = 0x47; bytes[3] = 0x4d; // "GSGM"
  bytes[4] = 0x21; // endian marker: little-endian
  bytes[5] = 0x00; // endian flag
  // version: major=3, minor=0 (YK1/Kiwami style)
  dv.setUint32(0x08, (3 << 16) | 0, true);
  dv.setUint32(0x0c, size, true);
  // Name RGG string at 0x10
  writeRGGStringLE(bytes, dv, 0x10, 'test_model');

  // -- Section pointers at 0x30 (YK1 header) --
  // We'll layout sections sequentially
  const nodeOffset = 0x200;
  const meshOffset = 0x2C0;
  const attrOffset = 0x340;
  const matOffset = 0x3C0;
  const matrixOffset = 0x400;
  const vbLayoutOffset = 0x440;
  const vertexDataOffset = 0x480;
  const textureOffset = 0x500;
  const shaderOffset = 0x520;
  const nodeNameOffset = 0x540;
  const indexOffset = 0x580;

  let o = 0x30;
  // nodeArr
  dv.setUint32(o, nodeOffset, true); o += 4;
  dv.setUint32(o, 1, true); o += 4; // 1 node
  // objArr
  dv.setUint32(o, 0, true); o += 4;
  dv.setUint32(o, 0, true); o += 4;
  // meshArr
  dv.setUint32(o, meshOffset, true); o += 4;
  dv.setUint32(o, 1, true); o += 4; // 1 mesh
  // attrArr
  dv.setUint32(o, attrOffset, true); o += 4;
  dv.setUint32(o, 1, true); o += 4; // 1 attribute
  // materialArr
  dv.setUint32(o, matOffset, true); o += 4;
  dv.setUint32(o, 1, true); o += 4;
  // matrixArr
  dv.setUint32(o, matrixOffset, true); o += 4;
  dv.setUint32(o, 1, true); o += 4;
  // vbLayoutArr
  dv.setUint32(o, vbLayoutOffset, true); o += 4;
  dv.setUint32(o, 1, true); o += 4;
  // vertexData
  dv.setUint32(o, vertexDataOffset, true); o += 4;
  dv.setUint32(o, 36, true); o += 4; // 3 verts * 12 bytes
  // textureArr
  dv.setUint32(o, textureOffset, true); o += 4;
  dv.setUint32(o, 0, true); o += 4;
  // shaderArr
  dv.setUint32(o, shaderOffset, true); o += 4;
  dv.setUint32(o, 0, true); o += 4;
  // nodeNameArr
  dv.setUint32(o, nodeNameOffset, true); o += 4;
  dv.setUint32(o, 1, true); o += 4;
  // indexData
  dv.setUint32(o, indexOffset, true); o += 4;
  dv.setUint32(o, 3, true); o += 4; // 3 indices

  // -- Node name at nodeNameOffset --
  writeRGGStringLE(bytes, dv, nodeNameOffset, 'root_bone');

  // -- Node at nodeOffset (128 bytes per node in the format) --
  o = nodeOffset;
  dv.setInt32(o, 0, true); o += 4; // index
  dv.setInt32(o, -1, true); o += 4; // parentOf
  dv.setInt32(o, -1, true); o += 4; // siblingOf
  dv.setInt32(o, -1, true); o += 4; // objectIndex
  dv.setInt32(o, 0, true); o += 4; // matrixIndex
  dv.setInt32(o, 0, true); o += 4; // stackOp
  dv.setInt32(o, 0, true); o += 4; // nameIndex
  dv.setInt32(o, 0, true); o += 4; // nodeType
  // position (4 floats)
  dv.setFloat32(o, 0, true); o += 4;
  dv.setFloat32(o, 0, true); o += 4;
  dv.setFloat32(o, 0, true); o += 4;
  dv.setFloat32(o, 1, true); o += 4;
  // rotation (4 floats: w, x, y, z)
  dv.setFloat32(o, 1, true); o += 4; // w
  dv.setFloat32(o, 0, true); o += 4;
  dv.setFloat32(o, 0, true); o += 4;
  dv.setFloat32(o, 0, true); o += 4;
  // scale
  dv.setFloat32(o, 1, true); o += 4;
  dv.setFloat32(o, 1, true); o += 4;
  dv.setFloat32(o, 1, true); o += 4;
  dv.setFloat32(o, 1, true); o += 4;
  // worldPos
  dv.setFloat32(o, 0, true); o += 4;
  dv.setFloat32(o, 0, true); o += 4;
  dv.setFloat32(o, 0, true); o += 4;
  dv.setFloat32(o, 1, true); o += 4;
  // anim_axis + flags (32 bytes skip)

  // -- Mesh at meshOffset (64 bytes) --
  o = meshOffset;
  dv.setUint32(o, 0, true); o += 4; // index
  dv.setUint32(o, 0, true); o += 4; // attributeIndex
  dv.setUint32(o, 0, true); o += 4; // vertexBufferIndex
  dv.setUint32(o, 3, true); o += 4; // vertexCount
  dv.setUint32(o, 3, true); o += 4; // triangleListCount
  dv.setUint32(o, 0, true); o += 4; // triangleListOffset
  dv.setUint32(o, 0, true); o += 4; // noResetStripCount
  dv.setUint32(o, 0, true); o += 4; // noResetStripOffset
  dv.setUint32(o, 0, true); o += 4; // resetStripCount
  dv.setUint32(o, 0, true); o += 4; // resetStripOffset
  dv.setUint32(o, 0, true); o += 4; // matrixListLength
  dv.setUint32(o, 0, true); o += 4; // matrixListOffset
  dv.setUint32(o, 0, true); o += 4; // nodeIndex
  dv.setUint32(o, 0, true); o += 4; // objectIndex
  dv.setUint32(o, 0, true); o += 4; // vertexOffsetFromIndex
  dv.setUint32(o, 0, true); o += 4; // minIndex

  // -- Attribute at attrOffset (104 bytes for YK1) --
  o = attrOffset;
  dv.setUint32(o, 0, true); o += 4; // index
  dv.setUint32(o, 0, true); o += 4; // materialIndex
  dv.setUint32(o, 0, true); o += 4; // shaderIndex
  dv.setUint32(o, 0, true); o += 4; // meshIndicesStart
  dv.setUint32(o, 1, true); o += 4; // meshIndicesCount
  dv.setUint32(o, 0, true); o += 4; // textureInitCount
  // unk/flags (8 bytes)
  o += 8;
  // 8 texture slots (9 bytes each = 72 bytes), all 0xFFFF
  for (let t = 0; t < 8; t++) {
    dv.setUint16(o, 0xffff, true); // no texture
    o += 9;
  }

  // -- Material at matOffset (16 bytes) --
  o = matOffset;
  o += 4; // power + unk1
  bytes[o] = 255; bytes[o + 1] = 255; bytes[o + 2] = 255; o += 3; // specular white
  o += 1; // padding
  bytes[o] = 200; bytes[o + 1] = 200; bytes[o + 2] = 200; o += 3; // diffuse gray
  bytes[o] = 255; o += 1; // opacity = 1.0

  // -- Matrix at matrixOffset (64 bytes = identity) --
  o = matrixOffset;
  dv.setFloat32(o, 1, true); o += 4; dv.setFloat32(o, 0, true); o += 4; dv.setFloat32(o, 0, true); o += 4; dv.setFloat32(o, 0, true); o += 4;
  dv.setFloat32(o, 0, true); o += 4; dv.setFloat32(o, 1, true); o += 4; dv.setFloat32(o, 0, true); o += 4; dv.setFloat32(o, 0, true); o += 4;
  dv.setFloat32(o, 0, true); o += 4; dv.setFloat32(o, 0, true); o += 4; dv.setFloat32(o, 1, true); o += 4; dv.setFloat32(o, 0, true); o += 4;
  dv.setFloat32(o, 0, true); o += 4; dv.setFloat32(o, 0, true); o += 4; dv.setFloat32(o, 0, true); o += 4; dv.setFloat32(o, 1, true);

  // -- VB Layout at vbLayoutOffset (32 bytes) --
  o = vbLayoutOffset;
  dv.setUint32(o, 0, true); o += 4; // index
  dv.setUint32(o, 3, true); o += 4; // vertexCount
  // packing flags: position only, 3 components, float32
  // bits 0-2 = 3 (3 components), bit 3 = 0 (float32)
  dv.setUint32(o, 3, true); o += 4; // flagsLow
  dv.setUint32(o, 0, true); o += 4; // flagsHigh
  dv.setUint32(o, 0, true); o += 4; // dataOffset (relative to vertexData)
  dv.setUint32(o, 36, true); o += 4; // dataLength
  dv.setUint32(o, 12, true); o += 4; // bytesPerVertex (3 floats = 12)
  dv.setUint32(o, 0, true); // padding

  // -- Vertex data at vertexDataOffset (3 * 12 = 36 bytes) --
  o = vertexDataOffset;
  // Triangle: (0,0,0), (1,0,0), (0,1,0)
  dv.setFloat32(o, 0, true); o += 4; dv.setFloat32(o, 0, true); o += 4; dv.setFloat32(o, 0, true); o += 4;
  dv.setFloat32(o, 1, true); o += 4; dv.setFloat32(o, 0, true); o += 4; dv.setFloat32(o, 0, true); o += 4;
  dv.setFloat32(o, 0, true); o += 4; dv.setFloat32(o, 1, true); o += 4; dv.setFloat32(o, 0, true);

  // -- Index data at indexOffset (3 uint16) --
  o = indexOffset;
  dv.setUint16(o, 0, true); o += 2;
  dv.setUint16(o, 1, true); o += 2;
  dv.setUint16(o, 2, true);

  return ab;
}

function writeRGGStringLE(bytes: Uint8Array, dv: DataView, offset: number, str: string): void {
  const encoded: number[] = [];
  for (let i = 0; i < str.length; i++) encoded.push(str.charCodeAt(i));
  const checksum = encoded.reduce((a, b) => a + b, 0);
  dv.setUint16(offset, checksum, true); // little-endian
  encoded.forEach((b, i) => { bytes[offset + 2 + i] = b; });
}

describe('parseGMD (integration)', () => {
  it('parses a minimal synthetic GMD', () => {
    const buf = buildMinimalGMD();
    const doc = parseGMD(buf);

    expect(doc.name).toBe('test_model');
    expect(doc.version.major).toBe(3);
    expect(doc.version.minor).toBe(0);
    expect(doc.nodes).toHaveLength(1);
    expect(doc.meshes).toHaveLength(1);
    expect(doc.materials).toHaveLength(1);
  });

  it('extracts vertex positions correctly', () => {
    const buf = buildMinimalGMD();
    const doc = parseGMD(buf);

    expect(doc.vertexBuffers).toHaveLength(1);
    const vb = doc.vertexBuffers[0]!;
    expect(vb.vertexCount).toBe(3);

    // Vertex 0: (0, 0, 0)
    expect(vb.positions[0]).toBe(0);
    expect(vb.positions[1]).toBe(0);
    expect(vb.positions[2]).toBe(0);
    // Vertex 1: (1, 0, 0)
    expect(vb.positions[3]).toBe(1);
    // Vertex 2: (0, 1, 0)
    expect(vb.positions[7]).toBe(1);
  });

  it('reads index buffer', () => {
    const buf = buildMinimalGMD();
    const doc = parseGMD(buf);

    expect(doc.indexBuffer.length).toBe(3);
    expect(Array.from(doc.indexBuffer)).toEqual([0, 1, 2]);
  });

  it('reads node hierarchy', () => {
    const buf = buildMinimalGMD();
    const doc = parseGMD(buf);

    expect(doc.nodes[0]!.name).toBe('root_bone');
    expect(doc.nodes[0]!.parentOf).toBe(-1);
  });
});
