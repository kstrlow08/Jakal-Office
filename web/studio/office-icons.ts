// Office-specific symbols: the edited object itself, with one small action cue.
export type IconNode = [tag: string, attributes: Record<string, string>, text?: string];
const path = (d: string, extra: Record<string,string> = {}): IconNode => ['path',{d,...extra}];
const box = (x: number,y: number,width: number,height: number,extra: Record<string,string> = {}): IconNode => ['rect',{x:String(x),y:String(y),width:String(width),height:String(height),rx:'.5',...extra}];
const glyph = (text: string,x=12,y=18,size=18): IconNode => ['text',{x:String(x),y:String(y),'font-size':String(size),'font-family':'sans-serif','text-anchor':'middle',fill:'currentColor',stroke:'none'},text];
const shade = {fill:'currentColor','fill-opacity':'.13',stroke:'none'};
const page = () => box(4,2,16,20);
function insertRow(top: boolean): IconNode[] {
  const y=top?3:16;
  return [box(3,3,18,18),box(3,y,18,5,shade),path('M3 8h18M3 16h18M10 8v8'),path(`M12 ${y+1}v3m-1.5-1.5h3`)];
}
function insertColumn(left: boolean): IconNode[] {
  const x=left?3:16;
  return [box(3,3,18,18),box(x,3,5,18,shade),path('M8 3v18M16 3v18M8 12h8'),path(`M${x+2.5} 10.5v3m-1.5-1.5h3`)];
}
export const officeIconNodes: Record<string,IconNode[]> = {
  'icon-print':[box(6,2,12,6),box(3,8,18,10),box(6,14,12,8,{fill:'white'}),path('M17 11h1M9 18h6')],
  'icon-pdf':[page(),glyph('PDF',12,15,7)],
  'icon-page-setup':[page(),path('M7 6h10M7 18h10M7 6v12M17 6v12',{'stroke-dasharray':'2 2'})],
  'icon-office-cell-split':[box(3,5,18,14),path('M12 5v14',{'stroke-dasharray':'2 2'}),path('m8 10-2 2 2 2m8-4 2 2-2 2')],
  'icon-office-cell-merge':[box(3,5,18,14),path('M12 5v3m0 8v3',{'stroke-dasharray':'1 2'}),path('M5 12h4m-2-2 2 2-2 2m12-2h-4m2-2-2 2 2 2')],
  'icon-office-nested-table':[box(2,3,20,18),path('M2 9h20M8 3v6'),box(8,11,11,7),path('M8 14.5h11M13.5 11v7')],
  'icon-office-row-above':insertRow(true),
  'icon-office-row-below':insertRow(false),
  'icon-office-column-left':insertColumn(true),
  'icon-office-column-right':insertColumn(false),
  'icon-office-equal-rows':[box(6,3,15,18),path('M6 12h15M2 4v16m-1-14 1-2 1 2m-2 12 1 2 1-2')],
  'icon-office-equal-columns':[box(3,6,18,15),path('M12 6v15M4 2h16M6 1 4 2l2 1m12-2 2 1-2 1')],
  'icon-office-inline':[path('M2 6h20M2 12h5m10 0h5M2 19h20'),box(9,8,6,6,shade),box(9,8,6,6)],
  'icon-office-wrap':[path('M2 4h20M2 9h6m9 0h5M2 14h6m9 0h5M2 20h20'),box(10,7,5,10,shade),box(10,7,5,10)],
  'icon-header':[page(),box(6,4,12,4,shade),path('M7 5.5h10M7 12h10m-10 4h7')],
  'icon-footer':[page(),box(6,16,12,4,shade),path('M7 6h10M7 10h7M7 18h10')],
  'icon-office-line-expand':[path('M10 4h12M10 12h12M10 20h12M4 3v18m-2-16 2-2 2 2m-4 14 2 2 2-2')],
  'icon-office-line-contract':[path('M10 7h12M10 12h12M10 17h12M4 2v6m-2-2 2 2 2-2M4 22v-6m-2 2 2-2 2 2')],
  'icon-office-page-break':[path('M4 2h16v7H4zM4 15h16v7H4zM2 12h20',{'stroke-dasharray':'0'})],
  'icon-office-column-break':[page(),path('M8 6v12M16 6v12M9 12h6m-2-2 2 2-2 2')],
  'icon-office-page-number':[page(),glyph('1',12,17,13)],
  'icon-office-total-pages':[box(2,5,15,17),box(6,2,16,17,{fill:'white'}),glyph('#',14,15,13)],
  'icon-office-hanja':[glyph('漢',12,20,21)],
  'icon-textbox':[box(2,4,20,16),path('M7 8V7h10v1M12 7v10m-3 0h6')],
  'icon-compare':[box(2,3,8,18),box(14,3,8,18),path('M4 7h4m-4 4h4m-4 4h2M16 7h4m-4 4h4m-4 4h4')],
  'icon-office-decimal-add':[glyph('.0',8,16,12),path('M17 6v6m-3-3h6')],
  'icon-office-decimal-remove':[glyph('.0',8,16,12),path('M14 9h6')],
  'icon-office-thousands':[glyph(',',12,17,24)],
  'icon-office-char-width-increase':[glyph('가',12,14,13),path('M3 20h18m-15-2-3 2 3 2m12-4 3 2-3 2')],
  'icon-office-char-width-decrease':[glyph('가',12,14,13),path('M3 20h7m-2-2 2 2-2 2M21 20h-7m2-2-2 2 2 2')],
};

export const officeCommandIcons: Record<string,string> = {
  'table:cell-split':'icon-office-cell-split','table:cell-merge':'icon-office-cell-merge',
  'table:create-nested':'icon-office-nested-table',
  'table:insert-row-above':'icon-office-row-above','table:insert-row-below':'icon-office-row-below',
  'table:insert-col-left':'icon-office-column-left','table:insert-col-right':'icon-office-column-right',
  'table:cell-height-equal':'icon-office-equal-rows','table:cell-width-equal':'icon-office-equal-columns',
  'table:inline':'icon-office-inline','insert:picture-inline':'icon-office-inline',
  'table:floating':'icon-office-wrap','insert:picture-floating':'icon-office-wrap',
  'page:header-create':'icon-header','page:footer-create':'icon-footer',
  'page:break':'icon-office-page-break','page:column-break':'icon-office-column-break',
  'page:insert-field-pagenum':'icon-office-page-number','page:insert-field-totalpage':'icon-office-total-pages',
  'insert:hanja':'icon-office-hanja','insert:textbox':'icon-textbox',
  'format:line-spacing-increase':'icon-office-line-expand','format:line-spacing-decrease':'icon-office-line-contract',
  'format:char-ratio-increase':'icon-office-char-width-increase','format:char-ratio-decrease':'icon-office-char-width-decrease',
  'table:decimal-add':'icon-office-decimal-add','table:decimal-remove':'icon-office-decimal-remove','table:thousand-sep':'icon-office-thousands',
};
