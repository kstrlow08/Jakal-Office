import { fontFaceMetadata } from './font-faces.ts';
export const OFFICE_FONT_NAMES = ['나눔명조', '나눔고딕', '나눔고딕코딩', 'IBM Plex Sans KR', '고운바탕', '고운돋움', '신명조', '신명중명조', 'HY신명조'];
export const OFFICE_FONT_ENTRIES = [
  ['나눔명조','NanumMyeongjo-Regular.ttf'], ['나눔고딕','NanumGothic-Regular.ttf'],
  ['나눔고딕코딩','NanumGothicCoding-Regular.ttf'], ['IBM Plex Sans KR','IBMPlexSansKR-Regular.ttf'],
  ['고운바탕','GowunBatang-Regular.ttf'], ['고운돋움','GowunDodum-Regular.ttf'],
].map(([name,file]) => ({name, file:`/studio/fonts/jakal/${file}`, format:'truetype'}));
const activeLocal = new Set<string>();
// Private Canvas families avoid collisions with the engine's legacy stand-in faces.
const aliases = new Map<string,string>();
function canvasFamily(name: string) { let alias=aliases.get(name);if(!alias){alias=`JakalOfficeFace${aliases.size}`;aliases.set(name,alias);}return alias; }
for(const entry of OFFICE_FONT_ENTRIES)canvasFamily(entry.name);
export function connectedFontNames() { return [...activeLocal]; }
export function officeCanvasFont(font: string): string | null {
  const at=font.indexOf('px ');if(at<0)return null;
  const prefix=font.slice(0,at+3),family=font.slice(at+3),match=/^\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^,]+))/.exec(family);
  if(!match)return null;
  const name=(match[1]??match[2]??match[3]).trim().replace(/\\(.)/g,'$1'),alias=aliases.get(name);
  return alias?prefix+JSON.stringify(alias)+family.slice(match[0].length):null;
}
export function installOfficeFonts(registry: any, options: { generation?: () => number } = {}) {
  const style = document.createElement('style');
  style.textContent = OFFICE_FONT_ENTRIES.map(f => `@font-face{font-family:"${canvasFamily(f.name)}";src:url("${f.file}") format("truetype");font-display:swap}`).join('\n') +
    `@font-face{font-family:"${canvasFamily('나눔명조')}";src:url("/studio/fonts/jakal/NanumMyeongjo-Bold.ttf");font-weight:700}@font-face{font-family:"${canvasFamily('나눔고딕')}";src:url("/studio/fonts/jakal/NanumGothic-Bold.ttf");font-weight:700}`;
  document.head.append(style);
  registry.register({id:'view:office-fonts',label:'글꼴 추가 · 시스템 글꼴',canExecute:()=>true,execute() {
    const generation=options.generation?.();
    const dialog = document.createElement('dialog'); dialog.className='jakal-font-dialog';
    dialog.innerHTML='<h2>글꼴 연결</h2><label>글꼴 이름<input name="family" list="jakal-font-families" placeholder="파일 이름에서 자동으로 읽기"></label><datalist id="jakal-font-families"></datalist><div class="jakal-font-actions"><button type="button" data-list>시스템 글꼴 목록</button><button type="button" data-installed>이름으로 PC 글꼴 연결</button><label class="jakal-font-upload">글꼴 파일 선택<input name="file" type="file" accept=".ttf,.otf,.woff,.woff2" multiple></label></div><p role="status">글꼴 파일은 서버로 전송하지 않습니다. 일반·굵게 파일을 함께 연결할 수 있습니다.</p><footer><button type="button" data-close>닫기</button></footer>';
    const family=dialog.querySelector<HTMLInputElement>('[name=family]')!, status=dialog.querySelector<HTMLElement>('[role=status]')!, list=dialog.querySelector<HTMLDataListElement>('datalist')!;
    let system: any[]=[], familyOverride=false;
    family.oninput=()=>{familyOverride=!!family.value.trim();};
    function fill(names: string[]) { list.replaceChildren(...[...new Set(names)].sort((a,b)=>a.localeCompare(b,'ko')).map(name=>{const option=document.createElement('option');option.value=name;return option;})); }
    fill([...OFFICE_FONT_NAMES,...activeLocal]);
    async function register(name: string, source: ArrayBuffer|string, weight='400', style='normal') {
      if (!name.trim() || /[\x00-\x1f]/.test(name)) throw new Error('올바른 글꼴 이름을 입력해 주세요.');
      const face=new FontFace(canvasFamily(name),source,{weight,style}); await face.load(); document.fonts.add(face); activeLocal.add(name);
    }
    function apply(name: string) {
      if(generation!==options.generation?.()||!dialog.isConnected){document.dispatchEvent(new Event('jakal-font-loaded'));return;}
      const picker=document.getElementById('font-name') as HTMLSelectElement|null;
      if(picker){if(![...picker.options].some(o=>o.value===name)){const option=document.createElement('option');option.value=option.textContent=name;picker.append(option);}picker.value=name;picker.dispatchEvent(new Event('change',{bubbles:true}));}
      fill([...OFFICE_FONT_NAMES,...activeLocal,...system.map(face=>face.family)]);
      document.dispatchEvent(new Event('jakal-font-loaded')); status.textContent=`${name} 연결·적용됨 · 이 편집기에서 사용합니다.`;
    }
    dialog.querySelector('[data-list]')!.addEventListener('click',async()=>{
      try { if(typeof (window as any).queryLocalFonts!=='function') throw new Error('이 브라우저에서는 이름으로 연결하거나 글꼴 파일을 선택해 주세요.');
        system=await (window as any).queryLocalFonts();
        for(const face of system){const label=String(face.style||'').toLowerCase(),weight=/black|heavy/.test(label)?'900':/extra.*bold/.test(label)?'800':/semi.*bold|demi/.test(label)?'600':/bold/.test(label)?'700':/medium/.test(label)?'500':/light/.test(label)?'300':'400',style=/italic|oblique/.test(label)?'italic':'normal';
          for(const alias of new Set([face.family,face.fullName].filter(Boolean))){document.fonts.add(new FontFace(canvasFamily(alias),`local(${JSON.stringify(face.fullName)})`,{weight,style}));activeLocal.add(alias);}}
        fill(system.map(face=>face.family));document.dispatchEvent(new Event('jakal-font-loaded'));status.textContent=`${new Set(system.map(face=>face.family)).size}개 시스템 글꼴을 불러왔습니다. 글꼴 메뉴에서 선택하세요.`;family.focus();
      }catch(error){status.textContent=error instanceof Error?error.message:'시스템 글꼴 접근을 허용하지 않았습니다.';}
    });
    dialog.querySelector('[data-installed]')!.addEventListener('click',async()=>{
      try {const name=family.value.trim();if(!name)throw new Error('설치된 글꼴 이름을 입력해 주세요.');
        const matches=system.filter(face=>face.family===name||face.fullName===name);
        if(matches.length){for(const face of matches){const meta=fontFaceMetadata(await (await face.blob()).arrayBuffer(),face.fullName);await register(name,`local(${JSON.stringify(face.fullName)})`,meta.weight,meta.style);}}
        else {await register(name,`local(${JSON.stringify(name)})`);}
        apply(name);
      }catch(error){status.textContent=error instanceof Error?error.message:'글꼴을 찾지 못했습니다. 파일을 선택해 주세요.';}
    });
    dialog.querySelector<HTMLInputElement>('[name=file]')!.onchange=async event=>{
      const files=Array.from((event.target as HTMLInputElement).files||[]);let selected='';const alias=familyOverride?family.value.trim():'';
      try {for(const file of files){if(file.size>25*1024*1024)throw new Error('글꼴은 파일당 25MB 이내로 선택하세요.');const bytes=await file.arrayBuffer(),meta=fontFaceMetadata(bytes,file.name);const name=alias||meta.family;await register(name,bytes,meta.weight,meta.style);selected=name;}
        if(selected){family.value=selected;apply(selected);}
      }catch(error){status.textContent=error instanceof Error?error.message:String(error);}
    };
    const close=()=>{dialog.close();dialog.remove();};dialog.querySelector('[data-close]')!.addEventListener('click',close);dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    document.body.append(dialog);dialog.showModal();family.focus();
  }});
  const select=document.getElementById('font-name');
  if(select){const button=document.createElement('button');button.type='button';button.className='jakal-font-connect';button.title='신명조·신명중명조 및 PC 글꼴 연결';button.textContent='글꼴 추가';button.onclick=()=>registry.get('view:office-fonts')?.execute();select.parentElement?.append(button);}
}
