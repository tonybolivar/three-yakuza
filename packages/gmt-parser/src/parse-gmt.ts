/**
 * High-level GMT parsing: reads binary buffer and assembles the data model.
 * Ported from gmt_lib/gmt/gmt_reader.py (MIT).
 */
import type { GMTDocument, GMTAnimation, GMTBone, GMTCurve, GMTKeyframe } from './types.js';
import { GMTParseError } from './errors.js';
import { deserializeKeyframes } from './animation-data.js';
import {
  parseHeader,
  parseAnimations,
  parseGraphs,
  parseStrings,
  parseGroups,
  parseCurves,
} from './reader.js';

/**
 * Parse a GMT file from an ArrayBuffer.
 * Returns the complete parsed document with animations, bones, and curves.
 */
export function parseGMT(buffer: ArrayBuffer): GMTDocument {
  const { header, br } = parseHeader(buffer);

  // Parse all sections at their respective offsets
  br.seek(header.animationOffset);
  const rawAnims = parseAnimations(br, header.animationCount);

  br.seek(header.graphOffset);
  const graphs = parseGraphs(br, header.graphCount);

  br.seek(header.stringOffset);
  const strings = parseStrings(br, header.stringCount);

  br.seek(header.boneGroupOffset);
  const boneGroups = parseGroups(br, header.boneGroupCount);

  br.seek(header.curveGroupOffset);
  const curveGroups = parseGroups(br, header.curveGroupCount);

  br.seek(header.curveOffset);
  const rawCurves = parseCurves(br, header.curveCount);

  // Assemble animations by cross-referencing sections
  const animations: GMTAnimation[] = [];

  for (const rawAnim of rawAnims) {
    // Get animation name
    const animName = strings[rawAnim.nameIndex];
    if (animName === undefined) {
      throw new GMTParseError(
        `Animation name index ${rawAnim.nameIndex} out of bounds (${strings.length} strings)`,
        header.animationOffset,
      );
    }

    // Get bone names from the bone group
    const boneGroup = boneGroups[rawAnim.boneGroupIndex];
    if (!boneGroup) {
      throw new GMTParseError(
        `Bone group index ${rawAnim.boneGroupIndex} out of bounds`,
        header.boneGroupOffset,
      );
    }

    const bones = new Map<string, GMTBone>();

    // Iterate curve groups for this animation
    for (let cgi = 0; cgi < rawAnim.curveGroupsCount; cgi++) {
      const curveGroup = curveGroups[rawAnim.curveGroupsIndex + cgi];
      if (!curveGroup) {
        throw new GMTParseError(
          `Curve group index ${rawAnim.curveGroupsIndex + cgi} out of bounds`,
          header.curveGroupOffset,
        );
      }

      // The bone name for this curve group — cgi maps to the position in the bone group
      const boneName = strings[boneGroup.index + cgi];
      if (boneName === undefined) {
        throw new GMTParseError(
          `Bone string index ${boneGroup.index + cgi} out of bounds`,
          header.stringOffset,
        );
      }

      // Parse curves for this bone
      const curves: GMTCurve[] = [];
      for (let ci = 0; ci < curveGroup.count; ci++) {
        const rawCurve = rawCurves[curveGroup.index + ci];
        if (!rawCurve) {
          throw new GMTParseError(
            `Curve index ${curveGroup.index + ci} out of bounds`,
            header.curveOffset,
          );
        }

        // Get frame numbers from graph
        const graph = graphs[rawCurve.graphIndex];
        if (!graph) {
          throw new GMTParseError(
            `Graph index ${rawCurve.graphIndex} out of bounds`,
            header.graphOffset,
          );
        }

        // Deserialize keyframe values
        br.seek(rawCurve.dataOffset);
        const values = deserializeKeyframes(br, rawCurve.format, header.version, graph.length);

        // Zip frame numbers with values to create keyframes
        const keyframes: GMTKeyframe[] = graph.map((frame, i) => ({
          frame,
          value: values[i]!,
        }));

        curves.push({
          type: rawCurve.type,
          channel: rawCurve.channel,
          keyframes,
        });
      }

      // Merge curves into existing bone or create new one
      const existingBone = bones.get(boneName);
      if (existingBone) {
        bones.set(boneName, {
          name: boneName,
          curves: [...existingBone.curves, ...curves],
        });
      } else {
        bones.set(boneName, { name: boneName, curves });
      }
    }

    animations.push({
      name: animName,
      frameRate: rawAnim.frameRate,
      startFrame: rawAnim.startFrame,
      endFrame: rawAnim.endFrame,
      bones,
    });
  }

  return {
    name: header.name,
    version: header.version,
    isFaceGmt: header.isFaceGmt,
    animations,
  };
}
