import * as THREE from 'three';

export { TrackManager } from './TrackManager.js';
export { TrackBuilder } from './TrackBuilder.js';
export { InteractiveObjectManager, INTERACTIVE_OBJECT_TYPES } from './InteractiveObjectManager.js';

export class SceneManager {
  constructor(scene) {
    this.scene = scene;
    this.buildings = [];
    this.track = null;
    this.aiVehicles = [];
    this.props = [];
    this.ground = null;

    this._setupGround();
    this._setupGrid();
  }

  _setupGround() {
    const geo = new THREE.PlaneGeometry(500, 500);
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a5c3a, roughness: 0.9 });
    this.ground = new THREE.Mesh(geo, mat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
  }

  _setupGrid() {
    const grid = new THREE.GridHelper(500, 50, 0x444444, 0x222222);
    grid.position.y = 0.01;
    this.scene.add(grid);
  }

  loadTrack(trackId) {
    // Load track geometry and decoration from track data
  }

  spawnAI(count) {
    // Spawn AI vehicles on current track
  }

  update(delta) {
    for (const ai of this.aiVehicles) {
      // ai.update(delta);
    }
  }
}
