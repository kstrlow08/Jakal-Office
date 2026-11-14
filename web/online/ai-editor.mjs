import {diffText,acceptedText,validateReplacement} from './ai-core.js';
import {createCloudflareAi} from './cloudflare-ai.js';
import {createScopeClient,sameState,generationBatches,waitForCapacity} from './ai-scope.js';
const template=__PANEL_TEMPLATE__;
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};

export function createAiEditor({getEditor,isReady,beforeApply,afterApply,notify,onMutationChange=()=>{},googleClient=createCloudflareAi(),scopeClient=createScopeClient()}) {
  const readState=editor=>scopeClient.state?scopeClient.state(editor):editor.getDocumentState();
  let context=null,activeId='',receipt=null,pending=false,revision=0,controller=null,connection={phase:'loading'},applied=false,instruction='',reviews=new Map();
  const box=el('aside',undefined,'ai-panel');box.id='ai-panel';box.hidden=true;box.tabIndex=-1;box.setAttribute('role','region');box.setAttribute('aria-labelledby','ai-title');box.innerHTML=template;
  document.body.append(box);const $=s=>box.querySelector(s),launcher=document.querySelector('[data-action="ai-edit"]');
  const isOpen=()=>!box.hidden,current=()=>context?.targets.find(t=>t.id===activeId);
  const syncLauncher=()=>{launcher?.setAttribute('aria-expanded',String(isOpen()));launcher?.setAttribute('aria-label',isOpen()?'AI 편집 접기':'AI 편집 열기');};
  const status=(text,error=false)=>{$('[data-status]').textContent=text;$('[data-status]').classList.toggle('error',error);};
  const unchanged=t=>[{equal:t?.text||''}];
  const partsFor=t=>reviews.get(t?.id)?.parts||unchanged(t);
  function selectionCount(){let total=0,selected=0;for(const review of reviews.values())for(const part of review.parts)if(part.equal===undefined){total++;if(part.accepted)selected++;}return{total,selected};}
  function filtered(){return (context?.targets||[]).filter(t=>(!$('[data-region]').value||t.region===$('[data-region]').value)&&(!$('[data-only-changes]').checked||reviews.get(t.id)?.parts.some(p=>p.equal===undefined)));}
  function renderNavigation(){
    const targets=filtered();let index=targets.findIndex(t=>t.id===activeId);if(index<0){index=0;activeId=targets[0]?.id||'';}
    const start=Math.floor(index/40)*40,select=$('[data-target-select]');select.replaceChildren();
    for(const t of targets.slice(start,start+40)){const changed=reviews.get(t.id)?.parts.some(p=>p.equal===undefined);select.append(new Option(`${changed?'• ':''}${t.label} · ${t.text.slice(0,36)}`,t.id));}select.value=activeId;
    $('[data-position]').textContent=targets.length?`${index+1} / ${targets.length}부분 · ${reviews.size} / ${context?.targets.length||0} 생성됨`:'검토할 부분 없음';
    $('[data-previous]').disabled=pending||index<=0;$('[data-next]').disabled=pending||index>=targets.length-1;select.disabled=pending||!targets.length;
  }
  function render(){
    renderNavigation();const target=current(),parts=partsFor(target),before=$('[data-before]'),after=$('[data-after]'),changes=$('[data-changes]');before.replaceChildren();after.replaceChildren();changes.replaceChildren();
    for(const p of parts){if(p.equal!==undefined){before.append(document.createTextNode(p.equal));after.append(document.createTextNode(p.equal));continue;}
      before.append(el('span',p.before,p.accepted?'ai-deleted':''));after.append(el('span',p.accepted?p.after:p.before,p.accepted?'ai-added':''));
      const label=el('label',undefined,'ai-change'),check=el('input');check.type='checkbox';check.checked=p.accepted;check.disabled=pending||applied;check.onchange=()=>{p.accepted=check.checked;render();};label.append(check,el('span',`${p.before||'∅'} → ${p.after||'∅'}`));changes.append(label);
    }
    const {total,selected}=selectionCount();$('[data-count]').textContent=total?`전체 변경 ${total}곳 · ${selected}곳 선택`:'변경 사항 없음';
    $('[data-draft]').value=reviews.get(activeId)?.draft||'';$('[data-draft]').disabled=pending||applied||!target;
    $('[data-generate]').disabled=pending||!context?.targets.length||applied||connection.phase!=='signed-in';
    $('[data-generate]').textContent=instruction&&reviews.size&&reviews.size<(context?.targets.length||0)&&instruction===$('[data-prompt]').value.trim()?'남은 부분 이어서 만들기':'수정안 만들기';
    for(const selector of ['[data-login]','[data-login-redirect]'])$(selector).disabled=pending||!['signed-out','signed-in'].includes(connection.phase);
    $('[data-login-redirect]').hidden=connection.phase==='signed-in'||connection.loginMode==='redirect';$('[data-close]').disabled=pending&&!controller;$('[data-stop]').hidden=!controller;
    $('[data-apply]').disabled=pending||applied||!context||!selected||!context.targets.some(t=>reviews.has(t.id)&&acceptedText(partsFor(t))!==t.text);
    for(const selector of ['[data-read]','[data-all]','[data-none]','[data-scope]','[data-region]','[data-only-changes]','[data-prompt]','[data-logout]'])$(selector).disabled=pending;
    $('[data-revert]').hidden=!receipt;$('[data-revert]').disabled=pending;
  }
  function busy(value){pending=value;box.setAttribute('aria-busy',String(value));render();}
  function mutating(value){onMutationChange(value);if(getEditor()?.element)getEditor().element.inert=value;busy(value);}
  async function attempt(fn){try{await fn();}catch(error){status(error.name==='AbortError'?'요청을 취소했습니다. 받은 수정안은 그대로 검토할 수 있습니다.':error.name==='TimeoutError'?'응답 시간이 초과됐습니다. 받은 수정안은 유지되며, 남은 부분을 다시 요청할 수 있습니다.':error.message||'처리하지 못했습니다.',true);}}
  async function capture(){
    const run=++revision;if(!isReady())throw Error('먼저 편집할 문서를 열어 주세요.');
    context=null;reviews.clear();activeId='';receipt=null;applied=false;$('[data-target]').textContent='';$('[data-coverage]').textContent='';$('[data-region]').replaceChildren(new Option('모든 영역',''));busy(true);status('편집 범위의 텍스트를 읽고 있습니다…');
    try{const next=await scopeClient.capture(getEditor(),$('[data-scope]').value);if(run!==revision||!isOpen())return;
      context=next;activeId=next.targets[0]?.id||'';$('[data-target]').textContent=`${next.targets.length.toLocaleString()}부분 · ${next.characters.toLocaleString()}자`;
      $('[data-coverage]').textContent=Object.entries(next.regions).map(([name,count])=>`${name} ${count}`).join(' · ');
      $('[data-region]').replaceChildren(new Option('모든 영역',''));for(const[name,count]of Object.entries(next.regions))$('[data-region]').append(new Option(`${name} (${count})`,name));$('[data-only-changes]').checked=false;
      status(next.targets.length?'수정 요청을 입력해 주세요.':'이 범위에 편집할 글자가 없습니다. 범위를 바꾸어 주세요.');
    }finally{busy(false);}
  }
  async function assertCurrent(original=context){if(!original||getEditor()!==original.editor||!sameState(original.state,await readState(getEditor())))throw Error('문서가 변경됐습니다. 다시 읽은 뒤 수정안을 생성해 주세요.');}
  const close=(force=false,restoreFocus=true)=>{if(pending&&!controller&&!force)return;controller?.abort();revision++;box.hidden=true;syncLauncher();if(restoreFocus)launcher?.focus({preventScroll:true});};
  $('[data-close]').onclick=()=>close();box.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}});
  $('[data-expand]').onclick=()=>{const expanded=box.classList.toggle('is-expanded'),button=$('[data-expand]');button.setAttribute('aria-expanded',String(expanded));button.setAttribute('aria-label',expanded?'AI 패널 작게 보기':'AI 패널 넓게 보기');button.title=expanded?'작게 보기':'넓게 보기';button.querySelector('path').setAttribute('d',expanded?'M2 2l4 4M2 6h4V2M14 14l-4-4M10 14v-4h4':'M10 2h4v4M14 2 9 7M6 14H2v-4M2 14l5-5');};
  const unsubscribe=googleClient.subscribe(value=>{connection=value;$('[data-google-state]').textContent=value.phase==='signed-in'?(value.name||'Google 계정')+' · 로그인됨':value.message;$('[data-login]').hidden=value.phase==='signed-in';$('[data-logout]').hidden=value.phase!=='signed-in';if(value.phase!=='signed-in'){controller?.abort();reviews.clear();}render();});
  $('[data-login]').onclick=()=>attempt(async()=>{busy(true);try{if(connection.loginMode==='redirect')await beforeApply();await googleClient.login();}finally{busy(false);}});
  $('[data-login-redirect]').onclick=()=>attempt(async()=>{busy(true);try{await beforeApply();await googleClient.login({redirect:true});}finally{busy(false);}});
  $('[data-logout]').onclick=()=>attempt(()=>googleClient.logout());$('[data-stop]').onclick=()=>controller?.abort();
  $('[data-read]').onclick=()=>attempt(capture);$('[data-scope]').onchange=()=>attempt(capture);
  $('[data-region]').onchange=render;$('[data-only-changes]').onchange=render;
  $('[data-target-select]').onchange=()=>{activeId=$('[data-target-select]').value;render();};
  for(const [selector,direction]of [['[data-previous]',-1],['[data-next]',1]])$(selector).onclick=()=>{const targets=filtered(),index=targets.findIndex(t=>t.id===activeId);activeId=targets[index+direction]?.id||activeId;render();};
  $('[data-prompt]').oninput=()=>{$('[data-generate]').textContent='수정안 만들기';};
  $('[data-draft]').oninput=()=>{const target=current();if(!target)return;const draft=$('[data-draft]').value;try{const parts=diffText(target.text,draft?validateReplacement(draft):target.text);reviews.set(target.id,{draft,parts});status('변경 부분을 선택해 주세요.');}catch(error){reviews.delete(target.id);status(error.message,true);}const start=$('[data-draft]').selectionStart,end=$('[data-draft]').selectionEnd;render();$('[data-draft]').setSelectionRange(start,end);};
  for(const button of box.querySelectorAll('[data-preset]'))button.onclick=()=>{if(pending)return;$('[data-prompt]').value=button.dataset.preset;};
  for(const[selector,value]of [['[data-all]',true],['[data-none]',false]])$(selector).onclick=()=>{for(const review of reviews.values())review.parts.forEach(p=>{if(p.equal===undefined)p.accepted=value;});render();};
  $('[data-generate]').onclick=()=>attempt(async()=>{
    if(!context)return;await assertCurrent();const prompt=$('[data-prompt]').value.trim();if(!prompt)throw Error('수정 요청을 입력해 주세요.');
    if(instruction!==prompt||reviews.size===context.targets.length)reviews.clear();instruction=prompt;
    const original=context,run=revision;controller=new AbortController();const signal=controller.signal;busy(true);
    try{const batches=generationBatches(original.targets.filter(t=>!reviews.has(t.id)));
      for(let index=0;index<batches.length;index++){
        signal.throwIfAborted();await assertCurrent(original);const batch=batches[index];let results;
        for(let retry=0;;retry++)try{status(`${reviews.size} / ${original.targets.length}부분 완료 · 수정안 생성 중…`);results=await googleClient.generate(batch.map(t=>({id:t.id,source:t.text})),prompt,{signal});break;}
        catch(error){if(error.providerCode!=='RATE_LIMIT'||retry>=3)throw error;await waitForCapacity(error.retryAfter,signal,left=>status(`${reviews.size} / ${original.targets.length}부분 완료 · 무료 요청 간격 대기 ${left}초`));}
        signal.throwIfAborted();if(run!==revision||context!==original||!isOpen())return;await assertCurrent(original);
        const map=new Map(results.map(r=>[r.id,r.replacement]));if(map.size!==batch.length||batch.some(t=>!map.has(t.id)))throw Error('AI 응답의 문단 위치가 일치하지 않습니다.');
        const diffs=await scopeClient.request({type:'diff',items:batch.map(t=>({id:t.id,before:t.text,after:validateReplacement(map.get(t.id))}))});signal.throwIfAborted();
        if(run!==revision||context!==original||!isOpen())return;
        for(const item of diffs)reviews.set(item.id,{draft:map.get(item.id),parts:item.parts});render();
      }
      status(`${reviews.size}부분의 수정안을 만들었습니다. 변경 부분을 비교하고 반영할 내용만 선택하세요.`);
    }finally{controller=null;busy(false);}
  });
  $('[data-apply]').onclick=()=>attempt(async()=>{
    if(!context)return;const original=context,changes=original.targets.filter(t=>reviews.has(t.id)).map(t=>({id:t.id,before:t.text,after:acceptedText(partsFor(t))})).filter(t=>t.before!==t.after);if(!changes.length)return;
    mutating(true);
    try{await assertCurrent(original);await beforeApply(original.bytes);await assertCurrent(original);status('선택한 변경을 적용하고 있습니다…');
      const result=await scopeClient.request({type:'apply',changes});await assertCurrent(original);
      try{await original.editor.loadFile(result.bytes,'AI 편집.hwpx',{skipUnsavedGuard:true,suppressDialogs:true});}
      catch(error){try{await original.editor.loadFile(original.bytes,'AI 편집 전 원문.hwpx',{skipUnsavedGuard:true,suppressDialogs:true});await afterApply();}catch{throw Error('문서를 다시 여는 데 실패했습니다. 저장 기록에서 적용 전 원문을 복원해 주세요.');}throw Error('변경을 적용하지 못해 원문으로 복구했습니다.');}
      applied=true;receipt={bytes:original.bytes,editor:original.editor,state:await readState(original.editor)};render();
      try{await afterApply();receipt.state=await readState(original.editor);}catch{throw Error('변경은 적용됐지만 저장하지 못했습니다. 되돌리기 또는 문서 다운로드를 사용하세요.');}
      status(`${changes.length}부분의 선택한 변경을 적용하고 저장했습니다. 되돌리기로 적용 전 원문을 복원할 수 있습니다.`);notify('선택한 AI 변경을 적용했습니다.');
    }finally{mutating(false);}
  });
  $('[data-revert]').onclick=()=>attempt(async()=>{
    if(!receipt)return;mutating(true);try{if(getEditor()!==receipt.editor||!sameState(receipt.state,await readState(getEditor())))throw Error('적용 후 문서가 변경됐습니다. 새 편집을 보호하기 위해 되돌리기를 중단했습니다. 저장 기록에서 원문을 확인하세요.');
      await receipt.editor.loadFile(receipt.bytes,'AI 편집 전 원문.hwpx',{skipUnsavedGuard:true,suppressDialogs:true});receipt=null;await afterApply();
      // Loading resets the native selection. The worker's immutable baseline and
      // captured text boundaries still describe the exact bytes just restored.
      context={...context,state:await readState(getEditor())};reviews.clear();applied=false;render();
      status('AI 편집 전 원문으로 되돌리고 저장했습니다. 편집 범위는 그대로 유지됩니다.');
    }finally{mutating(false);}
  });
  async function open(){
    if(!isReady())throw Error('먼저 편집할 문서를 열어 주세요.');if(isOpen())return;box.hidden=false;syncLauncher();$('[data-close]').focus({preventScroll:true});
    if(context&&getEditor()===context.editor&&sameState(receipt?.state||context.state,await readState(getEditor()))){render();return;}
    await Promise.all([googleClient.initialize(),attempt(capture)]);
  }
  return {open,initializeConnection:()=>googleClient.initialize(),async toggle(){if(isOpen())close();else await open();},reset(){close(true,false);scopeClient.dispose();context=null;receipt=null;reviews.clear();activeId='';applied=false;$('[data-prompt]').value='';$('[data-target]').textContent='';$('[data-coverage]').textContent='';status('');render();},destroy(){close(true,false);scopeClient.dispose();unsubscribe();googleClient.dispose();box.remove();}};
}
