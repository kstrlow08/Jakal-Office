import test from 'node:test';import assert from 'node:assert/strict';import {zipSync,unzipSync,strToU8,strFromU8}from 'fflate';
import {patchZipEntries}from '../studio/zip-patch.ts';
test('changed XML is rewritten while binary local records and mimetype stay byte-for-byte intact',()=>{
  const image=Uint8Array.from({length:8192},(_,i)=>(i*113+i%7)&255);
  const original=zipSync({mimetype:[strToU8('application/hwp+zip'),{level:0}],'BinData/image.png':image,'Contents/section0.xml':strToU8('<old/>'),'이름.txt':strToU8('한글')});
  const result=patchZipEntries(original,{'Contents/section0.xml':strToU8('<new>각주</new>')});
  const data=unzipSync(result);assert.deepEqual(data['BinData/image.png'],image);assert.equal(strFromU8(data['Contents/section0.xml']),'<new>각주</new>');assert.equal(strFromU8(data['이름.txt']),'한글');
  const marker=new TextEncoder().encode('BinData/image.png');const find=(bytes,pattern)=>bytes.findIndex((_,i)=>pattern.every((b,j)=>bytes[i+j]===b));
  const start=find(original,marker)-30,end=find(original,new TextEncoder().encode('Contents/section0.xml'))-30;
  assert.deepEqual(result.slice(start,end),original.slice(start,end),'untouched compressed entry copied verbatim');
  assert.equal(new DataView(result.buffer).getUint16(8,true),0,'mimetype stored first');
});
test('empty patches keep identity, missing entries and malformed directories reject',()=>{
  const original=zipSync({a:strToU8('a')});assert.equal(patchZipEntries(original,{}),original);
  assert.throws(()=>patchZipEntries(original,{b:strToU8('b')}));assert.throws(()=>patchZipEntries(new Uint8Array([1,2]),{a:strToU8('a')}));
});
