/** Follow an explicitly selected fit rule; never replace a user's numeric zoom. */
export function installResponsiveFit(win: Pick<Window,'addEventListener'|'removeEventListener'|'requestAnimationFrame'|'cancelAnimationFrame'>,
  options: {mode:()=>string;ready:()=>boolean;apply:(mode:any)=>void}) {
  let frame:number|null=null;
  const resize=()=>{
    if(frame!==null)return;
    frame=win.requestAnimationFrame(()=>{
      frame=null;const mode=options.mode();
      if(options.ready()&&(mode==='fitWidth'||mode==='fitPage'))options.apply(mode);
    });
  };
  win.addEventListener('resize',resize);
  return ()=>{win.removeEventListener('resize',resize);if(frame!==null)win.cancelAnimationFrame(frame);};
}
