import test from 'node:test';import assert from 'node:assert/strict';import{gzipSync}from'node:zlib';
import{initializeCompressedWasm}from'../studio/compressed-wasm.ts';
const bytes=new Uint8Array([0,97,115,109,1,0,0,0]);
test('gzip stream initializes the original module bytes and uses its hashed cache entry',async()=>{
  let requested;
  const result=await initializeCompressedWasm(async options=>{assert.equal(options.module_or_path.headers.get('content-type'),'application/wasm');return new Uint8Array(await options.module_or_path.arrayBuffer());},'/engine-hash.wasm',
    {fetch:async(...args)=>{requested=args;return new Response(gzipSync(bytes));},Decompression:DecompressionStream,Response});
  assert.deepEqual(result,bytes);assert.deepEqual(requested,['/engine-hash.wasm.gz',{cache:'force-cache'}]);
});
test('actual stream signature handles retained encoding headers and fragmented or already decoded bodies',async()=>{
  for(const [payload,headers] of [[gzipSync(bytes),{'Content-Encoding':'gzip'}],[bytes,{'Content-Encoding':'gzip'}],[bytes,{}]]){
    let offset=0;
    const body=new ReadableStream({pull(controller){if(offset===payload.length)controller.close();else controller.enqueue(payload.subarray(offset,++offset));}});
    const result=await initializeCompressedWasm(async options=>new Uint8Array(await options.module_or_path.arrayBuffer()),'/engine.wasm',
      {fetch:async()=>new Response(body,{headers}),Decompression:DecompressionStream,Response});
    assert.deepEqual(result,bytes);
  }
});
test('HTTP errors, corrupt gzip and unsupported browsers preserve the original initializer',async()=>{
  for(const response of [new Response('',{status:404}),new Response(new Uint8Array([1,2,3]))]){
    let fallback=0;const value=await initializeCompressedWasm(async options=>{if(options)return options.module_or_path.arrayBuffer();fallback++;return 'original';},'/engine.wasm',
      {fetch:async()=>response,Decompression:DecompressionStream,Response});assert.equal(value,'original');assert.equal(fallback,1);
  }
  let fetched=false;assert.equal(await initializeCompressedWasm(async()=> 'original','/engine.wasm',{fetch:async()=>{fetched=true;},Decompression:undefined,Response}),'original');assert.equal(fetched,false);
});
