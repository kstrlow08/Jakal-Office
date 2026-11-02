// Opt-in local diagnostics. Records timings only, never document text or keys.
export function installInputProfile(targets: Record<string, object | null>) {
  if (!new URLSearchParams(location.search).has('profile-input')) return;
  const stages: Record<string, { count: number; total: number; max: number }> = {};
  const frames: number[] = [];
  const samples:Record<string,number[]>={input:[],scroll:[],command:[]};
  const longTasks:number[]=[];
  let active = false, pending = false, began = 0, inputs = 0;
  for (const [scope, target] of Object.entries(targets)) {
    if (!target) continue;
    const prototype = Object.getPrototypeOf(target);
    for (const name of Object.getOwnPropertyNames(prototype)) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      if (name === 'constructor' || typeof descriptor?.value !== 'function') continue;
      const original = descriptor.value;
      Object.defineProperty(target, name, { configurable: true, value: function (...args: unknown[]) {
        if (!active && !name.startsWith('export')) return original.apply(this, args);
        const start = performance.now();
        try { return original.apply(this, args); }
        finally {
          const elapsed = performance.now() - start;
          const value = stages[`${scope}.${name}`] ||= { count: 0, total: 0, max: 0 };
          value.count++; value.total += elapsed; value.max = Math.max(value.max, elapsed);
          if (!active) queueMicrotask(publish);
        }
      } });
    }
  }
  const publish = () => {
    document.documentElement.dataset.jakalInputProfile = JSON.stringify({ inputs, frames, samples, longTasks, stages });
  };
  function capture(event: Event) {
    if (!(event.target instanceof Element)) return;
    const kind=event.type==='scroll'?'scroll':event.type==='click'?'command':'input';
    if(kind==='input'&&!event.target.closest('textarea, [contenteditable="true"]'))return;
    if(kind==='scroll'&&event.target.id!=='scroll-container')return;
    if(kind==='command'&&!event.target.closest('[data-command]'))return;
    inputs++;
    if (pending) return;
    pending = true; active = true; began = performance.now();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      frames.push(Math.round((performance.now() - began) * 10) / 10);
      samples[kind].push(frames[frames.length-1]);if(samples[kind].length>128)samples[kind].shift();
      if (frames.length > 128) frames.shift();
      active = pending = false; publish();
    }));
  }
  for (const event of ['keydown', 'beforeinput', 'input', 'compositionstart', 'compositionend','scroll','click']) document.addEventListener(event, capture, true);
  if(typeof PerformanceObserver!=='undefined')try{
    const observer=new PerformanceObserver(list=>{for(const entry of list.getEntries()){longTasks.push(Math.round(entry.duration*10)/10);if(longTasks.length>128)longTasks.shift();}publish();});
    observer.observe({type:'longtask',buffered:false});
  }catch{/* Older browsers keep timings without long-task observations. */}
  publish();
}
