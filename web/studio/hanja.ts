const words: Record<string, string[]> = {
  한자:['漢字'], 한국:['韓國'], 대한민국:['大韓民國'], 문서:['文書'], 학교:['學校'], 학생:['學生'], 학년:['學年'],
  수학:['數學','修學'], 교육:['敎育'], 시험:['試驗'], 성명:['姓名'], 주소:['住所'], 번호:['番號'], 개인정보:['個人情報'],
  계약:['契約'], 회사:['會社'], 사업:['事業'], 사업자:['事業者'], 정책:['政策'], 경제:['經濟'], 사회:['社會'],
  과학:['科學'], 역사:['歷史'], 예술:['藝術'], 문화:['文化'], 정부:['政府'], 국가:['國家'], 국민:['國民'],
  학습:['學習'], 기술:['技術'], 개발:['開發'], 정보:['情報'], 국어:['國語'], 영어:['英語'], 합계:['合計'], 평균:['平均'],
  감사:['感謝','監査'], 회의:['會議'], 업무:['業務'], 연구:['硏究'], 질문:['質問'], 답변:['答辯'], 결과:['結果'], 자료:['資料'], 참고:['參考'], 내용:['內容'], 입력:['入力'], 수정:['修正'],
};
let loading: Promise<Record<string, string[]>> | undefined;
function dictionary() {
  return loading ??= fetch('/studio/data/hanja-17.0.0.json').then(response => { if (!response.ok) throw new Error('한자 사전을 불러오지 못했습니다.'); return response.json(); }).catch(error => { loading = undefined; throw error; });
}
export function hanjaTarget(input: any) {
  const c = input.cursor;
  if (input.isComposing || c.isInHeaderFooter() || c.isInFootnote() || input.isFormMode?.()) throw new Error('본문 또는 표의 한글을 선택하거나, 입력을 마친 낱말 뒤에서 한자 변환을 실행하세요.');
  const selection = input.getSelection(), caret = c.getPosition();
  let start = structuredClone(selection?.start ?? caret), end = structuredClone(selection?.end ?? caret), text: string;
  if (start.sectionIndex !== end.sectionIndex || start.paragraphIndex !== end.paragraphIndex || JSON.stringify(start.cellPath) !== JSON.stringify(end.cellPath) || start.parentParaIndex !== end.parentParaIndex || start.cellIndex !== end.cellIndex) throw new Error('한 문단 안의 한글 낱말을 선택해 주세요.');
  if (start.charOffset !== end.charOffset) text = input.getTextAt(start, end.charOffset - start.charOffset);
  else {
    const before = input.getTextAt({ ...caret, charOffset: 0 }, caret.charOffset), match = /[가-힣]{1,16}$/.exec(before);
    if (!match) throw new Error('변환할 한글을 선택하거나 낱말 바로 뒤에 커서를 놓으세요.');
    text = match[0]; start.charOffset = end.charOffset - text.length;
  }
  if (!/^[가-힣]{1,16}$/.test(text)) throw new Error('한글 1~16자를 선택해 주세요.');
  const formats = Array.from(text, (_, i) => {
    const offset = start.charOffset + i;
    const props = start.parentParaIndex === undefined ? input.wasm.getCharPropertiesAt(start.sectionIndex,start.paragraphIndex,offset)
      : start.cellPath?.length ? input.wasm.getCellCharPropertiesAtByPath(start.sectionIndex,start.parentParaIndex,JSON.stringify(start.cellPath),offset)
      : input.wasm.getCellCharPropertiesAt(start.sectionIndex,start.parentParaIndex,start.controlIndex,start.cellIndex,start.cellParaIndex,offset);
    const fontIds = props.fontFamilies?.map((name: string, lang: number) => input.wasm.findOrCreateFontIdForLang(lang,name));
    return { ...props, ...(fontIds ? {fontIds} : {}) };
  });
  return { start, end, text, formats, generation: input.wasm.documentGeneration };
}
export function applyHanja(input: any, target: ReturnType<typeof hanjaTarget>, replacement: string) {
  if (input.wasm.documentGeneration !== target.generation || input.getTextAt(target.start,target.text.length) !== target.text) throw new Error('문서 내용이 바뀌었습니다. 한자 변환을 다시 실행하세요.');
  if (replacement.length !== target.text.length || /[\x00-\x1f]/.test(replacement)) throw new Error('한자 후보를 선택해 주세요.');
  const p = target.start, count = target.text.length;
  input.executeOperation({kind:'snapshot',operationType:'convertHanja',operation:(wasm:any)=>{
    if (p.parentParaIndex === undefined) {
      wasm.deleteText(p.sectionIndex,p.paragraphIndex,p.charOffset,count); wasm.insertText(p.sectionIndex,p.paragraphIndex,p.charOffset,replacement);
      target.formats.forEach((props:any,i:number)=>wasm.applyCharFormat(p.sectionIndex,p.paragraphIndex,p.charOffset+i,p.charOffset+i+1,JSON.stringify(props)));
    } else {
      const path = JSON.stringify(p.cellPath?.length ? p.cellPath : [{controlIndex:p.controlIndex,cellIndex:p.cellIndex,cellParaIndex:p.cellParaIndex}]);
      wasm.deleteTextInCellByPath(p.sectionIndex,p.parentParaIndex,path,p.charOffset,count); wasm.insertTextInCellByPath(p.sectionIndex,p.parentParaIndex,path,p.charOffset,replacement);
      target.formats.forEach((props:any,i:number)=>wasm.applyCharFormatInCellByPath(p.sectionIndex,p.parentParaIndex,path,p.charOffset+i,p.charOffset+i+1,JSON.stringify(props)));
    }
    return {...target.end,charOffset:p.charOffset+replacement.length};
  }});
  input.cursor.clearSelection(); input.focus();
}
export async function showHanja(input: any) {
  let target: ReturnType<typeof hanjaTarget>;
  try { target = hanjaTarget(input); } catch(error) { window.alert((error as Error).message); return; }
  const dialog = document.createElement('dialog'); dialog.className='jakal-hanja-dialog'; dialog.setAttribute('aria-label','한자 변환');
  dialog.innerHTML='<h2>한자 변환</h2><p class="jakal-hanja-reading"></p><div class="jakal-hanja-words"></div><div class="jakal-hanja-letters" role="group" aria-label="변환할 글자"></div><div class="jakal-hanja-candidates" role="group" aria-label="한자 후보"></div><p role="status"></p><footer><button type="button" data-cancel>취소</button><button type="button" data-apply disabled>바꾸기</button></footer>';
  dialog.querySelector('.jakal-hanja-reading')!.textContent = target.text;
  const result = Array.from(target.text), status = dialog.querySelector<HTMLElement>('[role=status]')!, apply = dialog.querySelector<HTMLButtonElement>('[data-apply]')!;
  const close=()=>{dialog.close();dialog.remove();input.focus();}; dialog.querySelector('[data-cancel]')!.addEventListener('click',close);dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  apply.onclick=()=>{try{applyHanja(input,target,result.join(''));close();}catch(error){status.textContent=(error as Error).message;}};
  document.body.append(dialog);dialog.showModal();status.textContent='한자 후보를 읽고 있습니다…';
  try {
    const data=await dictionary(); if(!dialog.isConnected)return;
    function update(){apply.disabled=result.join('')===target.text;status.textContent=target.text+' → '+result.join('');}
    function candidates(index:number) {
      const grid=dialog.querySelector('.jakal-hanja-candidates')!;grid.replaceChildren();
      for(const char of [target.text[index],...(data[target.text[index]]??[])]){const button=document.createElement('button');button.type='button';button.textContent=char;button.setAttribute('aria-label',`${target.text[index]} → ${char}`);button.onclick=()=>{result[index]=char;letters();update();if(!apply.disabled)apply.focus();};grid.append(button);}
    }
    function letters(){const row=dialog.querySelector('.jakal-hanja-letters')!;row.replaceChildren();result.forEach((char,index)=>{const button=document.createElement('button');button.type='button';button.textContent=char;button.setAttribute('aria-label',`${index+1}번째 글자 ${target.text[index]}`);button.onclick=()=>candidates(index);row.append(button);});}
    for(const word of words[target.text]??[]){const button=document.createElement('button');button.type='button';button.textContent=word;button.onclick=()=>{result.splice(0,result.length,...Array.from(word));letters();update();apply.focus();};dialog.querySelector('.jakal-hanja-words')!.append(button);}
    letters();candidates(0);update();dialog.querySelector<HTMLButtonElement>('.jakal-hanja-words button,.jakal-hanja-candidates button')?.focus();
  }catch(error){status.textContent=(error as Error).message;}
}
