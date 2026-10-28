import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {resolve} from 'node:path';
const bundle=await build({entryPoints:['studio/ai-target.ts'],bundle:true,platform:'node',format:'esm',write:false,alias:{'@':resolve('../build/rhwp-studio-source/rhwp-studio/src'),'@noble/hashes':resolve('node_modules/@noble/hashes')}});
const {readAiTarget,listAiTargets}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
test('AI target reads reject empty, cell and oversized targets before touching the document',()=>{
 const wasm=new Proxy({},{get(){assert.fail('invalid target must not read native state');}});
 for(const target of [null,{kind:'cell',charOffset:0,length:2},{kind:'body_paragraph',charOffset:0,length:0},{kind:'body_paragraph',charOffset:0,length:4001}])assert.throws(()=>readAiTarget(wasm,target));
});
test('AI paragraph picker skips empty and control-bearing paragraphs and retains exact addresses',()=>{
 const texts=['','본문 문단','개체 문단','다른 문단'];const wasm={getSectionCount:()=>1,getParagraphCount:()=>4,getParagraphLength:(_s,p)=>texts[p].length,getControlTextPositions:(_s,p)=>p===2?[{type:'table'}]:[],getTextRange:(_s,p)=>texts[p]};
 const targets=listAiTargets(wasm);assert.deepEqual(targets.map(p=>p.target.paragraph),[1,3]);assert.equal(targets[0].preview,'본문 문단');assert.equal(targets[0].target.length,texts[1].length);
});
