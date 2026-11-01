import { ribbonIcon } from './ribbon-icons';
import { commandIcon } from './command-icons';
import { installFormatBar } from './format-bar.ts';
// Menu titles double as ribbon tabs: each one swaps the tool strip below the
// menu bar, the way 한글 2024 does. The runtime's own dropdowns stay reachable
// through the small arrow next to every title.
type Definition = { id: string; label: string; canExecute?: (context: any) => boolean; [key: string]: unknown };
type Registry = { get: (id: string) => Definition | undefined };
type Dispatcher = { dispatch: (id: string, params?: Record<string, unknown>) => boolean; isEnabled?: (id: string) => boolean };
type Events = { on: (event: string, listener: () => void) => unknown };
type Options = { storage?: Pick<Storage, 'getItem' | 'setItem'> | null; defaultTab?: string; getContext?: () => any; getInput?:()=>any; requestFrame?: (run: () => void) => unknown };
/** [command, label, sprite icon class]. Items without an icon render as compact symbols. */
type Item = [id: string, label: string, icon?: string];
type Group = { label?: string; items: Item[] };

export const STORAGE_KEY = 'jakal-ribbon';
export const ribbonTabs: Record<string, Group[]> = {
  file: [
    { label: '문서', items: [['file:new-doc', '새 문서', 'icon-new-doc'], ['file:open', '열기', 'icon-folder-open'], ['file:open-recent', '내 문서', 'icon-folder-clock']] },
    { label: '저장·내려받기', items: [['file:save', '저장', 'icon-save'], ['file:save-as', '복사본 저장'], ['file:save-as-hwpx', 'HWPX 받기'], ['file:save-as-hwp', 'HWP 받기'], ['jakal:original', '원본 받기']] },
    { label: '인쇄', items: [['file:page-setup', '편집 용지', 'icon-page-setup'], ['file:print', '인쇄', 'icon-print'], ['file:print-to-pdf', 'PDF 저장', 'icon-pdf']] },
    { label: '이력', items: [['edit:document-history', '저장 기록', 'icon-history']] },
  ],
  edit: [
    { label: '클립보드', items: [['edit:paste', '붙여넣기', 'icon-paste'], ['edit:cut', '잘라내기'], ['edit:copy', '복사'], ['edit:format-copy', '모양 복사'], ['edit:format-paste', '모양 붙이기']] },
    { label: '선택·삭제', items: [['edit:select-all', '모두 선택'], ['edit:delete', '지우기']] },
    { label: '글자와 문단', items: [['format:char-shape', '글자 모양', 'icon-char-shape'], ['format:para-shape', '문단 모양', 'icon-para-shape'], ['format:style-dialog', '스타일', 'icon-style']] },
    { label: '용지와 단', items: [['page:setup', '용지 방향', 'icon-orientation'], ['page:col-settings', '단', 'icon-columns']] },
    { label: '개체 입력', items: [['table:create', '표', 'icon-table'], ['insert:shape', '도형', 'icon-shape'], ['insert:image', '그림', 'icon-image']] },
    { label: '찾기·이동', items: [['edit:find', '찾기', 'icon-find'], ['edit:find-replace', '바꾸기'], ['edit:find-again', '다음 찾기'], ['edit:goto', '찾아가기']] },
  ],
  view: [
    { label: '화면 배율', items: [['view:zoom-in', '확대', 'icon-zoom-menu-in'], ['view:zoom-out', '축소', 'icon-zoom-menu-out'], ['view:zoom-fit-page', '쪽 맞춤'], ['view:zoom-fit-width', '폭 맞춤'], ['view:zoom-100', '100%'], ['view:zoom-dialog', '배율 설정…']] },
    { label: '표시', items: [['view:ctrl-mark', '조판 부호'], ['view:para-mark', '문단 부호'], ['view:border-transparent', '투명 선'], ['view:toggle-clip', '잘림 보기']] },
    { label: '격자·개체', items: [['view:toggle-grid', '격자 보기', 'icon-grid'], ['view:grid-settings', '격자 설정'], ['view:object-layout', '개체 레이아웃']] },
    { label: '편집 모드', items: [['view:form-mode', '양식 모드'], ['view:toolbox-format', '서식 줄 표시']] },
  ],
  insert: [
    { label: '개체', items: [['table:create', '표', 'icon-table'], ['insert:image', '그림', 'icon-image'], ['insert:shape', '도형', 'icon-shape'], ['insert:textbox', '글상자', 'icon-textbox'], ['insert:equation', '수식'], ['insert:field', '누름틀']] },
    { label: '문자·참조', items: [['insert:symbols', '문자표', 'icon-symbols'], ['insert:hanja', '한자 변환'], ['insert:hyperlink', '하이퍼링크'], ['insert:bookmark', '책갈피']] },
    { label: '주석', items: [['insert:footnote', '각주', 'icon-footnote'], ['insert:endnote', '미주', 'icon-endnote'], ['insert:endnote-shape', '각주·미주 모양'], ['insert:note-close', '주석 편집 끝']] },
    { label: '쪽 정보', items: [['page:header-create', '머리말'], ['page:footer-create', '꼬리말'], ['page:insert-field-pagenum', '현재 쪽 번호'], ['page:insert-field-totalpage', '전체 쪽 수'], ['page:insert-field-filename', '파일 이름']] },
    { label: '선택 개체', items: [['insert:caption-toggle', '캡션 넣기·빼기'], ['insert:chart-data-edit', '차트 데이터'], ['insert:equation-edit', '수식 고치기'], ['insert:picture-props', '그림 속성']] },
  ],
  format: [
    { label: '모양·스타일', items: [['format:char-shape', '글자 모양', 'icon-char-shape'], ['format:para-shape', '문단 모양', 'icon-para-shape'], ['format:style-dialog', '스타일', 'icon-style']] },
    { label: '글자 꾸밈', items: [['format:bold', '진하게'], ['format:italic', '기울임'], ['format:underline', '밑줄'], ['format:strikethrough', '취소선'], ['format:superscript', '위 첨자'], ['format:subscript', '아래 첨자']] },
    { label: '문단 정렬', items: [['format:align-left', '왼쪽 정렬'], ['format:align-center', '가운데 정렬'], ['format:align-right', '오른쪽 정렬'], ['format:align-justify', '양쪽 정렬'], ['format:align-distribute', '배분 정렬'], ['format:align-split', '나눔 정렬']] },
    { label: '번호·수준', items: [['format:toggle-numbering', '문단 번호 켜기·끄기'], ['format:toggle-bullet', '글머리표 켜기·끄기'], ['format:para-num-shape', '문단 번호 모양'], ['format:bullet-shape', '글머리표 모양'], ['format:level-increase', '수준 올림'], ['format:level-decrease', '수준 내림']] },
  ],
  page: [
    { label: '용지·구역', items: [['page:setup', '편집 용지', 'icon-page-setup'], ['page:page-border', '쪽 테두리·배경'], ['page:section-settings', '구역 설정']] },
    { label: '머리말·꼬리말', items: [['page:header-create', '머리말', 'icon-header'], ['page:footer-create', '꼬리말', 'icon-footer'], ['page:headerfooter-prev', '이전 영역'], ['page:headerfooter-next', '다음 영역'], ['page:headerfooter-close', '편집 끝'], ['page:headerfooter-delete', '영역 지우기']] },
    { label: '쪽 번호', items: [['page:new-page-num', '새 번호로 시작'], ['page:hide-current', '현재 쪽 감추기'], ['page:insert-field-pagenum', '현재 쪽 번호'], ['page:insert-field-totalpage', '전체 쪽 수']] },
    { label: '단 설정', items: [['page:col-settings', '다단 설정', 'icon-columns'], ['page:col-1', '한 단'], ['page:col-2', '두 단'], ['page:col-3', '세 단'], ['page:col-left', '왼쪽 좁게'], ['page:col-right', '오른쪽 좁게']] },
    { label: '나누기', items: [['page:break', '쪽 나누기'], ['page:column-break', '단 나누기']] },
  ],
  table: [
    { label: '본문 배치', items: [['table:inline','글자처럼 취급'],['table:floating','본문과 어울리기']] },
    { label: '표·셀', items: [['table:create', '표 만들기', 'icon-table'], ['table:create-nested', '표 안에 표'], ['table:parent-cell', '상위 칸으로'], ['table:cell-props', '표·셀 속성'], ['table:border-each', '테두리·배경']] },
    { label: '줄·칸', items: [['table:insert-row-above', '위에 줄'], ['table:insert-row-below', '아래에 줄'], ['table:insert-col-left', '왼쪽에 칸'], ['table:insert-col-right', '오른쪽에 칸'], ['table:insert-row-col', '줄·칸 추가…'], ['table:delete-row-col', '줄·칸 지우기…']] },
    { label: '선택·크기', items: [['table:select-cells', '셀 선택'], ['table:cell-split', '칸 나누기'], ['table:cell-merge', '칸 합치기'], ['table:cell-height-equal', '높이 같게'], ['table:cell-width-equal', '너비 같게']] },
    { label: '계산·표시', items: [['table:block-formula', '계산식'], ['table:block-sum', '블록 합계'], ['table:block-avg', '블록 평균'], ['table:block-product', '블록 곱'], ['table:thousand-sep', '천 단위 쉼표'], ['table:decimal-add', '자릿점 넣기'], ['table:decimal-remove', '자릿점 빼기']] },
    { label: '구성', items: [['table:split', '표 나누기'], ['table:attach', '표 붙이기'], ['table:transpose-copy', '행·열 바꿔 복사'], ['table:transpose-paste', '행·열 바꿔 붙이기'], ['table:caption-toggle', '캡션 넣기·빼기']] },
  ],
  security: [
    { label: '파일 암호', items: [['jakal:encrypted-download', '암호 걸어 받기', 'icon-lock']] },
    { label: '개인정보', items: [['edit:find', '개인정보 찾기', 'icon-find'], ['edit:find-replace', '찾아 바꾸기']] },
    { label: '보관', items: [['file:save', '브라우저에 저장', 'icon-save'], ['jakal:original', '원본 받기'], ['edit:document-history', '저장 기록']] },
  ],
  review: [
    { label: '비교·기록', items: [['jakal:compare', '문서 비교', 'icon-compare'], ['edit:document-history', '저장 기록', 'icon-history'], ['jakal:original', '원본 받기']] },
    { label: 'AI 검토', items: [['jakal:ai-edit', 'AI 수정·비교', 'icon-sparkles']] },
    { label: '주석 확인', items: [['insert:endnote-shape', '각주·미주 모양'], ['view:ctrl-mark', '조판 부호']] },
    { label: '수정', items: [['edit:find', '찾기', 'icon-find'], ['edit:find-replace', '바꾸기'], ['edit:undo', '실행 취소'], ['edit:redo', '다시 실행']] },
  ],
  tool: [
    { label: '설정', items: [['tool:options', '환경 설정', 'icon-settings'], ['view:office-fonts', '글꼴 추가', 'icon-font']] },
    { label: '찾기·검토', items: [['jakal:workbench', '도구 찾기', 'icon-find'], ['jakal:ai-edit', 'AI 수정·비교', 'icon-sparkles'], ['jakal:compare', '문서 비교', 'icon-compare']] },
    { label: '개체 배치', items: [['format:object-properties', '개체 속성', 'icon-obj-props'], ['insert:arrange-front', '맨 앞으로'], ['insert:arrange-back', '맨 뒤로'], ['insert:arrange-forward', '앞으로'], ['insert:arrange-backward', '뒤로']] },
    { label: '회전·묶기', items: [['insert:rotate-cw', '오른쪽 90°'], ['insert:rotate-ccw', '왼쪽 90°'], ['insert:flip-horz', '좌우 뒤집기'], ['insert:flip-vert', '상하 뒤집기'], ['insert:group-shapes', '개체 묶기'], ['insert:ungroup-shapes', '묶기 풀기']] },
  ],
};

export function installRibbon(registry: Registry, dispatcher: Dispatcher, events: Events, options: Options = {}) {
  const menu = document.getElementById('menu-bar');
  const header = document.getElementById('studio-header');
  if (!menu || !header || document.getElementById('jakal-ribbon')) return null;
  const root = header;
  for (const [name, label] of [['security', '보안'], ['review', '검토']]) {
    if (menu.querySelector(`[data-menu="${name}"]`)) continue;
    const item = document.createElement('div'); item.className = 'menu-item'; item.dataset.menu = name;
    const title = document.createElement('span'); title.className = 'menu-title'; title.textContent = label; item.append(title);
    menu.insertBefore(item, menu.querySelector('[data-menu="tool"]'));
  }
  const titles = [...menu.querySelectorAll<HTMLElement>('.menu-item[data-menu] > .menu-title')];
  if (!titles.length) return null;
  const storage = options.storage === undefined ? safeStorage() : options.storage;
  const saved = readState(storage);
  const tabs = titles.map(title => (title.parentElement as HTMLElement).dataset.menu!).filter(name => ribbonTabs[name]);
  let active = tabs.includes(saved.tab) ? saved.tab : tabs.includes(options.defaultTab ?? 'edit') ? (options.defaultTab ?? 'edit') : tabs[0];
  let collapsed = saved.collapsed;
  let passthrough = false;

  const region = document.createElement('div'); region.id = 'jakal-ribbon'; region.className = 'jakal-ribbon';
  region.setAttribute('role', 'tabpanel'); region.setAttribute('aria-label', '도구 모음');
  const buttons = new Map<string, HTMLButtonElement[]>();
  const cache = new Map<string, { nodes: Node[]; buttons: Map<string, HTMLButtonElement[]> }>();
  const nativeStates = new Map<string, HTMLElement | null>();
  let updatePending = false;
  const requestFrame = options.requestFrame ?? (run => {
    const win = document.defaultView;
    return win?.requestAnimationFrame ? win.requestAnimationFrame(run) : run();
  });
  const quickButtons = new Map<string, HTMLButtonElement[]>();
  const stylebar = document.getElementById('style-bar');
  if (stylebar) {
    if(options.getInput)installFormatBar(events,{getInput:options.getInput,getContext:options.getContext,requestFrame:options.requestFrame});
    const quick = document.createElement('div'); quick.className = 'jakal-quick-actions';
    quick.setAttribute('role', 'group'); quick.setAttribute('aria-label', '실행 취소와 다시 실행');
    for (const [id, label, icon] of [['edit:undo', '실행 취소', 'icon-undo'], ['edit:redo', '다시 실행', 'icon-redo']]) {
      if (!registry.get(id)) continue;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'tb-btn jakal-quick-button';
      button.dataset.command = id; button.title = label; button.setAttribute('aria-label', label); button.append(ribbonIcon(icon,16));
      button.addEventListener('click', () => { dispatcher.dispatch(id, { anchorEl: button }); update(); });
      quick.append(button); quickButtons.set(id, [button]);
    }
    quick.addEventListener('mousedown', event => event.preventDefault());
    if (quick.childElementCount) stylebar.prepend(quick);
  }
  const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'jakal-ribbon-toggle';
  toggle.setAttribute('aria-controls', region.id);
  // Menu bar last so the native overflow toggle, hidden in the embed, keeps its slot.
  menu.append(toggle);
  const anchor = document.getElementById('icon-toolbar');
  if (anchor && anchor.parentElement === header) anchor.before(region); else menu.after(region);
  document.documentElement.classList.add('jakal-ribbon-on');

  for (const title of titles) {
    const item = title.parentElement as HTMLElement, name = item.dataset.menu!;
    if (!ribbonTabs[name]) continue;
    title.setAttribute('role', 'tab'); title.tabIndex = 0; title.setAttribute('aria-controls', region.id);
    if (!item.querySelector('.menu-dropdown')) continue;
    const arrow = document.createElement('button'); arrow.type = 'button'; arrow.className = 'jakal-menu-arrow';
    arrow.setAttribute('aria-label', `${title.textContent?.trim()} 메뉴 열기`); arrow.tabIndex = -1;
    arrow.addEventListener('mousedown', event => { event.preventDefault(); event.stopPropagation(); openDropdown(title); });
    arrow.addEventListener('click', event => { if (event.detail === 0) openDropdown(title); });
    title.after(arrow);
  }

  function openDropdown(title: HTMLElement) {
    if (!title.parentElement?.querySelector('.menu-dropdown')) return;
    passthrough = true;
    try { title.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); } finally { passthrough = false; }
  }
  function render() {
    region.replaceChildren(); buttons.clear();
    for (const [id, list] of quickButtons) buttons.set(id, list);
    const existing = cache.get(active);
    if (existing) {
      region.append(...existing.nodes);
      for (const [id, list] of existing.buttons) buttons.set(id, [...(buttons.get(id) ?? []), ...list]);
      return;
    }
    const tabButtons = new Map<string, HTMLButtonElement[]>();
    for (const group of ribbonTabs[active] ?? []) {
      const area = document.createElement('div'); area.className = 'tb-group jakal-ribbon-group'; area.setAttribute('role', 'group');
      if (group.label) area.setAttribute('aria-label', group.label);
      let stack: HTMLElement | null = null;
      for (const [id, label, icon] of group.items) {
        if (!registry.get(id)) continue;
        const definition = registry.get(id)!;
        const button = document.createElement('button'); button.type = 'button'; button.dataset.command = id; button.title = label + (definition.shortcutLabel ? ` (${definition.shortcutLabel})` : ''); button.setAttribute('aria-label', label);
        if (id === 'table:create' || id === 'table:create-nested') button.setAttribute('aria-haspopup', 'dialog');
        if (icon) {
          button.className = 'tb-btn jakal-ribbon-button';
          const sprite = ribbonIcon(icon);
          const text = document.createElement('span'); text.className = 'tb-label'; text.textContent = label;
          button.append(sprite, text); area.append(button); stack = null;
        } else {
          button.className = 'jakal-ribbon-small jakal-icon-command'; button.append(commandIcon(id));
          if (!stack || stack.childElementCount >= 2) { stack = document.createElement('div'); stack.className = 'jakal-ribbon-stack'; area.append(stack); }
          stack.append(button);
        }
        button.addEventListener('click', () => { dispatcher.dispatch(id, { anchorEl: button }); update(); });
        buttons.set(id, [...(buttons.get(id) ?? []), button]);
        tabButtons.set(id, [...(tabButtons.get(id) ?? []), button]);
      }
      if (!area.querySelector('button')) continue;
      if (group.label) { const caption = document.createElement('span'); caption.className = 'jakal-ribbon-caption'; caption.textContent = group.label; caption.setAttribute('aria-hidden', 'true'); area.append(caption); }
      if (region.childElementCount) { const separator = document.createElement('span'); separator.className = 'tb-sep'; region.append(separator); }
      region.append(area);
    }
    cache.set(active, { nodes: [...region.childNodes], buttons: tabButtons });
  }
  function update() {
    for (const title of titles) {
      const name = (title.parentElement as HTMLElement).dataset.menu!;
      if (!ribbonTabs[name]) continue;
      title.classList.toggle('jakal-tab-active', name === active && !collapsed);
      title.setAttribute('aria-selected', String(name === active));
      title.setAttribute('aria-expanded', String(name === active && !collapsed));
    }
    region.hidden = collapsed;
    root.classList.toggle('jakal-ribbon-collapsed', collapsed);
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', collapsed ? '도구 모음 펼치기' : '도구 모음 접기');
    toggle.title = collapsed ? '도구 모음 펼치기 (탭 빈 곳 두 번 클릭)' : '도구 모음 접기 (탭 빈 곳 두 번 클릭)';
    const context = options.getContext?.();
    const flags: Record<string, boolean | undefined> = { 'view:ctrl-mark': context?.showControlCodes, 'view:para-mark': context?.showParagraphMarks, 'view:form-mode': context?.isFormMode };
    for (const [id, list] of buttons) {
      const enabled = dispatcher.isEnabled ? dispatcher.isEnabled(id) : !!registry.get(id);
      let pressed = flags[id];
      if (pressed === undefined && toggleCommands.has(id)) {
        if (!nativeStates.has(id)) nativeStates.set(id, document.querySelector<HTMLElement>(toolbarStates[id] ?? `[data-cmd="${id}"]`));
        const native = nativeStates.get(id); if (native) pressed = native.classList.contains('active');
      }
      for (const button of list) {
        if (button.disabled === enabled) button.disabled = !enabled;
        if (pressed !== undefined && button.getAttribute('aria-pressed') !== String(pressed)) button.setAttribute('aria-pressed', String(pressed));
      }
    }
  }
  function persist() { try { storage?.setItem(STORAGE_KEY, JSON.stringify({ tab: active, collapsed })); } catch { /* Private mode or quota: the choice lasts for this session only. */ } }
  function select(name: string, expand = true) {
    if (!ribbonTabs[name]) return;
    if (name !== active) { active = name; render(); }
    if (expand) collapsed = false;
    update(); persist();
  }
  function setCollapsed(value: boolean) { collapsed = value; update(); persist(); }

  // Capture runs before the runtime's own title listener, which would open the dropdown.
  menu.addEventListener('mousedown', event => {
    if (passthrough) return;
    const title = (event.target as Element).closest<HTMLElement>('.menu-item[data-menu] > .menu-title');
    if (!title || !ribbonTabs[(title.parentElement as HTMLElement).dataset.menu!]) return;
    event.preventDefault(); event.stopPropagation();
    if (event.button === 0) select((title.parentElement as HTMLElement).dataset.menu!);
  }, true);
  menu.addEventListener('dblclick', event => {
    const target = event.target as Element;
    if (target.closest('.menu-item, .jakal-ribbon-toggle, .jakal-layout-tabs, .menu-toolbox-toggle, button')) return;
    event.preventDefault(); setCollapsed(!collapsed);
  });
  toggle.addEventListener('mousedown', event => event.preventDefault());
  toggle.addEventListener('click', () => setCollapsed(!collapsed));
  menu.addEventListener('keydown', event => {
    const title = (event.target as Element).closest<HTMLElement>('.menu-item[data-menu] > .menu-title');
    if (!title) return;
    const name = (title.parentElement as HTMLElement).dataset.menu!;
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(name); }
    else if (event.key === 'ArrowDown') {
      event.preventDefault(); openDropdown(title);
      title.parentElement?.querySelector<HTMLElement>('.menu-dropdown > .md-item:not(.disabled)[data-cmd]')?.focus();
    }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const list = titles.filter(entry => ribbonTabs[(entry.parentElement as HTMLElement).dataset.menu!]);
      const at = list.indexOf(title);
      list[(at + (event.key === 'ArrowLeft' ? -1 : 1) + list.length) % list.length]?.focus();
    }
  });
  // Tool clicks must not move focus away from the document selection.
  region.addEventListener('mousedown', event => event.preventDefault());
  const scheduleUpdate = () => { if (updatePending) return; updatePending = true; requestFrame(() => { updatePending = false; update(); }); };
  for (const event of ['command-state-changed', 'selection-changed', 'cursor-format-changed', 'cursor-cell-changed', 'document-loaded', 'document-changed', 'document-mutated', 'table-object-selection-changed', 'picture-object-selection-changed', 'document-view-changed', 'grid-view-changed']) events.on(event, scheduleUpdate);
  render(); update();
  return { select, setCollapsed, get active() { return active; }, get collapsed() { return collapsed; }, refresh: () => { cache.clear(); nativeStates.clear(); render(); update(); } };
}

const toggleCommands = new Set(['view:ctrl-mark', 'view:para-mark', 'view:form-mode', 'view:border-transparent', 'view:toggle-clip', 'view:toggle-grid', 'view:toolbox-format', 'format:bold', 'format:italic', 'format:underline', 'format:strikethrough', 'format:superscript', 'format:subscript', 'format:align-left', 'format:align-center', 'format:align-right', 'format:align-justify', 'format:align-distribute', 'format:align-split']);
const toolbarStates: Record<string, string> = { 'format:bold': '#btn-bold', 'format:italic': '#btn-italic', 'format:underline': '#btn-underline', 'format:strikethrough': '#btn-strike', ...Object.fromEntries(['left', 'center', 'right', 'justify', 'distribute', 'split'].map(alignment => [`format:align-${alignment}`, `#btn-align-${alignment}`])) };

function safeStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
function readState(storage: Pick<Storage, 'getItem' | 'setItem'> | null): { tab: string; collapsed: boolean } {
  try {
    const value: unknown = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null');
    if (value && typeof value === 'object') return { tab: typeof (value as any).tab === 'string' ? (value as any).tab : '', collapsed: (value as any).collapsed === true };
  } catch { /* Corrupt state falls back to the defaults. */ }
  return { tab: '', collapsed: false };
}
