/** Width depends on the actual Canvas font and font-face generation, not document position. */
export class TextWidthCache {
  private values=new Map<string,{width:number;bytes:number}>();private bytes=0;
  hits=0;misses=0;
  constructor(privateLimit=4096,byteLimit=2*1024*1024){this.limit=privateLimit;this.byteLimit=byteLimit;}
  private limit:number;private byteLimit:number;
  measure(font:string,text:string,read:()=>number){
    if(text.length>4096)return read();
    const key=JSON.stringify([font,text]),found=this.values.get(key);
    if(found){this.hits++;return found.width;}
    this.misses++;const width=read(),bytes=key.length*2+64;
    if(!Number.isFinite(width)||width<0||bytes>this.byteLimit)return width;
    while(this.values.size&&(this.values.size>=this.limit||this.bytes+bytes>this.byteLimit)){
      const first=this.values.keys().next().value!;this.bytes-=this.values.get(first)!.bytes;this.values.delete(first);
    }
    this.values.set(key,{width,bytes});this.bytes+=bytes;return width;
  }
  clear(){this.values.clear();this.bytes=0;}
  diagnostics(){return{entries:this.values.size,bytes:this.bytes,hits:this.hits,misses:this.misses};}
}
