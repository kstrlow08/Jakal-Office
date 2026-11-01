import { commandIcon } from './command-icons.ts';
import { ribbonIcon } from './ribbon-icons.ts';

const actions: Record<string,string> = { '확인':'check','적용':'check','설정':'check','넣기':'plus','만들기':'plus','취소':'x','닫기':'x','저장':'file-down','삭제':'trash-2','찾기':'search-check','바꾸기':'replace','열기':'file','추가':'plus' };
const formatting:Record<string,string>={'굵게':'format:bold','기울임':'format:italic','밑줄':'format:underline','취소선':'format:strikethrough','위 첨자':'format:superscript','아래 첨자':'format:subscript'};

/** Decorate only actual command surfaces, never document text or live canvases. */
export function decorateCommandSurface(root: Element) {
  if(root.matches('.menu-dropdown,.context-menu'))root.setAttribute('role','menu');
  for (const row of root.querySelectorAll<HTMLElement>('.md-item[data-cmd]')) {
    row.setAttribute('aria-disabled',String(row.classList.contains('disabled')));
    if (!row.classList.contains('jakal-command-row')) {
      row.querySelector(':scope > .md-icon')?.remove();
      row.prepend(commandIcon(row.dataset.cmd!));row.classList.add('jakal-command-row');
      row.tabIndex=-1;row.setAttribute('role','menuitem');
    }
  }
  for(const button of root.querySelectorAll<HTMLButtonElement>('.dialog-close,.cs-icon-btn')){
    if(button.querySelector('svg'))continue;
    const id=formatting[button.title];
    if(button.classList.contains('dialog-close')){
      button.replaceChildren(ribbonIcon('icon-mono-x',16));button.setAttribute('aria-label','닫기');button.title='닫기';
    }else if(id){button.replaceChildren(commandIcon(id));button.setAttribute('aria-label',button.title);}
  }
  for (const button of root.querySelectorAll<HTMLButtonElement>('.dialog-btn, dialog button:not([role]), .jakal-picker-header button')) {
    if(button.querySelector('svg')||button.querySelector('input,select')||button.closest('.sym-char-grid,.sym-recent-grid'))continue;
    const name=actions[(button.textContent??'').trim().replace(/\([A-Za-z]\)/g,'').replace(/[.…]+$/,'')];if(!name)continue;
    button.prepend(ribbonIcon('icon-mono-'+name,16));button.classList.add('jakal-action-icon');
  }
  for(const menu of root.querySelectorAll<HTMLElement>('.menu-dropdown,.context-menu')) menu.setAttribute('role','menu');
}

export function installSurfaceIcons(doc: Document = document) {
  const menu=doc.getElementById('menu-bar');if(menu)decorateCommandSurface(menu);
  // Native popups are appended complete to body. No subtree/attribute observer:
  // typing, selection, cursor movement and button state updates do no scanning.
  const Observer=doc.defaultView?.MutationObserver;if(!Observer||!doc.body)return;
  const observer=new Observer(records=>{
    for(const record of records)for(const node of record.addedNodes){
      if(node.nodeType!==1)continue;
      const root=node as Element;
      if(root.matches('.modal-overlay,.context-menu,dialog,.shape-picker-panel'))decorateCommandSurface(root);
    }
  });
  observer.observe(doc.body,{childList:true});
  const keydown=(event: KeyboardEvent)=>{
    const target=event.target as HTMLElement;
    if(!target.closest('.md-item[data-cmd]'))return;
    const surface=target.closest('.menu-dropdown,.md-sub-panel,.context-menu');if(!surface)return;
    const rows=[...surface.querySelectorAll<HTMLElement>('.md-item[data-cmd]:not(.disabled)')].filter(row=>row.getClientRects().length);
    if(!rows.length)return;
    const at=rows.indexOf(target.closest('.md-item') as HTMLElement);
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();event.stopImmediatePropagation();
      rows[event.key==='Home'?0:event.key==='End'?rows.length-1:(at+(event.key==='ArrowUp'?-1:1)+rows.length)%rows.length].focus();
    }else if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopImmediatePropagation();if(at>=0)rows[at].click();}
  };
  doc.addEventListener('keydown',keydown,true);
  return ()=>{observer.disconnect();doc.removeEventListener('keydown',keydown,true);};
}
