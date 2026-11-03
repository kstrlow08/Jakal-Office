// Deterministic local stress documents: real text, tables and PNG payloads.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import init, { HwpDocument } from '@rhwp/core';
const web=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
await init({module_or_path:fs.readFileSync(path.join(web,'node_modules/@rhwp/core/rhwp_bg.wasm'))});
const out=path.resolve(web,'../build/editor-regressions/large-documents');fs.mkdirSync(out,{recursive:true});
const blank=HwpDocument.createEmpty();let archive;
try{archive=unzipSync(blank.exportHwpx());}finally{blank.free();}
const section=strFromU8(archive['Contents/section0.xml']);
const paragraphs=[];const pageTotal=160, perPage=10;
for(let page=0;page<pageTotal;page++)for(let line=0;line<perPage;line++){
  const marker=line===0?`대용량 검증 ${String(page+1).padStart(3,'0')}쪽`:'';
  const text=`${marker} ${line+1}. 문서 로딩과 스크롤, 글자 입력 및 표 편집의 반응을 확인하는 공개 테스트 본문입니다. `+`정확한 문서 구조와 서식을 유지하면서 긴 문서를 편집합니다. `.repeat(2);
  paragraphs.push(`<hp:p id="${page*perPage+line+1}" paraPrIDRef="0" styleIDRef="0" pageBreak="${page>0&&line===0?1:0}" columnBreak="0" merged="0"><hp:run charPrIDRef="0"><hp:t>${text}</hp:t></hp:run></hp:p>`);
}
archive['Contents/section0.xml']=strToU8(section.replace('</hs:sec>',paragraphs.join('')+'</hs:sec>'));
const doc=new HwpDocument(zipSync(archive,{level:1}));
const tableParas=[];for(let i=0;i<16;i++){
  const para=1+i*100;const result=JSON.parse(doc.createTableEx(JSON.stringify({sectionIdx:0,paraIdx:para,charOffset:0,rowCount:10,colCount:6,treatAsChar:true})));
  if(!result.ok)throw new Error(JSON.stringify(result));tableParas.push(para);
}
function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let n=0;n<8;n++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(type,bytes){const t=Buffer.from(type),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(bytes.length);crc.writeUInt32BE(crc32(Buffer.concat([t,bytes])));return Buffer.concat([size,t,bytes,crc]);}
function picture(seed){const side=512,raw=Buffer.alloc((side*3+1)*side);let state=seed;
  for(let y=0;y<side;y++)for(let x=0;x<side*3;x++){state=(Math.imul(state,1664525)+1013904223)>>>0;raw[y*(side*3+1)+1+x]=state>>>24;}
  const hdr=Buffer.alloc(13);hdr.writeUInt32BE(side,0);hdr.writeUInt32BE(side,4);hdr[8]=8;hdr[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',hdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
for(let i=0;i<8;i++){
  const result=JSON.parse(doc.insertPicture(0,51+i*200,0,'',picture(i+1),22000,16000,512,512,'png','성능 검증용 합성 화소 이미지'));
  if(!result.ok)throw new Error(JSON.stringify(result));
}
const files=[];for(const [ext,bytes]of [['hwpx',doc.exportHwpx()],['hwp',doc.exportHwp()]]){
  const file=path.join(out,`large-mixed-160.${ext}`);fs.writeFileSync(file,bytes);
  const reopened=new HwpDocument(bytes);files.push({file,format:ext,bytes:bytes.length,pages:reopened.pageCount(),paragraphs:reopened.getParagraphCount(0),tables:16,cells:960,images:8});reopened.free();
}
doc.free();fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({seed:'deterministic',pageBreaks:159,tableParas,files},null,2));console.log(JSON.stringify(files));
