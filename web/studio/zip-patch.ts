import { zipSync } from 'fflate';
type Entry={name:string;local:Uint8Array;central:Uint8Array};
/** Read ZIP32 records without inflating images/fonts. Keep local data descriptors. */
function directory(bytes:Uint8Array){
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;
  for(let at=bytes.length-22;at>=Math.max(0,bytes.length-65557);at--)if(v.getUint32(at,true)===0x06054b50&&at+22+v.getUint16(at+20,true)===bytes.length){end=at;break;}
  if(end<0||v.getUint16(end+4,true)||v.getUint16(end+6,true))throw new Error('Unsupported ZIP directory');
  const count=v.getUint16(end+10,true),start=v.getUint32(end+16,true),size=v.getUint32(end+12,true);
  if(count===65535||start===0xffffffff||size===0xffffffff||start+size!==end)throw new Error('Unsupported ZIP64/directory');
  const records:{name:string;offset:number;central:Uint8Array}[]=[];let at=start;
  for(let i=0;i<count;i++){
    if(at+46>end||v.getUint32(at,true)!==0x02014b50)throw new Error('Invalid ZIP record');
    const length=46+v.getUint16(at+28,true)+v.getUint16(at+30,true)+v.getUint16(at+32,true),offset=v.getUint32(at+42,true);
    if(at+length>end||offset>=start||offset+30>start||v.getUint32(offset,true)!==0x04034b50)throw new Error('Invalid ZIP range');
    const name=new TextDecoder().decode(bytes.subarray(at+46,at+46+v.getUint16(at+28,true)));
    records.push({name,offset,central:bytes.subarray(at,at+length)});at+=length;
  }
  if(at!==end||new Set(records.map(r=>r.name)).size!==records.length)throw new Error('Invalid ZIP entries');
  records.sort((a,b)=>a.offset-b.offset);
  const entries:Entry[]=records.map((record,i)=>({...record,local:bytes.subarray(record.offset,records[i+1]?.offset??start)}));
  return {entries,end:bytes.subarray(end)};
}
/** Replace existing XML entries; every untouched compressed payload is copied verbatim. */
export function patchZipEntries(original:Uint8Array,changes:Record<string,Uint8Array>):Uint8Array{
  if(!Object.keys(changes).length)return original;
  const source=directory(original),patch=directory(zipSync(changes,{level:6}));
  const replacements=new Map(patch.entries.map(e=>[e.name,e]));
  if([...replacements.keys()].some(name=>!source.entries.some(e=>e.name===name)))throw new Error('ZIP patch cannot add entries');
  const locals:Uint8Array[]=[],centrals:Uint8Array[]=[];let offset=0;
  for(const old of source.entries){
    const next=replacements.get(old.name)??old,central=next.central.slice();
    new DataView(central.buffer).setUint32(42,offset,true);locals.push(next.local);centrals.push(central);offset+=next.local.length;
  }
  const end=source.end.slice(),view=new DataView(end.buffer),centralSize=centrals.reduce((n,b)=>n+b.length,0);
  view.setUint32(12,centralSize,true);view.setUint32(16,offset,true);
  const result=new Uint8Array(offset+centralSize+end.length);let at=0;
  for(const bytes of [...locals,...centrals,end]){result.set(bytes,at);at+=bytes.length;}
  return result;
}
