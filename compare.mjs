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

console.log("=== STRUCTURE ===");
console.log("Nodes: ours=" + ours.nodes.length + " friend=" + friend.nodes.length);
console.log("Meshes: ours=" + ours.meshes.length + " friend=" + friend.meshes.length);
console.log("Materials: ours=" + ours.materials.length + " friend=" + friend.materials.length);
console.log("Textures: ours=" + ours.textures.length + " friend=" + friend.textures.length);
console.log("Shaders: ours=" + ours.shaders.length + " friend=" + friend.shaders.length);
console.log("VBs: ours=" + ours.vertexBuffers.length + " friend=" + friend.vertexBuffers.length);

// Compare textures
const oTex = new Set(ours.textures);
const fTex = new Set(friend.textures);
const texMatch = [...oTex].every(t => fTex.has(t)) && [...fTex].every(t => oTex.has(t));
console.log("Textures identical:", texMatch);

// Compare shaders
const oShd = new Set(ours.shaders);
const fShd = new Set(friend.shaders);
const shdMatch = [...oShd].every(t => fShd.has(t)) && [...fShd].every(t => oShd.has(t));
console.log("Shaders identical:", shdMatch);

// Deep vertex comparison - sample 50 vertices across all meshes
console.log("\n=== VERTEX DATA (sampled) ===");
let compared = 0, normalBad = 0, uvBad = 0, worstDot = 1, worstUV = 0;

for (const om of ours.meshes) {
  const oMat = ours.materials[om.attributeIndex];
  const oShader = ours.shaders[oMat.shaderIndex] || "";
  const oDi = oMat.textureIndices.map(i => ours.textures[i]).find(n => n && n.includes("_di")) || "";
  
  const fm = friend.meshes.find(m => {
    const fMat = friend.materials[m.attributeIndex];
    return friend.shaders[fMat.shaderIndex] === oShader && 
           fMat.textureIndices.map(i => friend.textures[i]).find(n => n && n.includes("_di")) === oDi &&
           m.triangleListCount === om.triangleListCount;
  });
  if (!fm) continue;
  
  const ovb = ours.vertexBuffers[om.vertexBufferIndex];
  const fvb = friend.vertexBuffers[fm.vertexBufferIndex];
  
  for (let s = 0; s < 5; s++) {
    const oi = om.minIndex + Math.floor(s * om.vertexCount / 5);
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
      if (diff > worstUV) worstUV = diff;
      if (diff > 0.01) uvBad++;
    }
  }
}

console.log("Compared:", compared, "vertices");
console.log("Normal mismatches (dot<0.99):", normalBad, "worst:", worstDot.toFixed(6));
console.log("UV mismatches (diff>0.01):", uvBad, "worst:", worstUV.toFixed(6));

// Material properties
console.log("\n=== MATERIAL PROPERTIES ===");
for (let a = 0; a < ours.materials.length; a++) {
  const om = ours.materials[a];
  const oShader = ours.shaders[om.shaderIndex] || "";
  const oDi = om.textureIndices.map(i => ours.textures[i]).find(n => n && n.includes("_di")) || "";
  
  const fm = friend.materials.find(m => {
    return friend.shaders[m.shaderIndex] === oShader &&
           m.textureIndices.map(i => friend.textures[i]).find(n => n && n.includes("_di")) === oDi;
  });
  if (!fm) continue;
  
  const dMatch = JSON.stringify(om.diffuse.map(v => v.toFixed(3))) === JSON.stringify(fm.diffuse.map(v => v.toFixed(3)));
  const sMatch = JSON.stringify(om.specular.map(v => v.toFixed(3))) === JSON.stringify(fm.specular.map(v => v.toFixed(3)));
  const oMatch = Math.abs(om.opacity - fm.opacity) < 0.01;
  const shMatch = Math.abs(om.shininess - fm.shininess) < 0.1;
  
  if (!dMatch || !sMatch || !oMatch || !shMatch) {
    console.log("attr" + a + " (" + oDi.substring(0,20) + "):");
    if (!dMatch) console.log("  diffuse: ours=" + om.diffuse.map(v=>v.toFixed(3)) + " friend=" + fm.diffuse.map(v=>v.toFixed(3)));
    if (!sMatch) console.log("  specular: ours=" + om.specular.map(v=>v.toFixed(3)) + " friend=" + fm.specular.map(v=>v.toFixed(3)));
    if (!oMatch) console.log("  opacity: ours=" + om.opacity.toFixed(3) + " friend=" + fm.opacity.toFixed(3));
    if (!shMatch) console.log("  shininess: ours=" + om.shininess.toFixed(1) + " friend=" + fm.shininess.toFixed(1));
  }
}
console.log("(no output above = all match)");
