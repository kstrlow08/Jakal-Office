import init,{HwpDocument} from '@wasm/rhwp.js';
import wasmUrl from '@wasm/rhwp_bg.wasm?url';
import {initializeCompressedWasm} from './compressed-wasm';
import {installWorkerXml} from './worker-xml';
import {finalizeHwpx,exportCompatibleHwp} from './export-compat';
import {runReportedExport} from '@/core/export-content-loss';
import {replayOperation,replicaFingerprint} from './replica-journal';
import {widthKey} from './replica-measurements';
installWorkerXml();
let initialized:Promise<any>|undefined,doc:any=null,applied=0,identity='',handles=new Map<string,number>();
const widths=new Map<string,number>(),missing=new Map<string,[string,string]>();
(globalThis as any).measureTextWidth=(font:string,text:string)=>{
  const key=widthKey(font,text),value=widths.get(key);if(value!==undefined)return value;
  if(missing.size<1500)missing.set(key,[font,text]);return 0;
};
function reset(){doc?.free();doc=null;applied=0;handles.clear();}
function stable(value:any):any{return Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;}
function key(value:any){return JSON.stringify(stable(value));}
async function execute(data:any){
  widths.clear();
  for(const[k,v]of data.widths||[])widths.set(k,v);
  missing.clear();
  if(data.type==='finalize'){
    const hints=data.hints||{},source={getControlTextPositions:(s:number,p:number)=>hints[s+':'+p]?.positions||'[]',getTableProperties:(s:number,p:number,c:number)=>hints[s+':'+p]?.properties?.[c]||'{}'};
    const canonical=finalizeHwpx(data.bytes,source);
    if(data.format==='hwpx')return{bytes:canonical,route:'xml-worker'};
    await (initialized ||= initializeCompressedWasm(init,wasmUrl));
    const converted=new HwpDocument(canonical);
    try{const bytes=exportCompatibleHwp(converted,HwpDocument,runReportedExport).bytes;return missing.size?{missing:[...missing.values()]}:{bytes,route:'conversion-worker'};}
    finally{converted.free();}
  }
  await (initialized ||= initializeCompressedWasm(init,wasmUrl));
  if(data.identity!==identity||!doc){reset();identity=data.identity;doc=new HwpDocument(data.source);}
  for(let i=applied;i<data.operations.length;i++){replayOperation(doc,data.operations[i],handles);applied=i+1;}
  doc.flushDeferredPagination();
  const fingerprint=replicaFingerprint(doc);
  if(missing.size){const requested=[...missing.values()];reset();return{missing:requested};}
  if(key(fingerprint)!==key(data.fingerprint))throw Error('Replica content/geometry mismatch');
  let bytes;
  if(data.format==='hwp')bytes=exportCompatibleHwp(doc,HwpDocument,runReportedExport).bytes;
  else{const artifact=runReportedExport(()=>doc.exportHwpxWithReport());if(artifact.contentLoss.count)throw Error('Content loss in worker export');bytes=finalizeHwpx(artifact.bytes,doc);}
  if(missing.size){const requested=[...missing.values()];reset();return{missing:requested};}
  return{bytes,route:'replica-worker'};
}
let chain=Promise.resolve();
self.onmessage=event=>{const data=event.data;chain=chain.catch(()=>{}).then(async()=>{
  try{const result=await execute(data);(self as any).postMessage({id:data.id,...result},result.bytes?[result.bytes.buffer]:[]);}
  catch(error){const requested=[...missing.values()];reset();(self as any).postMessage(requested.length?{id:data.id,missing:requested}:{id:data.id,error:error instanceof Error?error.message:String(error)});}
});};
