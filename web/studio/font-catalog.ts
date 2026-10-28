export const OFFICE_FONT_NAMES = ['나눔명조', '나눔고딕', '나눔고딕코딩', 'IBM Plex Sans KR', '고운바탕', '고운돋움', '신명조', '신명중명조', 'HY신명조'];
export const OFFICE_FONT_ENTRIES = [
  ['나눔명조','NanumMyeongjo-Regular.ttf'], ['나눔고딕','NanumGothic-Regular.ttf'],
  ['나눔고딕코딩','NanumGothicCoding-Regular.ttf'], ['IBM Plex Sans KR','IBMPlexSansKR-Regular.ttf'],
  ['고운바탕','GowunBatang-Regular.ttf'], ['고운돋움','GowunDodum-Regular.ttf'],
].map(([name,file]) => ({name, file:`/studio/fonts/jakal/${file}`, format:'truetype'}));
const activeLocal = new Set<string>();
export function officeCanvasFont(font: string): string | null {
  const families = [...OFFICE_FONT_ENTRIES.map(f => f.name), ...activeLocal];
  return families.some(name => font.includes(`"${name}"`) || font.includes(`'${name}'`) || font.endsWith(' ' + name)) ? font : null;
}
export function installOfficeFonts(registry: any) {
  const style = document.createElement('style');
  style.textContent = OFFICE_FONT_ENTRIES.map(f => `@font-face{font-family:"${f.name}";src:url("${f.file}") format("truetype");font-display:swap}`).join('\n') +
    '@font-face{font-family:"나눔명조";src:url("/studio/fonts/jakal/NanumMyeongjo-Bold.ttf");font-weight:700}@font-face{font-family:"나눔고딕";src:url("/studio/fonts/jakal/NanumGothic-Bold.ttf");font-weight:700}';
  document.head.append(style);
  registry.register({id:'view:office-fonts',label:'글꼴 추가 · 신명조 연결',canExecute:()=>true,execute() {
    const dialog = document.createElement('dialog');dialog.className='jakal-font-dialog';
    dialog.innerHTML='<h2>기본 글꼴과 PC 글꼴</h2><p>나눔명조·나눔고딕·나눔고딕코딩·IBM Plex Sans KR·고운바탕·고운돋움을 기본 제공합니다.</p><p>신명조·신명중명조·HY신명조는 사용권이 있는 PC 글꼴을 연결하세요. 글꼴 파일은 서버에 전송하지 않으며 현재 편집기에서만 사용합니다. HWP를 여는 PC에도 같은 글꼴이 있어야 배치가 일치합니다.</p><label>연결할 이름<select><option>신명조</option><option>신명중명조</option><option>HY신명조</option></select></label><div><button type="button" data-installed>PC 설치 글꼴 연결</button><label class="jakal-font-upload">글꼴 파일 선택<input type="file" accept=".ttf,.otf,.woff,.woff2"></label></div><p role="status"></p><footer><button type="button" data-close>닫기</button></footer>';
    const name = dialog.querySelector('select')!, status = dialog.querySelector('[role=status]')!;
    async function add(bytes?: ArrayBuffer) {
      const face = new FontFace(name.value, bytes ?? `local("${name.value}")`);
      await face.load(); document.fonts.add(face); activeLocal.add(name.value);
      status.textContent=`${name.value} 연결됨 · 글꼴 메뉴에서 선택하세요.`;
      document.dispatchEvent(new Event('jakal-font-loaded'));
    }
    dialog.querySelector('[data-installed]')!.addEventListener('click', () => { void add().catch(()=>status.textContent='PC에서 해당 이름의 글꼴을 찾지 못했습니다. 사용권이 있는 글꼴 파일을 선택하세요.'); });
    dialog.querySelector('input')!.onchange=async event=>{const file=(event.target as HTMLInputElement).files?.[0];if(!file)return;try{if(file.size>25*1024*1024)throw new Error('글꼴은 25MB 이내로 선택하세요.');await add(await file.arrayBuffer());}catch(error){status.textContent=error instanceof Error?error.message:String(error);}};
    const close=()=>{dialog.close();dialog.remove();};dialog.querySelector('[data-close]')!.addEventListener('click',close);dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    document.body.append(dialog);dialog.showModal();
  }});
  const select=document.getElementById('font-name');
  if(select){const button=document.createElement('button');button.type='button';button.className='jakal-font-connect';button.title='신명조·신명중명조 및 PC 글꼴 연결';button.textContent='글꼴 추가';button.onclick=()=>registry.get('view:office-fonts')?.execute();select.parentElement?.append(button);}
}
