type Events = { on: (name: string, run: (...args: any[]) => void) => unknown };
type Options = { getInput: () => any; getContext?: () => any; requestFrame?: (run: () => void) => unknown };
type Metric = 'ratios' | 'spacings' | 'lineSpacing';
const definitions: [Metric,string,number,number,number][] = [
  ['ratios','장평',50,200,100], ['spacings','자간',-50,50,0], ['lineSpacing','줄 간격',5,500,160],
];
/** Match the document's language arrays without overwriting other languages. */
export function characterMetric(properties: any, metric: 'ratios'|'spacings', value: number, language='all') {
  const fallback=metric==='ratios'?100:0;
  const previous=Array.from({length:7},(_,i)=>Number(properties?.[metric]?.[i]??fallback));
  const target=language==='all'?-1:Number(language);
  return {[metric]:previous.map((old,i)=>target<0||target===i?value:old)};
}
export function installFormatBar(events: Events, options: Options) {
  const bar=document.getElementById('style-bar');
  if(!bar||bar.querySelector('.jakal-metric-group'))return;
  const getInput=options.getInput, fields=new Map<Metric,{input:HTMLInputElement;buttons:HTMLButtonElement[];dirty:boolean;generation:unknown}>();
  let scheduled=false, applying=false;
  const frame=options.requestFrame??((run:()=>void)=>requestAnimationFrame(run));
  function enabled(input:any) {
    const context=options.getContext?.();
    return !!input && context?.hasDocument!==false && context?.isEditable!==false && !context?.isFormMode && !context?.inPictureObjectSelection && !context?.inTableObjectSelection && !document.documentElement.classList.contains('rhwp-busy');
  }
  function read() {
    const input=getInput();
    try{return {input,char:{...input?.getCharProperties?.(),...input?.getPendingCharShape?.()},para:input?.getParaProperties?.()??{}};}
    catch{return {input:null,char:{},para:{}};}
  }
  function language() {return (document.getElementById('font-lang') as HTMLSelectElement|null)?.value??'all';}
  function current(metric:Metric,state:ReturnType<typeof read>) {
    if(metric==='lineSpacing')return state.para.lineSpacingType==='Percent'?state.para.lineSpacing:undefined;
    const values=state.char[metric] as number[]|undefined;
    if(!values?.length)return metric==='ratios'?100:0;
    const lang=language();return lang==='all'?(values.every(n=>n===values[0])?values[0]:undefined):values[Number(lang)];
  }
  function refresh(force=false) {
    const state=read(),canEdit=enabled(state.input);
    for(const [metric,field] of fields){
      field.input.disabled=!canEdit;for(const button of field.buttons)button.disabled=!canEdit;
      if(!force&&document.activeElement===field.input&&field.dirty)continue;
      const value=current(metric,state);field.input.value=value===undefined?'':String(Math.round(value));
      field.input.placeholder='—';field.input.removeAttribute('aria-invalid');
      if(force)field.dirty=false;
    }
  }
  function schedule(){if(scheduled)return;scheduled=true;frame(()=>{scheduled=false;refresh();});}
  function apply(metric:Metric,value:number,focusDocument:boolean) {
    const field=fields.get(metric)!,state=read(),definition=definitions.find(d=>d[0]===metric)!;
    const stale=field.dirty&&field.generation!==state.input?.wasm?.documentGeneration;
    field.dirty=false;
    if(!enabled(state.input)||stale||!Number.isFinite(value)){refresh(true);return;}
    value=Math.max(definition[2],Math.min(definition[3],Math.round(value)));
    applying=true;
    try{
      if(metric==='lineSpacing'){
        if(current(metric,state)!==value)state.input.setLineSpacing(value);
      }else{
        const props=characterMetric(state.char,metric,value,language());
        if(JSON.stringify(props[metric])!==JSON.stringify(state.char[metric]))state.input.applyCharFormat(props);
      }
      field.input.value=String(value);
    }finally{applying=false;}
    refresh(true);if(focusDocument)state.input.focus();
  }
  function commit(metric:Metric,focusDocument=false){
    const field=fields.get(metric)!;
    if(!field.dirty||applying)return;
    const value=field.input.value.trim();
    if(!value){field.dirty=false;refresh(true);return;}
    apply(metric,Number(value),focusDocument);
  }
  const characterGroup=document.createElement('div');characterGroup.className='jakal-metric-group';characterGroup.setAttribute('role','group');characterGroup.setAttribute('aria-label','장평과 자간');
  const paragraphGroup=document.createElement('div');paragraphGroup.className='jakal-metric-group jakal-paragraph-metric';paragraphGroup.setAttribute('role','group');paragraphGroup.setAttribute('aria-label','줄 간격');
  for(const [metric,label,min,max,fallback] of definitions){
    const field=document.createElement('span');field.className='jakal-metric-field';
    const caption=document.createElement('label');caption.htmlFor=`jakal-${metric}`;caption.textContent=label;
    const input=document.createElement('input');input.id=caption.htmlFor;input.type='number';input.inputMode='numeric';input.min=String(min);input.max=String(max);input.step='1';input.setAttribute('aria-label',`${label} (%)`);input.title=`${label} · ${min}~${max}%`;input.autocomplete='off';
    const unit=document.createElement('span');unit.className='jakal-metric-unit';unit.textContent='%';unit.setAttribute('aria-hidden','true');
    const arrows=document.createElement('span');arrows.className='jakal-metric-arrows';const buttons:HTMLButtonElement[]=[];
    fields.set(metric,{input,buttons,dirty:false,generation:undefined});
    for(const [delta,text] of [[1,'늘리기'],[-1,'줄이기']] as const){
      const button=document.createElement('button');button.type='button';button.tabIndex=-1;button.textContent=delta>0?'▴':'▾';button.setAttribute('aria-label',`${label} ${text}`);button.title=`${label} ${text} (1%)`;
      button.addEventListener('mousedown',event=>event.preventDefault());
      button.addEventListener('click',()=>{const value=fields.get(metric)!.dirty&&input.value.trim()?Number(input.value):current(metric,read())??fallback;apply(metric,value+delta,true);});
      arrows.append(button);buttons.push(button);
    }
    input.addEventListener('focus',()=>{const field=fields.get(metric)!;field.generation=getInput()?.wasm?.documentGeneration;});
    input.addEventListener('input',()=>{fields.get(metric)!.dirty=true;});
    input.addEventListener('change',()=>commit(metric));input.addEventListener('blur',()=>commit(metric));
    input.addEventListener('keydown',event=>{
      if(event.isComposing)return;
      if(event.key==='Enter'){event.preventDefault();event.stopPropagation();if(fields.get(metric)!.dirty)commit(metric,true);else getInput()?.focus();}
      else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();fields.get(metric)!.dirty=false;refresh(true);getInput()?.focus();}
      else if(['ArrowUp','ArrowDown'].includes(event.key)){
        event.preventDefault();event.stopPropagation();const value=fields.get(metric)!.dirty&&input.value.trim()?Number(input.value):current(metric,read())??fallback;apply(metric,value+(event.key==='ArrowUp'?1:-1),false);
      }
    });
    field.append(caption,input,unit,arrows);(metric==='lineSpacing'?paragraphGroup:characterGroup).append(field);
  }
  const track=bar.querySelector('.sb-command-track'),alignment=bar.querySelector('.sb-overflow-host');
  if(track){if(alignment)alignment.before(characterGroup);else track.append(characterGroup);track.append(paragraphGroup);}else bar.append(characterGroup,paragraphGroup);
  bar.setAttribute('role','toolbar');bar.setAttribute('aria-label','글꼴 및 문단 서식');
  document.getElementById('font-name')?.setAttribute('aria-label','글꼴');document.getElementById('font-size')?.setAttribute('aria-label','글자 크기 (pt)');
  for(const name of ['cursor-format-changed','cursor-para-changed','selection-changed','command-state-changed','document-swapped','document-changed','document-mutated'])events.on(name,schedule);
  document.getElementById('font-lang')?.addEventListener('change',schedule);
  refresh();
}
