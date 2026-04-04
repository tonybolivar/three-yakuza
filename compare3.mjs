import { parseGMD } from './packages/gmd-parser/dist/index.js';
import { parsePAR, extractFile } from './packages/par-parser/dist/index.js';
import { readFileSync } from 'fs';

const pBuf = readFileSync('C:/Program Files (x86)/Steam/steamapps/common/Yakuza Kiwami/media/data/chara/w64/adv/c_cm_kiryu/mesh.par');
const pAB = pBuf.buffer.slice(pBuf.byteOffset, pBuf.byteOffset + pBuf.byteLength);
const archive = parsePAR(pAB);
const gmdData = extractFile(pAB, archive.files.find(f => f.name.endsWith('.gmd')));
const ours = parseGMD(gmdData.buffer.slice(gmdData.byteOffset, gmdData.byteOffset + gmdData.byteLength));

const fBuf = readFileSync('C:/Users/tonyt/Downloads/kiryu (1).gmd');
const friend = parseGMD(fBuf.buffer.slice(fBuf.byteOffset, fBuf.byteOffset + fBuf.byteLength));

// Better comparison: match by position + UV together to avoid seam duplicates
console.log("=== IMPROVED COMPARISON (pos+UV match) ===\n");

let totalCompared = 0, totalNormalBad = 0, totalUVBad = 0;
const meshIssues = [];

for (const om of ours.meshes) {
  const oMat = ours.materials[om.attributeIndex];
  const oShader = ours.shaders[oMat.shaderIndex] || "";
  const oDi = oMat.textureIndices.map(i => ours.textures[i]).find(n => n && n.includes("_di")) || "none";

  const fm = friend.meshes.find(m => {
    const fMat = friend.materials[m.attributeIndex];
    return friend.shaders[fMat.shaderIndex] === oShader &&
           (fMat.textureIndices.map(i => friend.textures[i]).find(n => n && n.includes("_di")) || "none") === oDi &&
           m.triangleListCount === om.triangleListCount;
  });
  if (!fm) continue;

  const ovb = ours.vertexBuffers[om.vertexBufferIndex];
  const fvb = friend.vertexBuffers[fm.vertexBufferIndex];

  let normalBad = 0, compared = 0, worstDot = 1;

  for (let s = 0; s < Math.min(om.vertexCount, 30); s++) {
    const oi = om.minIndex + Math.floor(s * om.vertexCount / Math.min(om.vertexCount, 30));
    const op = [ovb.positions[oi*3], ovb.positions[oi*3+1], ovb.positions[oi*3+2]];
    const ouv = ovb.uvs ? [ovb.uvs[oi*2], ovb.uvs[oi*2+1]] : null;

    // Match by position AND UV
    let bestD = 999, bestFi = -1;
    for (let j = 0; j < fm.vertexCount; j++) {
      const fi = fm.minIndex + j;
      const dx = fvb.positions[fi*3]-op[0], dy = fvb.positions[fi*3+1]-op[1], dz = fvb.positions[fi*3+2]-op[2];
      const posDist = dx*dx+dy*dy+dz*dz;
      if (posDist > 0.0001) continue;

      // Also compare UV to pick the right seam duplicate
      let uvDist = 0;
      if (ouv && fvb.uvs) {
        uvDist = Math.abs(fvb.uvs[fi*2]-ouv[0]) + Math.abs(fvb.uvs[fi*2+1]-ouv[1]);
      }
      const totalDist = posDist + uvDist * 0.001; // UV as tiebreaker
      if (totalDist < bestD) { bestD = totalDist; bestFi = fi; }
    }
    if (bestFi < 0) continue;
    compared++;

    if (ovb.normals && fvb.normals) {
      const dot = ovb.normals[oi*3]*fvb.normals[bestFi*3] + ovb.normals[oi*3+1]*fvb.normals[bestFi*3+1] + ovb.normals[oi*3+2]*fvb.normals[bestFi*3+2];
      if (dot < worstDot) worstDot = dot;
      if (dot < 0.95) normalBad++;
    }
  }

  totalCompared += compared;
  totalNormalBad += normalBad;

  if (normalBad > 0) {
    meshIssues.push({ mesh: om.index, name: oDi, shader: oShader, compared, normalBad, worstDot });
  }
}

console.log("Total vertices compared:", totalCompared);
console.log("Normal mismatches (dot<0.95):", totalNormalBad);
console.log();

if (meshIssues.length > 0) {
  console.log("Meshes with normal issues:");
  for (const m of meshIssues) {
    console.log("  mesh" + m.mesh + " (" + m.name.substring(0,20) + " " + m.shader.substring(0,20) + "): " + m.normalBad + "/" + m.compared + " bad, worst=" + m.worstDot.toFixed(4));
  }
} else {
  console.log("NO ISSUES FOUND - ALL DATA MATCHES");
}
