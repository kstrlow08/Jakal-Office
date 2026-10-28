// Menu titles double as ribbon tabs: each one swaps the tool strip below the
// menu bar, the way 한글 2024 does. The runtime's own dropdowns stay reachable
// through the small arrow next to every title.
type Definition = { id: string; label: string; canExecute?: (context: any) => boolean; [key: string]: unknown };
type Registry = { get: (id: string) => Definition | undefined };
type Dispatcher = { dispatch: (id: string, params?: Record<string, unknown>) => boolean; isEnabled?: (id: string) => boolean };
type Events = { on: (event: string, listener: () => void) => unknown };
type Options = { storage?: Pick<Storage, 'getItem' | 'setItem'> | null; defaultTab?: string };
/** [command, label, sprite icon class]. Items without an icon render as small text buttons. */
type Item = [id: string, label: string, icon?: string];
type Group = { label?: string; items: Item[] };

export const STORAGE_KEY = 'jakal-ribbon';
export const ribbonTabs: Record<string, Group[]> = {
  file: [
    { items: [['file:new-doc', '새 문서', 'icon-new-doc'], ['file:open', '열기'], ['file:open-recent', '내 문서'], ['file:save', '저장', 'icon-save'], ['file:save-as', '다른 이름으로'], ['file:save-as-hwpx', 'HWPX 받기'], ['file:save-as-hwp', 'HWP 받기']] },
    { items: [['file:page-setup', '편집 용지', 'icon-page-setup'], ['file:print', '인쇄', 'icon-print'], ['file:print-to-pdf', 'PDF 저장', 'icon-pdf']] },
    { items: [['edit:document-history', '저장 기록'], ['file:about', '제품 정보', 'icon-help']] },
  ],
  edit: [
    { items: [['edit:undo', '되돌리기', 'icon-undo'], ['edit:redo', '다시 실행', 'icon-redo']] },
    { items: [['edit:cut', '오려 두기', 'icon-cut'], ['edit:copy', '복사하기', 'icon-copy'], ['edit:paste', '붙이기', 'icon-paste'], ['edit:format-copy', '모양 복사', 'icon-format-copy'], ['edit:format-paste', '모양 붙여넣기'], ['edit:delete', '지우기'], ['edit:select-all', '모두 선택']] },
    { items: [['format:char-shape', '글자 모양', 'icon-char-shape'], ['format:para-shape', '문단 모양', 'icon-para-shape'], ['format:style-dialog', '스타일']] },
    { items: [['edit:find', '찾기', 'icon-find'], ['edit:find-replace', '찾아 바꾸기', 'icon-find-replace'], ['edit:find-again', '다시 찾기'], ['edit:goto', '찾아가기']] },
  ],
  view: [
    { items: [['view:zoom-in', '확대', 'icon-zoom-menu-in'], ['view:zoom-out', '축소', 'icon-zoom-menu-out'], ['view:zoom-fit-page', '쪽 맞춤'], ['view:zoom-fit-width', '폭 맞춤'], ['view:zoom-100', '100%'], ['view:zoom-dialog', '배율 설정…']] },
    { items: [['view:ctrl-mark', '조판 부호', 'icon-ctrl-mark'], ['view:para-mark', '문단 부호', 'icon-para-mark'], ['view:border-transparent', '투명 선'], ['view:toggle-clip', '잘림 보기']] },
    { items: [['view:toggle-grid', '격자 보기', 'icon-grid'], ['view:grid-settings', '격자 설정']] },
    { items: [['view:object-layout', '개체 레이아웃', 'icon-obj-props']] },
  ],
  insert: [
    { items: [['table:create', '표', 'icon-table'], ['insert:image', '그림', 'icon-image'], ['insert:shape', '도형', 'icon-shape'], ['insert:textbox', '글상자', 'icon-textbox'], ['insert:equation', '수식'], ['insert:field', '필드 입력'], ['insert:para-band', '문단 띠']] },
    { items: [['insert:symbols', '문자표', 'icon-symbols'], ['insert:hyperlink', '하이퍼링크', 'icon-hyperlink'], ['insert:bookmark', '책갈피'], ['insert:comment', '주석', 'icon-comment']] },
    { items: [['page:header-create', '머리말', 'icon-header'], ['page:footer-create', '꼬리말', 'icon-footer'], ['insert:footnote', '각주', 'icon-footnote'], ['insert:endnote', '미주', 'icon-endnote'], ['insert:endnote-shape', '각주·미주 모양']] },
  ],
  format: [
    { items: [['format:char-shape', '글자 모양', 'icon-char-shape'], ['format:para-shape', '문단 모양', 'icon-para-shape'], ['format:style-dialog', '스타일']] },
    { items: [['format:bold', '진하게'], ['format:italic', '기울임'], ['format:underline', '밑줄'], ['format:font-size-increase', '글자 크게'], ['format:font-size-decrease', '글자 작게']] },
    { items: [['format:align-left', '왼쪽 정렬'], ['format:align-center', '가운데 정렬'], ['format:align-right', '오른쪽 정렬'], ['format:align-justify', '양쪽 정렬'], ['format:align-distribute', '배분 정렬'], ['format:line-spacing-increase', '줄 간격 늘림'], ['format:line-spacing-decrease', '줄 간격 줄임']] },
    { items: [['format:para-num-shape', '문단 번호'], ['format:bullet-shape', '글머리표'], ['format:level-increase', '수준 올림'], ['format:level-decrease', '수준 내림']] },
    { items: [['format:object-properties', '개체 속성', 'icon-obj-props']] },
  ],
  page: [
    { items: [['page:setup', '편집 용지', 'icon-page-setup'], ['page:page-border', '쪽 테두리·배경'], ['page:section-settings', '구역 설정']] },
    { items: [['page:header-create', '머리말', 'icon-header'], ['page:footer-create', '꼬리말', 'icon-footer'], ['page:new-page-num', '새 번호로 시작'], ['page:hide-current', '현재 쪽 감추기']] },
    { items: [['page:break', '쪽 나누기'], ['page:column-break', '단 나누기'], ['page:col-settings', '다단 설정'], ['page:col-1', '한 단'], ['page:col-2', '두 단'], ['page:col-3', '세 단']] },
  ],
  table: [
    { items: [['table:create', '표 만들기', 'icon-table'], ['table:create-nested', '표 안에 표'], ['table:parent-cell', '상위 칸으로'], ['table:cell-props', '표·셀 속성'], ['table:border-each', '테두리·배경']] },
    { items: [['table:insert-row-above', '위에 줄'], ['table:insert-row-below', '아래에 줄'], ['table:insert-col-left', '왼쪽에 칸'], ['table:insert-col-right', '오른쪽에 칸'], ['table:insert-row-col', '줄·칸 추가…'], ['table:delete-row-col', '줄·칸 지우기…']] },
    { items: [['table:select-cells', '셀 선택'], ['table:cell-split', '셀 나누기'], ['table:cell-merge', '셀 합치기'], ['table:cell-height-equal', '높이 같게'], ['table:cell-width-equal', '너비 같게']] },
    { items: [['table:block-formula', '계산식'], ['table:block-sum', '블록 합계'], ['table:block-avg', '블록 평균'], ['table:block-product', '블록 곱'], ['table:thousand-sep', '천 단위 쉼표'], ['table:decimal-add', '자릿점 넣기'], ['table:decimal-remove', '자릿점 빼기']] },
  ],
  tool: [
    { items: [['tool:options', '환경 설정'], ['view:office-fonts', '글꼴 추가'], ['jakal:workbench', '도구 찾기', 'icon-find']] },
  ],
};

export function installRibbon(registry: Registry, dispatcher: Dispatcher, events: Events, options: Options = {}) {
  const menu = document.getElementById('menu-bar');
  const header = document.getElementById('studio-header');
  if (!menu || !header || document.getElementById('jakal-ribbon')) return null;
  const root = header;
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
    const arrow = document.createElement('button'); arrow.type = 'button'; arrow.className = 'jakal-menu-arrow';
    arrow.setAttribute('aria-label', `${title.textContent?.trim()} 메뉴 열기`); arrow.tabIndex = -1;
    arrow.addEventListener('mousedown', event => { event.preventDefault(); event.stopPropagation(); openDropdown(title); });
    arrow.addEventListener('click', event => { if (event.detail === 0) openDropdown(title); });
    title.after(arrow);
  }

  function openDropdown(title: HTMLElement) {
    passthrough = true;
    try { title.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); } finally { passthrough = false; }
  }
  function render() {
    region.replaceChildren(); buttons.clear();
    for (const group of ribbonTabs[active] ?? []) {
      const area = document.createElement('div'); area.className = 'tb-group jakal-ribbon-group'; area.setAttribute('role', 'group');
      if (group.label) area.setAttribute('aria-label', group.label);
      let stack: HTMLElement | null = null;
      for (const [id, label, icon] of group.items) {
        if (!registry.get(id)) continue;
        const button = document.createElement('button'); button.type = 'button'; button.dataset.command = id; button.title = label;
        if (icon) {
          button.className = 'tb-btn jakal-ribbon-button';
          const sprite = document.createElement('span'); sprite.className = `tb-sprite ${icon}`; sprite.setAttribute('aria-hidden', 'true');
          const text = document.createElement('span'); text.className = 'tb-label'; text.textContent = label;
          button.append(sprite, text); area.append(button); stack = null;
        } else {
          button.className = 'jakal-ribbon-small'; button.textContent = label;
          if (!stack || stack.childElementCount >= 3) { stack = document.createElement('div'); stack.className = 'jakal-ribbon-stack'; area.append(stack); }
          stack.append(button);
        }
        button.addEventListener('click', () => { dispatcher.dispatch(id, { anchorEl: button }); update(); });
        buttons.set(id, [...(buttons.get(id) ?? []), button]);
      }
      if (!area.querySelector('button')) continue;
      if (region.childElementCount) { const separator = document.createElement('span'); separator.className = 'tb-sep'; region.append(separator); }
      region.append(area);
    }
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
    for (const [id, list] of buttons) {
      const enabled = dispatcher.isEnabled ? dispatcher.isEnabled(id) : !!registry.get(id);
      for (const button of list) button.disabled = !enabled;
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
    else if (event.key === 'ArrowDown') { event.preventDefault(); openDropdown(title); }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const list = titles.filter(entry => ribbonTabs[(entry.parentElement as HTMLElement).dataset.menu!]);
      const at = list.indexOf(title);
      list[(at + (event.key === 'ArrowLeft' ? -1 : 1) + list.length) % list.length]?.focus();
    }
  });
  // Tool clicks must not move focus away from the document selection.
  region.addEventListener('mousedown', event => event.preventDefault());
  for (const event of ['command-state-changed', 'selection-changed', 'cursor-format-changed', 'cursor-cell-changed', 'document-loaded', 'document-changed', 'document-mutated', 'table-object-selection-changed', 'picture-object-selection-changed']) events.on(event, update);
  render(); update();
  return { select, setCollapsed, get active() { return active; }, get collapsed() { return collapsed; }, refresh: () => { render(); update(); } };
}

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
