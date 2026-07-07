import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { CarModel } from '../src/vehicle/CarModel.js';
import { TrackBuilder } from '../src/scene/TrackBuilder.js';

installFileReaderPolyfill();

const outDir = path.resolve('reference-assets');

async function main() {
  await fs.mkdir(outDir, { recursive: true });

  const car = new CarModel();
  car.buildProcedural(
    { body: 0xe74c3c, cabin: 0x1a1a2e, trim: 0x333333, wheel: 0x111111 },
    'sports'
  );
  normalizeCarNodeNames(car.root);
  await exportGltf(car.root, path.join(outDir, 'street-racer-car-reference.gltf'));

  const scene = new THREE.Scene();
  const trackBuilder = new TrackBuilder(scene);
  trackBuilder._makeTextPanel = (text, color = 0x66e8ff) => {
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
    );
    panel.name = `sign-${String(text).toLowerCase()}`;
    return panel;
  };
  trackBuilder.build();
  const metadata = {
    checkpoints: trackBuilder.checkpoints,
    spawnPoints: trackBuilder.spawnPoints,
    roadCenterPoints: trackBuilder.roadCenterPoints.map((point) => ({
      x: Number(point.x.toFixed(3)),
      y: Number(point.y.toFixed(3)),
      z: Number(point.z.toFixed(3))
    })),
    surfaceZones: trackBuilder.surfaceZones
  };
  await exportGltf(trackBuilder.root, path.join(outDir, 'street-racer-track-reference.gltf'));
  await fs.writeFile(
    path.join(outDir, 'street-racer-track-reference.navigation.json'),
    JSON.stringify(metadata, null, 2),
    'utf8'
  );

  console.log(`Exported reference assets to ${outDir}`);
}

function normalizeCarNodeNames(root) {
  root.name = 'car_root';
  const body = root.getObjectByName('car-body');
  if (body) body.name = 'body';

  const rename = {
    'wheel-fl': 'wheel_fl',
    'wheel-fr': 'wheel_fr',
    'wheel-rl': 'wheel_rl',
    'wheel-rr': 'wheel_rr'
  };

  root.traverse((object) => {
    if (rename[object.name]) {
      object.name = rename[object.name];
    }
  });
}

async function exportGltf(object, filePath) {
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(object, {
    binary: false,
    trs: false,
    onlyVisible: true,
    truncateDrawRange: true,
    includeCustomExtensions: false
  });

  await fs.writeFile(filePath, JSON.stringify(result, null, 2), 'utf8');
}

function installFileReaderPolyfill() {
  if (globalThis.FileReader) {
    return;
  }

  globalThis.FileReader = class FileReader {
    constructor() {
      this.result = null;
      this.onloadend = null;
    }

    async readAsArrayBuffer(blob) {
      this.result = await blob.arrayBuffer();
      this.onloadend?.();
    }

    async readAsDataURL(blob) {
      const buffer = Buffer.from(await blob.arrayBuffer());
      const type = blob.type || 'application/octet-stream';
      this.result = `data:${type};base64,${buffer.toString('base64')}`;
      this.onloadend?.();
    }
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
