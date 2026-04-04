import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DDSLoader } from 'three/addons/loaders/DDSLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GMTLoader } from '@three-yakuza/three-gmt';
import { GMDLoader } from '@three-yakuza/three-gmd';
import { parsePAR, extractFile } from '@three-yakuza/par-parser';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const infoEl = document.getElementById('info') as HTMLPreElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const commonInput = document.getElementById('common-input') as HTMLInputElement;

// Shared texture map — common textures loaded first, character textures override
const commonTextureMap = new Map<string, THREE.Texture>();

// -- Three.js setup --
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 200);
camera.position.set(0, 0.5, 2);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.3, 0);
controls.enableDamping = true;
controls.update();

// Lighting — PBR needs higher intensity than Phong/Lambert
scene.add(new THREE.AmbientLight(0xffffff, 1.0));
const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
dirLight.position.set(3, 5, 4);
scene.add(dirLight);
const fillLight = new THREE.DirectionalLight(0xffffff, 0.8);
fillLight.position.set(-3, 2, -2);
scene.add(fillLight);
const rimLight = new THREE.DirectionalLight(0xffffff, 0.4);
rimLight.position.set(0, 3, -5);
scene.add(rimLight);

// Grid
scene.add(new THREE.GridHelper(10, 20, 0x333344, 0x222233));

const clock = new THREE.Clock();
let mixer: THREE.AnimationMixer | null = null;
let modelScene: THREE.Group | null = null;

const gmtLoader = new GMTLoader();
const gmdLoader = new GMDLoader();

// -- Common textures PAR --
commonInput.addEventListener('change', () => {
  const file = commonInput.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const buffer = reader.result as ArrayBuffer;
    const loaded = loadDDSFromPAR(buffer, commonTextureMap);
    infoEl.textContent = `Loaded ${loaded} common textures from ${file.name}.\nNow load a character .par file.`;
  };
  reader.readAsArrayBuffer(file);
});

// -- File loading --
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  const ext = file.name.split('.').pop()?.toLowerCase();
  const reader = new FileReader();
  reader.onload = () => {
    const buffer = reader.result as ArrayBuffer;
    try {
      if (ext === 'par') {
        loadPAR(buffer, file.name);
      } else if (ext === 'gmd') {
        loadGMD(buffer, file.name);
      } else if (ext === 'glb' || ext === 'gltf') {
        loadGLB(buffer, file.name);
      } else {
        loadGMT(buffer, file.name);
      }
    } catch (e) {
      infoEl.textContent = `Error: ${e instanceof Error ? e.message : String(e)}`;
      console.error(e);
    }
  };
  reader.readAsArrayBuffer(file);
});

// -- PAR: full pipeline --
function loadPAR(buffer: ArrayBuffer, filename: string): void {
  const archive = parsePAR(buffer);
  const lines: string[] = [`File: ${filename}`, `PAR v${archive.version}`, ''];

  // List all files in the archive (recursively)
  const allFiles = listPARFiles(archive, buffer);
  lines.push(`Archive contains ${allFiles.length} files:`);
  for (const f of allFiles) {
    const comp = f.file.compression ? ' [SLLZ]' : '';
    lines.push(`  ${f.path} (${f.file.size} bytes${comp})`);
  }
  lines.push('');

  // Find GMD, GMT, and DDS files
  const gmdFiles = allFiles.filter(f => f.path.endsWith('.gmd'));
  const gmtFiles = allFiles.filter(f => f.path.endsWith('.gmt'));
  const ddsFiles = allFiles.filter(f => f.path.endsWith('.dds'));

  // If this PAR has a GMD, it's a model PAR — clear everything.
  // If it only has GMT, it's a motion PAR — keep existing model.
  const isMotionOnly = gmdFiles.length === 0 && gmtFiles.length > 0;
  if (!isMotionOnly) {
    clearScene();
    mixer = null;
    modelScene = null;
  }

  // Build texture map: common textures as fallback, character textures override
  const textureMap = new Map<string, THREE.Texture>(commonTextureMap);
  const charLoaded = loadDDSFromPAR(buffer, textureMap);

  lines.push(`Textures: ${charLoaded} from PAR + ${commonTextureMap.size} common (${textureMap.size} total)`);
  lines.push('');

  // Load first GMD as the model, with textures
  if (gmdFiles.length > 0) {
    const gmdEntry = gmdFiles[0]!;
    const gmdData = extractFile(buffer, gmdEntry.file);
    const gmdBuf = gmdData.buffer.slice(gmdData.byteOffset, gmdData.byteOffset + gmdData.byteLength);
    const gmdResult = gmdLoader.parse(gmdBuf, textureMap);
    modelScene = gmdResult.scene;
    scene.add(modelScene);

    const doc = gmdResult.document;
    lines.push(`Loaded model: ${doc.name}`);
    lines.push(`  ${doc.meshes.length} meshes, ${doc.nodes.length} nodes`);
    let totalVerts = 0;
    for (const vb of doc.vertexBuffers) totalVerts += vb.vertexCount;
    lines.push(`  ${totalVerts} vertices, ${doc.indexBuffer.length} indices`);
    if (gmdResult.matchedTextures.length > 0) {
      lines.push(`  Matched textures: ${gmdResult.matchedTextures.join(', ')}`);
    }
    if (gmdResult.missingTextures.length > 0) {
      lines.push(`  Missing textures: ${gmdResult.missingTextures.join(', ')}`);
    }
    lines.push('');

    fitCamera(modelScene);
  }

  // Load all GMT animations and apply to model
  if (gmtFiles.length > 0) {
    const target = modelScene ?? new THREE.Group();
    if (!modelScene) {
      target.name = 'animTarget';
      scene.add(target);
    }

    mixer = new THREE.AnimationMixer(target);
    let totalClips = 0;

    for (const gmtEntry of gmtFiles) {
      try {
        const gmtData = extractFile(buffer, gmtEntry.file);
        const gmtResult = gmtLoader.parse(gmtData.buffer.slice(gmtData.byteOffset, gmtData.byteOffset + gmtData.byteLength));

        // Add dummy bone objects for animation targets (if no model loaded)
        if (!modelScene) {
          for (const anim of gmtResult.document.animations) {
            for (const boneName of anim.bones.keys()) {
              if (!target.getObjectByName(boneName)) {
                const obj = new THREE.Object3D();
                obj.name = boneName;
                target.add(obj);
              }
            }
          }
        }

        for (const clip of gmtResult.animations) {
          totalClips++;
        }

        // Play first animation (skip face GMTs — they need special handling)
        if (!gmtResult.document.isFaceGmt && gmtResult.animations.length > 0 && totalClips <= gmtResult.animations.length) {
          mixer.clipAction(gmtResult.animations[0]!).play();
        }

        lines.push(`Loaded animation: ${gmtResult.document.name} (${gmtResult.animations.length} clips)`);
        for (const anim of gmtResult.document.animations) {
          lines.push(`  [${anim.name}] ${anim.startFrame}-${anim.endFrame} @ ${anim.frameRate}fps, ${anim.bones.size} bones`);
        }
      } catch (e) {
        lines.push(`  Error loading ${gmtEntry.path}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    lines.push('', `Total animation clips: ${totalClips}`);
  }

  if (gmdFiles.length === 0 && gmtFiles.length === 0) {
    lines.push('No .gmd or .gmt files found in this archive.');
  }

  infoEl.textContent = lines.join('\n');
}

interface PARFileEntry {
  path: string;
  file: ReturnType<typeof parsePAR>['files'][number];
}

function listPARFiles(
  archive: ReturnType<typeof parsePAR>,
  _buffer: ArrayBuffer,
): PARFileEntry[] {
  const result: PARFileEntry[] = [];

  function walk(folderIdx: number, prefix: string): void {
    const folder = archive.folders[folderIdx];
    if (!folder) return;

    // Add files in this folder
    for (let i = 0; i < folder.childFileCount; i++) {
      const file = archive.files[folder.childFileStartIndex + i];
      if (file) {
        result.push({ path: prefix + file.name, file });
      }
    }

    // Recurse into child folders
    for (let i = 0; i < folder.childFolderCount; i++) {
      const childFolder = archive.folders[folder.childFolderStartIndex + i];
      if (childFolder && childFolder.name !== '.') {
        walk(folder.childFolderStartIndex + i, prefix + childFolder.name + '/');
      }
    }
  }

  walk(0, '');
  return result;
}

// -- Direct file loaders --
function loadGMT(buffer: ArrayBuffer, filename: string): void {
  const result = gmtLoader.parse(buffer);
  const doc = result.document;

  const lines = [
    `File: ${filename}`,
    `GMT: ${doc.name} (0x${doc.version.toString(16)})`,
    `Face GMT: ${doc.isFaceGmt}`,
    `Animations: ${doc.animations.length}`,
    '',
  ];
  for (const anim of doc.animations) {
    lines.push(`  [${anim.name}] ${anim.startFrame}-${anim.endFrame} @ ${anim.frameRate}fps, ${anim.bones.size} bones`);
    lines.push(`    bones: ${[...anim.bones.keys()].slice(0, 10).join(', ')}${anim.bones.size > 10 ? '...' : ''}`);
  }
  lines.push('', `Clips: ${result.animations.length}`);
  for (const clip of result.animations) {
    lines.push(`  ${clip.name}: ${clip.duration.toFixed(2)}s, ${clip.tracks.length} tracks`);
  }

  // Apply to existing model if one is loaded, otherwise create standalone target
  const target = modelScene ?? (() => {
    const group = new THREE.Group();
    group.name = 'animTarget';
    for (const anim of doc.animations) {
      for (const boneName of anim.bones.keys()) {
        if (!group.getObjectByName(boneName)) {
          const obj = new THREE.Object3D();
          obj.name = boneName;
          group.add(obj);
        }
      }
    }
    clearScene();
    scene.add(group);
    return group;
  })();

  mixer = new THREE.AnimationMixer(target);
  if (result.animations.length > 0) {
    mixer.clipAction(result.animations[0]!).play();
    lines.push('', modelScene ? 'Playing on loaded model.' : 'Playing standalone (no model loaded).');
  }

  infoEl.textContent = lines.join('\n');
}

function loadGMD(buffer: ArrayBuffer, filename: string): void {
  const result = gmdLoader.parse(buffer);
  const doc = result.document;

  const lines = [
    `File: ${filename}`,
    `GMD: ${doc.name} (v${doc.version.major}.${doc.version.minor})`,
    `${doc.meshes.length} meshes, ${doc.nodes.length} nodes, ${doc.materials.length} materials`,
    `Textures: ${doc.textures.join(', ') || '(none)'}`,
    '',
  ];
  let totalVerts = 0;
  for (const vb of doc.vertexBuffers) {
    totalVerts += vb.vertexCount;
    lines.push(`  VB${vb.index}: ${vb.vertexCount} verts, ${vb.bytesPerVertex} B/v` +
      (vb.normals ? ' +N' : '') + (vb.uvs ? ' +UV' : '') +
      (vb.boneIndices ? ' +Bones' : '') + (vb.colors ? ' +Col' : ''));
  }
  lines.push(`Total: ${totalVerts} vertices, ${doc.indexBuffer.length} indices`);
  if (doc.nodes.length > 0) {
    lines.push(`Bones: ${doc.nodes.map(n => n.name).join(', ')}`);
  }
  infoEl.textContent = lines.join('\n');

  clearScene();
  modelScene = result.scene;
  scene.add(modelScene);
  fitCamera(modelScene);
  mixer = null;
}

function loadGLB(buffer: ArrayBuffer, filename: string): void {
  const gltfLoader = new GLTFLoader();
  gltfLoader.parse(buffer, '', (gltf) => {
    clearScene();
    gltf.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        (obj.material as THREE.Material).side = THREE.DoubleSide;
      }
    });

    scene.add(gltf.scene);
    fitCamera(gltf.scene);
    mixer = null;

    let meshCount = 0;
    let vertCount = 0;
    const matNames: string[] = [];
    gltf.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        meshCount++;
        const pos = obj.geometry.getAttribute('position');
        if (pos) vertCount += pos.count;
        const mat = obj.material as THREE.MeshStandardMaterial;
        if (mat.name && !matNames.includes(mat.name)) matNames.push(mat.name);
      }
    });

    infoEl.textContent = [
      `File: ${filename} (GLB reference model)`,
      `Meshes: ${meshCount}, Vertices: ${vertCount}`,
      `Materials: ${matNames.join(', ')}`,
      '',
      'This is the reference export from Blender.',
      'Compare against loading the same character from mesh.par.',
    ].join('\n');
  }, (error) => {
    infoEl.textContent = `GLB Error: ${error instanceof Error ? error.message : error}`;
    console.error(error);
  });
}

function clearScene(): void {
  const keep = scene.children.filter(
    (c) => c instanceof THREE.GridHelper || c instanceof THREE.Light,
  );
  scene.clear();
  for (const c of keep) scene.add(c);
}

function fitCamera(obj: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(obj);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);

  controls.target.copy(center);
  camera.position.copy(center);
  camera.position.z += maxDim * 2;
  camera.position.y += maxDim * 0.5;
  controls.update();
}

/** Load all DDS textures from a PAR buffer into the given map. Returns count loaded. */
function loadDDSFromPAR(parBuffer: ArrayBuffer, target: Map<string, THREE.Texture>): number {
  const archive = parsePAR(parBuffer);
  const ddsLoader = new DDSLoader();
  let count = 0;

  for (const file of archive.files) {
    if (!file.name.endsWith('.dds')) continue;
    try {
      const data = extractFile(parBuffer, file);
      const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      const texData = ddsLoader.parse(buf, false);

      const texture = new THREE.CompressedTexture(
        texData.mipmaps, texData.width, texData.height, texData.format,
      );
      texture.mipmaps = texData.mipmaps;
      texture.minFilter = texData.mipmaps.length > 1
        ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      // CompressedTexture.flipY defaults to false — correct for DDS top-down storage.
      // SEGA UVs use DirectX convention (V=0 at top) which matches.

      // Diffuse textures are sRGB — Three.js uses COMPRESSED_SRGB_S3TC_DXT*_EXT
      // for hardware decode to linear, then PBR math runs in linear space.
      if (file.name.toLowerCase().includes('_di')) {
        texture.colorSpace = THREE.SRGBColorSpace;
      }

      texture.needsUpdate = true;

      // Store lowercase — GMD texture names are lowercase but PAR filenames may differ
      const baseName = file.name.replace(/\.dds$/i, '').toLowerCase();
      target.set(baseName, texture);
      count++;
    } catch {
      // Skip unparseable textures
    }
  }
  return count;
}

// -- Keyboard: Space = pause/resume animation, D = dump bone state --
let animPaused = false;
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    animPaused = !animPaused;
    if (mixer) mixer.timeScale = animPaused ? 0 : 1;
    console.log(`Animation ${animPaused ? 'PAUSED' : 'PLAYING'}`);
  }
  if (e.code === 'KeyD' && modelScene) {
    console.group('[Dump] Bone world positions at current frame');
    modelScene.traverse((obj) => {
      if (obj.type === 'Bone') {
        const wx = obj.matrixWorld.elements[12].toFixed(3);
        const wy = obj.matrixWorld.elements[13].toFixed(3);
        const wz = obj.matrixWorld.elements[14].toFixed(3);
        console.log(`  ${obj.name}  world=(${wx},${wy},${wz})  local=(${obj.position.x.toFixed(3)},${obj.position.y.toFixed(3)},${obj.position.z.toFixed(3)})`);
      }
    });
    console.groupEnd();
  }
});

// -- Render loop --
function animate(): void {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  mixer?.update(delta);
  controls.update();
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
