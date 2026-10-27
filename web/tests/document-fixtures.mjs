import assert from 'node:assert/strict';
import fs from 'node:fs';
import { HwpDocument } from '@rhwp/core';

// Extend Office's own demo instead of retaining the upstream document corpus.
export function mathDocument({ secondSection = false } = {}) {
  const source = secondSection ? './fixtures/two-sections.hwpx' : '../public/sample.hwpx';
  const doc = new HwpDocument(fs.readFileSync(new URL(source, import.meta.url)));
  try {
    const last = doc.getParagraphCount(0) - 1;
    assert.equal(JSON.parse(doc.insertEquation(0, last, doc.getParagraphLength(0, last), 'x^2+y^2=z^2', 1100, 0)).ok, true);
    if (secondSection) {
      assert.equal(doc.getSectionCount(), 2);
    }
    return doc;
  } catch (error) {
    doc.free();
    throw error;
  }
}
