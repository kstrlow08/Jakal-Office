import {unzipSync,strFromU8,strToU8} from 'fflate';
import {DOMParser,XMLSerializer} from '@xmldom/xmldom';
import {patchZipEntries} from '../studio/zip-patch.ts';
import {diffText} from './ai-diff.mjs';

const HP='http://www.hancom.co.kr/hwpml/2011/paragraph';
const children=n=>Array.from(n?.childNodes||[]).filter(n=>n.nodeType===1);
const is=(n,name)=>n?.namespaceURI===HP&&n.localName===name;
const paras=n=>children(n).filter(n=>is(n,'p'));
const all=(n,name)=>Array.from(n?.getElementsByTagNameNS(HP,name)||[]);
const cp=s=>Array.from(s);
const length=s=>cp(s).length;
const parse=text=>{
  if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('문서 XML에 지원하지 않는 선언이 있습니다.');
  return new DOMParser({onError(level,message){if(level!=='warning')throw Error('문서 XML을 읽지 못했습니다: '+message);}}).parseFromString(text,'application/xml');
};
function controls(p){return children(p).filter(n=>is(n,'run')).flatMap(run=>children(run).flatMap(n=>is(n,'t')?[]:is(n,'ctrl')?children(n):[n]));}
function rootControls(p,count){
  const list=controls(p);
  // Native HWP may omit the default column definition. HWPX export synthesizes
  // colPr (sometimes secPr too), which must not shift a captured control index.
  if(!Number.isSafeInteger(count)||count===list.length)return list;
  const noColumn=list.filter(n=>!is(n,'colPr'));if(noColumn.length===count)return noColumn;
  const noSection=noColumn.filter(n=>!is(n,'secPr'));if(noSection.length===count)return noSection;
  return [];
}
function cellList(table){return children(table).filter(n=>is(n,'tr')).flatMap(row=>children(row).filter(n=>is(n,'tc')));}
function subParas(node){const list=children(node).find(n=>is(n,'subList'))||all(node,'subList')[0];return paras(list);}
function region(p){
  const tags=[];for(let n=p.parentNode;n?.nodeType===1;n=n.parentNode)tags.push(is(n,'fieldBegin')&&n.getAttribute('type')==='MEMO'?'memo':n.localName);
  const names={footNote:'각주',endNote:'미주',header:'머리말',footer:'꼬리말',memo:'메모',memoContent:'메모',caption:'캡션',drawText:'글상자',tc:'표 셀',masterPage:'바탕쪽'};
  return [...new Set(tags.map(n=>names[n]).filter(Boolean))].reverse().join(' · ')||'본문';
}
/** Text runs only. Object/field/numbering elements remain immutable boundaries. */
function textFlow(p){
  let offset=0,group=0;const nodes=[];
  const text=n=>{if(n.nodeType===3||n.nodeType===4){const size=length(n.data);if(size)nodes.push({node:n,start:offset,end:offset+size,group});offset+=size;return;}
    if(n.nodeType!==1)return;
    // Tabs and explicit line breaks are not sent to AI or replaced with spaces.
    group++;if(['tab','lineBreak','nbSpace','fwSpace'].includes(n.localName))offset++;group++;
  };
  for(const run of children(p).filter(n=>is(n,'run')))for(const n of children(run)){
    if(is(n,'t'))for(const child of Array.from(n.childNodes))text(child);else group++;
  }
  return {nodes,length:offset};
}
function chunks(text,max=2800){
  const chars=cp(text),out=[];let start=0;
  while(start<chars.length){let end=Math.min(chars.length,start+max);
    if(end<chars.length){const floor=start+Math.floor(max*.6);for(let i=end;i>floor;i--)if(/[\s.!?。]/u.test(chars[i-1])){end=i;break;}}
    out.push({start,end,text:chars.slice(start,end).join('')});start=end;
  }return out;
}
function nearestBody(p,root){let n=p;while(n?.parentNode&&n.parentNode!==root)n=n.parentNode;return is(n,'p')?n:null;}
function resolvePosition(xml,position){
  const section=xml.get(`Contents/section${position.sectionIndex}.xml`);if(!section)return null;
  let p=paras(section.documentElement)[position.parentParaIndex??position.paragraphIndex];if(!p)return null;
  if(position.cellPath?.length){let first=true;for(const path of position.cellPath){const table=(first?rootControls(p,position.controlCount):controls(p))[path.controlIndex];first=false;const cell=cellList(table)[path.cellIndex];p=subParas(cell)[path.cellParaIndex];if(!p)return null;}return p;}
  if(position.controlIndex!==undefined){const ctrl=rootControls(p,position.controlCount)[position.controlIndex];if(!ctrl)return null;
    p=subParas(position.isTextBox?ctrl:cellList(ctrl)[position.cellIndex])[position.cellParaIndex??position.paragraphIndex];
  }return p;
}
function resolveLocation(xml,location){
  if(!location)return {};
  if(location.kind==='body'){
    const range=location.selection;return {current:resolvePosition(xml,location.position),start:range&&resolvePosition(xml,range.start),end:range&&resolvePosition(xml,range.end),
      from:range?.start.charOffset,to:range?.end.charOffset,cells:location.cells,bodyRange:range?.start.parentParaIndex===undefined&&range?.end.parentParaIndex===undefined};
  }
  const section=xml.get(`Contents/section${location.section}.xml`);if(!section)return {};
  let list;
  if(location.kind==='header'){
    const type=['BOTH','EVEN','ODD'][location.applyTo];
    const ctrl=all(section,location.isHeader?'header':'footer').find(n=>n.getAttribute('applyPageType')===type||n.getAttribute('type')===type);
    list=ctrl?subParas(ctrl):[];
  }else{const p=paras(section.documentElement)[location.paragraph],ctrl=p&&rootControls(p,location.controlCount)[location.control];list=ctrl?subParas(ctrl):[];}
  const index=n=>n?.paraIdx??n?.fnParaIdx;
  return {current:list[location.kind==='header'?location.paragraph:location.inner],start:location.selection&&list[index(location.selection.start)],end:location.selection&&list[index(location.selection.end)],from:location.selection?.start.charOffset,to:location.selection?.end.charOffset};
}
function selectedCells(xml,selection){
  const c=selection.context;if(!c)return [];
  const section=xml.get(`Contents/section${c.sec}.xml`);let p=section&&paras(section.documentElement)[c.ppi];
  if(!p)return [];
  let first=true;if(c.cellPath?.length>1)for(const segment of c.cellPath.slice(0,-1)){p=subParas(cellList((first?rootControls(p,c.controlCount):controls(p))[segment.controlIndex])[segment.cellIndex])[segment.cellParaIndex];first=false;if(!p)return [];}
  const table=(first?rootControls(p,c.controlCount):controls(p))[c.cellPath?.at(-1)?.controlIndex??c.ci];if(!table)return [];
  return cellList(table).filter(cell=>{const addr=children(cell).find(n=>is(n,'cellAddr'));const row=Number(addr?.getAttribute('rowAddr')),col=Number(addr?.getAttribute('colAddr'));return row>=selection.startRow&&row<=selection.endRow&&col>=selection.startCol&&col<=selection.endCol&&!selection.excluded?.includes(`${row},${col}`);});
}
function within(node,parent){for(let n=node;n;n=n.parentNode)if(n===parent)return true;return false;}

export class AiDocument {
  constructor(bytes){
    this.bytes=new Uint8Array(bytes);this.xml=new Map();this.paragraphs=[];
    let expanded=0;
    const entries=unzipSync(this.bytes,{filter:file=>{if(!/^Contents\/.*\.xml$/i.test(file.name)||/\/header\.xml$/i.test(file.name))return false;expanded+=file.originalSize;if(expanded>80*1024*1024)throw Error('문서 XML이 너무 큽니다. 문서를 나누어 열어 주세요.');return true;}});
    for(const name of Object.keys(entries).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))){
      const xml=parse(strFromU8(entries[name]));this.xml.set(name,xml);const body=paras(xml.documentElement),section=Number(name.match(/section(\d+)\.xml$/)?.[1]??-1);
      for(const p of all(xml,'p')){const flow=textFlow(p),root=nearestBody(p,xml.documentElement),bodyIndex=body.indexOf(root);
        this.paragraphs.push({id:`p${this.paragraphs.length}`,name,node:p,section,bodyIndex,region:region(p),flow});}
    }
    this.byNode=new Map(this.paragraphs.map(p=>[p.node,p]));this.targets=new Map();
  }
  index(scope='document',location=null,targetId=null){
    const resolved=resolveLocation(this.xml,location),start=this.byNode.get(resolved.start),end=this.byNode.get(resolved.end),current=this.byNode.get(resolved.current);
    const first=start&&this.paragraphs.indexOf(start),last=end&&this.paragraphs.indexOf(end),cells=resolved.cells&&selectedCells(this.xml,resolved.cells);
    if(scope==='selection'&&!cells?.length&&(!start||!end||first===last&&resolved.from===resolved.to))throw Error('편집할 글자나 표 셀을 먼저 선택해 주세요.');
    if(scope==='paragraph'&&!targetId&&!current)throw Error('문단 안을 클릭하거나 문서 전체에서 편집할 영역을 골라 주세요.');
    const targets=[];this.targets.clear();
    for(let i=0;i<this.paragraphs.length;i++){
      const p=this.paragraphs[i];let from=0,to=p.flow.length;
      if(scope==='paragraph'&&p.id!==(targetId||current?.id))continue;
      if(scope==='selection'){
        if(cells?.length){if(!cells.some(cell=>within(p.node,cell)))continue;}
        else {if(i<first||i>last)continue;
          // A text selection in one container must not expand into its anchored notes.
          if(!resolved.bodyRange&&p.node.parentNode!==start.node.parentNode)continue;
          if(p===start)from=resolved.from;if(p===end)to=resolved.to;
        }
      }
      const groups=[];
      for(const item of p.flow.nodes){const a=Math.max(from,item.start),b=Math.min(to,item.end);if(a>=b)continue;
        const text=cp(item.node.data).slice(a-item.start,b-item.start).join('');let group=groups.at(-1);
        if(!group||group.group!==item.group||group.end!==a){group={group:item.group,start:a,end:a,text:''};groups.push(group);}group.text+=text;group.end=b;
      }
      for(const group of groups)for(const chunk of chunks(group.text)){
        const text=chunk.text.trim();if(!text)continue;
        // Note-number placeholders and boundary whitespace are structural anchors.
        // Keep them outside AI replacement ranges, including chunk boundaries.
        const leading=length(chunk.text)-length(chunk.text.trimStart()),trailing=length(chunk.text)-length(chunk.text.trimEnd());
        const a=group.start+chunk.start+leading,b=group.start+chunk.end-trailing,id=`${p.id}:${a}:${b}`;
        const target={id,paragraph:p.id,region:p.region,label:`${p.section>=0?`${p.section+1}구역 · `:''}${p.region} · ${p.bodyIndex>=0?p.bodyIndex+1:i+1}문단`,text,start:a,end:b};
        targets.push(target);this.targets.set(id,{...target,p});
      }
    }
    const regions={};for(const target of targets)regions[target.region]=(regions[target.region]||0)+1;
    return {targets,regions,characters:targets.reduce((n,t)=>n+length(t.text),0),current:current?.id};
  }
  apply(changes){
    if(!Array.isArray(changes)||!changes.length)throw Error('선택한 변경이 없습니다.');
    const seen=new Set(),prepared=[];
    for(const change of changes){const target=this.targets.get(change.id);
      if(!target||seen.has(change.id)||change.before!==target.text||typeof change.after!=='string'||!change.after.trim()||length(change.after)>4000||/[\u0000-\u001f\u007f]/u.test(change.after))throw Error('수정 대상이 원문과 일치하지 않습니다. 다시 읽어 주세요.');
      seen.add(change.id);let offset=target.start;
      for(const part of diffText(change.before,change.after)){if(part.equal!==undefined){offset+=length(part.equal);continue;}prepared.push({p:target.p,start:offset,end:offset+length(part.before),scopeStart:target.start,scopeEnd:target.end,text:part.after});offset+=length(part.before);}
    }
    // Serialize patches against clones; a failed or repeated apply never mutates the baseline.
    const changedNames=new Set(prepared.map(p=>p.p.name)),clones=new Map([...changedNames].map(name=>[name,this.xml.get(name).cloneNode(true)]));
    const clonedParagraphs=new Map();for(const[name,xml]of clones){const originals=this.paragraphs.filter(p=>p.name===name),nodes=all(xml,'p');originals.forEach((p,i)=>clonedParagraphs.set(p.id,nodes[i]));}
    const byParagraph=new Map();for(const patch of prepared){if(!byParagraph.has(patch.p.id))byParagraph.set(patch.p.id,[]);byParagraph.get(patch.p.id).push(patch);}
    for(const[id,patches]of byParagraph){const p=clonedParagraphs.get(id),flow=textFlow(p);patches.sort((a,b)=>b.start-a.start||b.scopeStart-a.scopeStart);
      for(const patch of patches){const nodes=flow.nodes.filter(n=>n.end>patch.scopeStart&&n.start<patch.scopeEnd),affected=nodes.filter(n=>n.end>patch.start&&n.start<patch.end);
        const anchor=affected[0]||nodes.find(n=>n.start<=patch.start&&n.end>patch.start)||nodes.findLast(n=>n.end===patch.start);
        if(!anchor)throw Error('수정할 텍스트 위치를 찾지 못했습니다.');
        for(const item of affected){const chars=cp(item.node.data),a=Math.max(0,patch.start-item.start),b=Math.min(item.end-item.start,patch.end-item.start);chars.splice(a,b-a,...(item===anchor?cp(patch.text):[]));item.node.data=chars.join('');}
        if(!affected.length){const chars=cp(anchor.node.data);chars.splice(patch.start-anchor.start,0,...cp(patch.text));anchor.node.data=chars.join('');}
      }
      for(const cache of children(p).filter(n=>is(n,'linesegarray')))p.removeChild(cache);
    }
    const replacements=Object.fromEntries([...clones].map(([name,xml])=>[name,strToU8(new XMLSerializer().serializeToString(xml))]));
    return patchZipEntries(this.bytes,replacements);
  }
}
