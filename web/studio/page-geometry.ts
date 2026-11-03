/** Commit one complete, current geometry snapshot; yield between bounded slices. */
export async function collectPageGeometry<T>(count:number,read:(index:number)=>T,current:()=>boolean,
  clock={now:()=>performance.now(),yield:()=>new Promise<void>(resolve=>setTimeout(resolve,0))},
  onError:(index:number,error:unknown)=>void=(index,error)=>console.error(`Page ${index} geometry`,error)) {
  const pages:T[]=[];let slice=clock.now();
  for(let index=0;index<count;index++) {
    if(!current())return null;
    try{pages.push(read(index));}catch(error){onError(index,error);}
    if(index+1<count&&clock.now()-slice>=6){await clock.yield();slice=clock.now();}
  }
  return current()?pages:null;
}
