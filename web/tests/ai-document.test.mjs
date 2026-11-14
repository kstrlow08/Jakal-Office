import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import{execFileSync}from'node:child_process';import{build}from'esbuild';import{initSync,HwpDocument}from'@rhwp/core';import{unzipSync,strFromU8,strToU8,zipSync}from'fflate';
const result=await build({entryPoints:['online/ai-document.mjs'],bundle:true,platform:'node',format:'esm',write:false});
fs.mkdirSync('../build/editor-regressions',{recursive:true});fs.writeFileSync('../build/editor-regressions/ai-document-test.mjs',result.outputFiles[0].contents);
const {AiDocument}=await import('../../build/editor-regressions/ai-document-test.mjs');
initSync({module:fs.readFileSync('node_modules/@rhwp/core/rhwp_bg.wasm')});
fs.mkdirSync('../build/editor-regressions',{recursive:true});
const HP='http://www.hancom.co.kr/hwpml/2011/paragraph';
test('appending beside a control stays on the original side of the object anchor',()=>{
  const{bytes}=fixture(),doc=new AiDocument(bytes),target=doc.index().targets.find(t=>t.text==='각주 본문');
  const changed=doc.apply([{id:target.id,before:target.text,after:target.text+' 추가'}]);
  const xml=strFromU8(unzipSync(changed)['Contents/section0.xml']);assert(xml.includes('<hp:t>각주 본문 추가</hp:t>'));
});
function fixture(){const d=new HwpDocument(fs.readFileSync('tests/fixtures/notes-objects.hwpx'));
  d.insertText(0,0,5,' 중요 안내입니다.');d.applyCharFormat(0,0,6,8,JSON.stringify({bold:true}));
  d.createHeaderFooter(0,true,0);d.insertTextInHeaderFooter(0,true,0,0,0,'머리말 안내입니다.');
  const created=JSON.parse(d.createTableEx(JSON.stringify({sectionIdx:0,paraIdx:0,charOffset:5,rowCount:2,colCount:2,treatAsChar:true})));const table=created.controlIdx??created.controlIndex??created.ctrlIdx;
  assert.notEqual(table,undefined);d.insertTextInCell(0,0,table,0,0,0,'표 첫째 내용입니다.');d.insertTextInCell(0,0,table,1,0,0,'표 둘째 내용입니다.');
  const exported=unzipSync(d.exportHwpx());d.free();
  exported['Contents/section0.xml']=strToU8(strFromU8(exported['Contents/section0.xml']).replace('<hp:t> 중요 안내입니다.</hp:t>','<hp:t> </hp:t></hp:run><hp:run charPrIDRef="1"><hp:t>중요</hp:t></hp:run><hp:run charPrIDRef="0"><hp:t> 안내입니다.</hp:t>'));
  const bytes=zipSync(exported);return{bytes,table,controlCount:3};
}
const ownTexts=bytes=>new AiDocument(bytes).index().targets.map(t=>t.text);
test('whole document covers control-bearing body, mixed formats, notes, headers, shapes and cells; HWP and HWPX retain edits',()=>{
  const{bytes}=fixture(),document=new AiDocument(bytes),index=document.index();
  for(const region of ['본문','각주','미주','머리말','글상자','표 셀'])assert(index.targets.some(t=>t.region===region),region);
  const targets=index.targets.filter(t=>['각주','미주','표 셀','머리말'].includes(t.region));const edited=document.apply(targets.map(t=>({id:t.id,before:t.text,after:t.text+' 확인'})));
  const before=unzipSync(bytes),after=unzipSync(edited);for(const name of Object.keys(before))if(name!=='Contents/section0.xml')assert.deepEqual(after[name],before[name],name);
  const expected=ownTexts(edited);for(const format of ['hwpx','hwp']){const loaded=new HwpDocument(edited);try{const reopened=new HwpDocument(format==='hwp'?loaded.exportHwp():loaded.exportHwpx());try{assert.deepEqual(ownTexts(reopened.exportHwpx()),expected,format);}finally{reopened.free();}}finally{loaded.free();}}
  assert.deepEqual(ownTexts(bytes),ownTexts(document.bytes));assert.deepEqual(unzipSync(document.apply(targets.map(t=>({id:t.id,before:t.text,after:t.text+' 확인'})))),after,'repeat applies against immutable baseline; ZIP timestamps may differ');
  fs.writeFileSync('../build/editor-regressions/ai-all-regions.hwpx',bytes);fs.writeFileSync('../build/editor-regressions/ai-all-regions-edited.hwpx',edited);
});
test('selection edits exact codepoint boundaries across mixed runs and preserves bold on equal text',()=>{
  const{bytes}=fixture(),doc=new AiDocument(bytes),location={kind:'body',position:{sectionIndex:0,paragraphIndex:0,charOffset:8},selection:{start:{sectionIndex:0,paragraphIndex:0,charOffset:6},end:{sectionIndex:0,paragraphIndex:0,charOffset:8}}};
  const index=doc.index('selection',location);assert.deepEqual(index.targets.map(t=>t.text),['중요']);const target=index.targets[0],edited=doc.apply([{id:target.id,before:target.text,after:'핵심'}]);
  const native=new HwpDocument(edited);try{assert.equal(native.getTextRange(0,0,0,native.getParagraphLength(0,0)),'각주 본문 핵심 안내입니다.');assert.equal(JSON.parse(native.getCharPropertiesAt(0,0,6)).bold,true);}finally{native.free();}
  assert.throws(()=>doc.apply([{id:target.id,before:'다른 원문',after:'변경'}]));assert.throws(()=>doc.apply([{id:target.id,before:target.text,after:'여러\n문단'}]));
});
test('note/header and cell selection resolve separate native caret coordinates, excluding unselected cells',()=>{
  const{bytes,table,controlCount}=fixture(),doc=new AiDocument(bytes);
  assert.equal(doc.index('paragraph',{kind:'note',section:0,paragraph:1,control:0,inner:0,offset:1}).targets[0].text,'각주 내용 가나다');
  assert.equal(doc.index('paragraph',{kind:'header',section:0,isHeader:true,applyTo:0,paragraph:0}).targets[0].text,'머리말 안내입니다.');
  assert.equal(doc.index('paragraph',{kind:'body',position:{sectionIndex:0,paragraphIndex:0,parentParaIndex:0,controlIndex:table,cellIndex:1,cellParaIndex:0,controlCount}}).targets[0].text,'표 둘째 내용입니다.');
  const targets=doc.index('selection',{kind:'body',position:{sectionIndex:0,paragraphIndex:0},cells:{startRow:0,endRow:1,startCol:0,endCol:1,excluded:['0,1'],context:{sec:0,ppi:0,ci:table,controlCount}}}).targets;assert.deepEqual(targets.map(t=>t.text),['표 첫째 내용입니다.']);
  assert.throws(()=>doc.index('selection',{kind:'body',position:{sectionIndex:0,paragraphIndex:0}}));
});
test('long paragraphs and 160-page documents have no 200-paragraph or 4000-character cutoff; non-XML assets stay byte-identical',()=>{
  if(!fs.existsSync('../build/editor-regressions/large-documents/large-mixed-160.hwpx'))execFileSync(process.execPath,['scripts/create-large-fixtures.mjs'],{stdio:'pipe'});
  const data=fs.readFileSync('../build/editor-regressions/large-documents/large-mixed-160.hwpx'),started=performance.now(),doc=new AiDocument(data),index=doc.index();assert.equal(index.targets.length,1600);assert(index.characters>150000);
  const selected=[index.targets[0],index.targets.at(-1)],edited=doc.apply(selected.map(t=>({id:t.id,before:t.text,after:t.text.replace('문서','자료')})));
  const original=unzipSync(data),result=unzipSync(edited);for(const name of Object.keys(original).filter(n=>n.startsWith('BinData/')))assert.deepEqual(result[name],original[name]);
  const native=new HwpDocument(edited);try{assert.equal(native.pageCount(),160);assert.equal(native.getParagraphCount(0),1601);}finally{native.free();}
  const report={bytes:data.length,paragraphs:1600,characters:index.characters,indexAndPatchMs:Math.round(performance.now()-started),imagesPreserved:8};fs.writeFileSync('../build/editor-regressions/ai-large-document.json',JSON.stringify(report,null,2));
  const empty=HwpDocument.createEmpty(),parts=unzipSync(empty.exportHwpx());empty.free();const long='한글😀 문장입니다. '.repeat(1000);parts['Contents/section0.xml']=strToU8(strFromU8(parts['Contents/section0.xml']).replace('</hs:sec>',`<hp:p id="99"><hp:run charPrIDRef="0"><hp:t>${long}</hp:t></hp:run></hp:p></hs:sec>`));const longDoc=new AiDocument(zipSync(parts)),chunks=longDoc.index().targets;assert.equal(chunks.map(t=>t.text).join('').replaceAll(' ',''),long.replaceAll(' ',''));assert(chunks.every(t=>Array.from(t.text).length<=2800));
});
test('native automatic note numbers and their whitespace anchors survive editing and HWP export',()=>{
  const d=new HwpDocument(fs.readFileSync('tests/fixtures/notes-objects.hwpx'));const note=JSON.parse(d.insertFootnote(0,0,5));
  const control=note.controlIndex??note.controlIdx;assert.notEqual(control,undefined);d.insertTextInFootnote(0,0,control,0,2,'각주 설명입니다.');
  const source=d.exportHwpx();d.free();const doc=new AiDocument(source),target=doc.index().targets.find(t=>t.region==='각주'&&t.text==='각주 설명입니다.');assert(target);
  const patched=doc.apply([{id:target.id,before:target.text,after:'각주 안내입니다.'}]);
  const counts=bytes=>strFromU8(unzipSync(bytes)['Contents/section0.xml']).match(/<hp:autoNum\b[^>]*>/g);assert.deepEqual(counts(patched),counts(source));
  const reopened=new HwpDocument(patched);try{const hwp=new HwpDocument(reopened.exportHwp());try{assert(new AiDocument(hwp.exportHwpx()).index().targets.some(t=>t.region==='각주'&&t.text==='각주 안내입니다.'));}finally{hwp.free();}}finally{reopened.free();}
});
test('MEMO field paragraphs are reviewed as comments and retain field references and metadata',()=>{
  const{bytes}=fixture(),archive=unzipSync(bytes),original=strFromU8(archive['Contents/section0.xml']);
  const memo='<hp:p id="910" paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0"><hp:ctrl><hp:fieldBegin id="900" type="MEMO" name="" editable="1" dirty="0" zorder="1" fieldid="900"><hp:parameters count="1"><hp:integerParam name="ID">900</hp:integerParam></hp:parameters><hp:subList id="901" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP"><hp:p id="902" paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0"><hp:t>주석 검토 내용입니다.</hp:t></hp:run></hp:p></hp:subList></hp:fieldBegin></hp:ctrl><hp:t>주석 연결 본문</hp:t><hp:ctrl><hp:fieldEnd beginIDRef="900"/></hp:ctrl></hp:run></hp:p>';
  archive['Contents/section0.xml']=strToU8(original.replace('</hs:sec>',memo+'</hs:sec>'));const doc=new AiDocument(zipSync(archive)),target=doc.index().targets.find(t=>t.region==='메모');assert.equal(target.text,'주석 검토 내용입니다.');
  const edited=doc.apply([{id:target.id,before:target.text,after:'주석 검토 설명입니다.'}]),xml=strFromU8(unzipSync(edited)['Contents/section0.xml']);assert(xml.includes('beginIDRef="900"'));assert(xml.includes('<hp:integerParam name="ID">900</hp:integerParam>'));
  const native=new HwpDocument(edited);try{assert(new AiDocument(native.exportHwpx()).index().targets.some(t=>t.region==='메모'&&t.text==='주석 검토 설명입니다.'));}finally{native.free();}
});
