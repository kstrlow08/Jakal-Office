/** Let a real progress update paint without adding two frames at every stage. */
export function createLoadProgress(clock = {
  now: () => performance.now(),
  paint: () => new Promise<void>(resolve => {
    let done = false;
    const finish = () => { if (done) return; done = true; clearTimeout(timer); resolve(); };
    const timer = setTimeout(finish, 50);
    requestAnimationFrame(() => requestAnimationFrame(finish));
  }),
}) {
  let last = -Infinity;
  return async (percent: number, label: string, display: HTMLElement) => {
    display.textContent = `파일 로딩 ${Math.max(0, Math.min(100, Math.round(percent)))}% - ${label}`;
    if (percent === 0 || clock.now() - last >= 80) {
      last = clock.now();
      await clock.paint();
    }
  };
}
