/** Delay whole-document serialization until interaction settles. Manual saves bypass this. */
export function createBackupScheduler({run,onError,clock=globalThis}){
  let timer=null,idle=null,generation=0;
  function cancel(){generation++;if(timer!==null)clock.clearTimeout(timer);if(idle!==null)clock.cancelIdleCallback?.(idle);timer=idle=null;}
  function schedule(bytes=0,composing=false){
    cancel();if(composing)return;
    const token=generation,delay=bytes>=4*1024*1024?6000:1800;
    timer=clock.setTimeout(()=>{
      timer=null;
      const begin=()=>{idle=null;if(token!==generation)return;Promise.resolve().then(run).catch(onError);};
      if(clock.requestIdleCallback)idle=clock.requestIdleCallback(begin,{timeout:1500});else timer=clock.setTimeout(begin,0);
    },delay);
  }
  return {schedule,cancel};
}
