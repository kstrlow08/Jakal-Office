import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { unzipSync, strFromU8 } from 'fflate';
import { HwpDocument, initSync } from '@rhwp/core';
import { dragTableContext } from '../studio/table-drag.ts';
import { finalizeHwpx, exportCompatibleHwp, layoutSignature } from '../studio/export-compat.ts';

const dom=new JSDOM('');globalThis.DOMParser=dom.window.DOMParser;globalThis.XMLSerializer=dom.window.XMLSerializer;
initSync({module:fs.readFileSync(new URL('../node_modules/@rhwp/core/rhwp_bg.wasm',import.meta.url))});
const bundled=await build({entryPoints:['studio/image-tools.ts'],bundle:true,platform:'node',format:'esm',write:false,alias:{'@':resolve('../build/rhwp-studio-source/rhwp-studio/src')}});
const {fitImage,pictureParagraph}=await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const readExport=fn=>{const value=fn();try{return {bytes:value.takeBytes(),contentLoss:JSON.parse(value.contentLoss())};}finally{value.free();}};

test('dragging from an ordinary table caret resolves context before F5 mode exists',()=>{
  const p={sectionIndex:2,parentParaIndex:4,controlIndex:1,cellIndex:3,cellParaIndex:0,cellPath:[{controlIndex:1,cellIndex:3,cellParaIndex:0}]};
  assert.deepEqual(dragTableContext({getCellTableContext:()=>null,getPosition:()=>p}),{sec:2,ppi:4,ci:1,cellPath:p.cellPath});
  assert.equal(dragTableContext({getCellTableContext:()=>null,getPosition:()=>({sectionIndex:0})}),null);
  const selected={sec:1,ppi:2,ci:0};assert.equal(dragTableContext({getCellTableContext:()=>selected}),selected);
});
test('large images fit the available cell/body width without changing aspect ratio',()=>{
  const fit=fitImage(3840,2160,12000);assert.equal(fit.width,12000);assert.ok(Math.abs(fit.height/fit.width-2160/3840)<.001);
  assert.throws(()=>fitImage(0,10));assert.throws(()=>fitImage(10,10,-1));
});

test('a wide inline picture has a separate paragraph while preserving text on both sides',()=>{
  const doc=HwpDocument.createEmpty();doc.createBlankDocument();
  try {
    assert.ok(JSON.parse(doc.insertText(0,0,0,'앞문장뒷문장')).ok);
    const target=pictureParagraph(doc,{sectionIndex:0,paragraphIndex:0,charOffset:3},[],true);
    assert.equal(target.position.paragraphIndex,1);assert.equal(target.position.charOffset,0);
    assert.equal(doc.getParagraphCount(0),3);
    const xml=new DOMParser().parseFromString(strFromU8(unzipSync(doc.exportHwpx())['Contents/section0.xml']),'application/xml');
    const paragraphs=Array.from(xml.documentElement.children).filter(n=>n.localName==='p');
    const texts=paragraphs.map(p=>Array.from(p.getElementsByTagNameNS('*','t')).map(n=>n.textContent).join(''));
    assert.deepEqual(texts,['앞문장','','뒷문장']);
  }finally{doc.free();}
});
test('image inline/floating changes preserve dimensions and survive export and undo',()=>{
  const doc=new HwpDocument(fs.readFileSync('public/sample.hwpx'));
  try {
    const png=new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=','base64'));
    const inserted=JSON.parse(doc.insertPicture(0,0,0,'[]',png,12000,6000,1,1,'png','fixture'));
    assert.ok(inserted.ok);const before=doc.saveSnapshot();
    assert.ok(JSON.parse(doc.setPictureProperties(0,inserted.paraIdx,inserted.controlIdx,JSON.stringify({treatAsChar:true}))).ok);
    const props=JSON.parse(doc.getPictureProperties(0,inserted.paraIdx,inserted.controlIdx));assert.equal(props.treatAsChar,true);assert.equal(props.width,12000);assert.equal(props.height,6000);
    const reopened=new HwpDocument(doc.exportHwpx());try{const picture=JSON.parse(reopened.getControls()).find(control=>control.userDesc==='그림');assert.ok(picture);assert.equal(picture.props.TreatAsChar,1);}finally{reopened.free();}
    doc.restoreSnapshot(before);assert.equal(JSON.parse(doc.getPictureProperties(0,inserted.paraIdx,inserted.controlIdx)).treatAsChar,false);doc.discardSnapshot(before);
  }finally{doc.free();}
});
test('a wide picture paragraph in a table stays in its cell and retains surrounding text',()=>{
  const doc=HwpDocument.createEmpty();doc.createBlankDocument();
  try {
    const table=JSON.parse(doc.createTableEx(JSON.stringify({sectionIdx:0,paraIdx:0,charOffset:0,rowCount:2,colCount:2})));
    assert.ok(table.ok);
    const path=[{controlIndex:table.controlIdx,cellIndex:0,cellParaIndex:0}];
    assert.ok(JSON.parse(doc.insertTextInCellByPath(0,table.paraIdx,JSON.stringify(path),0,'앞뒤')).ok);
    const target=pictureParagraph(doc,{sectionIndex:0,paragraphIndex:0,parentParaIndex:table.paraIdx,controlIndex:table.controlIdx,cellIndex:0,cellParaIndex:0,charOffset:1,cellPath:path},path,true);
    assert.equal(target.path[0].cellParaIndex,1);assert.equal(path[0].cellParaIndex,0);
    const xml=new DOMParser().parseFromString(strFromU8(unzipSync(doc.exportHwpx())['Contents/section0.xml']),'application/xml');
    const cells=Array.from(xml.getElementsByTagNameNS('*','tc'));
    const paragraphs=Array.from(cells[0].getElementsByTagNameNS('*','p'));
    assert.deepEqual(paragraphs.map(p=>Array.from(p.getElementsByTagNameNS('*','t')).map(n=>n.textContent).join('')),['앞','','뒤']);
    assert.equal(cells.length,4);
  }finally{doc.free();}
});

test('footnotes/endnotes receive distinct identities and no stale font-dependent line caches',()=>{
  const doc=new HwpDocument(fs.readFileSync('public/sample.hwpx'));
  try {
    JSON.parse(doc.insertFootnote(0,0,0));JSON.parse(doc.insertEndnote(0,0,1));
    const xml=new DOMParser().parseFromString(strFromU8(unzipSync(finalizeHwpx(doc.exportHwpx()))['Contents/section0.xml']),'application/xml');
    const notes=[...xml.getElementsByTagNameNS('*','footNote'),...xml.getElementsByTagNameNS('*','endNote')];
    assert.equal(new Set(notes.map(n=>n.getAttribute('instId'))).size,2);assert.ok(notes.every(n=>n.getAttribute('instId')!=='0'));
    assert.ok(notes.every(n=>n.getElementsByTagNameNS('*','linesegarray').length===0));
  }finally{doc.free();}
});
test('HWP conversion reopens with note numbering and object anchor geometry intact',()=>{
  const doc=new HwpDocument(fs.readFileSync('tests/fixtures/notes-objects.hwpx'));
  try {
    const artifact=exportCompatibleHwp(doc,HwpDocument,readExport);
    assert.equal(artifact.contentLoss.count,0);
    const reopened=new HwpDocument(artifact.bytes);
    try{assert.deepEqual(layoutSignature(finalizeHwpx(doc.exportHwpx())),layoutSignature(reopened.exportHwpx()));}finally{reopened.free();}
  }finally{doc.free();}
});
