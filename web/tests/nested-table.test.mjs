import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { HwpDocument, initSync } from '@rhwp/core';
import { insertNestedTable, parentTableCell, editNestedTable, insertCellPicture, insertCellEquation, ensureTrailingParagraph } from '../studio/nested-table.ts';
import { deflateSync } from 'node:zlib';
import { mathDocument } from './document-fixtures.mjs';

initSync({ module: fs.readFileSync(new URL('../node_modules/@rhwp/core/rhwp_bg.wasm', import.meta.url)) });
const source = fs.readFileSync(new URL('../public/sample.hwpx', import.meta.url));
function fixture(t) {
  const doc = new HwpDocument(source);
  t.after(() => doc.free());
  const paragraph = doc.getParagraphCount(0) - 1;
  const table = JSON.parse(doc.createTable(0, paragraph, doc.getParagraphLength(0, paragraph), 2, 2));
  assert.equal(table.ok, true);
  const position = { sectionIndex: 0, paragraphIndex: 0, charOffset: 0,
    parentParaIndex: table.paraIdx, controlIndex: table.controlIdx, cellIndex: 0, cellParaIndex: 0 };
  return { doc, position };
}
function dimensions(doc, position) {
  return JSON.parse(doc.getTableDimensionsByPath(position.sectionIndex, position.parentParaIndex, JSON.stringify(position.cellPath)));
}
function exportBytes(doc) {
  const artifact = doc.exportHwpxWithReport();
  try {
    assert.equal(JSON.parse(artifact.contentLoss()).count, 0);
    return artifact.takeBytes();
  } finally { artifact.free(); }
}

test('nested tables fit the cell, accept text, persist across export, undo and redo', t => {
  const { doc, position } = fixture(t);
  doc.insertTextInCell(0, position.parentParaIndex, position.controlIndex, 0, 0, 0, '앞😀뒤');
  position.charOffset = 2;
  const count = doc.getParagraphCount(0), before = doc.saveSnapshot(), beforeBytes = exportBytes(doc);
  const cursor = insertNestedTable(doc, position, 2, 3);
  assert.equal(doc.getTextInCell(0, position.parentParaIndex, position.controlIndex, 0, 0, 0, 20), '앞😀');
  assert.equal(doc.getTextInCell(0, position.parentParaIndex, position.controlIndex, 0, 2, 0, 20), '뒤');
  assert.deepEqual(dimensions(doc, cursor), { rowCount: 2, colCount: 3, cellCount: 6 });
  assert.equal(doc.getParagraphCount(0), count, 'scratch paragraphs are removed');
  assert.equal(doc.hasInternalClipboard(), false);
  doc.insertTextInCellByPath(0, cursor.parentParaIndex, JSON.stringify(cursor.cellPath), 0, '안쪽 셀😀');
  const third = insertNestedTable(doc, cursor, 1, 2);
  assert.equal(third.cellPath.length, 3);
  assert.equal(dimensions(doc, third).colCount, 2);
  const bytes = exportBytes(doc), after = doc.saveSnapshot();
  const reloaded = new HwpDocument(bytes);
  try {
    assert.equal(dimensions(reloaded, third).colCount, 2);
    const inner = JSON.parse(reloaded.getCellPropertiesByPath(0, cursor.parentParaIndex, JSON.stringify(cursor.cellPath), 0));
    const outer = JSON.parse(reloaded.getCellProperties(0, position.parentParaIndex, position.controlIndex, 0));
    assert.ok(inner.width * 3 < (outer.width - outer.paddingLeft - outer.paddingRight) * .8,
      'a separate inner table leaves visible space inside its parent cell');
    assert.ok(reloaded.getControls().includes('tbl'));
  } finally { reloaded.free(); }
  doc.restoreSnapshot(before);
  assert.deepEqual(exportBytes(doc), beforeBytes);
  doc.restoreSnapshot(after);
  assert.deepEqual(exportBytes(doc), bytes);
  doc.discardSnapshot(before); doc.discardSnapshot(after);
});

test('cell split/merge changes the existing grid, while nested insertion adds a separate table', t => {
  const { doc, position } = fixture(t);
  const count = () => JSON.parse(doc.getControls()).filter(control => control.ctrlId === 'tbl').length;
  const before = count(), args = [0, position.parentParaIndex, position.controlIndex];
  doc.splitTableCellInto(...args, 0, 0, 1, 2, false, false);
  assert.equal(count(), before);
  assert.equal(JSON.parse(doc.getTableDimensions(...args)).cellCount, 5);
  doc.mergeTableCells(...args, 0, 0, 0, 1);
  assert.equal(count(), before);
  assert.equal(JSON.parse(doc.getTableDimensions(...args)).cellCount, 4);
  const grid = doc.getTableDimensions(...args);
  let inner = insertNestedTable(doc, position, 2, 2, { widthPercent: 60 });
  assert.equal(count(), before + 1);
  assert.equal(doc.getTableDimensions(...args), grid);
  const layouts = JSON.parse(doc.getPageControlLayout(0)).controls.filter(control => control.type === 'table');
  const child = layouts.at(-1), parent = layouts.find(control => control.paraIdx === position.parentParaIndex && control.controlIdx === position.controlIndex);
  const cell = parent.cells[0];
  assert.ok(child.y >= cell.y && child.y + child.h <= cell.y + cell.h,
    'the inserted table is visible inside its parent immediately, before saving or reloading');
  inner = editNestedTable(doc, inner, 'splitCells', { rows: 1, cols: 2 });
  assert.equal(dimensions(doc, inner).cellCount, 5);
  assert.equal(count(), before + 1);
  inner = editNestedTable(doc, inner, 'mergeCells', { range: { startRow: 0, startCol: 0, endRow: 0, endCol: 1 } });
  assert.equal(dimensions(doc, inner).cellCount, 4);
  assert.equal(doc.getTableDimensions(...args), grid);
  exportBytes(doc);
});

test('inserting a table preserves a rich internal copy buffer', t => {
  const { doc, position } = fixture(t);
  doc.copyControl(0, position.parentParaIndex, '', position.controlIndex);
  const text = doc.getClipboardText();
  insertNestedTable(doc, position, 2, 2);
  assert.equal(doc.getClipboardText(), text);
  assert.equal(doc.clipboardHasControl(), true);
  doc.pasteInternalInCell(0, position.parentParaIndex, position.controlIndex, 1, 0, 0);
  const path = [{ controlIndex: position.controlIndex, cellIndex: 1, cellParaIndex: 0 }, { controlIndex: 0, cellIndex: 0, cellParaIndex: 0 }];
  assert.equal(JSON.parse(doc.getTableDimensionsByPath(0, position.parentParaIndex, JSON.stringify(path))).cellCount, 4);
  exportBytes(doc);
});
test('row and column edits apply to the inner table and preserve the outer grid', t => {
  const { doc, position } = fixture(t);
  let inner = insertNestedTable(doc, position, 2, 2);
  doc.insertTextInCellByPath(0, inner.parentParaIndex, JSON.stringify(inner.cellPath), 0, '행열 유지😀');
  doc.copyControl(0, position.parentParaIndex, '', position.controlIndex);
  const clipboard = doc.getClipboardText(), originalCount = doc.getParagraphCount(0);
  for (const operation of ['insertRowAbove', 'insertRowBelow', 'insertColLeft', 'insertColRight', 'deleteRow', 'deleteCol']) {
    inner = editNestedTable(doc, inner, operation);
  }
  assert.equal(dimensions(doc, inner).rowCount, 3);
  assert.equal(dimensions(doc, inner).colCount, 3);
  const moved = inner.cellPath.map(entry => ({ ...entry })); moved.at(-1).cellIndex = 4;
  assert.equal(doc.getTextInCellByPath(0, inner.parentParaIndex, JSON.stringify(moved), 0, 50), '행열 유지😀');
  assert.equal(doc.getClipboardText(), clipboard);
  assert.equal(doc.getParagraphCount(0), originalCount);
  assert.deepEqual(JSON.parse(doc.getTableDimensions(0, position.parentParaIndex, position.controlIndex)), { rowCount: 2, colCount: 2, cellCount: 4 });
  exportBytes(doc);
});

test('invalid sizes do not mutate the document and leaving a nested table keeps its parent path', t => {
  const { doc, position } = fixture(t);
  const before = exportBytes(doc);
  for (const [rows, cols] of [[0, 2], [2, -1], [NaN, 2], [1.5, 2], [100, 100]]) {
    assert.throws(() => insertNestedTable(doc, position, rows, cols));
  }
  assert.deepEqual(exportBytes(doc), before);
  const inner = insertNestedTable(doc, position, 1, 1);
  const parent = parentTableCell(inner);
  assert.equal(parent.cellPath.length, 1);
  assert.equal(parent.parentParaIndex, position.parentParaIndex);
  assert.equal(parent.cellPath[0].cellParaIndex, 1);
  assert.throws(() => parentTableCell(position));
});

test('deleting the last inner row is rejected without changing either table', t => {
  const { doc, position } = fixture(t);
  const inner = insertNestedTable(doc, position, 1, 1);
  assert.throws(() => editNestedTable(doc, inner, 'deleteRow'));
  assert.equal(dimensions(doc, inner).cellCount, 1);
  assert.equal(JSON.parse(doc.getTableDimensions(0, position.parentParaIndex, position.controlIndex)).cellCount, 4);
  exportBytes(doc);
});

test('nested edits in the second section resolve the right parent table', t => {
  const doc = mathDocument({ secondSection: true });
  t.after(() => doc.free());
  const paragraph = doc.getParagraphCount(1) - 1;
  const table = JSON.parse(doc.createTable(1, paragraph, doc.getParagraphLength(1, paragraph), 2, 2));
  const position = { sectionIndex: 1, paragraphIndex: 0, charOffset: 0, parentParaIndex: table.paraIdx,
    controlIndex: table.controlIdx, cellIndex: 0, cellParaIndex: 0 };
  let inner = insertNestedTable(doc, position, 2, 2);
  inner = editNestedTable(doc, inner, 'insertRowBelow');
  assert.equal(dimensions(doc, inner).rowCount, 3);
  assert.equal(JSON.parse(doc.getTableDimensions(1, table.paraIdx, table.controlIdx)).rowCount, 2);
  exportBytes(doc);
});

test('multiline text copy buffers survive insertion and failures can be rolled back without leaked paragraphs', t => {
  const { doc, position } = fixture(t);
  const last = doc.getParagraphCount(0) - 1;
  doc.insertText(0, last, 0, '복사😀');
  const split = JSON.parse(doc.splitParagraph(0, last, doc.getParagraphLength(0, last)));
  doc.insertText(0, split.paraIdx, 0, '둘째 줄');
  doc.copySelection(0, last, 0, split.paraIdx, doc.getParagraphLength(0, split.paraIdx));
  const copied = doc.getClipboardText();
  insertNestedTable(doc, position, 1, 2);
  assert.equal(doc.getClipboardText(), copied);
  const before = exportBytes(doc), snapshot = doc.saveSnapshot(), count = doc.getParagraphCount(0);
  const failing = new Proxy(doc, { get(target, name) {
    if (name === 'pasteInternalInCellByPath') return () => '{"ok":false}';
    const member = target[name]; return typeof member === 'function' ? member.bind(target) : member;
  } });
  assert.throws(() => insertNestedTable(failing, position, 1, 1));
  assert.equal(doc.getClipboardText(), copied);
  assert.equal(doc.getParagraphCount(0), count);
  doc.restoreSnapshot(snapshot); doc.discardSnapshot(snapshot);
  assert.deepEqual(exportBytes(doc), before);
});

// A table that is the only content of the final paragraph sits at text offset 0,
// so splitting that paragraph "at its end" used to move the table into the
// scratch area. This is the default state right after inserting a table into a
// new document.
function lastParagraphTable(t, rows = 2, cols = 2) {
  const doc = new HwpDocument(source);
  t.after(() => doc.free());
  const appended = JSON.parse(doc.insertParagraph(0, doc.getParagraphCount(0)));
  assert.equal(appended.ok, true);
  const table = JSON.parse(doc.createTableEx(JSON.stringify({ sectionIdx: 0, paraIdx: appended.paraIdx, charOffset: 0, rowCount: rows, colCount: cols, treatAsChar: true })));
  assert.equal(table.ok, true);
  assert.equal(table.paraIdx, doc.getParagraphCount(0) - 1);
  return { doc, table, position: { sectionIndex: 0, paragraphIndex: 0, charOffset: 0, parentParaIndex: table.paraIdx,
    controlIndex: table.controlIdx, cellIndex: 0, cellParaIndex: 0 } };
}
function tableCount(doc) { return JSON.parse(doc.getControls()).filter(control => control.ctrlId === 'tbl').length; }
function solidPng(width, height) {
  const crc = buffer => { let c = ~0; for (const byte of buffer) { c ^= byte; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } return ~c >>> 0; };
  const chunk = (type, data) => { const body = Buffer.concat([Buffer.from(type), data]); const out = Buffer.alloc(body.length + 8); out.writeUInt32BE(data.length); body.copy(out, 4); out.writeUInt32BE(crc(body), body.length + 4); return out; };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const rows = Buffer.alloc((width * 3 + 1) * height, 0x80); for (let y = 0; y < height; y++) rows[y * (width * 3 + 1)] = 0;
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]));
}
const picture = { bytes: solidPng(16, 8), width: 1200, height: 600, naturalWidth: 16, naturalHeight: 8, extension: 'png', description: '그림입니다.' };

test('a nested table can be added to a table that is the last paragraph of the section', t => {
  const { doc, position } = lastParagraphTable(t);
  const count = doc.getParagraphCount(0), tables = tableCount(doc);
  const inner = insertNestedTable(doc, position, 2, 2);
  assert.equal(tableCount(doc), tables + 1, 'the outer table stays in the document');
  assert.equal(doc.getParagraphCount(0), count, 'scratch paragraphs are removed');
  assert.deepEqual(dimensions(doc, inner), { rowCount: 2, colCount: 2, cellCount: 4 });
  const row = editNestedTable(doc, inner, 'insertRowBelow');
  assert.equal(dimensions(doc, row).rowCount, 3);
  const reopened = new HwpDocument(exportBytes(doc));
  t.after(() => reopened.free());
  assert.equal(tableCount(reopened), tables + 1);
});

test('pictures inserted into a cell stay inline inside that cell and survive export', t => {
  const { doc, position, table } = lastParagraphTable(t);
  doc.insertTextInCell(0, table.paraIdx, table.controlIdx, 1, 0, 0, '앞뒤');
  const count = doc.getParagraphCount(0);
  const cell = { ...position, cellIndex: 1, charOffset: 1 };
  const cursor = insertCellPicture(doc, cell, picture);
  const path = JSON.stringify([{ controlIndex: table.controlIdx, cellIndex: 1, cellParaIndex: 0 }]);
  const props = JSON.parse(doc.getCellPicturePropertiesByPath(0, table.paraIdx, path, 0));
  assert.equal(props.treatAsChar, true);
  assert.equal(props.width, 1200);
  assert.equal(doc.getTextInCell(0, table.paraIdx, table.controlIdx, 1, 0, 0, 10), '앞뒤', 'surrounding text is kept');
  assert.equal(cursor.cellPath.at(-1).cellIndex, 1);
  assert.equal(cursor.charOffset, 2, 'the caret lands after the picture, not before it');
  const before = JSON.parse(doc.getCursorRectInCell(0, table.paraIdx, table.controlIdx, 1, 0, 1));
  const after = JSON.parse(doc.getCursorRectInCell(0, table.paraIdx, table.controlIdx, 1, 0, 2));
  assert.ok(after.x - before.x >= 15, 'the picture sits between offsets 1 and 2');
  assert.equal(doc.getParagraphCount(0), count, 'no floating sibling or scratch paragraph is left in the body');
  const bodyPictures = JSON.parse(doc.getControls()).filter(control => control.ctrlId === 'gso' && control.list === 0);
  assert.equal(bodyPictures.length, 0);
  // Wide pictures get their own cell paragraph, keeping text on both sides.
  doc.insertTextInCell(0, table.paraIdx, table.controlIdx, 2, 0, 0, '가나다');
  const wide = insertCellPicture(doc, { ...position, cellIndex: 2, charOffset: 2 }, { ...picture, ownParagraph: true });
  const widePath = [{ controlIndex: table.controlIdx, cellIndex: 2, cellParaIndex: 0 }];
  assert.equal(doc.getCellParagraphCountByPath(0, table.paraIdx, JSON.stringify(widePath)), 3);
  assert.equal(doc.getTextInCell(0, table.paraIdx, table.controlIdx, 2, 0, 0, 10), '가나');
  assert.equal(doc.getTextInCell(0, table.paraIdx, table.controlIdx, 2, 2, 0, 10), '다');
  assert.equal(wide.cellPath.at(-1).cellParaIndex, 1);
  assert.equal(wide.charOffset, 1);
  // Nested table cells receive the picture inside the inner table.
  const inner = insertNestedTable(doc, { ...position, cellIndex: 3 }, 1, 1);
  insertCellPicture(doc, inner, picture);
  const reopened = new HwpDocument(exportBytes(doc));
  t.after(() => reopened.free());
  const pictures = JSON.parse(reopened.getControls()).filter(control => control.ctrlId === 'gso' && control.list !== 0);
  assert.equal(pictures.length, 3);
  assert(pictures.every(control => control.list !== 0 && control.props.TreatAsChar === 1));
});

test('cell picture insertion keeps the copy buffer and rejects protected cells', t => {
  const { doc, position, table } = lastParagraphTable(t);
  const last = doc.getParagraphCount(0) - 1;
  doc.insertTextInCell(0, table.paraIdx, table.controlIdx, 0, 0, 0, '복사');
  doc.copySelectionInCell(0, table.paraIdx, table.controlIdx, 0, 0, 0, 0, 2);
  const copied = doc.getClipboardText();
  insertCellPicture(doc, position, picture);
  assert.equal(doc.getClipboardText(), copied);
  assert.equal(doc.getParagraphCount(0), last + 1);
  assert.throws(() => insertCellPicture(doc, position, { ...picture, width: 0 }), /이미지 크기/);
  const protectedDoc = new Proxy(doc, { get(target, name) {
    if (name === 'getCellPropertiesByPath') return () => JSON.stringify({ cellProtect: true, width: 1000, paddingLeft: 0, paddingRight: 0 });
    const member = target[name]; return typeof member === 'function' ? member.bind(target) : member;
  } });
  assert.throws(() => insertCellPicture(protectedDoc, position, picture), /보호된 셀/);
});

test('an inline table that ends the section gets a following paragraph so the caret can leave it', t => {
  const { doc, table } = lastParagraphTable(t);
  const count = doc.getParagraphCount(0), tables = tableCount(doc);
  assert.equal(ensureTrailingParagraph(doc, 0, table.paraIdx), true);
  assert.equal(doc.getParagraphCount(0), count + 1);
  assert.equal(doc.getParagraphLength(0, count), 0, 'the new paragraph is empty');
  assert.equal(tableCount(doc), tables, 'the table stays where it was');
  assert.equal(JSON.parse(doc.getControls()).filter(control => control.ctrlId === 'tbl' && control.list === 0).at(-1).para, table.paraIdx);
  assert.equal(ensureTrailingParagraph(doc, 0, table.paraIdx), false, 'only the last paragraph needs one');
  assert.equal(doc.getParagraphCount(0), count + 1);
  exportBytes(doc);
});

test('equations go inside table cells, including nested tables, and survive export', t => {
  const { doc, position } = fixture(t);
  doc.insertTextInCell(0, position.parentParaIndex, position.controlIndex, 0, 0, 0, '넓이');
  position.charOffset = 2;
  const count = doc.getParagraphCount(0);
  const cursor = insertCellEquation(doc, position, { script: 'pi r^{2}', fontSize: 1000, color: 0 });
  assert.equal(cursor.charOffset, 3, 'the caret lands after the equation');
  assert.equal(doc.getParagraphCount(0), count, 'no scratch paragraph or floating copy is left in the body');
  const equation = JSON.parse(doc.getEquationProperties(0, position.parentParaIndex, position.controlIndex, 0, 0));
  assert.equal(equation.script, 'pi r^{2}');
  assert.equal(equation.fontSize, 1000);
  const nested = insertNestedTable(doc, { ...position, cellIndex: 1, cellParaIndex: 0, charOffset: 0, cellPath: undefined }, 1, 1);
  const inner = insertCellEquation(doc, nested, { script: '{1} over {2}', fontSize: 1200, color: 0 });
  assert.equal(inner.cellPath.length, 2);
  const reopened = new HwpDocument(exportBytes(doc));
  t.after(() => reopened.free());
  const scripts = JSON.parse(reopened.getControls()).filter(control => control.ctrlId === 'eqed');
  assert.equal(scripts.length, 2);
  assert.throws(() => insertCellEquation(doc, position, { script: ' ', fontSize: 1000, color: 0 }), /수식 내용/);
});
