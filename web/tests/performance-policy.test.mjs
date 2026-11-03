import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {MetricFailureGate} from '../studio/metric-failure-gate.ts';
import {collectPageGeometry} from '../studio/page-geometry.ts';
import {QuietTask} from '../studio/quiet-task.ts';
import {applyPerformancePolicy} from '../scripts/performance-policy.mjs';
import {capturePlainLine,plainLinePatch} from '../studio/plain-line-patch.ts';

test('deterministic metric errors stop repeated scans but document/font changes and invalidation retry',()=>{
  const gate=new MetricFailureGate(),doc={},generation={document:1,fonts:2};
  gate.record(doc,generation,Error('Temporary font fetch'));assert.equal(gate.matches(doc,generation),false);
  gate.record(doc,generation,'Canvas metrics: InvalidStyle');assert.equal(gate.matches(doc,generation),true);
  assert.equal(gate.matches({},generation),false);assert.equal(gate.matches(doc,{document:2,fonts:2}),false);
  assert.equal(gate.matches(doc,{document:1,fonts:3}),false);gate.clear();assert.equal(gate.matches(doc,generation),false);
});
test('large geometry collection yields and never returns a partial or superseded snapshot',async()=>{
  let time=0,yields=0,current=true;
  const clock={now:()=>time,yield:async()=>{yields++;}};
  const pages=await collectPageGeometry(160,i=>{time+=2;return i;},()=>current,clock);
  assert.equal(pages.length,160);assert(yields>40);
  assert.equal(await collectPageGeometry(160,i=>{time+=2;if(i===6)current=false;return i;},()=>current,clock),null);
});
test('fallback pagination waits for typing/composition to settle; an exact barrier cancels stale work',()=>{
  let now=0,lastActivity=0,active=false,id=0;const jobs=new Map(),ran=[];
  const clock={now:()=>now,lastActivity:()=>lastActivity,active:()=>active,
    request:(run,delay)=>{jobs.set(++id,{run,at:now+delay});return id;},cancel:id=>jobs.delete(id)};
  const task=new QuietTask(clock),tick=time=>{now=time;const due=[...jobs].filter(([,job])=>job.at<=now);for(const [id,job]of due){jobs.delete(id);job.run();}};
  task.schedule(()=>ran.push(1));lastActivity=300;tick(350);assert.deepEqual(ran,[]);
  active=true;tick(650);assert.deepEqual(ran,[]);active=false;tick(700);assert.deepEqual(ran,[1]);
  task.schedule(()=>ran.push('stale'));const stale=[...jobs.values()][0].run;task.cancel();stale();tick(1100);assert.deepEqual(ran,[1]);
});
test('pinned policies preserve full refresh paths and apply only to known modules',async()=>{
  const root='../build/rhwp-studio-source/rhwp-studio/src/';
  for(const name of ['main.ts','command/commands/table.ts','core/canvas-metric-session.ts','engine/input-handler.ts','engine/command.ts','view/canvas-view.ts','view/page-renderer.ts','view/render-surface-budget.ts']){
    const source=await fs.readFile(root+name,'utf8'),patched=applyPerformancePolicy(source,'/src/'+name);assert.notEqual(patched,source);
    if(name==='main.ts')assert(patched.includes("return exportInBackground(wasm,'hwpx');"));
    if(name.endsWith('/table.ts'))assert(patched.includes('operation: (wasm) => wasm.runInBatch(() => {'));
    if(name.endsWith('input-handler.ts'))assert(patched.includes('this.jakalPaginationFallback.cancel();'));
    if(name.endsWith('canvas-view.ts'))assert(patched.includes('if(preparedPages)this.pages=preparedPages;else'));
  }
  assert.equal(applyPerformancePolicy('unchanged','other.ts'),'unchanged');
});
test('only a stable single plain line receives a bounded patch; controls, mixed fonts, wrapping and moved geometry keep full paint',()=>{
  const engine={getParagraphLength:()=>24,getControlTextPositions:()=>[],getLineInfo:()=>({lineCount:1}),getCharShapeRuns:()=>[{}],getCursorRect:()=>({pageIndex:0,y:100,height:16}),getPageInfo:()=>({width:800,height:1100})};
  const before=capturePlainLine(engine,0,0),patch=plainLinePatch(before,capturePlainLine(engine,0,0));
  assert.deepEqual(patch,{pageIndex:0,x:0,y:68,width:800,height:80});
  for(const override of [{getControlTextPositions:()=>[0]},{getLineInfo:()=>({lineCount:2})},{getCharShapeRuns:()=>[{},{}]},{getParagraphLength:()=>3000}])assert.equal(capturePlainLine({...engine,...override},0,0),undefined);
  assert(capturePlainLine({...engine,getControlTextPositions:()=>[0,0],getControls:()=>['secd','cold'].map(ctrlId=>({ctrlId,list:0,para:0}))},0,0));
  assert.equal(capturePlainLine({...engine,getControlTextPositions:()=>[0],getControls:()=>[{ctrlId:'tbl ',list:0,para:0}]},0,0),undefined);
  for(const override of [{y:101},{height:20},{pageIndex:1},{width:900}])assert.equal(plainLinePatch(before,{...before,...override}),undefined);
});
