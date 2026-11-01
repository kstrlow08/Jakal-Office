import test from 'node:test';
import assert from 'node:assert/strict';
import { installResponsiveFit } from '../studio/responsive-fit.ts';
test('resize bursts coalesce, fit rules follow the viewport, manual zoom and loading are left alone',()=>{
  let resize,run,requests=0,mode='fitWidth',ready=true;const calls=[];
  const stop=installResponsiveFit({addEventListener:(_e,fn)=>resize=fn,removeEventListener:()=>resize=null,
    requestAnimationFrame:fn=>{requests++;run=fn;return requests;},cancelAnimationFrame:()=>run=null},
    {mode:()=>mode,ready:()=>ready,apply:value=>calls.push(value)});
  resize();resize();resize();assert.equal(requests,1);run();assert.deepEqual(calls,['fitWidth']);
  mode='none';resize();run();assert.equal(calls.length,1);
  mode='fitPage';ready=false;resize();run();assert.equal(calls.length,1);
  ready=true;resize();run();assert.deepEqual(calls,['fitWidth','fitPage']);stop();assert.equal(resize,null);
});
