import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash}from 'node:crypto';
import {initSync,HwpDocument}from '@rhwp/core';import{unzipSync,strFromU8}from 'fflate';
initSync({module:fs.readFileSync('node_modules/@rhwp/core/rhwp_bg.wasm')});
const file=process.argv[2],data=fs.readFileSync(file),doc=new HwpDocument(data);
try{
  const original=unzipSync(fs.readFileSync('../build/editor-regressions/large-documents/large-mixed-160.hwpx')),current=unzipSync(data);
  const hash=parts=>Object.entries(parts).filter(([n])=>n.startsWith('BinData/')).map(([,b])=>createHash('sha256').update(b).digest('hex')).sort();
  const xml=strFromU8(current['Contents/section0.xml']),text=doc.getTextFileText();
  const result={file:path.resolve(file),bytes:data.length,pages:doc.pageCount(),paragraphs:doc.getParagraphCount(0),
    firstTable:JSON.parse(doc.getTableProperties(0,1,0)),firstTableRows:Number(xml.match(/<hp:tbl\b[^>]*\browCnt="(\d+)"/)?.[1]),tables:(xml.match(/<hp:tbl\b/g)||[]).length,
    imageBytesPreserved:JSON.stringify(hash(original))===JSON.stringify(hash(current)),images:hash(current).length,
    bodyTextPreserved:text.includes('abcdefghijklmnopqrstuvwx'),cellTextPreserved:text.includes('tablecheck123')&&text.includes('한글 입력 확인')};
  assert.equal(result.pages,160);assert.equal(result.paragraphs,1601);assert.equal(result.tables,16);assert.equal(result.images,8);
  assert.equal(result.firstTableRows,11);
  assert(result.imageBytesPreserved);assert(result.bodyTextPreserved);assert(result.cellTextPreserved);
  fs.writeFileSync('../build/editor-regressions/large-roundtrip.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{doc.free();}
