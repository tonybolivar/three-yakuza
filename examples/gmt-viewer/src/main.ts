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

// Animation panel elements
const clipListEl = document.getElementById('clip-list') as HTMLUListElement;
const clipListEmpty = document.getElementById('clip-list-empty') as HTMLDivElement;
const btnPlay = document.getElementById('btn-play') as HTMLButtonElement;
const btnStop = document.getElementById('btn-stop') as HTMLButtonElement;
const scrubber = document.getElementById('scrubber') as HTMLInputElement;
const timeDisplay = document.getElementById('time-display') as HTMLSpanElement;
const speedSelect = document.getElementById('speed-select') as HTMLSelectElement;
const btnRecord = document.getElementById('btn-record') as HTMLButtonElement;
const btnPngSeq = document.getElementById('btn-png-seq') as HTMLButtonElement;
const recordStatus = document.getElementById('record-status') as HTMLDivElement;

// Shared texture map — common textures loaded first, character textures override
const commonTextureMap = new Map<string, THREE.Texture>();

// -- Three.js setup --
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
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

// Animation panel state
let loadedClips: THREE.AnimationClip[] = [];
let currentAction: THREE.AnimationAction | null = null;
let playbackSpeed = 1;
let isScrubbing = false;

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

// -- File loading (supports multi-select for texture PARs) --
fileInput.addEventListener('change', async () => {
  const files = fileInput.files;
  if (!files || files.length === 0) return;

  if (files.length === 1) {
    // Single file — original behavior
    const file = files[0]!;
    const ext = file.name.split('.').pop()?.toLowerCase();
    const buffer = await file.arrayBuffer();
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
  } else {
    // Multiple files — load texture PARs (tex*.par) first, then mesh.par last
    const sorted = [...files].sort((a, b) => {
      const aIsMesh = a.name.toLowerCase().includes('mesh');
      const bIsMesh = b.name.toLowerCase().includes('mesh');
      if (aIsMesh && !bIsMesh) return 1; // mesh last
      if (!aIsMesh && bIsMesh) return -1;
      return a.name.localeCompare(b.name);
    });

    // Load texture PARs into common texture map first
    let texCount = 0;
    for (const file of sorted) {
      if (!file.name.toLowerCase().endsWith('.par')) continue;
      if (file.name.toLowerCase().includes('mesh')) continue;
      const buffer = await file.arrayBuffer();
      texCount += loadDDSFromPAR(buffer, commonTextureMap);
    }
    if (texCount > 0) {
      infoEl.textContent = `Loaded ${texCount} textures from ${sorted.length - 1} texture PARs.\nLoading model...`;
    }

    // Then load the mesh PAR (or first PAR if no mesh)
    const meshFile = sorted.find(f => f.name.toLowerCase().includes('mesh'))
      ?? sorted.find(f => f.name.toLowerCase().endsWith('.par'));
    if (meshFile) {
      try {
        const buffer = await meshFile.arrayBuffer();
        loadPAR(buffer, meshFile.name);
      } catch (e) {
        infoEl.textContent = `Error: ${e instanceof Error ? e.message : String(e)}`;
        console.error(e);
      }
    }
  }
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
    loadedClips = [];
    currentAction = null;
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

    // Extract bone rest positions for face GMT additive blending
    const boneRestPositions = new Map<string, [number, number, number]>();
    modelScene.traverse((obj) => {
      if (obj.type === 'Bone') {
        boneRestPositions.set(obj.name, [obj.position.x, obj.position.y, obj.position.z]);
      }
    });
    gmtLoader.setBoneRestPositions(boneRestPositions);
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
    loadedClips = [];
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
          loadedClips.push(clip);
          totalClips++;
        }

        if (gmtResult.animations.length > 0 && totalClips <= gmtResult.animations.length) {
          if (gmtResult.document.isFaceGmt) {
            // Face GMT is a pose blend system — skip auto-play, needs proper blending
            console.log('[GMT] Skipping face animation (pose system):', gmtResult.document.name);
          } else {
            playClip(gmtResult.animations[0]!);
          }
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
    refreshClipList();
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
  loadedClips = [...result.animations];

  if (result.animations.length > 0) {
    playClip(result.animations[0]!, doc.isFaceGmt);
    lines.push('', modelScene ? 'Playing on loaded model.' : 'Playing standalone (no model loaded).');
  }

  refreshClipList();
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
  loadedClips = [];
  currentAction = null;
  refreshClipList();
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
    loadedClips = [];
    currentAction = null;
    refreshClipList();

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

// -- Free camera (WASD + mouse) --
const keysDown = new Set<string>();
const moveSpeed = 2.0;
let freeCam = false;

window.addEventListener('keydown', (e) => {
  keysDown.add(e.code);

  if (e.code === 'Space' && !freeCam) {
    if (mixer && currentAction) {
      animPaused = !animPaused;
      mixer.timeScale = animPaused ? 0 : playbackSpeed;
      updatePlayButton();
    }
  }
  if (e.code === 'Tab') {
    e.preventDefault();
    freeCam = !freeCam;
    controls.enabled = !freeCam;
    if (freeCam) {
      canvas.requestPointerLock();
    } else {
      document.exitPointerLock();
      // Sync orbit target to where the camera is now looking
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      controls.target.copy(camera.position).addScaledVector(dir, 2);
      controls.update();
    }
  }
  if (e.code === 'KeyD' && !freeCam && modelScene) {
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
window.addEventListener('keyup', (e) => keysDown.delete(e.code));

let animPaused = false;
const euler = new THREE.Euler(0, 0, 0, 'YXZ');
canvas.addEventListener('mousemove', (e) => {
  if (!freeCam || document.pointerLockElement !== canvas) return;
  euler.setFromQuaternion(camera.quaternion);
  euler.y -= e.movementX * 0.002;
  euler.x -= e.movementY * 0.002;
  euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));
  camera.quaternion.setFromEuler(euler);
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas && freeCam) {
    freeCam = false;
    controls.enabled = true;
  }
});

function updateFreeCam(dt: number): void {
  if (!freeCam) return;
  const speed = moveSpeed * dt;
  const dir = new THREE.Vector3();
  const right = new THREE.Vector3();
  camera.getWorldDirection(dir);
  right.crossVectors(dir, camera.up).normalize();

  if (keysDown.has('KeyW')) camera.position.addScaledVector(dir, speed);
  if (keysDown.has('KeyS')) camera.position.addScaledVector(dir, -speed);
  if (keysDown.has('KeyA')) camera.position.addScaledVector(right, -speed);
  if (keysDown.has('KeyD')) camera.position.addScaledVector(right, speed);
  if (keysDown.has('KeyQ') || keysDown.has('ShiftLeft')) camera.position.y -= speed;
  if (keysDown.has('KeyE') || keysDown.has('Space')) camera.position.y += speed;
}

// ── Animation Panel Logic ──

/** Play a specific clip, stopping any previous action */
function playClip(clip: THREE.AnimationClip, additive = false): void {
  if (!mixer) return;

  // Stop all current actions
  mixer.stopAllAction();

  const action = mixer.clipAction(clip);
  if (additive) {
    action.blendMode = THREE.AdditiveAnimationBlendMode;
  }
  action.play();
  currentAction = action;
  animPaused = false;
  mixer.timeScale = playbackSpeed;

  // Update scrubber range
  scrubber.max = String(clip.duration);
  scrubber.value = '0';

  // Highlight active clip in list
  highlightActiveClip(clip);
  updatePlayButton();
}

/** Refresh the clip list UI from loadedClips */
function refreshClipList(): void {
  clipListEl.innerHTML = '';
  if (loadedClips.length === 0) {
    clipListEmpty.style.display = '';
    return;
  }
  clipListEmpty.style.display = 'none';

  for (const clip of loadedClips) {
    const li = document.createElement('li');
    li.textContent = `${clip.name} (${clip.duration.toFixed(2)}s)`;
    li.title = clip.name;
    li.dataset.clipName = clip.name;
    li.addEventListener('click', () => playClip(clip));
    clipListEl.appendChild(li);
  }

  // Highlight current if any
  if (currentAction) {
    highlightActiveClip(currentAction.getClip());
  }
}

/** Highlight the active clip in the list */
function highlightActiveClip(clip: THREE.AnimationClip): void {
  for (const li of clipListEl.children) {
    (li as HTMLElement).classList.toggle('active', (li as HTMLElement).dataset.clipName === clip.name);
  }
}

/** Update the play/pause button icon */
function updatePlayButton(): void {
  btnPlay.innerHTML = animPaused ? '&#9654;' : '&#9646;&#9646;';
}

// Play / Pause
btnPlay.addEventListener('click', () => {
  if (!mixer || !currentAction) return;
  animPaused = !animPaused;
  mixer.timeScale = animPaused ? 0 : playbackSpeed;
  updatePlayButton();
});

// Stop (reset to bind pose)
btnStop.addEventListener('click', () => {
  if (!mixer) return;
  mixer.stopAllAction();
  currentAction = null;
  animPaused = false;
  scrubber.value = '0';
  timeDisplay.textContent = '0.00 / 0.00';
  updatePlayButton();

  // Reset all bones to bind pose by updating mixer at time 0 with no actions
  // (stopAllAction already does this for skinned meshes)
});

// Speed selector
speedSelect.addEventListener('change', () => {
  playbackSpeed = parseFloat(speedSelect.value);
  if (mixer && !animPaused) {
    mixer.timeScale = playbackSpeed;
  }
});

// Scrubber drag
scrubber.addEventListener('input', () => {
  if (!mixer || !currentAction) return;
  isScrubbing = true;
  const t = parseFloat(scrubber.value);
  // Pause while scrubbing, set time directly
  mixer.timeScale = 0;
  currentAction.time = t;
  mixer.update(0); // force update at current time
});

scrubber.addEventListener('change', () => {
  isScrubbing = false;
  if (mixer && !animPaused) {
    mixer.timeScale = playbackSpeed;
  }
});

// ── Recording Logic (WebM via MediaRecorder) ──

let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];

btnRecord.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    // Stop recording
    mediaRecorder.stop();
    return;
  }

  // Start recording
  const stream = canvas.captureStream(30);
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';

  mediaRecorder = new MediaRecorder(stream, { mimeType });
  recordedChunks = [];

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `animation-${Date.now()}.webm`;
    a.click();
    URL.revokeObjectURL(url);

    btnRecord.textContent = 'Record WebM';
    btnRecord.classList.remove('recording');
    recordStatus.textContent = `Saved ${(blob.size / 1024).toFixed(0)} KB`;
    btnPngSeq.disabled = false;
  };

  mediaRecorder.start();
  btnRecord.textContent = 'Stop Recording';
  btnRecord.classList.add('recording');
  recordStatus.textContent = 'Recording...';
  btnPngSeq.disabled = true;
});

// ── PNG Sequence Export ──

let pngExporting = false;

btnPngSeq.addEventListener('click', async () => {
  if (!mixer || !currentAction || pngExporting) return;

  const clip = currentAction.getClip();
  const fps = 15;
  const totalFrames = Math.ceil(clip.duration * fps);
  if (totalFrames <= 0 || totalFrames > 600) {
    recordStatus.textContent = totalFrames > 600
      ? 'Clip too long (>40s at 15fps)'
      : 'No frames to export';
    return;
  }

  pngExporting = true;
  btnPngSeq.disabled = true;
  btnRecord.disabled = true;
  recordStatus.textContent = `Exporting 0/${totalFrames} frames...`;

  // Pause normal playback, manually step through frames
  const wasPaused = animPaused;
  const wasTimeScale = mixer.timeScale;
  mixer.timeScale = 0;

  const blobs: Blob[] = [];

  for (let i = 0; i < totalFrames; i++) {
    const t = (i / fps);
    currentAction.time = t;
    mixer.update(0);
    renderer.render(scene, camera);

    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), 'image/png');
    });
    blobs.push(blob);
    recordStatus.textContent = `Exporting ${i + 1}/${totalFrames} frames...`;
  }

  // Restore playback state
  mixer.timeScale = wasPaused ? 0 : wasTimeScale;

  // Bundle all PNGs into a store-only ZIP (no external deps)
  const zipBlob = await buildZip(blobs, clip.name, fps);
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${clip.name.replace(/[^a-zA-Z0-9_-]/g, '_')}-png-sequence.zip`;
  a.click();
  URL.revokeObjectURL(url);

  recordStatus.textContent = `Exported ${totalFrames} PNG frames (${(zipBlob.size / 1024).toFixed(0)} KB)`;
  pngExporting = false;
  btnPngSeq.disabled = false;
  btnRecord.disabled = false;
});

/** Build a minimal ZIP file from an array of PNG blobs. No compression (store only). */
async function buildZip(blobs: Blob[], baseName: string, fps: number): Promise<Blob> {
  const entries: { name: Uint8Array; data: Uint8Array; }[] = [];
  const encoder = new TextEncoder();

  for (let i = 0; i < blobs.length; i++) {
    const fileName = `${baseName}_${String(i).padStart(4, '0')}.png`;
    const data = new Uint8Array(await blobs[i]!.arrayBuffer());
    entries.push({ name: encoder.encode(fileName), data });
  }

  // Build ZIP structure
  const parts: Uint8Array[] = [];
  const centralDir: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    // Local file header
    const localHeader = new Uint8Array(30 + entry.name.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);   // signature
    lv.setUint16(4, 20, true);            // version needed
    lv.setUint16(6, 0, true);             // flags
    lv.setUint16(8, 0, true);             // compression (store)
    lv.setUint16(10, 0, true);            // mod time
    lv.setUint16(12, 0, true);            // mod date
    lv.setUint32(14, crc32(entry.data), true); // crc32
    lv.setUint32(18, entry.data.length, true); // compressed size
    lv.setUint32(22, entry.data.length, true); // uncompressed size
    lv.setUint16(26, entry.name.length, true); // filename length
    lv.setUint16(28, 0, true);             // extra field length
    localHeader.set(entry.name, 30);

    // Central directory entry
    const cdEntry = new Uint8Array(46 + entry.name.length);
    const cv = new DataView(cdEntry.buffer);
    cv.setUint32(0, 0x02014b50, true);   // signature
    cv.setUint16(4, 20, true);            // version made by
    cv.setUint16(6, 20, true);            // version needed
    cv.setUint16(8, 0, true);             // flags
    cv.setUint16(10, 0, true);            // compression
    cv.setUint16(12, 0, true);            // mod time
    cv.setUint16(14, 0, true);            // mod date
    cv.setUint32(16, crc32(entry.data), true);
    cv.setUint32(20, entry.data.length, true);
    cv.setUint32(24, entry.data.length, true);
    cv.setUint16(28, entry.name.length, true);
    cv.setUint16(30, 0, true);            // extra field length
    cv.setUint16(32, 0, true);            // comment length
    cv.setUint16(34, 0, true);            // disk number
    cv.setUint16(36, 0, true);            // internal attrs
    cv.setUint32(38, 0, true);            // external attrs
    cv.setUint32(42, offset, true);       // local header offset
    cdEntry.set(entry.name, 46);

    parts.push(localHeader, entry.data);
    centralDir.push(cdEntry);
    offset += localHeader.length + entry.data.length;
  }

  // Central directory
  const cdOffset = offset;
  let cdSize = 0;
  for (const cd of centralDir) {
    parts.push(cd);
    cdSize += cd.length;
  }

  // End of central directory
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);               // disk number
  ev.setUint16(6, 0, true);               // disk with cd
  ev.setUint16(8, entries.length, true);   // entries on disk
  ev.setUint16(10, entries.length, true);  // total entries
  ev.setUint32(12, cdSize, true);          // cd size
  ev.setUint32(16, cdOffset, true);        // cd offset
  ev.setUint16(20, 0, true);              // comment length
  parts.push(eocd);

  return new Blob(parts as unknown as BlobPart[], { type: 'application/zip' });
}

/** CRC-32 (used by ZIP format) */
function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]!;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// -- Render loop --
function animate(): void {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  mixer?.update(delta);
  updateFreeCam(delta);
  if (!freeCam) controls.update();
  renderer.render(scene, camera);

  // Update scrubber and time display
  if (currentAction && !isScrubbing) {
    const clip = currentAction.getClip();
    const t = currentAction.time % clip.duration;
    scrubber.value = String(t);
    timeDisplay.textContent = `${t.toFixed(2)} / ${clip.duration.toFixed(2)}`;
  }
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
