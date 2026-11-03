type Clock={now:()=>number;request:(run:()=>void,delay:number)=>any;cancel:(id:any)=>void;active:()=>boolean;lastActivity:()=>number};
let activity:{at:number;composing:boolean}|undefined;
function browserClock():Clock {
  if(!activity){
    activity={at:-Infinity,composing:false};
    const touch=()=>{activity!.at=performance.now();};
    for(const type of ['keydown','beforeinput','pointerdown','scroll'])document.addEventListener(type,touch,{capture:true,passive:true});
    document.addEventListener('compositionstart',()=>{activity!.composing=true;touch();},true);
    document.addEventListener('compositionend',()=>{activity!.composing=false;touch();},true);
  }
  return {now:()=>performance.now(),request:(run,delay)=>setTimeout(run,delay),cancel:id=>clearTimeout(id),
    lastActivity:()=>activity!.at,active:()=>document.hidden||activity!.composing||!!(navigator as any).scheduling?.isInputPending?.()};
}
/** Only derived background work waits. Explicit save/navigation/history barriers cancel it. */
export class QuietTask {
  private id:any=null;private generation=0;
  private clock:Clock;private quietMs:number;
  constructor(clock:Clock=browserClock(),quietMs=350){this.clock=clock;this.quietMs=quietMs;}
  schedule(run:()=>void){
    this.cancel();const token=this.generation;
    const attempt=()=>{
      this.id=null;if(token!==this.generation)return;
      const remaining=this.quietMs-(this.clock.now()-this.clock.lastActivity());
      if(this.clock.active()||remaining>0){this.id=this.clock.request(attempt,Math.max(32,remaining));return;}
      run();
    };
    this.id=this.clock.request(attempt,this.quietMs);
  }
  cancel(){this.generation++;if(this.id!==null)this.clock.cancel(this.id);this.id=null;}
}
