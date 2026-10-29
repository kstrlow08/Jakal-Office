import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import { JSDOM } from 'jsdom';
import { useLineCaretDuringComposition } from '../studio/line-caret-policy.mjs';

const base = new URL('../../build/rhwp-studio-source/rhwp-studio/src/engine/', import.meta.url);
const inputSource = await readFile(new URL('input-handler.ts', base), 'utf8');
const patched = useLineCaretDuringComposition(inputSource);
const start = patched.indexOf('  private updateCaret(');
const end = patched.indexOf('\n  /** 빈 누름틀 끝', start);
assert(start >= 0 && end > start);
const handlerCode = await transform(`export class Handler { ${patched.slice(start, end)} }`, {loader:'ts',format:'esm'});
const caretCode = await transform(await readFile(new URL('caret-renderer.ts', base),'utf8'), {loader:'ts',format:'esm'});
const {Handler} = await import(`data:text/javascript;base64,${Buffer.from(handlerCode.code).toString('base64')}`);
const {CaretRenderer} = await import(`data:text/javascript;base64,${Buffer.from(caretCode.code).toString('base64')}`);

function fixture(t, rect, composing = true) {
  const dom = new JSDOM('<div id="view"><div id="scroll-content"><span id="glyph">한</span></div></div>');
  const previous = {document:globalThis.document,window:globalThis.window,clearInterval:globalThis.clearInterval};
  globalThis.document = dom.window.document; globalThis.window = dom.window;
  const timers = new Map(); let serial = 0;
  dom.window.setInterval = run => { timers.set(++serial,run); return serial; };
  globalThis.clearInterval = id => timers.delete(id);
  const view = {getPageOffset:()=>100,getPageLeftResolved:()=>30};
  const caret = new CaretRenderer(document.getElementById('view'),view);
  const handler = new Handler(), scroll = [], events = [];
  Object.assign(handler, {isComposing:composing,compositionAnchor:{charOffset:0},compositionLength:1,
    cursor:{getRect:()=>rect},viewportManager:{getZoom:()=>2},caret,
    adjustExitedFieldEndCaretRect:rect=>rect,scrollCaretIntoView:rect=>scroll.push(rect),
    updateSelection(){},emitCursorFormatState(){},updateFieldMarkers(){},eventBus:{emit:(...args)=>events.push(args)},
    wasm:new Proxy({}, {get(){throw new Error('Composition anchor lookup must not run');}})});
  t.after(()=>{caret.dispose();dom.window.close();for(const [name,value] of Object.entries(previous)){if(value===undefined)delete globalThis[name];else globalThis[name]=value;}});
  return {handler,caret,timers,scroll,events,line:document.querySelector('.caret'),box:document.querySelector('.caret-composition'),glyph:document.getElementById('glyph')};
}

test('IME composition blinks only the thin line at the actual cursor; glyphs stay visible', t => {
  const rect = {pageIndex:0,x:120,y:40,height:18};
  const f = fixture(t, rect);
  f.handler.updateCaret();
  assert.equal(f.line.style.width,'2px'); assert.equal(f.line.style.display,'block');
  assert.equal(f.line.style.left,'270px'); assert.equal(f.line.style.top,'180px');
  assert.equal(f.box.style.display,'none'); assert.equal(f.box.textContent,'');
  const blink = [...f.timers.values()][0];
  blink(); assert.equal(f.line.style.opacity,'0');
  assert.equal(f.glyph.textContent,'한'); assert.equal(f.glyph.style.opacity,'');
  blink(); assert.equal(f.line.style.opacity,'1'); assert.equal(f.box.style.display,'none');
  assert.deepEqual(f.scroll,[rect]);
});

test('wrapped and nested-cell input keeps the caret inside the real destination cell', t => {
  const rect = {pageIndex:3,x:100,y:200,height:40,cellBounds:{x:10,y:20,w:30,h:15}};
  const f = fixture(t,rect);
  f.handler.updateCaret(true);
  assert.equal(f.line.style.left,'108px'); assert.equal(f.line.style.top,'140px');
  assert.equal(f.line.style.height,'30px'); assert.equal(f.box.style.display,'none');
  assert.deepEqual(f.scroll,[]);
  f.handler.isComposing = false;
  f.handler.updateCaret();
  assert.equal(f.line.style.display,'block'); assert.equal(f.timers.size,1);
});

test('unexpected upstream caret structure stops the build instead of silently retaining block IME', () => {
  assert.throws(()=>useLineCaretDuringComposition(inputSource.replace('this.caret.showComposition(', 'this.caret.newComposition(')), /Pinned composition/);
});
