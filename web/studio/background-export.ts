import {ReplicaJournal,replicaFingerprint} from './replica-journal';
import {replicaWidths,onReplicaFontsChanged} from './replica-measurements';
import {finalizeHwpx,exportCompatibleHwp} from './export-compat';
import {runReportedExport} from '@/core/export-content-loss';
import {HwpDocument} from '@wasm/rhwp.js';
const journals=new WeakMap<object,ReplicaJournal>(),clients=new WeakMap<object,WorkerClient>();
class WorkerClient {
  private worker:Worker|null=null;private pending=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void;timer:any}>();private next=0;private idle:any=null;
  close(){clearTimeout(this.idle);this.worker?.terminate();this.worker=null;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Worker released'));}this.pending.clear();}
  request(data:any){
    clearTimeout(this.idle);
    if(!this.worker){
      this.worker=new Worker(new URL('./document-worker.ts',import.meta.url),{type:'module'});
      this.worker.onmessage=({data})=>{const p=this.pending.get(data.id);if(!p)return;this.pending.delete(data.id);clearTimeout(p.timer);data.error?p.reject(Error(data.error)):p.resolve(data);if(!this.pending.size)this.idle=setTimeout(()=>this.close(),45000);};
      this.worker.onerror=()=>this.close();
    }
    const id=++this.next;return new Promise<any>((resolve,reject)=>{const timer=setTimeout(()=>{this.close();reject(Error('Background export timeout'));},90000);this.pending.set(id,{resolve,reject,timer});this.worker!.postMessage({...data,id});});
  }
}
export function registerBackgroundDocument(doc:any,source:Uint8Array,name:string,checkpoint=false){
  journals.get(doc)?.invalidate('checkpoint-replaced');clients.delete(doc);
  const copy=new Uint8Array(source),journal=new ReplicaJournal(copy,name);
  if(checkpoint)journal.operations.push({method:'convertToEditable',args:[]},{method:'setFileName',args:[name]});
  const unlisten=onReplicaFontsChanged(()=>journal.invalidate('font-resources-changed'));
  journal.onInvalidate=()=>{unlisten();clients.get(doc)?.close();};
  journals.set(doc,journal);journal.attach(doc);
}
function tableHints(doc:any){
  const hints:Record<string,any>={};
  for(let s=0;s<doc.getSectionCount();s++)for(let p=0,count=doc.getParagraphCount(s);p<count;p++){
    const positions=doc.getControlTextPositions(s,p),parsed=JSON.parse(positions);if(!parsed.length)continue;
    const properties:Record<number,string>={};let found=false;
    for(let c=0;c<parsed.length;c++)try{const raw=doc.getTableProperties(s,p,c),value=JSON.parse(raw);if(typeof value.repeatHeader==='boolean'&&value.tableWidth!==undefined){properties[c]=raw;found=true;}}catch{}
    if(found)hints[s+':'+p]={positions,properties};
  }
  return hints;
}
function hintDocument(hints:Record<string,any>){return{getControlTextPositions:(s:number,p:number)=>hints[s+':'+p]?.positions||'[]',getTableProperties:(s:number,p:number,c:number)=>hints[s+':'+p]?.properties?.[c]||'{}'};}
function report(route:string,started:number,reason?:string){const root=document.documentElement;root.dataset.jakalExportRoute=route;root.dataset.jakalExportMs=String(Math.round(performance.now()-started));if(reason)root.dataset.jakalExportFallback=reason.slice(0,160);else delete root.dataset.jakalExportFallback;}
export async function exportInBackground(wasm:any,format:'hwpx'|'hwp'){
  const started=performance.now(),doc=wasm.doc,generation=wasm.documentGeneration,journal=journals.get(doc);
  if(!doc)throw Error('문서를 먼저 열어 주세요.');
  wasm.onBeforeExport?.();
  const current=()=>wasm.doc===doc&&wasm.documentGeneration===generation;
  let reason='';
  if(typeof Worker==='function'&&journal?.valid&&(journal.source.byteLength>=256*1024||wasm.pageCount>30)){
    let client=clients.get(doc);if(!client){client=new WorkerClient();clients.set(doc,client);}
    try{
      const operations=journal.operations.slice(),fingerprint=replicaFingerprint(doc);
      for(let attempt=0;attempt<3;attempt++){
        const result=await client.request({type:'replica',identity:generation+':'+journal.fileName,source:journal.source,operations,fingerprint,widths:replicaWidths(),format});
        if(!current())throw Error('저장 중 문서가 변경되었습니다.');
        if(!journal.valid)throw Error('Replica invalidated during export');
        if(result.missing){
          for(let i=0;i<result.missing.length;i++){
            const [font,text]=result.missing[i];(globalThis as any).measureTextWidth(font,text);
            if(i%32===31)await new Promise(resolve=>setTimeout(resolve,0));
          }
          continue;
        }
        report(result.route,started);return result.bytes as Uint8Array;
      }
      throw Error('Worker measurement budget');
    }catch(error){if(!current())throw error;reason=error instanceof Error?error.message:String(error);}
  }else reason=journal?.reason||'worker-unavailable-or-small';
  // Unknown edits keep the established native content-loss fence. Only its XML,
  // ZIP repairs and HWP conversion move off the UI thread in this path.
  const artifact=wasm.exportHwpxWithReport();
  if(artifact.contentLoss.count)throw Error('저장 과정에서 지원하지 않는 개체가 발견되어 원본을 유지했습니다.');
  const hints=tableHints(doc);
  // The native snapshot already paid for this exact state. Resume background
  // saving from it after a font change or previously unsupported edit. Old undo
  // handles deliberately fall back again if they predate this checkpoint.
  registerBackgroundDocument(doc,artifact.bytes,wasm.fileName||journal?.fileName||'document.hwpx',true);
  if(typeof Worker==='function'){
    let client=clients.get(doc);if(!client){client=new WorkerClient();clients.set(doc,client);}
    try{for(let attempt=0;attempt<3;attempt++){
      const result=await client.request({type:'finalize',bytes:artifact.bytes,hints,format,widths:replicaWidths()});
      if(!current())throw Error('저장 중 문서가 변경되었습니다.');
      if(result.missing){for(let i=0;i<result.missing.length;i++){const[font,text]=result.missing[i];(globalThis as any).measureTextWidth(font,text);if(i%32===31)await new Promise(resolve=>setTimeout(resolve,0));}continue;}
      report(result.route,started,reason);return result.bytes as Uint8Array;
    }throw Error('Worker measurement budget');}
    catch(error){if(!current())throw error;reason=String(error);}
  }
  const canonical=finalizeHwpx(artifact.bytes,hintDocument(hints));
  if(format==='hwpx'){report('main-fallback',started,reason);return canonical;}
  const converted=new HwpDocument(canonical);try{const bytes=exportCompatibleHwp(converted,HwpDocument,runReportedExport).bytes;report('main-fallback',started,reason);return bytes;}finally{converted.free();}
}
