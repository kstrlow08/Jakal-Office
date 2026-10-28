import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const module = await build({ entryPoints: ['studio/ribbon.ts'], bundle: true, format: 'esm', platform: 'node', write: false });
const { installRibbon, ribbonTabs, STORAGE_KEY } = await import(`data:text/javascript;base64,${Buffer.from(module.outputFiles[0].text).toString('base64')}`);

const menus = ['file', 'edit', 'view', 'insert', 'format', 'page', 'table', 'tool'];
function fixture(t, { storage = new Map(), commands = [], saved } = {}) {
  const html = `<header id="studio-header"><nav id="menu-bar">${menus.map(name => `<div class="menu-item" data-menu="${name}"><span class="menu-title">${name}</span><div class="menu-dropdown"></div></div>`).join('')}<button id="toolbox-basic-toggle"></button></nav><div id="icon-toolbar"><div class="tb-group tb-headerfooter-group" hidden></div></div><div id="style-bar"></div></header>`;
  const dom = new JSDOM(html);
  const previous = globalThis.document; globalThis.document = dom.window.document;
  t.after(() => { dom.window.close(); if (previous) globalThis.document = previous; else delete globalThis.document; });
  const definitions = new Map(commands.map(id => [id, { id }]));
  const enabled = new Set(commands);
  const calls = [], listeners = new Map(), opened = [];
  // The runtime's MenuBar opens dropdowns from a mousedown listener on each title.
  for (const title of document.querySelectorAll('.menu-title')) title.addEventListener('mousedown', () => opened.push(title.parentElement.dataset.menu));
  const store = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  if (saved) storage.set(STORAGE_KEY, JSON.stringify(saved));
  const ribbon = installRibbon({ get: id => definitions.get(id) }, { dispatch: (id, params) => { calls.push([id, params]); return true; }, isEnabled: id => enabled.has(id) },
    { on: (event, listener) => listeners.set(event, listener) }, { storage: store });
  const mousedown = (target, init = {}) => target.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, ...init }));
  const title = name => document.querySelector(`.menu-item[data-menu="${name}"] > .menu-title`);
  return { dom, ribbon, calls, listeners, opened, storage, enabled, mousedown, title, panel: document.getElementById('jakal-ribbon'),
    buttons: () => [...document.querySelectorAll('#jakal-ribbon [data-command]')].map(b => b.dataset.command) };
}

test('menu titles switch the ribbon instead of opening the dropdown', t => {
  const f = fixture(t, { commands: ['edit:undo', 'edit:find', 'view:zoom-in', 'page:setup'] });
  assert.equal(f.ribbon.active, 'edit');
  assert.deepEqual(f.buttons(), ['edit:undo', 'edit:find']);
  assert.equal(f.title('edit').getAttribute('aria-selected'), 'true');
  assert.equal(f.mousedown(f.title('view')), false, 'default prevented so the editor keeps focus');
  assert.deepEqual(f.opened, [], 'the dropdown stays closed');
  assert.equal(f.ribbon.active, 'view');
  assert.deepEqual(f.buttons(), ['view:zoom-in']);
  assert.deepEqual(JSON.parse(f.storage.get(STORAGE_KEY)), { tab: 'view', collapsed: false });
});

test('the arrow next to a title still opens the native dropdown', t => {
  const f = fixture(t, { commands: ['edit:undo'] });
  f.mousedown(document.querySelector('.menu-item[data-menu="file"] > .jakal-menu-arrow'));
  assert.deepEqual(f.opened, ['file']);
  assert.equal(f.ribbon.active, 'edit', 'opening a menu does not change the tab');
});

test('double-clicking empty tab space collapses and restores the strip', t => {
  const f = fixture(t, { commands: ['edit:undo'] });
  const menu = document.getElementById('menu-bar');
  const dblclick = target => target.dispatchEvent(new f.dom.window.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  dblclick(menu);
  assert.equal(f.ribbon.collapsed, true); assert.equal(f.panel.hidden, true);
  assert.equal(document.getElementById('studio-header').classList.contains('jakal-ribbon-collapsed'), true);
  assert.deepEqual(JSON.parse(f.storage.get(STORAGE_KEY)), { tab: 'edit', collapsed: true });
  dblclick(f.title('edit'));
  assert.equal(f.ribbon.collapsed, true, 'double-clicking a tab itself is not the empty area');
  f.mousedown(f.title('view'));
  assert.equal(f.ribbon.collapsed, false, 'choosing a tab brings the strip back');
  document.querySelector('.jakal-ribbon-toggle').click();
  assert.equal(f.ribbon.collapsed, true);
});

test('saved tab and collapsed state are restored, unknown tabs fall back', t => {
  const f = fixture(t, { commands: ['page:setup'], saved: { tab: 'page', collapsed: true } });
  assert.equal(f.ribbon.active, 'page'); assert.equal(f.ribbon.collapsed, true);
  const g = fixture(t, { commands: ['edit:undo'], saved: { tab: 'nope', collapsed: 'yes' } });
  assert.equal(g.ribbon.active, 'edit'); assert.equal(g.ribbon.collapsed, false);
});

test('buttons dispatch through the runtime and mirror enabled state', t => {
  const f = fixture(t, { commands: ['edit:undo', 'edit:redo', 'format:bold'] });
  const undo = document.querySelector('[data-command="edit:undo"]');
  assert.equal(undo.classList.contains('tb-btn'), true, 'icon items use the runtime toolbar look');
  assert.equal(document.querySelector('[data-command="format:bold"]'), null, 'other tabs render on demand');
  f.enabled.delete('edit:redo'); f.listeners.get('command-state-changed')();
  assert.equal(document.querySelector('[data-command="edit:redo"]').disabled, true);
  assert.equal(undo.disabled, false);
  undo.click();
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0][0], 'edit:undo'); assert.equal(f.calls[0][1].anchorEl, undo);
  assert.equal(f.mousedown(undo), false, 'tool clicks keep the document selection');
  f.ribbon.select('format');
  const bold = document.querySelector('[data-command="format:bold"]');
  assert.equal(bold.classList.contains('jakal-ribbon-small'), true, 'icon-less items are small text buttons');
  assert.equal(bold.closest('.jakal-ribbon-stack').childElementCount <= 3, true);
});

test('every ribbon entry names a command the editor or Office registers', () => {
  const ids = new Set(Object.values(ribbonTabs).flat().flatMap(group => group.items.map(([id]) => id)));
  for (const id of ids) assert.match(id, /^(file|edit|view|insert|format|page|table|tool|jakal):[a-z0-9-]+$/);
  assert.equal(Object.keys(ribbonTabs).join(','), menus.join(','));
});

test('does nothing without the runtime menu bar', t => {
  const dom = new JSDOM('<div></div>'); const previous = globalThis.document; globalThis.document = dom.window.document;
  t.after(() => { dom.window.close(); globalThis.document = previous; });
  assert.equal(installRibbon({ get: () => undefined }, { dispatch: () => true }, { on() {} }, { storage: null }), null);
});
