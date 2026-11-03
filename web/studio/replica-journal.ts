const readOnly=/^(get|has|is|can|find|hitTest|search|render|pageCount|snapshotCapacity|collectCanvasMetricRequests|canvasMetricsActive)/;
const ignored=new Set(['setShowControlCodes','setShowParagraphMarks','setShowTransparentBorders','setClipEnabled','selectCanvasMetrics','clearEventLog',
  'moveVertical','moveVerticalByPath','moveVerticalEx','navigateHeaderFooterByPage','navigateNextEditable']);
const supported=new Set(['convertToEditable','ensureParagraphStableIds','setFileName','setCaretPosition','clearActiveField','setActiveField','setActiveFieldInCell','setActiveFieldByPath',
  'replaceBodyTextLocal','insertText','deleteText','insertTextInCell','deleteTextInCell','insertTextInCellDeferredPagination','deleteTextInCellDeferredPagination','replaceTextInCellDeferredPagination',
  'insertTableRow','insertTableColumn','deleteTableRow','deleteTableColumn','beginBatch','endBatch','beginDeferredPagination','stepDeferredPagination','cancelDeferredPagination','flushDeferredPagination',
  'saveSnapshot','restoreSnapshot','discardSnapshot','captureDeleteRange','restoreDeleteFragment','discardDeleteFragment','captureSectionRaw','restoreSectionRaw','discardSectionRaw']);
export function replicaMethodKind(name:string){return readOnly.test(name)||ignored.has(name)?'read':supported.has(name)?'write':'unsupported';}
export type ReplicaOperation={method:string;args:any[];handle?:number};
export class ReplicaJournal {
  operations:ReplicaOperation[]=[];valid=true;reason='';private bytes=0;
  source:Uint8Array;fileName:string;onInvalidate:()=>void;
  constructor(source:Uint8Array,fileName:string,onInvalidate=()=>{}){this.source=source;this.fileName=fileName;this.onInvalidate=onInvalidate;}
  invalidate(reason:string){if(!this.valid)return;this.valid=false;this.reason=reason;this.source=new Uint8Array();this.operations=[];this.onInvalidate();}
  attach(doc:any){
    for(const name of Object.getOwnPropertyNames(Object.getPrototypeOf(doc))){
      if(name==='constructor')continue;const descriptor=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(doc),name);
      if(typeof descriptor?.value!=='function')continue;const original=descriptor.value,kind=replicaMethodKind(name),journal=this;
      Object.defineProperty(doc,name,{configurable:true,value:function(...args:any[]){
        if(name==='free')journal.invalidate('document-released');
        else if(kind==='unsupported')journal.invalidate('unsupported:'+name);
        let result;
        try{result=original.apply(this,args);}catch(error){if(kind==='write')journal.invalidate('mutation-failed:'+name);throw error;}
        if(journal.valid&&kind==='write'){
          try{const entry:ReplicaOperation={method:name,args:structuredClone(args)};
            if(['saveSnapshot','captureDeleteRange','captureSectionRaw'].includes(name))entry.handle=result;
            const bytes=JSON.stringify(entry).length*2;
            if(journal.operations.length>=6000||journal.bytes+bytes>2*1024*1024)journal.invalidate('journal-budget');
            else{journal.operations.push(entry);journal.bytes+=bytes;}
          }catch{journal.invalidate('nonportable-arguments:'+name);}
        }
        return result;
      }});
    }
  }
}
const handleFamily:Record<string,string>={saveSnapshot:'snapshot',restoreSnapshot:'snapshot',discardSnapshot:'snapshot',captureDeleteRange:'fragment',restoreDeleteFragment:'fragment',discardDeleteFragment:'fragment',captureSectionRaw:'section',restoreSectionRaw:'section',discardSectionRaw:'section'};
export function replayOperation(doc:any,operation:ReplicaOperation,handles:Map<string,number>){
  const args=structuredClone(operation.args),family=handleFamily[operation.method];
  if(family&&operation.handle===undefined){const id=handles.get(family+':'+args[0]);if(id===undefined)throw Error('Missing replay handle');args[0]=id;}
  if(typeof doc[operation.method]!=='function')throw Error('Unsupported worker binding');
  const result=doc[operation.method](...args);
  if(operation.handle!==undefined)handles.set(family+':'+operation.handle,result);
  return result;
}
/** Compare content and table geometry without exporting the UI's entire document. */
export function replicaFingerprint(doc:any){
  const sections=doc.getSectionCount(),paragraphs=Array.from({length:sections},(_,s)=>doc.getParagraphCount(s)),tables:any[]=[];
  const controls=JSON.parse(doc.getControls());
  for(const control of controls){
    if(String(control.ctrlId).trim()!=='tbl'||control.list>=sections)continue;
    try{tables.push([control.list,control.para,control.controlIndex,JSON.parse(doc.getTableDimensions(control.list,control.para,control.controlIndex)),JSON.parse(doc.getTableProperties(control.list,control.para,control.controlIndex))]);}catch{/* Nested list is not a body section. */}
  }
  return {text:doc.getTextFileText(),paragraphs,tables};
}
