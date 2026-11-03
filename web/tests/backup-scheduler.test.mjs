import test from 'node:test';import assert from 'node:assert/strict';import {createBackupScheduler}from '../online/backup-scheduler.mjs';
test('large files wait for settled interaction; new input, composition and manual cancellation discard queued idle work',async()=>{
  const timers=new Map(),idle=new Map();let id=0,calls=0;const delays=[];
  const clock={setTimeout:(fn,ms)=>{const n=++id;timers.set(n,fn);delays.push(ms);return n;},clearTimeout:n=>timers.delete(n),requestIdleCallback:fn=>{const n=++id;idle.set(n,fn);return n;},cancelIdleCallback:n=>idle.delete(n)};
  const backup=createBackupScheduler({run:()=>calls++,onError:()=>{},clock});
  backup.schedule(6*1024*1024);assert.equal(delays.at(-1),20000);let job=[...timers.values()][0];timers.clear();job();assert.equal(idle.size,1);
  backup.schedule(6*1024*1024,true);assert.equal(idle.size,0);assert.equal(timers.size,0);await Promise.resolve();assert.equal(calls,0);
  backup.schedule(100);assert.equal(delays.at(-1),1800);job=[...timers.values()][0];timers.clear();job();const stale=[...idle.values()][0];backup.cancel();stale();await Promise.resolve();assert.equal(calls,0);
  backup.schedule(100);job=[...timers.values()][0];timers.clear();job();[...idle.values()][0]();await Promise.resolve();assert.equal(calls,1);
});
