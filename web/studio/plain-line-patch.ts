/** A conservative display probe. Mixed formatting, controls and wrapped paragraphs
 * keep the engine's full paint path. No document mutation or pagination occurs here. */
export function capturePlainLine(engine:any,section:number,paragraph:number){
  try{
    const length=engine.getParagraphLength(section,paragraph);
    if(length>2000)return;
    const positions=engine.getControlTextPositions(section,paragraph);
    if(positions.length){
      // HWP's first body paragraph carries nonvisual section/column definitions.
      // Confirm exact control identities; tables, notes and every unknown control
      // still require the full renderer.
      const controls=engine.getControls().filter((c:any)=>c.list===section&&c.para===paragraph);
      if(controls.length!==positions.length||controls.some((c:any)=>!['secd','cold'].includes(c.ctrlId)))return;
    }
    if(engine.getLineInfo(section,paragraph,0).lineCount!==1)return;
    if(length&&engine.getCharShapeRuns(section,paragraph,0,length).length!==1)return;
    const rect=engine.getCursorRect(section,paragraph,0),page=engine.getPageInfo(rect.pageIndex);
    if(![rect.y,rect.height,page.width,page.height].every(Number.isFinite)||rect.height<=0||rect.y<0||rect.y+rect.height>page.height)return;
    return {pageIndex:rect.pageIndex,y:rect.y,height:rect.height,width:page.width,pageHeight:page.height};
  }catch{/* A missing/ambiguous query must retain the full renderer. */}
}
export function plainLinePatch(before:ReturnType<typeof capturePlainLine>,after:ReturnType<typeof capturePlainLine>){
  if(!before||!after||before.pageIndex!==after.pageIndex||before.width!==after.width||before.pageHeight!==after.pageHeight||Math.abs(before.y-after.y)>.01||Math.abs(before.height-after.height)>.01)return;
  const top=Math.max(0,after.y-2*after.height),bottom=Math.min(after.pageHeight,after.y+3*after.height);
  return {pageIndex:after.pageIndex,x:0,y:top,width:after.width,height:bottom-top};
}
