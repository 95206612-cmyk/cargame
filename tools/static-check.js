import fs from 'fs';
import path from 'path';

const root = process.cwd();
const failures = [];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function walk(dir, result = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'release') continue;
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, result);
    else result.push(rel);
  }
  return result;
}

function parseJson(file) {
  try {
    return JSON.parse(read(file));
  } catch (err) {
    failures.push(`${file}: invalid JSON (${err.message})`);
    return null;
  }
}

const textFiles = [
  ...walk('src'),
  ...walk('static'),
  ...walk('server/src'),
  'PROJECT_DOCS.md',
  'PBR_ASSET_RULES.md',
  'BLENDER_GLB_WORKFLOW.md',
  'index.html',
].filter(file => /\.(js|json|md|html|ts|css)$/i.test(file));

const mojibake = /(?:�|鈥|脳|鈫|涓|鎴|寮|鍘|杞|姘|璧|锛|銆|鐨|鏄)/;
for (const file of textFiles) {
  const content = read(file);
  assert(!mojibake.test(content), `${file}: suspected mojibake text`);
}

const cars = parseJson('static/config/cars.json') || {};
assert(cars.tuner?.name === '街改车', 'cars.json should preserve readable Chinese car names');
assert(Object.keys(cars).length >= 4, 'cars.json should define at least four cars');

const tracks = parseJson('static/config/tracks.json') || {};
assert(Array.isArray(tracks.tracks) && tracks.tracks.length >= 3, 'tracks.json should define playable tracks');
assert(tracks.tracks.some(track => track.id === 'city_circuit'), 'tracks.json should include city_circuit');

const tune = parseJson('static/config/tuneConfig.json') || {};
assert(tune.categories?.engine?.levels?.length >= 6, 'tuneConfig.json should include engine upgrade levels');

const main = read('src/main.js');
assert(main.includes('garage: () => this._showGarage()'), 'main menu garage action should open GarageUI');
assert(main.includes('multiplayer: () => this._showMultiplayer()'), 'main menu multiplayer action should open MultiplayerUI');
assert(main.includes('_updateMultiplayerSync'), 'main loop should include multiplayer sync');
assert(main.includes('new GarageUI'), 'App should instantiate GarageUI');
assert(main.includes('new MultiplayerUI'), 'App should instantiate MultiplayerUI');
assert(main.includes('new PlayerProfileUI'), 'App should instantiate PlayerProfileUI');
assert(main.includes('profile: () => this._showPlayerProfile()'), 'main menu should expose player profile action');
assert(main.includes('new InteractiveObjectManager'), 'App should instantiate InteractiveObjectManager');
assert(main.includes('new LevelEditorUI'), 'App should instantiate LevelEditorUI');
assert(main.includes('levelEditor: () => this._showLevelEditor()'), 'main menu should expose level editor action');
assert(main.includes('resolveVehicleContact'), 'main loop should resolve interactive object contacts');

const interactiveObjects = read('src/scene/InteractiveObjectManager.js');
assert(interactiveObjects.includes('INTERACTIVE_OBJECT_TYPES'), 'InteractiveObjectManager should define placeable object types');
assert(interactiveObjects.includes('saveCurrentTrack'), 'InteractiveObjectManager should persist track layouts');
assert(interactiveObjects.includes('breakable'), 'InteractiveObjectManager should support breakable objects');

const levelEditor = read('src/ui/LevelEditorUI.js');
assert(levelEditor.includes('level-editor-panel'), 'LevelEditorUI should render an editor panel');
assert(levelEditor.includes('吸附地面'), 'LevelEditorUI should expose ground snapping controls');
assert(levelEditor.includes('坚固度'), 'LevelEditorUI should expose durability controls');
assert(levelEditor.includes('Save & Exit'), 'LevelEditorUI should provide a save-and-exit action');

const mpUi = read('src/ui/MultiplayerUI.js');
assert(mpUi.includes('Need at least 2 players'), 'MultiplayerUI should explain the two-player ready requirement');
assert(mpUi.includes('房间规则'), 'MultiplayerUI should expose room rule controls');
assert(mpUi.includes('创建比赛房间'), 'MultiplayerUI should expose room creation');

const profileUi = read('src/ui/PlayerProfileUI.js');
assert(profileUi.includes('创建车手'), 'PlayerProfileUI should provide racer login');
assert(profileUi.includes('车辆外观'), 'PlayerProfileUI should expose vehicle customization');
assert(profileUi.includes('车内挂件'), 'PlayerProfileUI should expose pendant customization');

const settingsUi = read('src/ui/SettingsUI.js');
assert(settingsUi.includes('shadowQuality'), 'SettingsUI should expose shadow quality controls');
assert(settingsUi.includes('textureQuality'), 'SettingsUI should expose texture quality controls');
assert(settingsUi.includes('模型 LOD 距离'), 'SettingsUI should expose model LOD distance controls');
assert(settingsUi.includes('画面质量'), 'SettingsUI should use Chinese section labels');
assert(settingsUi.includes('镜头碰撞避让'), 'SettingsUI should localize camera collision controls');

const serverRoom = read('server/src/room.js');
assert(serverRoom.includes('_broadcastReadyState'), 'server room should broadcast ready state updates');
assert(serverRoom.includes('updateSettings'), 'server room should support room settings updates');

if (failures.length) {
  console.error('Static checks failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Static checks passed (${textFiles.length} text files scanned).`);
