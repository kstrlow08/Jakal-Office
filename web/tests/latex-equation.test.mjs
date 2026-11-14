import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { HwpDocument, initSync } from '@rhwp/core';
import { latexToHwp, hwpToLatex, normalizeHwpScript, stripMathDelimiters } from '../studio/latex-equation.ts';

initSync({ module: fs.readFileSync(new URL('../node_modules/@rhwp/core/rhwp_bg.wasm', import.meta.url)) });
const doc = HwpDocument.createEmpty();
doc.createBlankDocument();
const svg = script => doc.renderEquationPreview(script, 1000, 0);
const glyphs = script => (svg(script).match(/<text[^>]*>([^<]*)<\/text>/g) ?? []).map(text => text.replace(/<[^>]+>/g, '')).join('');

test('LaTeX becomes Hancom equation script', () => {
  const cases = {
    '\\frac{1}{2}': '{{1} over {2}}',
    'x^2+y^2=r^2': 'x^{2} + y^{2} = r^{2}',
    '\\sqrt[3]{8}': 'root {3} of {8}',
    '\\sum_{k=1}^{n} k': 'sum_{k = 1}^{n} k',
    '\\left( x \\right)': 'LEFT ( x RIGHT )',
    '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}': 'pmatrix{a & b # c & d}',
    '\\alpha \\le \\beta': 'alpha leq beta',
    '30^\\circ': '30 deg',
    "f'(x)": 'f prime ( x )',
    '\\text{넓이}': '"넓이"',
    '\\frac12': '{{1} over {2}}',
  };
  for (const [latex, script] of Object.entries(cases)) assert.equal(latexToHwp(latex).script, script, latex);
});

test('letter runs that spell Hancom keywords stay letters', () => {
  assert.equal(latexToHwp('pi r').script, 'p i r');
  assert.equal(latexToHwp('\\pi r').script, 'pi r');
  assert.equal(glyphs(latexToHwp('over').script), 'over');
});

test('unknown commands are kept as text and reported', () => {
  const result = latexToHwp('\\foo{x} + 1');
  assert.deepEqual(result.unsupported, ['\\foo']);
  assert.match(result.script, /"foo"/);
});

test('math delimiters around pasted LaTeX are removed', () => {
  assert.equal(stripMathDelimiters('$x^2$'), 'x^2');
  assert.equal(stripMathDelimiters('$$\\frac{a}{b}$$'), '\\frac{a}{b}');
  assert.equal(stripMathDelimiters('\\(a\\)'), 'a');
  assert.equal(stripMathDelimiters('\\[a\\]'), 'a');
  assert.equal(stripMathDelimiters('x'), 'x');
});

test('converted scripts draw the intended symbols', () => {
  assert.equal(glyphs(latexToHwp('\\forall x \\in \\mathbb{R}').script), '∀x∈ℝ');
  assert.equal(glyphs(latexToHwp('\\angle A = 90^{\\circ}').script), '∠A=90°');
  assert.equal(glyphs(latexToHwp('A \\cup B \\cap C').script), 'A∪B∩C');
  assert.equal(glyphs(latexToHwp('x \\to \\infty').script), 'x→∞');
});

test('Hancom scripts reopen as LaTeX that draws the same equation', () => {
  const scripts = ['{a} over {b}', 'x^{2} + y^{2} = r^{2}', 'sqrt {x+1}', 'root {3} of {8}', 'sum _{k=1} ^{n} k^{2}', 'int _{0} ^{1} x `dx',
    'lim _{x -> 0} {sin x} over {x} = 1', 'LEFT ( {a} over {b} RIGHT ) ^{2}', 'pmatrix{a & b # c & d}', 'f(x) = cases{x & x >= 0 # -x & x < 0}',
    'alpha + beta = gamma', 'Gamma (n)', 'a times b div c cdot d', 'x <= y != z >= w', 'A union B inter C', 'vec {AB} + OVERLINE {CD}',
    '"넓이" = pi r^{2}', '30 deg', 'f prime (x)', 'log _{2} 8 = 3', 'SUM _{i=1} ^{n} x_{i}', 'LEFT | x RIGHT |', 'rm {d} x', 'A`B', 'x~y',
    'a over {b over c}', 'LEFT lbrace x RIGHT .', 'bold {v}', 'x_{i}^{2}'];
  for (const script of scripts) {
    const latex = hwpToLatex(script);
    assert.equal(svg(latexToHwp(latex).script), svg(normalizeHwpScript(script)), `${script} -> ${latex}`);
  }
  assert.equal(hwpToLatex('{a} over {b}'), '\\frac{a}{b}');
  assert.equal(hwpToLatex('sqrt {b^{2} -4ac}'), '\\sqrt{b^{2} -4ac}');
  assert.equal(hwpToLatex('pi r^{2}'), '\\pi r^{2}');
});

test('a group around the whole formula is not shown in LaTeX', () => {
  assert.equal(hwpToLatex('{{a} over {b}}'), '\\frac{a}{b}');
  assert.equal(hwpToLatex('{a} + {b}'), '{a} + {b}');
});
