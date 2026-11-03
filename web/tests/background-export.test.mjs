import test from 'node:test';import assert from 'node:assert/strict';
import{TextWidthCache}from'../studio/text-width-cache.ts';
import{ReplicaJournal,replayOperation,replicaMethodKind}from'../studio/replica-journal.ts';
test('width cache keeps exact actual-font widths, bounds memory and invalidates font changes',()=>{
  const cache=new TextWidthCache(2,1000);let reads=0;
  const read=()=>++reads*1.25;assert.equal(cache.measure('A','가',read),1.25);assert.equal(cache.measure('A','가',read),1.25);
  assert.equal(cache.measure('bold A','가',read),2.5);cache.measure('A','나',read);assert.equal(cache.diagnostics().entries,2);
  cache.clear();assert.equal(cache.measure('A','가',read),5);assert(cache.diagnostics().bytes<1000);
});
test('journal preserves argument snapshots and disables replay for unknown or failed mutations',()=>{
  class Doc{state=0;getText(){return this.state;}insertText(...args){this.state++;return args.length;}saveSnapshot(){return 72;}unknownEdit(){this.state++;}}
  const doc=new Doc(),journal=new ReplicaJournal(new Uint8Array([1]),'x.hwpx');journal.attach(doc);
  const array=[1];doc.insertText(array);array.push(2);doc.getText();doc.saveSnapshot();
  assert.deepEqual(journal.operations,[{method:'insertText',args:[[1]]},{method:'saveSnapshot',args:[],handle:72}]);
  doc.unknownEdit();assert.equal(journal.valid,false);assert.equal(journal.source.length,0);assert.equal(doc.state,2);
  assert.equal(replicaMethodKind('applyParaFormat'),'unsupported');assert.equal(replicaMethodKind('getCursorRect'),'read');
  assert.equal(replicaMethodKind('moveVertical'),'read');assert.equal(replicaMethodKind('moveTableOffset'),'unsupported');
});
test('replay translates snapshot and fragment handles without assuming native allocator IDs',()=>{
  const calls=[],doc={saveSnapshot:()=>900,restoreSnapshot:id=>calls.push(id),captureDeleteRange:()=>1200,restoreDeleteFragment:id=>calls.push(id)},handles=new Map();
  replayOperation(doc,{method:'saveSnapshot',args:[],handle:1},handles);replayOperation(doc,{method:'restoreSnapshot',args:[1]},handles);
  replayOperation(doc,{method:'captureDeleteRange',args:[0,0,0],handle:2},handles);replayOperation(doc,{method:'restoreDeleteFragment',args:[2]},handles);
  assert.deepEqual(calls,[900,1200]);assert.throws(()=>replayOperation(doc,{method:'restoreSnapshot',args:[99]},handles));
});
