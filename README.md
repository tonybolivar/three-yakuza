# `three-yakuza`

Use [Yakuza / Like a Dragon](https://rggstudio.sega.com/) assets in [three.js](https://threejs.org/)

[GitHub Repository](https://github.com/tonybolivar/three-yakuza/) | [Examples](https://github.com/tonybolivar/three-yakuza/tree/main/examples) | [Contributing](CONTRIBUTING.md)

## What is this?

The first browser-native loader for SEGA's proprietary RGG Studio asset formats. Parse and render Yakuza series animations, models, and cameras directly in Three.js with no Blender pipeline required.

## Packages

| Package | Description |
| --- | --- |
| [`@three-yakuza/gmt-parser`](packages/gmt-parser) | Parse GMT/CMT/IFA files (zero dependencies) |
| [`@three-yakuza/gmd-parser`](packages/gmd-parser) | Parse GMD model files (zero dependencies) |
| [`@three-yakuza/par-parser`](packages/par-parser) | Unpack PAR archives + SLLZ decompression (zero dependencies) |
| [`@three-yakuza/three-gmt`](packages/three-gmt) | Three.js GMT animation loader |
| [`@three-yakuza/three-gmd`](packages/three-gmd) | Three.js GMD model loader |

## Supported formats

| Format | Extension | Contents | Games |
| --- | --- | --- | --- |
| GMT | `.gmt` | Skeletal animations (body, face) | Y0, YK1, Y3-5, Kenzan, Ishin |
| CMT | `.cmt` | Camera animations | Y0, YK1, Y3-5, Kenzan, Ishin |
| IFA | `.ifa` | Facial pose data | Y0, YK1, Y3-5 |
| GMD | `.gmd` | Character/stage models | Y0, YK1, Y3-5 |
| PAR | `.par` | Asset archives | All Old Engine titles |

## Quick start

### Install via npm

```sh
npm install three @three-yakuza/three-gmt
```

### Or clone and build from source

```sh
git clone https://github.com/tonybolivar/three-yakuza.git
cd three-yakuza
pnpm install
pnpm build
```

### Load and play a GMT animation

```typescript
import * as THREE from 'three';
import { GMTLoader } from '@three-yakuza/three-gmt';

const loader = new GMTLoader();
const gmt = await loader.loadAsync('/animations/karaoke_baka_mitai.gmt');

// Clips use original SEGA bone names (center, kosi, mune_1, etc.)
const mixer = new THREE.AnimationMixer(yourSkinnedMesh);
mixer.clipAction(gmt.animations[0]).play();
```

### Load a GMD model from a PAR archive

```typescript
import { parsePAR, extractFile } from '@three-yakuza/par-parser';
import { GMDLoader } from '@three-yakuza/three-gmd';

// Load the PAR archive
const parBuffer = await fetch('/data/c_cm_kiryu/mesh.par').then(r => r.arrayBuffer());
const archive = parsePAR(parBuffer);

// Extract and parse the GMD model
const gmdFile = archive.files.find(f => f.name.endsWith('.gmd'));
const gmdData = extractFile(parBuffer, gmdFile);
const loader = new GMDLoader();
const result = loader.parse(gmdData.buffer);

// Add to scene
scene.add(result.scene);
```

### Parser only (no Three.js)

```sh
npm install @three-yakuza/gmt-parser
```

```typescript
import { parseGMT } from '@three-yakuza/gmt-parser';

const buffer = await fetch('/animations/idle.gmt').then(r => r.arrayBuffer());
const gmt = parseGMT(buffer);

console.log(gmt.name);                    // file name
console.log(gmt.animations[0].name);       // animation name
console.log(gmt.animations[0].frameRate);  // e.g. 30.0
console.log(gmt.animations[0].bones);      // Map<string, GMTBone>
```

### Full pipeline: PAR -> GMD + GMT + DDS textures

See [`examples/gmt-viewer`](examples/gmt-viewer) for a complete browser demo that loads PAR archives, extracts models and animations, parses DDS textures, and renders everything in Three.js with orbit controls.

## Bone naming

Animation clips use original SEGA bone names as-is. This library does **not** perform bone retargeting. If applying GMT animations to non-Yakuza models (MMD, VRM, custom rigs), you must map bone names in your own code.

Common SEGA bone names: `center`, `kosi`, `mune_1`, `mune_2`, `kubi`, `face`, `kata_r`, `ude_r_1`, `ude_r_2`, `te_r`, `kata_l`, `ude_l_1`, `ude_l_2`, `te_l`, `asi_r_1`, `asi_r_2`, `asi_l_1`, `asi_l_2`

## Use with WebGPURenderer

The animation system (`AnimationClip`, `AnimationMixer`, `KeyframeTrack`) is renderer-agnostic. Works with both `WebGLRenderer` and `WebGPURenderer` with no changes.

## Credits

Parser logic ported from:

- [`gmt_lib`](https://github.com/SutandoTsukai181/gmt_lib) by SutandoTsukai181 (MIT) - GMT/CMT/IFA parsing
- [`Yakuza-PAR-py`](https://github.com/SutandoTsukai181/Yakuza-PAR-py) by SutandoTsukai181 (MIT) - PAR archive unpacking
- [`yk_gmd_io`](https://github.com/theturboturnip/yk_gmd_io) by theturboturnip (MIT) - GMD model parsing

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
