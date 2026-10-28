import assert from 'node:assert/strict';
import test from 'node:test';
import { createLoadProgress } from '../studio/load-progress.ts';

test('progress paints at startup and during long stages without blocking at every short stage', async () => {
  let now = 0, paints = 0;
  const display = {textContent: ''};
  const update = createLoadProgress({now:()=>now, paint:async()=>{paints++;}});
  for (const percent of [0,15,25,45,50,55,75,82,90,94,96]) await update(percent,'문서 준비',display);
  assert.equal(paints,1);
  assert.match(display.textContent,/96%/);
  now = 100;
  await update(97,'페이지 표시',display);
  assert.equal(paints,2);
  await update(0,'다음 문서',display);
  assert.equal(paints,3);
});
