type State = { key: string; at: number; properties: Record<string, unknown> };
const pending = new WeakMap<object, State>();
function key(input: any) { const c = input.cursor; return JSON.stringify([input.wasm.documentGeneration, c.headerFooterMode, c.hfSectionIdx, c.hfApplyTo, c.hfParaIdx]); }
export function headerTypingProps(input: any, at = input.cursor.hfCharOffset): Record<string, unknown> | undefined {
  const saved = pending.get(input);
  if (!saved || !input.cursor.isInHeaderFooter()) return undefined;
  if (saved.key !== key(input) || (saved.at !== at && !input.isComposing)) { pending.delete(input); return undefined; }
  return saved.properties;
}
export function stageHeaderTypingProps(input: any, properties: Record<string, unknown>) {
  const previous = headerTypingProps(input);
  pending.set(input, { key: key(input), at: input.cursor.hfCharOffset, properties: { ...previous, ...properties } });
}
export function advanceHeaderTypingProps(input: any, at: number) { const saved = pending.get(input); if (saved) saved.at = at; }
export function clearHeaderTypingProps(input: any) { pending.delete(input); }
export function applyHeaderStyle(input: any, styleId: number) {
  const c=input.cursor, detail=input.wasm.getStyleDetail(styleId), props={...detail.charProps};
  if(props.fontFamilies)props.fontIds=props.fontFamilies.map((name:string,lang:number)=>input.wasm.findOrCreateFontIdForLang(lang,name));
  const target={sectionIdx:c.hfSectionIdx,isHeader:c.headerFooterMode==='header',applyTo:c.hfApplyTo,paraIdx:c.hfParaIdx,charOffset:c.hfCharOffset,previewPage:c.hfPreviewPage};
  const info=JSON.parse(input.wasm.getHeaderFooter(target.sectionIdx,target.isHeader,target.applyTo)), length=(info.text.split('\n')[target.paraIdx]??'').length, body=c.getPosition();
  input.executeOperation({kind:'snapshot',operationType:'headerStyle',editContext:{mode:'headerFooter',...target},operation:(wasm:any)=>{
    wasm.applyParaFormatInHf(target.sectionIdx,target.isHeader,target.applyTo,target.paraIdx,JSON.stringify(detail.paraProps));
    if(length)wasm.applyCharFormatInHeaderFooter(target.sectionIdx,target.isHeader,target.applyTo,target.paraIdx,0,target.paraIdx,length,JSON.stringify(props));
    return body;
  }});
  stageHeaderTypingProps(input,props);input.focus();
}
