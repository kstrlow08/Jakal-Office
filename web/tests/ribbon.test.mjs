import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { readFileSync, readdirSync } from 'node:fs';

const module = await build({ entryPoints: ['studio/ribbon.ts'], bundle: true, format: 'esm', platform: 'node', write: false });
const { installRibbon, ribbonTabs, STORAGE_KEY } = await import(`data:text/javascript;base64,${Buffer.from(module.outputFiles[0].text).toString('base64')}`);

const menus = ['file', 'edit', 'view', 'insert', 'format', 'page', 'table', 'security', 'review', 'tool'];
function fixture(t, { storage = new Map(), commands = [], saved, requestFrame, context = {} } = {}) {
  const html = `<header id="studio-header"><nav id="menu-bar">${menus.filter(name => !['security', 'review'].includes(name)).map(name => `<div class="menu-item" data-menu="${name}"><span class="menu-title">${name}</span><div class="menu-dropdown"></div></div>`).join('')}<button id="toolbox-basic-toggle"></button></nav><div id="icon-toolbar"><div class="tb-group tb-headerfooter-group" hidden></div></div><div id="style-bar"></div></header>`;
  const dom = new JSDOM(html);
  const previous = globalThis.document, previousMouseEvent = globalThis.MouseEvent;
  globalThis.document = dom.window.document; globalThis.MouseEvent = dom.window.MouseEvent;
  t.after(() => { dom.window.close(); if (previous) globalThis.document = previous; else delete globalThis.document;
    if (previousMouseEvent) globalThis.MouseEvent = previousMouseEvent; else delete globalThis.MouseEvent; });
  const definitions = new Map(commands.map(id => [id, { id }]));
  const enabled = new Set(commands);
  const calls = [], listeners = new Map(), opened = [], checked = [];
  // The runtime's MenuBar opens dropdowns from a mousedown listener on each title.
  for (const title of document.querySelectorAll('.menu-title')) title.addEventListener('mousedown', () => opened.push(title.parentElement.dataset.menu));
  const store = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  if (saved) storage.set(STORAGE_KEY, JSON.stringify(saved));
  const ribbon = installRibbon({ get: id => definitions.get(id) }, { dispatch: (id, params) => { calls.push([id, params]); return true; }, isEnabled: id => { checked.push(id); return enabled.has(id); } },
    { on: (event, listener) => listeners.set(event, listener) }, { storage: store, requestFrame, getContext: () => context });
  const mousedown = (target, init = {}) => target.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, ...init }));
  const title = name => document.querySelector(`.menu-item[data-menu="${name}"] > .menu-title`);
  return { dom, ribbon, calls, listeners, opened, storage, enabled, checked, mousedown, title, panel: document.getElementById('jakal-ribbon'),
    buttons: () => [...document.querySelectorAll('#jakal-ribbon [data-command]')].map(b => b.dataset.command) };
}

test('menu titles switch the ribbon instead of opening the dropdown', t => {
  const f = fixture(t, { commands: ['edit:undo', 'edit:find', 'view:zoom-in'] });
  assert.equal(f.ribbon.active, 'edit');
  assert.deepEqual(f.buttons(), ['edit:find']);
  assert.equal(document.querySelector('#style-bar [data-command="edit:undo"]').getAttribute('aria-label'), '실행 취소');
  assert.equal(f.title('edit').getAttribute('aria-selected'), 'true');
  assert.equal(f.mousedown(f.title('view')), false, 'default prevented so the editor keeps focus');
  assert.deepEqual(f.opened, [], 'the dropdown stays closed');
  assert.equal(f.ribbon.active, 'view');
  assert.deepEqual(f.buttons(), ['view:zoom-in']);
  assert(document.querySelector('#style-bar [data-command="edit:undo"]'), 'quick history stays available across tabs');
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
  assert.equal(bold.classList.contains('jakal-icon-command'), true, 'secondary commands use small pictograms');
  assert.equal(bold.textContent, '', 'secondary commands do not crowd the strip with text');
  assert.equal(bold.querySelector('svg').getAttribute('aria-hidden'), 'true');
  assert.equal(bold.getAttribute('aria-label'), '진하게');
  assert.equal(bold.title, '진하게');
  assert.equal(bold.closest('.jakal-ribbon-stack').childElementCount <= 3, true);
});

test('every ribbon entry names a command the editor or Office registers', () => {
  const ids = new Set(Object.values(ribbonTabs).flat().flatMap(group => group.items.map(([id]) => id)));
  for (const id of ids) assert.match(id, /^(file|edit|view|insert|format|page|table|tool|jakal):[a-z0-9-]+$/);
  assert.equal(Object.keys(ribbonTabs).join(','), menus.join(','));
  const upstream = '../build/rhwp-studio-source/rhwp-studio/src/command/commands';
  const source = readdirSync(upstream).filter(name => name.endsWith('.ts')).map(name => readFileSync(`${upstream}/${name}`, 'utf8')).join('\n') + '\n' + ['host-bridge.ts', 'table-tools.ts', 'object-layout.ts', 'font-catalog.ts', 'image-tools.ts'].map(name => readFileSync('studio/' + name, 'utf8')).join('\n');
  for (const id of ids) {
    assert(source.includes(`'${id}'`) || id === 'view:zoom-100', `Unregistered ribbon command ${id}`);
    assert(!source.includes(`stub('${id}'`), `Unimplemented command ${id}`);
  }
});

test('tabs reuse their buttons but refresh availability, and custom tabs dispatch real commands', t => {
  const f = fixture(t, { commands: ['edit:find', 'view:zoom-in', 'jakal:encrypted-download', 'jakal:compare'] });
  const find = document.querySelector('[data-command="edit:find"]');
  f.ribbon.select('view'); f.enabled.delete('edit:find'); f.ribbon.select('edit');
  assert.equal(document.querySelector('[data-command="edit:find"]'), find);
  assert.equal(find.disabled, true, 'cached DOM never caches stale command availability');
  assert.equal(f.title('security').nextElementSibling, null, 'custom tabs do not advertise a nonexistent dropdown');
  f.mousedown(f.title('security'));
  document.querySelector('[data-command="jakal:encrypted-download"]').click();
  assert.equal(f.calls.at(-1)[0], 'jakal:encrypted-download');
  f.ribbon.select('review'); document.querySelector('[data-command="jakal:compare"]').click();
  assert.equal(f.calls.at(-1)[0], 'jakal:compare');
});

test('bursts of document events share one frame and view toggles show the current state', t => {
  const frames = [], context = { showControlCodes: false };
  const f = fixture(t, { commands: ['edit:find', 'view:ctrl-mark'], context, requestFrame: run => frames.push(run) });
  f.ribbon.select('view'); f.checked.length = 0;
  context.showControlCodes = true;
  for (let n = 0; n < 10; n++) for (const event of ['selection-changed', 'document-view-changed', 'document-mutated']) f.listeners.get(event)();
  assert.equal(frames.length, 1); assert.equal(f.checked.length, 0);
  frames.shift()();
  assert.deepEqual(f.checked, ['view:ctrl-mark']);
  assert.equal(document.querySelector('[data-command="view:ctrl-mark"]').getAttribute('aria-pressed'), 'true');
});

test('does nothing without the runtime menu bar', t => {
  const dom = new JSDOM('<div></div>'); const previous = globalThis.document; globalThis.document = dom.window.document;
  t.after(() => { dom.window.close(); globalThis.document = previous; });
  assert.equal(installRibbon({ get: () => undefined }, { dispatch: () => true }, { on() {} }, { storage: null }), null);
});

test('every secondary action has a local SVG and a readable accessible name', t => {
  const ids = [...new Set(Object.values(ribbonTabs).flat().flatMap(group => group.items.map(([id]) => id)))];
  const f = fixture(t, { commands: ids });
  for (const name of Object.keys(ribbonTabs)) {
    f.ribbon.select(name);
    for (const button of f.panel.querySelectorAll('.jakal-icon-command')) {
      assert(button.querySelector('svg'), `Missing local vector for ${button.dataset.command}`);
      assert(button.getAttribute('aria-label')?.length, button.dataset.command);
      assert.equal([...button.childNodes].filter(node=>node.nodeType===3).map(node=>node.textContent).join('').trim(), '', 'names stay in tooltips; concise SVG glyphs remain part of their icon');
    }
  }
});
