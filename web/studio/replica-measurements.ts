const widths=new Map<string,number>();let bytes=0;const invalidators=new Set<()=>void>();
export const widthKey=(font:string,text:string)=>JSON.stringify([font,text]);
export function rememberReplicaWidth(font:string,text:string,value:number){
  if(!Number.isFinite(value)||text.length>4096)return value;
  const key=widthKey(font,text);if(widths.has(key)){widths.set(key,value);return value;}
  const size=key.length*2+32;
  while(widths.size&&(widths.size>=12000||bytes+size>3*1024*1024)){const first=widths.keys().next().value!;bytes-=first.length*2+32;widths.delete(first);}
  widths.set(key,value);bytes+=size;return value;
}
export function replicaWidths(){return [...widths];}
export function onReplicaFontsChanged(run:()=>void){invalidators.add(run);return()=>invalidators.delete(run);}
export function invalidateReplicaFonts(){widths.clear();bytes=0;for(const run of [...invalidators])run();}
