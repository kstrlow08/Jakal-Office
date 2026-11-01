import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const module=await build({entryPoints:['studio/surface-icons.ts'],bundle:true,format:'esm',platform:'node',write:false});
const {installSurfaceIcons,decorateCommandSurface}=await import('data:text/javascript;base64,'+Buffer.from(module.outputFiles[0].text).toString('base64'));
function fixture(t){
  const dom=new JSDOM('<nav id="menu-bar"><div class="menu-dropdown"><div class="md-item" data-cmd="edit:copy"><span class="md-icon icon-copy"></span>복사<span class="md-shortcut">Ctrl+C</span></div><div class="md-item disabled" data-cmd="edit:cut">잘라내기</div><div class="md-item" data-cmd="edit:paste">붙여넣기</div></div></nav><main id="pages"></main>');
  const previous=globalThis.document;globalThis.document=dom.window.document;
  t.after(()=>{dom.window.close();globalThis.document=previous;});
  return {dom,doc:dom.window.document};
}
test('menus retain labels, shortcuts, disabled state and dispatch while replacing sprites once',t=>{
  const {doc}=fixture(t);const menu=doc.getElementById('menu-bar');decorateCommandSurface(menu);decorateCommandSurface(menu);
  const row=menu.querySelector('[data-cmd="edit:copy"]');
  assert.equal(row.textContent,'복사Ctrl+C');assert.equal(row.querySelectorAll('svg').length,1);assert.equal(row.querySelector('.md-icon'),null);
  assert.equal(row.querySelector('svg').getAttribute('data-icon-provider'),'octicons');
  assert.equal(menu.querySelector('[data-cmd="edit:cut"]').getAttribute('aria-disabled'),'true');
  let calls=0;row.addEventListener('click',()=>calls++);row.querySelector('path').dispatchEvent(new doc.defaultView.MouseEvent('click',{bubbles:true}));assert.equal(calls,1);
});
test('new floating dialogs are decorated without watching document text mutations',async t=>{
  const {doc}=fixture(t);const stop=installSurfaceIcons(doc);
  const dialog=doc.createElement('dialog');dialog.innerHTML='<button>확인</button><button>설정(D)</button><button class="dialog-close">×</button><button class="cs-icon-btn" title="굵게">가</button>';doc.body.append(dialog);
  await Promise.resolve();assert.equal(dialog.querySelectorAll('svg').length,4);
  assert.equal(dialog.querySelector('.dialog-close').getAttribute('aria-label'),'닫기');
  assert.equal(dialog.querySelector('.cs-icon-btn').getAttribute('aria-label'),'굵게');
  const pages=doc.getElementById('pages');pages.innerHTML='<button class="dialog-btn">확인</button>';
  await Promise.resolve();assert.equal(pages.querySelector('svg'),null,'document subtree is never observed');stop();
});
test('keyboard menu movement skips disabled entries and Enter activates the focused command',t=>{
  const {doc,dom}=fixture(t);const stop=installSurfaceIcons(doc);const rows=[...doc.querySelectorAll('.md-item')];
  rows.forEach(row=>row.getClientRects=()=>[{width:50,height:20}]);rows[0].focus();
  rows[0].dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));assert.equal(doc.activeElement,rows[2]);
  let calls=0;rows[2].onclick=()=>calls++;rows[2].dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert.equal(calls,1);stop();
});
