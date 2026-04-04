/** Top-level parsed IFA document. */
export interface IFADocument {
  readonly bones: readonly IFABone[];
}

/** A single bone pose in the IFA skeletal data. */
export interface IFABone {
  readonly name: string;
  readonly parentName: string;
  /** Rotation quaternion (x, y, z, w). */
  readonly rotation: readonly [number, number, number, number];
  /** Position (x, y, z). */
  readonly location: readonly [number, number, number];
}
