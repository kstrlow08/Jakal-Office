export function installSidebar({ document, media, storage }) {
  const sidebar = document.getElementById('document-sidebar');
  const toggles = [...document.querySelectorAll('[data-sidebar-toggle]')];
  const scrim = document.getElementById('sidebar-scrim');
  const key = 'jakal-office-sidebar-collapsed';
  let collapsed = false, mobileOpen = false;
  try { collapsed = storage?.getItem(key) === 'true'; } catch { /* Session-only preference. */ }
  function render() {
    const visible = media.matches ? mobileOpen : !collapsed;
    document.body.classList.toggle('sidebar-collapsed', !visible);
    sidebar.classList.toggle('mobile-open', media.matches && visible);
    sidebar.inert = !visible;
    sidebar.setAttribute('aria-hidden', String(!visible));
    scrim.hidden = !(media.matches && visible);
    for (const button of toggles) {
      button.setAttribute('aria-expanded', String(visible));
      button.setAttribute('aria-label', visible ? '문서 목록 접기' : '문서 목록 펼치기');
      button.title = visible ? '문서 목록 접기' : '문서 목록 펼치기';
    }
  }
  function toggle() {
    if (media.matches) mobileOpen = !mobileOpen;
    else { collapsed = !collapsed; try { storage?.setItem(key, String(collapsed)); } catch {} }
    const inside = sidebar.contains(document.activeElement);
    render();
    if (inside && sidebar.inert) {
      const selector = document.body.classList.contains('editing') ? '.editor-toolbar [data-sidebar-toggle]' : '.topbar [data-sidebar-toggle]';
      document.querySelector(selector)?.focus();
    }
  }
  const click = event => { if (event.target.closest('[data-sidebar-toggle]')) toggle(); };
  const closeOnMobile = () => { mobileOpen = false; render(); };
  const escape = event => { if (event.key === 'Escape' && mobileOpen) { event.preventDefault(); toggle(); } };
  document.addEventListener('click', click);
  document.addEventListener('keydown', escape);
  media.addEventListener('change', closeOnMobile);
  render();
  return { closeOnMobile, destroy() { document.removeEventListener('click', click); document.removeEventListener('keydown', escape); media.removeEventListener('change', closeOnMobile); } };
}
