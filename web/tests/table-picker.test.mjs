import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { showTablePicker } from '../studio/table-picker.ts';

function fixture(t) {
  const dom = new JSDOM('<button id="anchor">표</button>'); const previous = globalThis.document; globalThis.document = dom.window.document;
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  t.after(() => { dom.window.close(); if (previous) globalThis.document = previous; else delete globalThis.document; });
  const calls = []; let closed = 0, advanced = 0;
  const anchor = document.getElementById('anchor');
  const picker = showTablePicker({ anchor, onApply: (rows, cols) => calls.push([rows, cols]), onClose: () => closed++, onAdvanced: () => advanced++ });
  return { dom, picker, anchor, calls, closed: () => closed, advanced: () => advanced, cell: (row, col) => picker.querySelector(`[data-rows="${row}"][data-cols="${col}"]`) };
}

test('grid previews a rectangle without editing and commits the clicked dimensions once', t => {
  const f = fixture(t);
  assert.equal(f.picker.querySelectorAll('[role="gridcell"]').length, 144);
  assert.equal(f.anchor.getAttribute('aria-expanded'), 'true');
  f.cell(3, 4).dispatchEvent(new f.dom.window.Event('pointerover', { bubbles: true }));
  assert.equal(f.picker.querySelector('[role="status"]').textContent, '3줄 × 4칸');
  assert.equal(f.picker.querySelectorAll('[aria-selected="true"]').length, 12);
  assert.deepEqual(f.calls, []);
  f.cell(3, 4).click(); f.cell(3, 4).click();
  assert.deepEqual(f.calls, [[3, 4]]); assert.equal(f.closed(), 1); assert.equal(f.picker.isConnected, false);
  assert.equal(f.anchor.getAttribute('aria-expanded'), 'false');
});

test('keyboard navigation keeps one grid stop and clamps dimensions at its edges', t => {
  const f = fixture(t);
  const key = value => document.activeElement.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
  key('ArrowRight'); key('ArrowRight'); key('ArrowDown');
  assert.equal(document.activeElement, f.cell(2, 3));
  assert.equal(f.picker.querySelectorAll('[role="gridcell"][tabindex="0"]').length, 1);
  key('End'); key('ArrowRight'); assert.equal(document.activeElement, f.cell(2, 12));
  key('Home'); assert.equal(document.activeElement, f.cell(2, 1));
  f.picker.dispatchEvent(new f.dom.window.Event('cancel', { cancelable: true }));
  assert.deepEqual(f.calls, []); assert.equal(f.closed(), 1);
});

test('advanced input dismisses the grid without insertion or an intermediate editor focus', t => {
  const f = fixture(t);
  f.picker.querySelector('.jakal-picker-advanced').click();
  assert.equal(f.picker.isConnected, false); assert.equal(f.advanced(), 1);
  assert.deepEqual(f.calls, []); assert.equal(f.closed(), 0);
});

test('an invalidated insertion leaves an error and can still be cancelled', t => {
  const f = fixture(t); f.picker.querySelector('.jakal-picker-header button').click();
  const picker = showTablePicker({ onApply: () => { throw new Error('문서가 바뀌었습니다.'); }, onAdvanced() {}, onClose() {} });
  picker.querySelector('[data-rows="2"][data-cols="2"]').click();
  assert.equal(picker.isConnected, true); assert.equal(picker.querySelector('[role="alert"]').textContent, '문서가 바뀌었습니다.');
  picker.dispatchEvent(new f.dom.window.MouseEvent('click', { bubbles: true })); assert.equal(picker.isConnected, false);
});
