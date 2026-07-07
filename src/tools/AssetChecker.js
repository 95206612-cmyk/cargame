import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const state = {
  kind: 'car',
  files: [],
  issues: [],
  details: [],
  report: null
};

const selectors = {
  input: document.querySelector('#asset-input'),
  dropZone: document.querySelector('#drop-zone'),
  gameButton: document.querySelector('#game-button'),
  clearButton: document.querySelector('#clear-button'),
  exportButton: document.querySelector('#export-button'),
  issueList: document.querySelector('#issue-list'),
  fileList: document.querySelector('#file-list'),
  counts: {
    error: document.querySelector('#count-error'),
    warn: document.querySelector('#count-warn'),
    pass: document.querySelector('#count-pass'),
    files: document.querySelector('#count-files')
  },
  modeButtons: [...document.querySelectorAll('[data-kind]')],
  preview: document.querySelector('#preview')
};

const loader = new GLTFLoader();
let previewScene;
let previewCamera;
let previewRenderer;
let previewModel;
let animationId;

init();

function init() {
  initPreview();
  bindEvents();
  render();
}

function bindEvents() {
  selectors.input.addEventListener('change', () => analyzeFiles([...selectors.input.files]));
  selectors.gameButton.addEventListener('click', () => {
    window.location.href = './index.html';
  });
  selectors.clearButton.addEventListener('click', clearState);
  selectors.exportButton.addEventListener('click', exportReport);

  selectors.modeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      state.kind = button.dataset.kind;
      selectors.modeButtons.forEach((item) => item.classList.toggle('active', item === button));
      if (state.files.length) {
        analyzeFiles(state.files);
      }
    });
  });

  ['dragenter', 'dragover'].forEach((eventName) => {
    selectors.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      selectors.dropZone.classList.add('dragging');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    selectors.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      selectors.dropZone.classList.remove('dragging');
    });
  });

  selectors.dropZone.addEventListener('drop', (event) => {
    analyzeFiles([...event.dataTransfer.files]);
  });
}

async function analyzeFiles(files) {
  state.files = files;
  state.issues = [];
  state.details = [];
  state.report = null;
  clearPreviewModel();

  if (!files.length) {
    render();
    return;
  }

  addIssue('info', '开始检查', `当前模式：${labelForKind(state.kind)}；文件数量：${files.length}。`);

  const modelFiles = files.filter((file) => /\.(glb|gltf)$/i.test(file.name));
  const imageFiles = files.filter((file) => /\.(png|jpe?g|webp)$/i.test(file.name));
  const jsonFiles = files.filter((file) => /\.json$/i.test(file.name));

  if ((state.kind === 'car' || state.kind === 'track') && !modelFiles.length) {
    addIssue('error', '缺少模型文件', '车辆或赛道检查至少需要一个 .glb 或 .gltf 文件。');
  }

  for (const file of imageFiles) {
    await inspectImage(file);
  }

  for (const file of jsonFiles) {
    await inspectJson(file);
  }

  for (const file of modelFiles) {
    await inspectModel(file);
  }

  state.report = createReport();
  render();
}

async function inspectModel(file) {
  try {
    const url = URL.createObjectURL(file);
    const gltf = await loader.loadAsync(url);
    URL.revokeObjectURL(url);

    const root = gltf.scene;
    root.updateMatrixWorld(true);
    const stats = getModelStats(root);
    const names = stats.nodes.map((name) => name.toLowerCase());

    state.details.push({
      type: 'model',
      name: file.name,
      size: formatBytes(file.size),
      values: [
        ['尺寸', `${formatNumber(stats.size.x)}m x ${formatNumber(stats.size.y)}m x ${formatNumber(stats.size.z)}m`],
        ['三角面', stats.triangles.toLocaleString()],
        ['网格数量', stats.meshes.toLocaleString()],
        ['材质数量', stats.materials.size.toLocaleString()],
        ['动画数量', `${gltf.animations?.length || 0}`],
        ['节点数量', stats.nodes.length.toLocaleString()]
      ]
    });

    checkCommonModelRules(file, stats);

    if (state.kind === 'car') {
      checkCarRules(stats, names);
    }

    if (state.kind === 'track') {
      checkTrackRules(stats, names);
    }

    addIssue('pass', '模型可解析', `${file.name} 已成功由 GLTFLoader 读取。`);
    showPreview(root);
  } catch (error) {
    addIssue('error', '模型解析失败', `${file.name}: ${error.message}`);
  }
}

async function inspectImage(file) {
  try {
    const image = await loadImage(file);
    const widthPower = isPowerOfTwo(image.naturalWidth);
    const heightPower = isPowerOfTwo(image.naturalHeight);
    const maxSize = Math.max(image.naturalWidth, image.naturalHeight);

    state.details.push({
      type: 'image',
      name: file.name,
      size: formatBytes(file.size),
      values: [
        ['分辨率', `${image.naturalWidth} x ${image.naturalHeight}`],
        ['格式', extensionOf(file.name).toUpperCase()],
        ['2 的幂', widthPower && heightPower ? '是' : '否']
      ]
    });

    if (!widthPower || !heightPower) {
      addIssue('warn', '贴图尺寸不是 2 的幂', `${file.name} 是 ${image.naturalWidth}x${image.naturalHeight}，建议使用 512、1024、2048 这类尺寸。`);
    } else {
      addIssue('pass', '贴图尺寸合格', `${file.name} 使用了适合 GPU 的尺寸。`);
    }

    if (maxSize > 4096) {
      addIssue('warn', '贴图过大', `${file.name} 最大边为 ${maxSize}px，移动端建议不超过 2048px。`);
    }

    if (!/_(basecolor|normal|metallic|roughness|ao|emissive)|-(basecolor|normal|metallic|roughness|ao|emissive)/i.test(file.name) && state.kind !== 'texture') {
      addIssue('warn', '贴图命名不明确', `${file.name} 建议带上 basecolor、normal、metallic、roughness、ao 等用途后缀。`);
    }
  } catch (error) {
    addIssue('error', '贴图读取失败', `${file.name}: ${error.message}`);
  }
}

async function inspectJson(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const keys = Object.keys(data);

    state.details.push({
      type: 'json',
      name: file.name,
      size: formatBytes(file.size),
      values: [
        ['顶层字段', keys.slice(0, 8).join(', ') || '无'],
        ['字段数量', keys.length.toLocaleString()]
      ]
    });

    if (/physics|params|vehicle/i.test(file.name)) {
      checkPhysicsConfig(file.name, data);
    }

    if (/track/i.test(file.name)) {
      checkTrackConfig(file.name, data);
    }

    addIssue('pass', 'JSON 可解析', `${file.name} 是有效 JSON。`);
  } catch (error) {
    addIssue('error', 'JSON 解析失败', `${file.name}: ${error.message}`);
  }
}

function checkCommonModelRules(file, stats) {
  if (!stats.meshes) {
    addIssue('error', '模型没有网格', `${file.name} 没有可渲染 Mesh。`);
  }

  if (stats.triangles > 180000) {
    addIssue('warn', '三角面偏高', `${file.name} 有 ${stats.triangles.toLocaleString()} 个三角面，建议游戏用资产控制在 50K-150K 范围内。`);
  }

  if (stats.emptyMaterials > 0) {
    addIssue('warn', '存在无材质网格', `${file.name} 有 ${stats.emptyMaterials} 个 Mesh 没有材质。`);
  }

  if (stats.missingTextureSlots.length) {
    addIssue('warn', 'PBR 贴图不完整', `缺少常见贴图槽：${[...new Set(stats.missingTextureSlots)].join(', ')}。`);
  }

  const maxDim = Math.max(stats.size.x, stats.size.y, stats.size.z);
  const minDim = Math.min(stats.size.x, stats.size.y, stats.size.z);
  if (maxDim <= 0 || minDim < 0) {
    addIssue('error', '尺寸异常', `${file.name} 的包围盒尺寸异常。`);
  }
}

function checkCarRules(stats, names) {
  const required = ['body', 'wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'];
  const missing = required.filter((nodeName) => !names.includes(nodeName));

  if (missing.length) {
    addIssue('error', '车辆节点缺失', `缺少节点：${missing.join(', ')}。轮子需要单独命名才能转向和旋转。`);
  } else {
    addIssue('pass', '车辆节点合格', 'body 和四个轮子节点都存在。');
  }

  const { x, y, z } = stats.size;
  if (z < 2.6 || z > 6.2 || x < 1.2 || x > 3.2 || y < 0.8 || y > 2.8) {
    addIssue('warn', '车辆比例可能不对', `当前尺寸约 ${formatNumber(x)}m 宽、${formatNumber(y)}m 高、${formatNumber(z)}m 长；普通赛车建议约 1.8m x 1.3m x 4.5m。`);
  } else {
    addIssue('pass', '车辆比例在合理范围', `当前尺寸约 ${formatNumber(x)}m x ${formatNumber(y)}m x ${formatNumber(z)}m。`);
  }

  if (Math.abs(stats.center.x) > 0.6 || Math.abs(stats.center.z) > 0.8) {
    addIssue('warn', '车辆原点偏离中心', `包围盒中心在 (${formatNumber(stats.center.x)}, ${formatNumber(stats.center.y)}, ${formatNumber(stats.center.z)})，建议模型原点靠近车辆质心。`);
  }

  if (stats.size.z < stats.size.x) {
    addIssue('warn', '车辆朝向可能不对', '车辆长度轴看起来不是 Z 轴；本项目建议车头朝 +Z。');
  }
}

function checkTrackRules(stats, names) {
  const groups = [
    ['road', ['road', 'track_road', 'asphalt']],
    ['barriers', ['barriers', 'barrier', 'walls', 'collision']],
    ['checkpoints', ['checkpoints', 'checkpoint']],
    ['spawn_points', ['spawn_points', 'spawn', 'start']],
    ['route/ai_path', ['route', 'ai_path', 'centerline', 'path']]
  ];

  for (const [label, aliases] of groups) {
    const found = aliases.some((name) => names.includes(name) || names.some((nodeName) => nodeName.includes(`${name}_`)));
    if (found) {
      addIssue('pass', `赛道 ${label} 存在`, `找到 ${label} 相关节点。`);
    } else {
      const level = label === 'road' ? 'error' : 'warn';
      addIssue(level, `赛道缺少 ${label}`, `建议添加节点或空物体：${aliases.join(', ')}。`);
    }
  }

  if (stats.size.x < 40 || stats.size.z < 40) {
    addIssue('warn', '赛道尺寸偏小', `当前占地约 ${formatNumber(stats.size.x)}m x ${formatNumber(stats.size.z)}m，赛车赛道通常需要更大的平面范围。`);
  } else {
    addIssue('pass', '赛道尺寸可用', `当前占地约 ${formatNumber(stats.size.x)}m x ${formatNumber(stats.size.z)}m。`);
  }

  if (stats.size.y > 80) {
    addIssue('warn', '赛道高度跨度较大', `Y 轴跨度约 ${formatNumber(stats.size.y)}m，请确认没有远离场景的多余物体。`);
  }
}

function checkPhysicsConfig(fileName, data) {
  const json = JSON.stringify(data).toLowerCase();
  const requiredTerms = ['mass', 'accel', 'brake', 'steer'];
  const missing = requiredTerms.filter((term) => !json.includes(term));

  if (missing.length) {
    addIssue('warn', '物理配置字段不足', `${fileName} 没找到这些关键词：${missing.join(', ')}。`);
  } else {
    addIssue('pass', '物理配置关键词齐全', `${fileName} 包含质量、加速、刹车、转向相关字段。`);
  }
}

function checkTrackConfig(fileName, data) {
  const json = JSON.stringify(data).toLowerCase();
  const terms = ['checkpoint', 'route', 'spawn'];
  const missing = terms.filter((term) => !json.includes(term));

  if (missing.length) {
    addIssue('warn', '赛道配置缺少导航信息', `${fileName} 没找到这些关键词：${missing.join(', ')}。`);
  } else {
    addIssue('pass', '赛道配置包含导航信息', `${fileName} 包含检查点、路线或出生点信息。`);
  }
}

function getModelStats(root) {
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const stats = {
    size,
    center,
    triangles: 0,
    meshes: 0,
    emptyMaterials: 0,
    materials: new Set(),
    nodes: [],
    missingTextureSlots: []
  };

  root.traverse((object) => {
    if (object.name) {
      stats.nodes.push(object.name);
    }

    if (!object.isMesh) {
      return;
    }

    stats.meshes += 1;
    const geometry = object.geometry;
    const position = geometry?.attributes?.position;
    if (position) {
      stats.triangles += geometry.index ? geometry.index.count / 3 : position.count / 3;
    }

    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) {
        stats.emptyMaterials += 1;
        continue;
      }
      stats.materials.add(material.uuid);
      if (!material.map) stats.missingTextureSlots.push('basecolor/map');
      if (!material.normalMap) stats.missingTextureSlots.push('normal');
      if (!material.roughnessMap) stats.missingTextureSlots.push('roughness');
    }
  });

  stats.triangles = Math.round(stats.triangles);
  return stats;
}

function initPreview() {
  previewScene = new THREE.Scene();
  previewScene.background = new THREE.Color(0xd7e0e4);
  previewCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
  previewCamera.position.set(6, 4, 8);
  previewRenderer = new THREE.WebGLRenderer({ canvas: selectors.preview, antialias: true });
  previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const hemi = new THREE.HemisphereLight(0xffffff, 0x87938b, 2);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(5, 8, 4);
  previewScene.add(hemi, sun);

  window.addEventListener('resize', resizePreview);
  resizePreview();
  animatePreview();
}

function showPreview(root) {
  clearPreviewModel();
  previewModel = root.clone(true);
  const box = new THREE.Box3().setFromObject(previewModel);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  previewModel.position.sub(center);
  previewModel.scale.multiplyScalar(4 / maxDim);
  previewScene.add(previewModel);
}

function clearPreviewModel() {
  if (!previewModel) {
    return;
  }
  previewScene.remove(previewModel);
  previewModel.traverse((object) => {
    if (object.geometry) object.geometry.dispose();
    if (object.material) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => material.dispose?.());
    }
  });
  previewModel = null;
}

function animatePreview() {
  animationId = requestAnimationFrame(animatePreview);
  if (previewModel) {
    previewModel.rotation.y += 0.006;
  }
  previewRenderer.render(previewScene, previewCamera);
}

function resizePreview() {
  const rect = selectors.preview.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  previewCamera.aspect = width / height;
  previewCamera.updateProjectionMatrix();
  previewRenderer.setSize(width, height, false);
}

function addIssue(level, title, message) {
  state.issues.push({ level, title, message });
}

function render() {
  const counts = state.issues.reduce((acc, issue) => {
    acc[issue.level] = (acc[issue.level] || 0) + 1;
    return acc;
  }, {});

  selectors.counts.error.textContent = counts.error || 0;
  selectors.counts.warn.textContent = counts.warn || 0;
  selectors.counts.pass.textContent = counts.pass || 0;
  selectors.counts.files.textContent = state.files.length;

  selectors.issueList.innerHTML = state.issues.length
    ? state.issues.map(renderIssue).join('')
    : '<div class="empty">还没有导入资源。</div>';

  selectors.fileList.innerHTML = state.details.length
    ? state.details.map(renderDetail).join('')
    : '<div class="empty">模型导入后会显示尺寸、面数、节点和材质信息。</div>';
}

function renderIssue(issue) {
  const labels = {
    error: '错误',
    warn: '警告',
    pass: '通过',
    info: '信息'
  };
  return `
    <article class="issue">
      <span class="badge ${issue.level}">${labels[issue.level]}</span>
      <div>
        <h3>${escapeHtml(issue.title)}</h3>
        <p>${escapeHtml(issue.message)}</p>
      </div>
    </article>
  `;
}

function renderDetail(detail) {
  return `
    <article class="file-row">
      <strong>${escapeHtml(detail.name)}</strong>
      <div class="kv">
        <b>类型</b><span>${escapeHtml(detail.type)}</span>
        <b>大小</b><span>${escapeHtml(detail.size)}</span>
        ${detail.values.map(([key, value]) => `<b>${escapeHtml(key)}</b><span>${escapeHtml(value)}</span>`).join('')}
      </div>
    </article>
  `;
}

function clearState() {
  state.files = [];
  state.issues = [];
  state.details = [];
  state.report = null;
  selectors.input.value = '';
  clearPreviewModel();
  render();
}

function exportReport() {
  const report = state.report || createReport();
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `street-racer-asset-report-${state.kind}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function createReport() {
  return {
    tool: 'Street Racer Asset Checker',
    checkedAt: new Date().toISOString(),
    mode: state.kind,
    files: state.files.map((file) => ({ name: file.name, size: file.size, type: file.type || extensionOf(file.name) })),
    issues: state.issues,
    details: state.details
  };
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片无法解码'));
    };
    image.src = url;
  });
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toFixed(2) : '0.00';
}

function isPowerOfTwo(value) {
  return value > 0 && (value & (value - 1)) === 0;
}

function extensionOf(name) {
  return name.split('.').pop() || '';
}

function labelForKind(kind) {
  return { car: '车辆', track: '赛道', texture: '贴图' }[kind] || kind;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

window.addEventListener('beforeunload', () => {
  if (animationId) cancelAnimationFrame(animationId);
});
