import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { build } from 'esbuild';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
import { HwpDocument, initSync } from '@rhwp/core';
import { fontFaceMetadata } from '../studio/font-faces.ts';
import { installOfficeFonts, connectedFontNames } from '../studio/font-catalog.ts';
import { numberedPrefix, installAutomaticNumbering } from '../studio/automatic-numbering.ts';
import { hanjaTarget, applyHanja } from '../studio/hanja.ts';
import { tableFormatSignature, exportCompatibleHwp, finalizeHwpx } from '../studio/export-compat.ts';
import { repairHeaderInput, repairHeaderText, repairHeaderCommand } from '../studio/compatibility-policy.mjs';
import { applyHeaderStyle } from '../studio/header-format.ts';
initSync({module:fs.readFileSync('node_modules/@rhwp/core/rhwp_bg.wasm')});
const dom=new JSDOM('');globalThis.DOMParser=dom.window.DOMParser;globalThis.XMLSerializer=dom.window.XMLSerializer;
const readExport=fn=>{const value=fn();try{return{bytes:value.takeBytes(),contentLoss:JSON.parse(value.contentLoss())};}finally{value.free();}};
const native='../build/rhwp-studio-source/rhwp-studio/src/engine/';
const inputCode=repairHeaderInput(fs.readFileSync(native+'input-handler.ts','utf8'));
const textSource=repairHeaderText(fs.readFileSync(native+'input-handler-text.ts','utf8'));
const textParsed=ts.createSourceFile('text.ts',textSource,ts.ScriptTarget.Latest,true);
const endComposition=textParsed.statements.find(node=>node.name?.text==='onCompositionEnd').getText(textParsed);
const parsed=ts.createSourceFile('handler.ts',inputCode,ts.ScriptTarget.Latest,true),inputClass=parsed.statements.find(node=>ts.isClassDeclaration(node)&&node.name.text==='InputHandler');
const methods=['applyCharFormat','getPendingCharShape','getCharPropertiesAtCursor','applyCharPropsToRange','applyParaPropsToRange'];
const classText=inputClass.members.filter(node=>node.name&&methods.includes(node.name.getText(parsed))).map(node=>node.getText(parsed)).join('\n');
const cmdSource=repairHeaderCommand(fs.readFileSync(native+'command.ts','utf8').replaceAll('\r\n','\n'));
const commands=ts.createSourceFile('command.ts',cmdSource,ts.ScriptTarget.Latest,true);
const selected=commands.statements.filter(node=>node.name&&['InsertTextInHeaderFooterCommand','hfEditContext','hfFnStubPosition','charCount'].includes(node.name.text)).map(node=>node.getText(commands)).join('\n');
const bundled=await build({stdin:{contents:`import {headerTypingProps,stageHeaderTypingProps,clearHeaderTypingProps,advanceHeaderTypingProps} from './header-format.ts';export {headerTypingProps,advanceHeaderTypingProps};export class Probe {${classText}}\n${selected}\n${endComposition}`,loader:'ts',resolveDir:process.cwd()+'/studio'},bundle:true,format:'esm',platform:'node',write:false});
const {Probe,headerTypingProps,advanceHeaderTypingProps,InsertTextInHeaderFooterCommand,onCompositionEnd}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
function blankDocument(t,text=''){const d=HwpDocument.createEmpty();d.createBlankDocument();if(text)d.insertText(0,0,0,text);t.after(()=>d.free());return d;}

test('real font files expose their family and bold face weight',()=>{
  for(const[name,weight]of[['NanumMyeongjo-Regular.ttf','400'],['NanumMyeongjo-Bold.ttf','700'],['NanumGothic-Bold.ttf','700']]){
    const bytes=fs.readFileSync('public/fonts/editor/'+name);const meta=fontFaceMetadata(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),name);
    assert.equal(meta.weight,weight);assert(meta.family.length>1);assert.equal(meta.style,'normal');
  }
  assert.doesNotThrow(()=>fontFaceMetadata(new ArrayBuffer(3),'내글꼴-Regular.woff2'));
});
test('font IDs are resolved per language and bold survives HWPX and HWP',t=>{
  const d=blankDocument(t,'한字ABC');d.findOrCreateFontIdForLang(1,'서로다른목록');
  const fontIds=Array.from({length:7},(_,lang)=>d.findOrCreateFontIdForLang(lang,'검증명조'));
  assert.equal(JSON.parse(d.applyCharFormat(0,0,0,5,JSON.stringify({fontIds,bold:true}))).ok,true);
  for(const bytes of[d.exportHwpx(),d.exportHwp()]){const reopened=new HwpDocument(bytes);try{const props=JSON.parse(reopened.getCharPropertiesAt(0,0,0));assert.equal(props.bold,true);assert.deepEqual(props.fontFamilies,Array(7).fill('검증명조'));}finally{reopened.free();}}
});

test('uploaded regular and bold faces share their actual family and apply to the font picker',async t=>{
  const page=new JSDOM('<select id="font-name"></select>');
  const keys=['document','window','Event','FontFace'],previous=Object.fromEntries(keys.map(key=>[key,globalThis[key]])),faces=[];
  globalThis.document=page.window.document;globalThis.window=page.window;globalThis.Event=page.window.Event;
  globalThis.FontFace=class {constructor(family,source,descriptors){Object.assign(this,{family,source,...descriptors});}async load(){return this;}};
  Object.defineProperty(document,'fonts',{value:{add:face=>faces.push(face)}});page.window.HTMLDialogElement.prototype.showModal=function(){};
  t.after(()=>{for(const key of keys)globalThis[key]=previous[key];page.window.close();});
  const registry=new Map();registry.register=command=>registry.set(command.id,command);installOfficeFonts(registry);
  registry.get('view:office-fonts').execute();const upload=document.querySelector('[name=file]');
  Object.defineProperty(upload,'files',{value:['NanumMyeongjo-Regular.ttf','NanumMyeongjo-Bold.ttf'].map(name=>({name,size:100,async arrayBuffer(){const b=fs.readFileSync('public/fonts/editor/'+name);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}}))});
  let changes=0;document.querySelector('select').addEventListener('change',()=>changes++);
  await upload.onchange({target:upload});assert.equal(faces.length,2);assert.equal(faces[0].family,faces[1].family);
  assert.deepEqual(faces.map(face=>face.weight),['400','700']);assert.equal(document.querySelector('select').value,'나눔명조');assert.equal(changes,1);assert(connectedFontNames().includes('나눔명조'));assert.notEqual(faces[0].family,'나눔명조');
});
test('header pending character style and dialogs stay in the header, and redo keeps bold',t=>{
  const d=blankDocument(t,'본문은 그대로');d.createHeaderFooter(0,true,0);
  const h=new Probe(),calls=[];h.cursor={isInHeaderFooter:()=>true,isInFootnote:()=>false,headerFooterMode:'header',hfSectionIdx:0,hfApplyTo:0,hfParaIdx:0,hfCharOffset:0};
  h.wasm={documentGeneration:3,getCharPropertiesInHeaderFooter:(...args)=>JSON.parse(d.getCharPropertiesInHeaderFooter(...args))};
  h.applyCharFormatInHeaderFooterSelection=()=>false;h.getNonEmptyHeaderFooterSelection=()=>null;h.applyParaFormat=props=>calls.push(props);
  h.applyCharFormat({bold:true,fontSize:1600});assert.equal(h.getCharPropertiesAtCursor().bold,true);
  const props=headerTypingProps(h),command=new InsertTextInHeaderFooterCommand({sectionIdx:0,isHeader:true,applyTo:0,previewPage:0},0,0,'머리말',props);
  command.execute(d);assert.equal(JSON.parse(d.getCharPropertiesInHeaderFooter(0,true,0,0,0)).bold,true);
  command.undo(d);command.execute(d);assert.equal(JSON.parse(d.getCharPropertiesInHeaderFooter(0,true,0,0,0)).fontSize,1600);
  h.cursor.hfCharOffset=3;advanceHeaderTypingProps(h,3);assert.equal(headerTypingProps(h).bold,true);
  h.applyParaPropsToRange({}, {}, {alignment:'center'});assert.deepEqual(calls,[{alignment:'center'}]);
  assert.equal(d.getTextRange(0,0,0,7),'본문은 그대로');
  h.wasm.documentGeneration++;assert.equal(headerTypingProps(h),undefined);
});
test('numbered prefix starts a semantic list, continues on split and ends on empty Enter',t=>{
  const d=blankDocument(t,'1.');const page=new JSDOM('<textarea></textarea>');const previous=globalThis.document;globalThis.document=page.window.document;
  t.after(()=>{globalThis.document=previous;page.window.close();});let p={sectionIndex:0,paragraphIndex:0,charOffset:2};
  const input={textarea:document.querySelector('textarea'),cursor:{getPosition:()=>p,isInHeaderFooter:()=>false,isInFootnote:()=>false,hasSelection:()=>false},wasm:d,
    getParaProperties:()=>JSON.parse(d.getParaPropertiesAt(0,p.paragraphIndex)),getTextAt:(at,n)=>d.getTextRange(at.sectionIndex,at.paragraphIndex,at.charOffset,n),focus(){},
    executeOperation:op=>{p=op.operation(d);},applyParaPropsAtCursor:props=>d.applyParaFormat(0,p.paragraphIndex,JSON.stringify(props))};
  installAutomaticNumbering(()=>input);const space=new page.window.InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:' '});input.textarea.dispatchEvent(space);
  assert.equal(space.defaultPrevented,true);assert.equal(d.getTextRange(0,0,0,2),'');assert.equal(input.getParaProperties().headType,'Number');
  d.insertText(0,0,0,'첫째');d.splitParagraph(0,0,2);p={...p,paragraphIndex:1,charOffset:0};assert.equal(input.getParaProperties().headType,'Number');
  const enter=new page.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});input.textarea.dispatchEvent(enter);
  assert.equal(enter.defaultPrevented,true);assert.equal(input.getParaProperties().headType,'None');
  assert.equal(numberedPrefix('2026.'),null);assert.equal(numberedPrefix('문서1.'),null);
});

test('a named header style changes header appearance without formatting the body',t=>{
  const d=blankDocument(t,'본문 유지');d.createHeaderFooter(0,true,0);d.insertTextInHeaderFooter(0,true,0,0,0,'제목');
  const id=d.createStyle(JSON.stringify({name:'머리말 검증',englishName:'Header test',type:0,nextStyleId:0}));
  assert.equal(d.updateStyleShapes(id,JSON.stringify({bold:true,fontSize:1800}),JSON.stringify({alignment:'center'})),true);
  const input={wasm:{documentGeneration:1,getStyleDetail:id=>JSON.parse(d.getStyleDetail(id)),getHeaderFooter:(...a)=>d.getHeaderFooter(...a)},
    cursor:{isInHeaderFooter:()=>true,headerFooterMode:'header',hfSectionIdx:0,hfApplyTo:0,hfParaIdx:0,hfCharOffset:2,getPosition:()=>({sectionIndex:0,paragraphIndex:0,charOffset:0})},
    executeOperation:op=>op.operation(d),focus(){}};
  input.wasm.findOrCreateFontIdForLang=(...a)=>d.findOrCreateFontIdForLang(...a);
  applyHeaderStyle(input,id);
  assert.equal(JSON.parse(d.getCharPropertiesInHeaderFooter(0,true,0,0,0)).bold,true);
  assert.equal(JSON.parse(d.getParaPropertiesInHf(0,true,0,0)).alignment,'center');
  assert.equal(JSON.parse(d.getCharPropertiesAt(0,0,0)).bold,false);
  assert.equal(d.getTextRange(0,0,0,5),'본문 유지');
});
test('Korean header composition retains the style captured before final caret refresh',t=>{
  const d=blankDocument(t);d.createHeaderFooter(0,true,0);const h=new Probe(),recorded=[];
  h.cursor={isInHeaderFooter:()=>true,isInFootnote:()=>false,headerFooterMode:'header',hfSectionIdx:0,hfApplyTo:0,hfParaIdx:0,hfCharOffset:0};
  h.wasm={documentGeneration:1,getCharPropertiesInHeaderFooter:(...a)=>JSON.parse(d.getCharPropertiesInHeaderFooter(...a)),applyCharFormatInHeaderFooter:(...a)=>d.applyCharFormatInHeaderFooter(...a)};
  h.getNonEmptyHeaderFooterSelection=()=>null;h.applyCharFormatInHeaderFooterSelection=()=>false;h.applyCharFormat({bold:true,fontSize:1800});
  d.insertTextInHeaderFooter(0,true,0,0,0,'가');h.cursor.hfCharOffset=1;
  Object.assign(h,{compositionAnchor:{charOffset:0},compositionLength:1,isComposing:true,_lastCompositionText:'가',textarea:{value:'가'},caret:{hideComposition(){}},updateCaret(){this.getCharPropertiesAtCursor();},resetRawTextMutationEffects(){},executeOperation:op=>recorded.push(op.command)});
  onCompositionEnd.call(h);
  assert.equal(JSON.parse(d.getCharPropertiesInHeaderFooter(0,true,0,0,0)).bold,true);
  assert.equal(JSON.parse(d.getCharPropertiesInHeaderFooter(0,true,0,0,0)).fontSize,1800);
  assert.equal(headerTypingProps(h).bold,true);assert.equal(recorded.length,1);
  recorded[0].undo(d);recorded[0].execute(d);assert.equal(JSON.parse(d.getCharPropertiesInHeaderFooter(0,true,0,0,0)).bold,true);
});
test('Hanja replacement retains bold and supports one-step undo without changing other text',t=>{
  const d=blankDocument(t,'한자 뒤');d.applyCharFormat(0,0,0,2,JSON.stringify({bold:true}));let p={sectionIndex:0,paragraphIndex:0,charOffset:2};
  const wasm={documentGeneration:1,getCharPropertiesAt:(...a)=>JSON.parse(d.getCharPropertiesAt(...a)),findOrCreateFontIdForLang:(...a)=>d.findOrCreateFontIdForLang(...a)};
  let before;const input={wasm,cursor:{getPosition:()=>p,isInHeaderFooter:()=>false,isInFootnote:()=>false,clearSelection(){}},getSelection:()=>null,getTextAt:(at,n)=>d.getTextRange(0,at.paragraphIndex,at.charOffset,n),focus(){},executeOperation:op=>{before=d.saveSnapshot();p=op.operation(d);}};
  const target=hanjaTarget(input);assert.equal(target.text,'한자');applyHanja(input,target,'漢字');
  assert.equal(d.getTextRange(0,0,0,4),'漢字 뒤');assert.equal(JSON.parse(d.getCharPropertiesAt(0,0,0)).bold,true);
  d.restoreSnapshot(before);d.discardSnapshot(before);assert.equal(d.getTextRange(0,0,0,4),'한자 뒤');
  wasm.documentGeneration++;assert.throws(()=>applyHanja(input,target,'漢字'),/문서 내용/);
});
test('table borders, cell geometry and margins survive HWPX and HWP reopening',t=>{
  const d=new HwpDocument(fs.readFileSync('public/sample.hwpx'));t.after(()=>d.free());
  const original=tableFormatSignature(d.exportHwpx());assert.equal(original.length,1);
  for(const bytes of[d.exportHwpx(),exportCompatibleHwp(d,HwpDocument,readExport).bytes]){const reopened=new HwpDocument(bytes);try{assert.deepEqual(tableFormatSignature(finalizeHwpx(reopened.exportHwpx(),reopened)),original);}finally{reopened.free();}}
});
test('custom table cell fills, borders and margins survive both download formats',t=>{
  const d=blankDocument(t);const table=JSON.parse(d.createTableEx(JSON.stringify({sectionIdx:0,paraIdx:0,charOffset:0,rowCount:2,colCount:2,treatAsChar:true})));
  assert.equal(JSON.parse(d.setTableProperties(0,table.paraIdx,table.controlIdx,JSON.stringify({paddingLeft:800,paddingRight:400,paddingTop:200,paddingBottom:180}))).ok,true);
  assert.equal(JSON.parse(d.setCellProperties(0,table.paraIdx,table.controlIdx,0,JSON.stringify({applyInnerMargin:true,paddingLeft:600,paddingTop:300,verticalAlign:2,fillType:'solid',fillColor:'#eeddcc',borderBottom:{type:1,width:2,color:'#123456'}}))).ok,true);
  const expected=tableFormatSignature(d.exportHwpx());
  for(const bytes of[d.exportHwpx(),exportCompatibleHwp(d,HwpDocument,readExport).bytes]){const other=new HwpDocument(bytes);try{assert.deepEqual(tableFormatSignature(finalizeHwpx(other.exportHwpx(),other)),expected);}finally{other.free();}}
});
test('the offline Hanja index includes common Korean readings',()=>{
  const data=JSON.parse(fs.readFileSync('public/studio-data/hanja-17.0.0.json','utf8'));assert(data['한'].includes('漢'));assert(data['자'].includes('字'));assert(data['국'].includes('國'));
});
