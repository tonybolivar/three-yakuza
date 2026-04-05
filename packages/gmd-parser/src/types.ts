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
  /** Raw mesh matrix list bytes — uint8 bone index mapping per mesh. */
  readonly meshMatrixList: Uint8Array;
}

export interface GMDVersion {
  readonly major: number;
  readonly minor: number;
}

/** A node in the model hierarchy (bone or mesh transform). */
export interface GMDNode {
  readonly index: number;
  /** First child node index (-1 if leaf). Forms a child/sibling linked list. */
  readonly parentOf: number;
  /** Next sibling node index (-1 if last sibling). */
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
  readonly tangents: Float32Array | null;
  readonly uvs: Float32Array | null;
  readonly boneIndices: Uint8Array | null;
  readonly boneWeights: Float32Array | null;
  readonly colors: Float32Array | null;
}

/** Texture slots in a GMD material. Indices into the GMD texture name table. -1 = unused. */
export interface GMDTextureSlots {
  /** Slot 0: diffuse/albedo (_di) */
  readonly diffuse: number;
  /** Slot 1: reflection/cubemap */
  readonly reflection: number;
  /** Slot 2: multi-map (_mt) — R=metallic, G=AO, B=glossiness */
  readonly multi: number;
  /** Slot 3: repeat multi (_rm) */
  readonly repeatMulti: number;
  /** Slot 4: toon/subsurface (_ts) */
  readonly toonSub: number;
  /** Slot 5: normal map (_tn) */
  readonly normal: number;
  /** Slot 6: repeat normal (_rt) */
  readonly repeatNormal: number;
  /** Slot 7: repeat diffuse (_rd) */
  readonly repeatDiffuse: number;
}

/** Material properties (from the attribute + material structs). */
export interface GMDMaterial {
  readonly index: number;
  readonly shaderIndex: number;
  /** @deprecated Use textureSlots instead */
  readonly textureIndices: readonly number[];
  readonly textureSlots: GMDTextureSlots;
  readonly diffuse: readonly [number, number, number];
  readonly specular: readonly [number, number, number];
  readonly opacity: number;
  /** Specular power/shininess from MaterialStruct (float16). */
  readonly shininess: number;
}
