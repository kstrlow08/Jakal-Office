import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { showTableDialog, installTableTools, tableErrorMessage, installTableExit } from '../studio/table-tools.ts';

function fixture(t) {
  const dom = new JSDOM('', { url: 'https://editor.test' });
  const previous = { document: globalThis.document, localStorage: globalThis.localStorage };
  globalThis.document = dom.window.document; globalThis.localStorage = dom.window.localStorage;
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  t.after(() => { dom.window.close(); for (const key in previous) { if (previous[key] === undefined) delete globalThis[key]; else globalThis[key] = previous[key]; } });
  const submit = dialog => dialog.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  return { dom, submit };
}

test('table dialog applies presets, remembers sizes and returns focus on apply or cancel', t => {
  const { dom, submit } = fixture(t);
  const calls = []; let focuses = 0;
  let dialog = showTableDialog('split', (...args) => calls.push(args), () => focuses++);
  assert.match(dialog.textContent, /칸 나누기/);
  assert.equal(document.activeElement.name, 'rows');
  dialog.querySelector('[data-rows="5"]').click();
  assert.match(dialog.querySelector('[role="status"]').textContent, /5줄 × 2칸 · 10셀/);
  submit(dialog);
  assert.deepEqual(calls, [[5, 2]]); assert.equal(focuses, 1); assert.equal(dialog.isConnected, false);
  dialog = showTableDialog('split', () => assert.fail('cancel must not apply'), () => focuses++);
  assert.equal(dialog.querySelector('[name="rows"]').value, '5');
  dialog.dispatchEvent(new dom.window.Event('cancel', { cancelable: true }));
  assert.equal(dialog.isConnected, false); assert.equal(focuses, 2);
});

test('a separate nested-table dialog shows an inset table and its own width', t => {
  const { dom, submit } = fixture(t), calls = [];
  const dialog = showTableDialog(true, (...args) => calls.push(args), () => {});
  assert.match(dialog.querySelector('h2').textContent, /표 안에 새 표/);
  assert.equal(dialog.querySelector('.jakal-table-presets').hidden, true);
  assert.equal(dialog.querySelector('.jakal-nested-preview').hidden, false);
  const width = dialog.querySelector('[name="width"]');
  assert.equal(width.value, '75'); width.value = '60'; width.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(dialog.querySelector('.jakal-nested-preview > div').style.width, '60%');
  submit(dialog); assert.deepEqual(calls, [[2, 2, 60]]);
});

test('invalid dimensions stay blocked and a failed insertion keeps the dialog and error visible', t => {
  const { dom, submit } = fixture(t);
  let calls = 0;
  const dialog = showTableDialog(true, () => { calls++; throw new Error('보호된 셀'); }, () => {});
  const rows = dialog.querySelector('[name="rows"]');
  rows.value = '0'; rows.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(dialog.querySelector('[type="submit"]').disabled, true);
  submit(dialog); assert.equal(calls, 0);
  rows.value = '2'; rows.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  submit(dialog);
  assert.equal(calls, 1); assert.equal(dialog.isConnected, true);
  assert.equal(dialog.querySelector('[role="alert"]').textContent, '보호된 셀');
});

test('the create command keeps a frozen cell path and uses one snapshot transaction', t => {
  const { submit } = fixture(t);
  const commands = new Map([['table:create', { id: 'table:create', label: '표 만들기' }]]);
  const registry = { get: id => commands.get(id), register: command => commands.set(command.id, command) };
  const position = { sectionIndex: 0, paragraphIndex: 0, charOffset: 3, parentParaIndex: 1, controlIndex: 0,
    cellIndex: 2, cellParaIndex: 0, cellPath: [{ controlIndex: 0, cellIndex: 2, cellParaIndex: 0 }] };
  const operations = [], inserted = [];
  const engine = { documentGeneration: 1, createNestedTable: (...args) => { inserted.push(args); return args[0]; } };
  const input = { cursor: { isInHeaderFooter: () => false, isInFootnote: () => false, isInTextBox: () => false },
    getCursorPosition: () => position, focus: () => {}, executeOperation: operation => { operations.push(operation); operation.operation(engine); } };
  installTableTools(registry, () => input);
  const context = { hasDocument: true, isEditable: true, inTable: true };
  assert.equal(commands.get('table:create').canExecute(context), true);
  assert.equal(commands.get('table:create').canExecute({ ...context, isEditable: false }), false);
  assert.equal(commands.get('table:create').canExecute({ ...context, inCellSelectionMode: true }), false);
  assert.equal(commands.get('table:parent-cell').canExecute(context), false);
  commands.get('table:create-nested').execute({ getInputHandler: () => input, wasm: engine });
  position.cellPath[0].cellIndex = 9;
  document.querySelector('.jakal-table-grid [data-rows="2"][data-cols="2"]').click();
  assert.equal(operations.length, 1); assert.equal(operations[0].kind, 'snapshot');
  assert.equal(inserted[0][0].cellPath[0].cellIndex, 2);
});

test('the former size picker now splits the selected cell without creating a table', t => {
  const { submit } = fixture(t);
  const commands = new Map([['table:create', { id: 'table:create' }], ['table:cell-split', { id: 'table:cell-split' }]]);
  const calls = [];
  const position = { sectionIndex: 0, paragraphIndex: 0, charOffset: 0, parentParaIndex: 1, controlIndex: 2, cellIndex: 3, cellParaIndex: 0 };
  const engine = { documentGeneration: 1, getCellInfo: () => ({ row: 1, col: 1 }),
    splitTableCellInto: (...args) => { calls.push(args); return { ok: true }; },
    createNestedTable: () => assert.fail('splitting a cell must not create a child table') };
  const input = { getCursorPosition: () => position, hasMultiCellSelection: () => false, focus() {},
    executeOperation: action => action.operation(engine) };
  installTableTools({ get: id => commands.get(id), register: command => commands.set(command.id, command) }, () => input);
  commands.get('table:cell-split').execute({ getInputHandler: () => input, wasm: engine });
  const dialog = document.querySelector('dialog');
  assert.equal(dialog.querySelector('h2').textContent, '칸 나누기');
  assert.equal(dialog.querySelector('.jakal-nested-width').hidden, true);
  dialog.querySelector('[data-rows="2"]').click(); submit(dialog);
  assert.deepEqual(calls, [[0, 1, 2, 1, 1, 2, 2, false, false]]);
});

test('a document replacement while the grid is open cannot insert into the new document', t => {
  fixture(t);
  const commands = new Map([['table:create', { id: 'table:create' }]]);
  let edits = 0;
  const engine = { documentGeneration: 4 };
  const input = { getCursorPosition: () => ({ sectionIndex: 0, paragraphIndex: 0, charOffset: 0 }), focus() {}, executeOperation() { edits++; } };
  installTableTools({ get: id => commands.get(id), register: command => commands.set(command.id, command) }, () => input);
  commands.get('table:create').execute({ getInputHandler: () => input, wasm: engine });
  engine.documentGeneration++;
  document.querySelector('.jakal-table-grid [data-rows="3"][data-cols="4"]').click();
  assert.equal(edits, 0);
  assert.match(document.querySelector('.jakal-picker-error').textContent, /문서가 바뀌었습니다/);
});
test('new body tables explicitly use inline document flow',t=>{
  fixture(t);const commands=new Map([['table:create',{id:'table:create'}]]);let created;
  const engine={documentGeneration:1,createTableEx:options=>{created=options;return{ok:true,paraIdx:0,controlIdx:0};}};
  const input={cursor:{isInHeaderFooter:()=>false,isInFootnote:()=>false,isInTextBox:()=>false},getCursorPosition:()=>({sectionIndex:0,paragraphIndex:0,charOffset:0}),focus(){},executeOperation:op=>op.operation(engine)};
  installTableTools({get:id=>commands.get(id),register:command=>commands.set(command.id,command)},()=>input);
  commands.get('table:create').execute({getInputHandler:()=>input,wasm:engine});document.querySelector('.jakal-table-grid [data-rows="2"][data-cols="3"]').click();
  assert.equal(created.treatAsChar,true);assert.equal(created.rowCount,2);assert.equal(created.colCount,3);
});

test('failed nested-table edits are reported instead of failing silently', () => {
  const commands = new Map([['table:create', { id: 'table:create' }], ['table:insert-row-below', { id: 'table:insert-row-below', execute: () => assert.fail('nested rows use the nested path') }]]);
  const reported = [];
  const position = { sectionIndex: 0, paragraphIndex: 0, charOffset: 0, parentParaIndex: 1, controlIndex: 0, cellIndex: 0, cellParaIndex: 1,
    cellPath: [{ controlIndex: 0, cellIndex: 0, cellParaIndex: 1 }, { controlIndex: 0, cellIndex: 0, cellParaIndex: 0 }] };
  let focused = 0;
  const input = { getCursorPosition: () => position, focus() { focused++; }, executeOperation: () => { throw new Error('렌더링 오류: 경로[0]: controls[0] 범위 초과'); } };
  installTableTools({ get: id => commands.get(id), register: command => commands.set(command.id, command) }, () => input, message => reported.push(message));
  commands.get('table:insert-row-below').execute({ getInputHandler: () => input });
  assert.deepEqual(reported, ['표를 편집하지 못했습니다. 표의 칸을 다시 클릭한 뒤 시도해 주세요.']);
  assert.equal(focused, 1);
  assert.equal(tableErrorMessage(new Error('보호된 셀에는 표를 넣을 수 없습니다.')), '보호된 셀에는 표를 넣을 수 없습니다.');
  // Without a reporter the error still reaches the dispatcher, which logs it.
  const silent = new Map([['table:create', { id: 'table:create' }], ['table:insert-row-below', { id: 'table:insert-row-below' }]]);
  installTableTools({ get: id => silent.get(id), register: command => silent.set(command.id, command) }, () => input);
  assert.throws(() => silent.get('table:insert-row-below').execute({ getInputHandler: () => input }), /범위 초과/);
});
test('ArrowDown in the last row of a body table moves to the paragraph after it', t => {
  const listeners = [], previous = globalThis.document;
  globalThis.document = { addEventListener: (type, run) => listeners.push({ type, run }) };
  t.after(() => { if (previous) globalThis.document = previous; else delete globalThis.document; });
  const textarea = {}, moves = [], queue = [];
  const cellAt = index => ({ sectionIndex: 0, paragraphIndex: 0, charOffset: 0, parentParaIndex: 1, controlIndex: 0, cellIndex: index, cellParaIndex: 0,
    cellPath: [{ controlIndex: 0, cellIndex: index, cellParaIndex: 0 }] });
  let position = cellAt(3);
  const input = { textarea, getCursorPosition: () => position, moveCursorTo: next => { moves.push(next); position = next; },
    cursor: { isInHeaderFooter: () => false, isInFootnote: () => false } };
  const bridge = { getCellInfo: (_s, _p, _c, index) => ({ row: index >= 2 ? 1 : 0, col: index % 2, rowSpan: 1 }),
    getTableDimensions: () => ({ rowCount: 2 }), getParagraphCount: () => 3 };
  installTableExit(() => input, () => bridge, run => queue.push(run));
  const key = (name, extra = {}) => listeners[0].run({ key: name, target: textarea, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, isComposing: false, ...extra });
  key('ArrowDown'); queue.shift()();
  assert.deepEqual(moves, [{ sectionIndex: 0, paragraphIndex: 2, charOffset: 0 }]);
  moves.length = 0; position = cellAt(1); key('ArrowDown'); queue.shift()();
  assert.deepEqual(moves, [], 'not the last row');
  position = cellAt(3); key('ArrowDown'); position = cellAt(2); queue.shift()();
  assert.deepEqual(moves, [], 'the engine already moved the caret');
  bridge.getParagraphCount = () => 2; position = cellAt(3); key('ArrowDown'); queue.shift()();
  assert.deepEqual(moves, [], 'no paragraph follows the table');
  key('ArrowDown', { target: {} }); key('ArrowDown', { shiftKey: true });
  position = { ...cellAt(3), cellPath: [{}, {}] }; key('ArrowDown');
  assert.equal(queue.length, 0, 'other inputs, selections and nested tables are left alone');
});
