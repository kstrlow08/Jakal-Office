/** Content-hashed static gzip avoids a large transfer on hosts without gzip negotiation. */
function report(route:string,fallback?:string){
  if(!globalThis.document?.documentElement)return;
  const data=globalThis.document.documentElement.dataset;
  data.jakalEngineTransfer=route;
  if(fallback)data.jakalEngineFallback=fallback.slice(0,180);else delete data.jakalEngineFallback;
}
async function decodedWasmBody(body:ReadableStream<Uint8Array>,Decompression:typeof DecompressionStream){
  const reader=body.getReader(),chunks:Uint8Array[]=[],prefix=new Uint8Array(4);
  let length=0;
  while(length<4){
    const {value,done}=await reader.read();
    if(done)break;
    chunks.push(value);
    const count=Math.min(value.length,4-length);
    prefix.set(value.subarray(0,count),length);length+=count;
  }
  const gzip=length>=2&&prefix[0]===0x1f&&prefix[1]===0x8b;
  const wasm=length===4&&prefix[0]===0&&prefix[1]===0x61&&prefix[2]===0x73&&prefix[3]===0x6d;
  if(!gzip&&!wasm){await reader.cancel();throw new Error('Invalid engine signature');}
  const replay=new ReadableStream<Uint8Array>({
    start(controller){for(const chunk of chunks)controller.enqueue(chunk);},
    async pull(controller){const {value,done}=await reader.read();if(done)controller.close();else controller.enqueue(value);},
    cancel(reason){return reader.cancel(reason);},
  });
  // CDN/proxy decoding can retain Content-Encoding or leave another gzip layer.
  // Inspect actual bytes, replaying the prefix so compilation remains streaming.
  return gzip?replay.pipeThrough(new Decompression('gzip')):replay;
}
export async function initializeCompressedWasm(initialize:(options?:any)=>Promise<any>,url:string,
  env={fetch:globalThis.fetch.bind(globalThis),Decompression:globalThis.DecompressionStream,Response:globalThis.Response}){
  if(typeof env.Decompression!=='function'){report('standard','DecompressionStream unavailable');return initialize();}
  let stage='fetch';
  try{
    const response=await env.fetch(url+'.gz',{cache:'force-cache'});
    if(!response.ok||!response.body)throw new Error(`Compressed engine HTTP ${response.status}`);
    stage='decode';
    const decoded=await decodedWasmBody(response.body,env.Decompression);
    stage='initialize';
    const module=await initialize({module_or_path:new env.Response(decoded,{headers:{'Content-Type':'application/wasm'}})});
    report('gzip');return module;
  }catch(error){report('standard',`${stage}: ${error instanceof Error?error.message:String(error)}`);return initialize();}
}
