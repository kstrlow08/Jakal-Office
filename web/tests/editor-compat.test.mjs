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
import { encryptedCopy } from '../studio/encrypted-export.ts';

const dom=new JSDOM('');globalThis.DOMParser=dom.window.DOMParser;globalThis.XMLSerializer=dom.window.XMLSerializer;
initSync({module:fs.readFileSync(new URL('../node_modules/@rhwp/core/rhwp_bg.wasm',import.meta.url))});
const bundled=await build({entryPoints:['studio/image-tools.ts'],bundle:true,platform:'node',format:'esm',write:false,alias:{'@':resolve('../build/rhwp-studio-source/rhwp-studio/src')}});
const {fitImage,pictureParagraph,chooseImageFormat,pictureDescription,installImageDrop,installImagePaste,installMenuPaste}=await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
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

test('photos stay JPEG while other formats are normalized to PNG unless they are large and opaque',()=>{
  assert.equal(chooseImageFormat({type:'image/jpeg',name:'사진.JPG'}),'jpg');
  assert.equal(chooseImageFormat({type:'',name:'scan.jpeg'}),'jpg');
  assert.equal(chooseImageFormat({type:'image/webp',name:'a.webp'}),'png');
  assert.equal(chooseImageFormat({type:'image/png',name:'a.png'},5*1024*1024,true),'jpg');
  assert.equal(chooseImageFormat({type:'image/png',name:'a.png'},5*1024*1024,false),'png','transparency is kept');
  assert.equal(chooseImageFormat({type:'image/png',name:'a.png'},1024,true),'png');
  assert.match(pictureDescription('a\u0000b.png',640,480),/^그림입니다\.\r\n원본 그림의 이름: a b\.png\r\n원본 그림의 크기: 가로 640pixel, 세로 480pixel$/);
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

test('password HWPX reopens with text, objects and notes preserved and rejects a wrong password',()=>{
  const doc=new HwpDocument(fs.readFileSync('tests/fixtures/notes-objects.hwpx'));
  let reopened;
  try {
    const original=finalizeHwpx(doc.exportHwpx());
    const encrypted=encryptedCopy(original,'Jakal-검증2026!',HwpDocument,readExport);
    assert.throws(()=>HwpDocument.openWithPassword(encrypted,'wrong-password'));
    reopened=HwpDocument.openWithPassword(encrypted,'Jakal-검증2026!');
    assert.deepEqual(layoutSignature(original),layoutSignature(reopened.exportHwpx()));
    assert.equal(reopened.getTextFileText(),doc.getTextFileText());
    assert.throws(()=>encryptedCopy(original,'short',HwpDocument,readExport),/8~128/);
    assert.throws(()=>encryptedCopy(original,'x'.repeat(129),HwpDocument,readExport),/8~128/);
  }finally{reopened?.free();doc.free();}
});

test('image drops on body or table cells use the inline image path; text boxes and documents keep the runtime handler',()=>{
  const page=new JSDOM('<div id="scroll-container"><div id="page"></div></div>');
  const previous=globalThis.document;globalThis.document=page.window.document;
  try{
    let hit={sectionIndex:0,paragraphIndex:0,charOffset:0,parentParaIndex:1,controlIndex:0,cellIndex:2,cellParaIndex:0,cellPath:[{controlIndex:0,cellIndex:2,cellParaIndex:0}]};
    const input={cursor:{isInHeaderFooter:()=>false,isInFootnote:()=>false},pagePointFromClientPoint:()=>({pageIdx:0,pageX:10,pageY:20})};
    const bridge={pageCount:1,documentGeneration:1,hitTest:()=>hit};
    installImageDrop(()=>input,()=>bridge);
    let runtime=0;page.window.document.addEventListener('drop',()=>runtime++,true);
    const drop=name=>{const event=new page.window.Event('drop',{bubbles:true,cancelable:true});
      Object.defineProperty(event,'dataTransfer',{value:{files:[{name,type:name.endsWith('.png')?'image/png':'',size:10}]}});
      page.window.document.getElementById('page').dispatchEvent(event);return event;};
    let event=drop('cell.png');assert.equal(event.defaultPrevented,true);assert.equal(runtime,0,'the runtime drop handler does not also insert it');
    hit={...hit,isTextBox:true};event=drop('box.png');assert.equal(event.defaultPrevented,false);assert.equal(runtime,1);
    event=drop('문서.hwpx');assert.equal(event.defaultPrevented,false);assert.equal(runtime,2);
  }finally{page.window.close();if(previous)globalThis.document=previous;else delete globalThis.document;}
});

test('pasted images use the inline image path; editor copies, text boxes and multi-cell selections keep the runtime paste',()=>{
  const page=new JSDOM('<textarea id="input"></textarea>');
  const previous=globalThis.document;globalThis.document=page.window.document;
  try{
    const textarea=page.window.document.getElementById('input');
    let position={sectionIndex:0,paragraphIndex:0,charOffset:0,parentParaIndex:1,controlIndex:0,cellIndex:2,cellParaIndex:0,cellPath:[{controlIndex:0,cellIndex:2,cellParaIndex:0}]};
    let selection=null,textBox=false,internal=false;
    const cursor={isInHeaderFooter:()=>false,isInFootnote:()=>false,isInCellSelectionMode:()=>false,isInPictureObjectSelection:()=>false,isInTableObjectSelection:()=>false,isInTextBox:()=>textBox,hasSelection:()=>!!selection,getSelectionOrdered:()=>selection};
    const input={active:true,textarea,cursor,isFormMode:()=>false,getCursorPosition:()=>position};
    const bridge={documentGeneration:1,hasInternalClipboard:()=>internal,clipboardHasControl:()=>false,getClipboardText:()=>''};
    const calls=[];installImagePaste(()=>input,()=>bridge,(_input,_bridge,at,file,replace)=>calls.push({at,name:file.name,replace}));
    let runtime=0;page.window.document.addEventListener('paste',()=>runtime++,true);
    const paste=({type='image/png',html=''}={})=>{const event=new page.window.Event('paste',{bubbles:true,cancelable:true});
      Object.defineProperty(event,'clipboardData',{value:{items:[{kind:'file',type,getAsFile:()=>({name:'image.png',type,size:10})}],getData:kind=>kind==='text/html'?html:''}});
      textarea.dispatchEvent(event);return event;};
    let event=paste();assert.equal(event.defaultPrevented,true);assert.equal(runtime,0,'the runtime paste does not also insert it');
    assert.deepEqual(calls.at(-1),{at:position,name:'image.png',replace:false});
    internal=true;event=paste({html:'<!-- rhwp-studio-clipboard:abc --><img>'});assert.equal(event.defaultPrevented,false,'a copy made in the editor keeps its object paste');assert.equal(runtime,1);
    internal=false;textBox=true;event=paste();assert.equal(event.defaultPrevented,false);assert.equal(runtime,2);
    textBox=false;event=paste({type:'image/tiff'});assert.equal(event.defaultPrevented,false,'unsupported image types fall back to the runtime (HTML/text)');
    const inCell=cellParaIndex=>({...position,cellParaIndex,cellPath:[{controlIndex:0,cellIndex:2,cellParaIndex}]});
    selection={start:inCell(0),end:inCell(1)};event=paste();assert.equal(event.defaultPrevented,true);assert.deepEqual(calls.at(-1),{at:inCell(0),name:'image.png',replace:true},'a selection in one cell is replaced');
    selection={start:inCell(0),end:{...inCell(0),cellIndex:3,cellPath:[{controlIndex:0,cellIndex:3,cellParaIndex:0}]}};event=paste();assert.equal(event.defaultPrevented,false,'selections across cells keep the runtime path');
    assert.equal(calls.length,2);
  }finally{page.window.close();if(previous)globalThis.document=previous;else delete globalThis.document;}
});

test('menu paste falls back to the async clipboard and replays it as a paste event',async()=>{
  const page=new JSDOM('<textarea id="input"></textarea>');
  const previous={document:globalThis.document,ClipboardEvent:globalThis.ClipboardEvent};
  globalThis.document=page.window.document;
  globalThis.ClipboardEvent=class extends page.window.Event{constructor(type,init){super(type,init);this.clipboardData=init.clipboardData;}};
  try{
    const textarea=page.window.document.getElementById('input');
    const commands=new Map([['edit:paste',{id:'edit:paste',label:'붙이기',canExecute:()=>true,execute:()=>{}}]]);
    const registry={get:id=>commands.get(id),register:command=>commands.set(command.id,command)};
    let allowed=false,focused=0;const input={textarea,focus:()=>focused++,performPaste:()=>allowed};
    const data={types:['text/plain'],files:[],getData:()=> '붙일 글'};
    installMenuPaste(registry,async()=>data);
    const received=[];textarea.addEventListener('paste',event=>received.push(event.clipboardData));
    commands.get('edit:paste').execute({getInputHandler:()=>input});
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.deepEqual(received,[data]);assert.equal(focused,1);
    allowed=true;commands.get('edit:paste').execute({getInputHandler:()=>input});
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(received.length,1,'a browser that allowed execCommand paste is not pasted twice');
  }finally{page.window.close();globalThis.ClipboardEvent=previous.ClipboardEvent;if(previous.document)globalThis.document=previous.document;else delete globalThis.document;}
});
