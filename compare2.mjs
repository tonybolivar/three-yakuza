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

// For each of our meshes, find the matching friend mesh and compare deeply
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

  let normalBad = 0, uvBad = 0, compared = 0;
  let worstDot = 1, worstUV = 0, worstUVVertex = -1;

  for (let s = 0; s < Math.min(om.vertexCount, 50); s++) {
    const oi = om.minIndex + Math.floor(s * om.vertexCount / Math.min(om.vertexCount, 50));
    const op = [ovb.positions[oi*3], ovb.positions[oi*3+1], ovb.positions[oi*3+2]];

    let bestD = 999, bestFi = -1;
    for (let j = 0; j < fm.vertexCount; j++) {
      const fi = fm.minIndex + j;
      const dx = fvb.positions[fi*3]-op[0], dy = fvb.positions[fi*3+1]-op[1], dz = fvb.positions[fi*3+2]-op[2];
      const d = dx*dx+dy*dy+dz*dz;
      if (d < bestD) { bestD = d; bestFi = fi; }
    }
    if (bestD > 0.0001) continue;
    compared++;

    if (ovb.normals && fvb.normals) {
      const dot = ovb.normals[oi*3]*fvb.normals[bestFi*3] + ovb.normals[oi*3+1]*fvb.normals[bestFi*3+1] + ovb.normals[oi*3+2]*fvb.normals[bestFi*3+2];
      if (dot < worstDot) worstDot = dot;
      if (dot < 0.99) normalBad++;
    }
    if (ovb.uvs && fvb.uvs) {
      const diff = Math.abs(ovb.uvs[oi*2]-fvb.uvs[bestFi*2]) + Math.abs(ovb.uvs[oi*2+1]-fvb.uvs[bestFi*2+1]);
      if (diff > worstUV) { worstUV = diff; worstUVVertex = oi; }
      if (diff > 0.01) uvBad++;
    }
  }

  if (normalBad > 0 || uvBad > 0) {
    console.log("mesh" + om.index + " (" + oDi.substring(0,25) + " " + oShader.substring(0,25) + "):");
    console.log("  " + compared + " compared, normalBad=" + normalBad + " (worst dot=" + worstDot.toFixed(4) + ") uvBad=" + uvBad + " (worst=" + worstUV.toFixed(4) + ")");

    // Show the worst UV mismatch details
    if (worstUV > 0.1 && worstUVVertex >= 0) {
      const oi = worstUVVertex;
      const op = [ovb.positions[oi*3], ovb.positions[oi*3+1], ovb.positions[oi*3+2]];
      let bestD = 999, bestFi = -1;
      for (let j = 0; j < fm.vertexCount; j++) {
        const fi = fm.minIndex + j;
        const dx = fvb.positions[fi*3]-op[0], dy = fvb.positions[fi*3+1]-op[1], dz = fvb.positions[fi*3+2]-op[2];
        const d = dx*dx+dy*dy+dz*dz;
        if (d < bestD) { bestD = d; bestFi = fi; }
      }
      console.log("  Worst UV at v" + oi + ": ours=(" + ovb.uvs[oi*2].toFixed(4) + "," + ovb.uvs[oi*2+1].toFixed(4) + ") friend=(" + fvb.uvs[bestFi*2].toFixed(4) + "," + fvb.uvs[bestFi*2+1].toFixed(4) + ")");
    }
  }
}
