import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import{pathToFileURL}from'node:url';import{Worker}from'node:worker_threads';import{build}from'esbuild';import{initSync,HwpDocument}from'@rhwp/core';import{unzipSync,strFromU8}from'fflate';import{createHash}from'node:crypto';
import{ReplicaJournal,replicaFingerprint}from'../studio/replica-journal.ts';
import {execFileSync} from 'node:child_process';
import {installWorkerXml} from '../studio/worker-xml.ts';
import {finalizeHwpx,layoutSignature} from '../studio/export-compat.ts';
installWorkerXml();
const root=path.resolve('..'),artifacts=path.join(root,'build/editor-regressions/worker-tests');await fs.mkdir(artifacts,{recursive:true});
try{await fs.access(path.join(root,'build/editor-regressions/large-documents/large-mixed-160.hwp'));await fs.access(path.join(root,'build/editor-regressions/large-documents/large-mixed-160.hwpx'));}
catch{execFileSync(process.execPath,['scripts/create-large-fixtures.mjs'],{stdio:'pipe'});}
await build({entryPoints:['studio/document-worker.ts'],outfile:path.join(artifacts,'worker.mjs'),bundle:true,format:'esm',platform:'browser',alias:{'@wasm/rhwp.js':path.resolve('node_modules/@rhwp/core/rhwp.js'),'@/core/export-content-loss':path.join(root,'build/rhwp-studio-source/rhwp-studio/src/core/export-content-loss.ts')},plugins:[{name:'test-wasm-url',setup(b){b.onResolve({filter:/rhwp_bg\.wasm\?url$/},()=>({path:'wasm-url',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export default "/engine.wasm";'}));}}]});
const adapter=`import{parentPort}from'node:worker_threads';import fs from'node:fs/promises';globalThis.self=globalThis;globalThis.postMessage=(data,transfer)=>parentPort.postMessage(data,transfer);globalThis.fetch=async url=>new Response(await fs.readFile(${JSON.stringify(path.resolve('node_modules/@rhwp/core/rhwp_bg.wasm'))}+ (String(url).endsWith('.gz')?'.missing':'')),{headers:{'Content-Type':'application/wasm'}});await import('./worker.mjs');parentPort.on('message',data=>self.onmessage({data}));parentPort.postMessage({ready:true});`;
await fs.writeFile(path.join(artifacts,'adapter.mjs'),adapter);
initSync({module:await fs.readFile('node_modules/@rhwp/core/rhwp_bg.wasm')});
const widths=new Map();globalThis.measureTextWidth=(font,text)=>{const size=Number(/([\d.]+)px/.exec(font)?.[1]||12),value=[...text].reduce((sum,c)=>sum+size*(/[\x00-\xff]/.test(c)?.55:1),0);widths.set(JSON.stringify([font,text]),value);return value;};
async function workerFixture(){const worker=new Worker(pathToFileURL(path.join(artifacts,'adapter.mjs')),{execArgv:[]});let next=0;const pending=new Map();await new Promise((resolve,reject)=>{worker.on('error',reject);worker.on('message',data=>{if(data.ready)return resolve();const p=pending.get(data.id);if(p){pending.delete(data.id);data.error?p.reject(Error(data.error)):p.resolve(data);}});});return{worker,request:data=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});worker.postMessage({...data,id});})};}
async function requestMeasured(f,data){for(let n=0;n<3;n++){const result=await f.request({...data,widths:[...widths]});if(!result.missing)return result;for(const[font,text]of result.missing)globalThis.measureTextWidth(font,text);}throw Error('measurement retry budget');}
const hashes=parts=>Object.entries(parts).filter(([n])=>n.startsWith('BinData/')).map(([,b])=>createHash('sha256').update(b).digest('hex')).sort();
test('real worker replays large HWP/HWPX edits and native history handles, preserving text, added rows and every image',async()=>{
 const f=await workerFixture();try{
 for(const format of ['hwpx','hwp']){
   const source=new Uint8Array(await fs.readFile('../build/editor-regressions/large-documents/large-mixed-160.'+format)),doc=new HwpDocument(source),journal=new ReplicaJournal(source,'large.'+format);
   const originalReport=doc.exportHwpxWithReport(),originalImages=hashes(unzipSync(originalReport.takeBytes()));originalReport.free();journal.attach(doc);
   try{doc.convertToEditable();doc.setFileName('large.'+format);doc.replaceBodyTextLocal(0,0,0,0,'worker');doc.insertTextInCellDeferredPagination(0,1,0,0,0,0,'worker cell');
     const before=doc.saveSnapshot();doc.beginBatch();for(let i=0;i<5;i++)doc.insertTableRow(0,1,0,0,true);doc.endBatch();const after=doc.saveSnapshot();doc.restoreSnapshot(before);doc.restoreSnapshot(after);doc.discardSnapshot(before);doc.discardSnapshot(after);doc.flushDeferredPagination();
     assert(journal.valid,journal.reason);const result=await requestMeasured(f,{type:'replica',identity:format,source,operations:journal.operations,fingerprint:replicaFingerprint(doc),format:'hwpx'});
     assert.equal(result.route,'replica-worker');const reopened=new HwpDocument(result.bytes),parts=unzipSync(result.bytes),xml=strFromU8(parts['Contents/section0.xml']);
     try{assert.equal(reopened.pageCount(),doc.pageCount());assert.equal(reopened.getParagraphCount(0),1601);assert(reopened.getTextFileText().includes('worker'));assert(reopened.getTextFileText().includes('worker cell'));assert.equal(Number(xml.match(/<hp:tbl\b[^>]*rowCnt="(\d+)"/)?.[1]),15);assert.deepEqual(hashes(parts),originalImages);}finally{reopened.free();}
     if(format==='hwpx'){
       const binary=await requestMeasured(f,{type:'replica',identity:format,source,operations:journal.operations,fingerprint:replicaFingerprint(doc),format:'hwp'}),hwp=new HwpDocument(binary.bytes);
       try{assert.equal(binary.route,'replica-worker');assert.equal(hwp.pageCount(),doc.pageCount());assert(hwp.getTextFileText().includes('worker cell'));}finally{hwp.free();}
     }
   }finally{doc.free();}
 }
 }finally{await f.worker.terminate();}
});

test('XML and HWP conversion workers retain note identities and object anchors and reject malformed XML',async()=>{
 const f=await workerFixture(),source=new Uint8Array(await fs.readFile('tests/fixtures/notes-objects.hwpx')),doc=new HwpDocument(source);
 try{
   const expected=layoutSignature(finalizeHwpx(doc.exportHwpx(),doc));
   for(const format of ['hwpx','hwp']){
     const result=await requestMeasured(f,{type:'finalize',bytes:source,format}),reopened=new HwpDocument(result.bytes);
     try{assert.deepEqual(layoutSignature(reopened.exportHwpx()),expected);assert.equal(reopened.getTextFileText(),doc.getTextFileText());}finally{reopened.free();}
   }
   const {zipSync,strToU8}=await import('fflate'),parts=unzipSync(source);parts['Contents/section0.xml']=strToU8('<sec><unclosed></sec>');
   await assert.rejects(f.request({type:'finalize',bytes:zipSync(parts),format:'hwpx'}),/XML|parse|closing/i);
 }finally{doc.free();await f.worker.terminate();}
});

test('unsupported edits checkpoint once; later saves stay in workers, concurrent input survives, and old undo handles fall back safely',async()=>{
 const outfile=path.join(artifacts,'background.mjs');
 await build({stdin:{contents:"export * from './studio/background-export.ts';export {rememberReplicaWidth} from './studio/replica-measurements.ts';",resolveDir:path.resolve('.')},outfile,bundle:true,format:'esm',platform:'browser',alias:{'@/core/export-content-loss':path.join(root,'build/rhwp-studio-source/rhwp-studio/src/core/export-content-loss.ts')},plugins:[{name:'native-external',setup(b){b.onResolve({filter:/^@wasm\/rhwp\.js$/},()=>({path:pathToFileURL(path.resolve('node_modules/@rhwp/core/rhwp.js')).href,external:true}));}}]});
 const pipeline=await import(pathToFileURL(outfile)),previousMeasure=globalThis.measureTextWidth,previousWorker=globalThis.Worker,previousDocument=globalThis.document;
 globalThis.document={documentElement:{dataset:{}}};
 globalThis.measureTextWidth=(font,text)=>pipeline.rememberReplicaWidth(font,text,previousMeasure(font,text));
 globalThis.Worker=class{constructor(){this.worker=new Worker(pathToFileURL(path.join(artifacts,'adapter.mjs')),{execArgv:[]});this.worker.on('message',data=>this.onmessage?.({data}));this.worker.on('error',error=>this.onerror?.(error));}postMessage(data){this.worker.postMessage(data);}terminate(){void this.worker.terminate();}};
 const source=new Uint8Array(await fs.readFile('../build/editor-regressions/large-documents/large-mixed-160.hwpx')),doc=new HwpDocument(source);pipeline.registerBackgroundDocument(doc,source,'large.hwpx');let nativeExports=0;
 const wasm={doc,fileName:'large.hwpx',documentGeneration:1,pageCount:160,exportHwpxWithReport(){nativeExports++;const result=doc.exportHwpxWithReport();try{return{bytes:result.takeBytes(),contentLoss:JSON.parse(result.contentLoss())};}finally{result.free();}}};
 try{
   doc.convertToEditable();doc.setFileName('large.hwpx');doc.insertText(0,0,0,'base');const before=doc.saveSnapshot();doc.applyCharFormat(0,0,0,4,JSON.stringify({bold:true}));
   await pipeline.exportInBackground(wasm,'hwpx');assert.equal(nativeExports,1);assert.equal(document.documentElement.dataset.jakalExportRoute,'xml-worker');
   doc.insertText(0,0,4,'more');const saving=pipeline.exportInBackground(wasm,'hwpx');doc.insertText(0,0,8,'later');const saved=new HwpDocument(await saving);
   try{assert(saved.getTextFileText().includes('basemore'));assert(!saved.getTextFileText().includes('later'));assert.equal(JSON.parse(saved.getCharPropertiesAt(0,0,0)).bold,true);}finally{saved.free();}
   assert.equal(nativeExports,1);assert.equal(document.documentElement.dataset.jakalExportRoute,'replica-worker');
   const next=new HwpDocument(await pipeline.exportInBackground(wasm,'hwpx'));try{assert(next.getTextFileText().includes('basemorelater'));}finally{next.free();}
   doc.restoreSnapshot(before);const undone=new HwpDocument(await pipeline.exportInBackground(wasm,'hwpx'));try{assert(undone.getTextFileText().includes('base'));assert(!undone.getTextFileText().includes('morelater'));}finally{undone.free();}
   assert.equal(nativeExports,2);assert.equal(document.documentElement.dataset.jakalExportRoute,'xml-worker');doc.discardSnapshot(before);
 }finally{doc.free();globalThis.measureTextWidth=previousMeasure;globalThis.Worker=previousWorker;globalThis.document=previousDocument;}
});
