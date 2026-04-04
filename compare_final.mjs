import { parseGMD } from './packages/gmd-parser/dist/index.js';
import { parsePAR, extractFile } from './packages/par-parser/dist/index.js';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// Parse ours from PAR
const pBuf = readFileSync('C:/Program Files (x86)/Steam/steamapps/common/Yakuza Kiwami/media/data/chara/w64/adv/c_cm_kiryu/mesh.par');
const pAB = pBuf.buffer.slice(pBuf.byteOffset, pBuf.byteOffset + pBuf.byteLength);
const archive = parsePAR(pAB);
const gmdData = extractFile(pAB, archive.files.find(f => f.name.endsWith('.gmd')));
const ours = parseGMD(gmdData.buffer.slice(gmdData.byteOffset, gmdData.byteOffset + gmdData.byteLength));

// Parse friend's
const fBuf = readFileSync('C:/Users/tonyt/Downloads/kiryu (1).gmd');
const friend = parseGMD(fBuf.buffer.slice(fBuf.byteOffset, fBuf.byteOffset + fBuf.byteLength));

// Simulate what the renderer does (filter logic from gmd-loader.ts)
const maxNode = ours.meshes.reduce((m, x) => Math.max(m, x.nodeIndex), 0);

function getRenderedMeshes(doc) {
  const result = [];
  const byAttr = new Map();
  for (const m of doc.meshes) {
    if (m.triangleListCount === 0) continue;
    const list = byAttr.get(m.attributeIndex) || [];
    list.push(m);
    byAttr.set(m.attributeIndex, list);
  }

  for (const [attrIdx, subMeshes] of byAttr) {
    const mat = doc.materials[attrIdx];
    const shader = doc.shaders[mat.shaderIndex] || '';
    const di = mat.textureIndices.map(i => doc.textures[i]).find(n => n && n.includes('_di')) || 'none';

    // Skip [ref] without diffuse
    if (!di.includes('_di') && shader.includes('[ref]')) continue;

    // Skip [skin] at max node
    const isSkin = shader.includes('[skin]');
    const filtered = subMeshes.filter(m => !(m.nodeIndex === maxNode && isSkin));

    for (const m of filtered) {
      result.push({ mesh: m, attrIdx, shader, di });
    }
  }
  return result;
}

const ourRendered = getRenderedMeshes(ours);
const friendAll = friend.meshes.filter(m => m.triangleListCount > 0);

// Count by shader+di
const ourByKey = new Map();
for (const r of ourRendered) {
  const key = r.shader + '|' + r.di;
  const e = ourByKey.get(key) || { verts: 0, tris: 0, meshes: 0 };
  e.verts += r.mesh.vertexCount;
  e.tris += r.mesh.triangleListCount;
  e.meshes++;
  ourByKey.set(key, e);
}

const friendByKey = new Map();
for (const m of friendAll) {
  const mat = friend.materials[m.attributeIndex];
  const shader = friend.shaders[mat.shaderIndex] || '';
  const di = mat.textureIndices.map(i => friend.textures[i]).find(n => n && n.includes('_di')) || 'none';
  const key = shader + '|' + di;
  const e = friendByKey.get(key) || { verts: 0, tris: 0, meshes: 0 };
  e.verts += m.vertexCount;
  e.tris += m.triangleListCount;
  e.meshes++;
  friendByKey.set(key, e);
}

console.log("=== RENDERED MESH COMPARISON ===\n");
let ourTotalTris = 0, friendTotalTris = 0, ourTotalVerts = 0, friendTotalVerts = 0;
let triMismatch = false;

const allKeys = new Set([...ourByKey.keys(), ...friendByKey.keys()]);
for (const key of [...allKeys].sort()) {
  const o = ourByKey.get(key) || { verts: 0, tris: 0, meshes: 0 };
  const f = friendByKey.get(key) || { verts: 0, tris: 0, meshes: 0 };
  ourTotalTris += o.tris; friendTotalTris += f.tris;
  ourTotalVerts += o.verts; friendTotalVerts += f.verts;

  const triMatch = o.tris === f.tris;
  const meshMatch = o.meshes === f.meshes;
  if (!triMatch) triMismatch = true;

  const parts = key.split('|');
  const label = (parts[1] || '').substring(0, 20).padEnd(20) + ' ' + (parts[0] || '').substring(0, 25);

  if (!triMatch || !meshMatch) {
    console.log("DIFF " + label);
    console.log("     ours:   m=" + o.meshes + " v=" + o.verts + " t=" + o.tris);
    console.log("     friend: m=" + f.meshes + " v=" + f.verts + " t=" + f.tris);
  }
}

console.log("\nTOTALS:");
console.log("  Ours:   " + ourTotalVerts + " verts, " + ourTotalTris + " tris, " + ourRendered.length + " meshes");
console.log("  Friend: " + friendTotalVerts + " verts, " + friendTotalTris + " tris, " + friendAll.length + " meshes");
console.log("  Tri match: " + (ourTotalTris === friendTotalTris ? "YES" : "NO (diff=" + (ourTotalTris - friendTotalTris) + ")"));

// Texture comparison
console.log("\n=== TEXTURE COMPARISON ===\n");
const meshDir = 'C:/Users/tonyt/AppData/Local/Temp/kiryu-clean/1/mesh.par.unpack';
const commonDir = 'C:/Users/tonyt/AppData/Local/Temp/kiryu-clean/1/tex_common_w64.par.unpack';

const friendDDS = new Set();
for (const f of readdirSync(meshDir)) {
  if (f.toLowerCase().endsWith('.dds')) friendDDS.add(f.replace(/\.dds$/i, '').toLowerCase());
}
for (const f of readdirSync(commonDir)) {
  if (f.toLowerCase().endsWith('.dds')) friendDDS.add(f.replace(/\.dds$/i, '').toLowerCase());
}

// Check our PAR extraction matches
const cBuf = readFileSync('C:/Program Files (x86)/Steam/steamapps/common/Yakuza Kiwami/media/data/chara_common/tex_common_w64.par');
const cAB = cBuf.buffer.slice(cBuf.byteOffset, cBuf.byteOffset + cBuf.byteLength);
const commonArchive = parsePAR(cAB);

const ourDDS = new Set();
for (const f of archive.files) {
  if (f.name.toLowerCase().endsWith('.dds')) ourDDS.add(f.name.replace(/\.dds$/i, '').toLowerCase());
}
for (const f of commonArchive.files) {
  if (f.name.toLowerCase().endsWith('.dds')) ourDDS.add(f.name.replace(/\.dds$/i, '').toLowerCase());
}

// Check coverage against GMD texture list
let texMatched = 0, texMissing = 0;
const missingTex = [];
for (const t of ours.textures) {
  if (ourDDS.has(t.toLowerCase())) texMatched++;
  else { texMissing++; missingTex.push(t); }
}
console.log("GMD references " + ours.textures.length + " textures");
console.log("Available from PARs: " + texMatched + "/" + ours.textures.length);
if (missingTex.length) console.log("Missing: " + missingTex.join(', '));
else console.log("ALL TEXTURES AVAILABLE");

// Byte comparison of DDS files
console.log("\n=== DDS BYTE COMPARISON ===\n");
let ddsMatch = 0, ddsDiff = 0;
for (const parFile of archive.files) {
  if (!parFile.name.toLowerCase().endsWith('.dds')) continue;
  const baseName = parFile.name.replace(/\.dds$/i, '');
  const friendPath = join(meshDir, parFile.name);
  try {
    const ourBytes = extractFile(pAB, parFile);
    const friendBytes = readFileSync(friendPath);
    let match = ourBytes.length === friendBytes.length;
    if (match) {
      for (let i = 0; i < ourBytes.length; i++) {
        if (ourBytes[i] !== friendBytes[i]) { match = false; break; }
      }
    }
    if (match) ddsMatch++;
    else { ddsDiff++; console.log("DIFF: " + baseName + " (ours=" + ourBytes.length + " friend=" + friendBytes.length + ")"); }
  } catch { /* file not in friend's unpack */ }
}
console.log("Identical: " + ddsMatch + ", Different: " + ddsDiff);

// Material property comparison
console.log("\n=== MATERIAL PROPERTIES ===\n");
let matIssues = 0;
for (let a = 0; a < ours.materials.length; a++) {
  const om = ours.materials[a];
  const oShader = ours.shaders[om.shaderIndex] || "";
  const oDi = om.textureIndices.map(i => ours.textures[i]).find(n => n && n.includes("_di")) || "";

  const fm = friend.materials.find(m => {
    return friend.shaders[m.shaderIndex] === oShader &&
           (m.textureIndices.map(i => friend.textures[i]).find(n => n && n.includes("_di")) || "") === oDi;
  });
  if (!fm) continue;

  const issues = [];
  if (Math.abs(om.opacity - fm.opacity) > 0.01) issues.push("opacity: " + om.opacity.toFixed(3) + " vs " + fm.opacity.toFixed(3));
  if (Math.abs(om.shininess - fm.shininess) > 0.5) issues.push("shininess: " + om.shininess.toFixed(1) + " vs " + fm.shininess.toFixed(1));

  const dDiff = om.diffuse.map((v, i) => Math.abs(v - fm.diffuse[i])).reduce((a, b) => a + b, 0);
  if (dDiff > 0.01) issues.push("diffuse diff=" + dDiff.toFixed(3));

  const sDiff = om.specular.map((v, i) => Math.abs(v - fm.specular[i])).reduce((a, b) => a + b, 0);
  if (sDiff > 0.01) issues.push("specular diff=" + sDiff.toFixed(3));

  if (issues.length > 0) {
    matIssues++;
    console.log("attr" + a + " (" + oDi.substring(0, 20) + "): " + issues.join(", "));
  }
}
if (matIssues === 0) console.log("ALL MATERIAL PROPERTIES MATCH");

console.log("\n=== SUMMARY ===\n");
console.log("Parser output: " + (triMismatch ? "TRI MISMATCH" : "GEOMETRY MATCHES"));
console.log("Textures: " + (texMissing === 0 ? "100% COVERAGE" : texMissing + " MISSING"));
console.log("DDS files: " + (ddsDiff === 0 ? "BYTE-IDENTICAL" : ddsDiff + " DIFFERENT"));
console.log("Materials: " + (matIssues === 0 ? "ALL MATCH" : matIssues + " ISSUES"));
