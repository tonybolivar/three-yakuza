/** Top-level parsed GMD document. */
export interface GMDDocument {
  readonly name: string;
  readonly version: GMDVersion;
  readonly nodes: readonly GMDNode[];
  readonly meshes: readonly GMDMesh[];
  readonly materials: readonly GMDMaterial[];
  readonly textures: readonly string[];
  readonly shaders: readonly string[];
  readonly matrices: readonly Float32Array[];
  readonly vertexBuffers: readonly GMDVertexBuffer[];
  readonly indexBuffer: Uint16Array;
}

export interface GMDVersion {
  readonly major: number;
  readonly minor: number;
}

/** A node in the model hierarchy (bone or mesh transform). */
export interface GMDNode {
  readonly index: number;
  readonly parentOf: number;
  readonly siblingOf: number;
  readonly objectIndex: number;
  readonly matrixIndex: number;
  readonly nameIndex: number;
  readonly nodeType: number;
  readonly name: string;
  readonly position: readonly [number, number, number, number];
  readonly rotation: readonly [number, number, number, number];
  readonly scale: readonly [number, number, number, number];
  readonly worldPosition: readonly [number, number, number, number];
}

/** A mesh within the model. */
export interface GMDMesh {
  readonly index: number;
  readonly attributeIndex: number;
  readonly vertexBufferIndex: number;
  readonly vertexCount: number;
  readonly triangleListCount: number;
  readonly triangleListOffset: number;
  readonly noResetStripCount: number;
  readonly noResetStripOffset: number;
  readonly resetStripCount: number;
  readonly resetStripOffset: number;
  readonly matrixListLength: number;
  readonly matrixListOffset: number;
  readonly nodeIndex: number;
  readonly objectIndex: number;
  readonly vertexOffsetFromIndex: number;
  readonly minIndex: number;
}

/** Parsed vertex buffer with layout info and extracted attribute arrays. */
export interface GMDVertexBuffer {
  readonly index: number;
  readonly vertexCount: number;
  readonly bytesPerVertex: number;
  readonly positions: Float32Array;
  readonly normals: Float32Array | null;
  readonly uvs: Float32Array | null;
  readonly boneIndices: Uint8Array | null;
  readonly boneWeights: Float32Array | null;
  readonly colors: Float32Array | null;
}

/** Material properties (from the attribute + material structs). */
export interface GMDMaterial {
  readonly index: number;
  readonly shaderIndex: number;
  readonly textureIndices: readonly number[];
  readonly diffuse: readonly [number, number, number];
  readonly specular: readonly [number, number, number];
  readonly opacity: number;
  /** Specular power/shininess from MaterialStruct (float16). */
  readonly shininess: number;
}
