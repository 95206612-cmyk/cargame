import { chromium } from 'playwright';

const baseUrl = process.env.SMOKE_URL || 'http://127.0.0.1:4173/';
const timeout = Number(process.env.SMOKE_TIMEOUT || 30000);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];

page.on('pageerror', err => errors.push(`pageerror: ${err.message}`));
page.on('console', msg => {
  if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
});

const waitHidden = (selector) => page.waitForFunction((sel) => {
  const el = document.querySelector(sel);
  return !el || getComputedStyle(el).display === 'none';
}, selector, { timeout });

const showPanel = async (action, selector) => {
  await page.evaluate((name) => window.GameActions[name](), action);
  await page.waitForSelector(selector, { state: 'visible', timeout });
};

const closeActivePanel = async (selector) => {
  await page.evaluate(() => window.GameActions.escape());
  await waitHidden(selector);
};

const setInputValue = async (selector, value) => {
  await page.evaluate(({ selector: sel, value: nextValue }) => {
    const input = document.querySelector(sel);
    if (!input) throw new Error(`Missing input: ${sel}`);
    input.value = nextValue;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, { selector, value });
};

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout });
  await page.waitForFunction(() => window.__streetRacerBootStarted === true, null, { timeout });
  await page.waitForFunction(() => window.GameActions && document.querySelector('#main-menu'), null, { timeout });
  await waitHidden('#loading-screen');

  if (await page.locator('#player-profile-panel').isVisible().catch(() => false)) {
    const loginVisible = await page.locator('#login-name').count();
    if (loginVisible) {
      await setInputValue('#login-name', 'SmokeRacer');
      await setInputValue('#login-club', 'Test Garage');
      await page.evaluate(() => document.querySelector('#login-submit')?.click());
      await page.waitForSelector('#player-profile-panel', { state: 'visible', timeout });
      const profileText = await page.locator('#player-profile-panel').textContent();
      if (!profileText?.includes('车辆外观')) throw new Error('Player profile panel did not render after login');
    }
    await closeActivePanel('#player-profile-panel');
  }

  await page.evaluate(() => window.GameActions.escape());
  await page.waitForSelector('#main-menu.show', { timeout });

  await showPanel('profile', '#player-profile-panel');
  const profilePanelText = await page.locator('#player-profile-panel').textContent();
  if (!profilePanelText?.includes('车辆外观')) throw new Error('Player profile customization did not render');
  await closeActivePanel('#player-profile-panel');
  await page.evaluate(() => window.GameActions.escape());
  await page.waitForSelector('#main-menu.show', { timeout });

  await showPanel('garage', '#garage-panel');
  const garageTitle = await page.locator('#garage-panel').textContent();
  if (!garageTitle?.includes('GARAGE')) throw new Error('Garage panel did not render');
  await closeActivePanel('#garage-panel');
  await page.evaluate(() => window.GameActions.escape());
  await page.waitForSelector('#main-menu.show', { timeout });

  await showPanel('settings', '#settings-panel');
  const settingsText = await page.locator('#settings-panel').textContent();
  if (!settingsText?.includes('设置')) throw new Error('Chinese settings title did not render');
  if (!settingsText?.includes('阴影自动')) throw new Error('Shadow quality setting did not render');
  if (!settingsText?.includes('贴图自动')) throw new Error('Texture quality setting did not render');
  if (!settingsText?.includes('模型 LOD 距离')) throw new Error('LOD distance setting did not render');
  await closeActivePanel('#settings-panel');
  await page.evaluate(() => window.GameActions.escape());
  await page.waitForSelector('#main-menu.show', { timeout });

  await showPanel('multiplayer', '#multiplayer-panel');
  const mpTitle = await page.locator('#multiplayer-panel').textContent();
  if (!mpTitle?.includes('网络比赛')) throw new Error('Multiplayer panel did not render');
  if (!mpTitle?.includes('创建比赛房间')) throw new Error('Multiplayer room creation did not render');
  await setInputValue('#mp-name-input', 'SmokeTest');
  await closeActivePanel('#multiplayer-panel');
  await page.evaluate(() => window.GameActions.escape());
  await page.waitForSelector('#main-menu.show', { timeout });

  await showPanel('levelEditor', '#level-editor-panel');
  const editorText = await page.locator('#level-editor-panel').textContent();
  if (!editorText?.includes('关卡编辑器 V2')) throw new Error('Level editor panel did not render');
  if (!editorText?.includes('物体库')) throw new Error('Level editor palette did not render');
  if (!editorText?.includes('保存并退出')) throw new Error('Level editor save-and-exit action did not render');
  await closeActivePanel('#level-editor-panel');

  const debug = await page.evaluate(() => window.__streetRacerDebug || null);
  if (!debug || !debug.mode) throw new Error('Street Racer debug state was not published');

  if (errors.length) {
    throw new Error(errors.join('\n'));
  }

  console.log('Smoke test passed.');
} finally {
  await browser.close();
}
