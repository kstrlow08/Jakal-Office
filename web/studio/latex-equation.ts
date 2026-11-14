// LaTeX <-> Hancom equation script.
// Users type LaTeX; the document keeps Hancom's own equation syntax so that
// 한글 (HWP/HWPX) opens and edits the equation unchanged.

type Token = { kind: 'cmd' | 'open' | 'close' | 'sup' | 'sub' | 'amp' | 'word' | 'num' | 'char' | 'space'; value: string };

const GREEK = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu', 'nu',
  'xi', 'omicron', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega',
  'varepsilon', 'vartheta', 'varphi', 'varpi', 'varrho', 'varsigma'];

/** LaTeX command -> Hancom keyword (or a Unicode glyph Hancom prints as is). */
const SYMBOLS: Record<string, string> = {
  pm: 'pm', mp: 'mp', times: 'times', div: 'div', cdot: 'cdot', ast: '*', star: 'star', circ: 'circ', bullet: 'bullet',
  oplus: 'oplus', ominus: 'ominus', otimes: 'otimes', odot: 'odot',
  neq: 'neq', ne: 'neq', leq: 'leq', le: 'leq', leqslant: 'leq', geq: 'geq', ge: 'geq', geqslant: 'geq', ll: '≪', gg: '≫',
  approx: 'approx', equiv: 'equiv', sim: 'sim', simeq: '≃', cong: 'cong', propto: 'propto',
  infty: 'inf', partial: 'partial', nabla: 'nabla', emptyset: 'emptyset', varnothing: 'emptyset',
  in: 'in', notin: 'notin', ni: 'owns', subset: 'subset', supset: 'superset', subseteq: 'subseteq', supseteq: 'supseteq',
  cup: 'union', cap: 'inter', setminus: '∖', forall: 'forall', exists: 'exist', neg: 'lnot', lnot: 'lnot',
  wedge: 'wedge', land: 'wedge', vee: 'vee', lor: 'vee', therefore: 'therefore', because: 'because',
  leftarrow: 'larrow', gets: 'larrow', longleftarrow: 'larrow', rightarrow: 'rarrow', to: 'rarrow', longrightarrow: 'rarrow',
  uparrow: 'uparrow', downarrow: 'downarrow', leftrightarrow: 'lrarrow', longleftrightarrow: 'lrarrow',
  Leftarrow: 'LARROW', Rightarrow: 'RARROW', implies: 'RARROW', Longrightarrow: 'RARROW', Leftrightarrow: 'LRARROW', iff: 'LRARROW',
  mapsto: 'mapsto', nearrow: 'nearrow', searrow: 'searrow', nwarrow: 'nwarrow', swarrow: 'swarrow',
  ell: 'ell', hbar: 'hbar', aleph: 'aleph', cdots: 'cdots', ldots: 'ldots', dots: 'ldots', vdots: 'vdots', ddots: 'ddots',
  triangle: 'triangle', angle: 'angle', bot: 'bot', perp: 'bot', dagger: 'dagger', ddagger: 'ddagger', prime: 'prime',
  parallel: '∥', mid: '|', nmid: '∤', square: '□', Box: '□', degree: 'deg', lbrace: 'lbrace', rbrace: 'rbrace',
  langle: '<', rangle: '>', lceil: 'lceil', rceil: 'rceil', lfloor: 'lfloor', rfloor: 'rfloor', backslash: '∖',
};
const FUNCTIONS = ['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh',
  'log', 'ln', 'exp', 'det', 'max', 'min', 'gcd', 'mod', 'lim'];
/** Operator names Hancom has no keyword for: printed upright as text. */
const TEXT_FUNCTIONS = ['coth', 'lg', 'lcm', 'arg', 'dim', 'ker', 'hom', 'Pr', 'sup', 'inf', 'deg', 'sgn', 'liminf', 'limsup', 'bmod', 'Re', 'Im'];
const BIG: Record<string, string> = { sum: 'sum', prod: 'prod', coprod: 'coprod', int: 'int', iint: 'dint', iiint: 'tint',
  oint: 'oint', bigcup: 'union', bigcap: 'inter' };
const ACCENTS: Record<string, string> = { hat: 'hat', widehat: 'hat', bar: 'bar', tilde: 'tilde', widetilde: 'tilde', vec: 'vec',
  overrightarrow: 'vec', dot: 'dot', ddot: 'ddot', acute: 'acute', grave: 'grave', check: 'check',
  overline: 'OVERLINE', underline: 'UNDERLINE' };
const FONTS: Record<string, string> = { mathrm: 'rm', mathit: 'it', mathbf: 'bold', boldsymbol: 'bold', bm: 'bold', operatorname: 'rm', mathsf: 'rm', mathtt: 'rm' };
const BLACKBOARD: Record<string, string> = { R: 'ℝ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', C: 'ℂ', P: 'ℙ', E: '𝔼' };
const ENVIRONMENTS: Record<string, string> = { matrix: 'matrix', smallmatrix: 'matrix', array: 'matrix', pmatrix: 'pmatrix', bmatrix: 'bmatrix',
  vmatrix: 'dmatrix', cases: 'cases', gathered: 'pile', gather: 'pile', 'gather*': 'pile', aligned: 'eqalign', align: 'eqalign',
  'align*': 'eqalign', split: 'eqalign', eqnarray: 'eqalign', 'eqnarray*': 'eqalign' };
const DELIMITERS: Record<string, string> = { '(': '(', ')': ')', '[': '[', ']': ']', '|': '|', '.': '.', '/': '/',
  '\\{': 'lbrace', '\\}': 'rbrace', '\\lbrace': 'lbrace', '\\rbrace': 'rbrace', '\\|': '||', '\\vert': '|', '\\lvert': '|', '\\rvert': '|',
  '\\Vert': '||', '\\lVert': '||', '\\rVert': '||', '\\langle': '<', '\\rangle': '>', '\\lceil': 'lceil', '\\rceil': 'rceil',
  '\\lfloor': 'lfloor', '\\rfloor': 'rfloor', '<': '<', '>': '>' };
const IGNORED = new Set(['displaystyle', 'textstyle', 'scriptstyle', 'limits', 'nolimits', 'big', 'Big', 'bigg', 'Bigg', 'bigl', 'bigr',
  'Bigl', 'Bigr', 'biggl', 'biggr', 'nonumber', 'notag', '!', 'left.', 'middle']);
const SKIP_ARGUMENT = new Set(['label', 'tag', 'color', 'hspace', 'vspace', 'phantom']);

/** Hancom words that would change meaning if a LaTeX letter run spelled them. */
const KEYWORDS = new Set([...GREEK, ...Object.values(SYMBOLS), ...FUNCTIONS, ...Object.values(BIG), ...Object.values(ACCENTS),
  ...Object.values(FONTS), ...Object.values(ENVIRONMENTS), 'over', 'atop', 'sqrt', 'root', 'of', 'sup', 'sub', 'from', 'to', 'left',
  'right', 'choose', 'binom', 'inf', 'deg', 'lim', 'under', 'box', 'pile', 'lpile', 'rpile', 'centigrade', 'not', 'it'].map(word => word.toLowerCase()));

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  for (let i = 0; i < source.length;) {
    const char = source[i];
    if (char === '%') { while (i < source.length && source[i] !== '\n') i++; continue; }
    if (/\s/.test(char)) { while (i < source.length && /\s/.test(source[i])) i++; tokens.push({ kind: 'space', value: ' ' }); continue; }
    if (char === '\\') {
      const name = /^[A-Za-z]+\*?/.exec(source.slice(i + 1))?.[0];
      if (name) { tokens.push({ kind: 'cmd', value: name.replace(/\*$/, '') }); i += 1 + name.length; continue; }
      tokens.push({ kind: 'cmd', value: source[i + 1] ?? '' }); i += 2; continue;
    }
    if (char === '{') { tokens.push({ kind: 'open', value: char }); i++; continue; }
    if (char === '}') { tokens.push({ kind: 'close', value: char }); i++; continue; }
    if (char === '^') { tokens.push({ kind: 'sup', value: char }); i++; continue; }
    if (char === '_') { tokens.push({ kind: 'sub', value: char }); i++; continue; }
    if (char === '&') { tokens.push({ kind: 'amp', value: char }); i++; continue; }
    const word = /^[A-Za-z]+/.exec(source.slice(i))?.[0];
    if (word) { tokens.push({ kind: 'word', value: word }); i += word.length; continue; }
    const number = /^\d+(?:\.\d+)?/.exec(source.slice(i))?.[0];
    if (number) { tokens.push({ kind: 'num', value: number }); i += number.length; continue; }
    const glyph = String.fromCodePoint(source.codePointAt(i)!);
    tokens.push({ kind: 'char', value: glyph }); i += glyph.length;
  }
  return tokens;
}

class LatexParser {
  private index = 0;
  private readonly tokens: Token[];
  readonly unsupported = new Set<string>();
  constructor(tokens: Token[]) { this.tokens = tokens; }

  private peek(skipSpace = true) {
    let at = this.index;
    while (skipSpace && this.tokens[at]?.kind === 'space') at++;
    return this.tokens[at];
  }
  next(skipSpace = true) {
    while (skipSpace && this.tokens[this.index]?.kind === 'space') this.index++;
    return this.tokens[this.index++];
  }
  private isCmd(token: Token | undefined, name: string) { return token?.kind === 'cmd' && token.value === name; }

  parse(stop: (token: Token) => boolean = () => false): string {
    const items: string[] = [];
    const attach = (script: string) => { if (items.length) items[items.length - 1] += script; else items.push(`{}${script}`); };
    for (let token = this.peek(); token && !stop(token); token = this.peek()) {
      if (token.kind === 'close') break;
      this.next();
      if (token.kind === 'sup' || token.kind === 'sub') {
        const argument = this.argument();
        if (token.kind === 'sup' && /^\{\s*circ\s*\}$/.test(argument)) items.push('deg');
        else if (token.kind === 'sup' && /^\{\s*(prime\s*)+\}$/.test(argument)) items.push(...argument.match(/prime/g)!);
        else attach(`${token.value}${argument}`);
      } else if (token.kind === 'amp') items.push('&');
      else if (token.kind === 'open') items.push(this.group());
      else if (token.kind === 'word') items.push(this.word(token.value));
      else if (token.kind === 'num') items.push(token.value);
      else if (token.kind === 'char') items.push(this.char(token.value));
      else if (token.kind === 'cmd') { const value = this.command(token.value); if (value) items.push(value); }
    }
    return items.join(' ');
  }

  private group() {
    const inner = this.parse();
    if (this.peek()?.kind === 'close') this.next();
    return `{${inner}}`;
  }

  /** One LaTeX argument. `\frac12` and `x^23` take a single digit or letter. */
  argument(): string {
    const token = this.peek();
    if (!token) return '{}';
    if (token.kind === 'open') { this.next(); return this.group(); }
    if ((token.kind === 'num' || token.kind === 'word') && token.value.length > 1) {
      this.next();
      this.tokens.splice(this.index, 0, { kind: token.kind, value: token.value.slice(1) });
      return `{${token.kind === 'word' ? this.word(token.value[0]) : token.value[0]}}`;
    }
    this.next();
    if (token.kind === 'word') return `{${this.word(token.value)}}`;
    if (token.kind === 'num') return `{${token.value}}`;
    if (token.kind === 'char') return `{${this.char(token.value)}}`;
    if (token.kind === 'cmd') return `{${this.command(token.value)}}`;
    return '{}';
  }

  /** Raw text of a braced argument, for \text{...}. */
  private rawArgument(): string {
    const token = this.peek();
    if (token?.kind !== 'open') return token ? (this.next(), token.value) : '';
    this.next(); let depth = 1, text = '';
    while (this.index < this.tokens.length) {
      const part = this.tokens[this.index++];
      if (part.kind === 'open') depth++;
      if (part.kind === 'close' && --depth === 0) break;
      text += part.kind === 'cmd' ? (part.value.length === 1 ? part.value : `\\${part.value}`) : part.value;
    }
    return text;
  }

  private word(word: string) {
    return KEYWORDS.has(word.toLowerCase()) ? [...word].join(' ') : word;
  }

  private char(char: string) {
    if (char === '\'') return 'prime';
    if (char === '"') return '';
    if (char === '#') return '"#"';
    return char;
  }

  private delimiter(): string {
    const token = this.next();
    if (!token) return '.';
    const key = token.kind === 'cmd' ? `\\${token.value}` : token.value;
    if (DELIMITERS[key]) return DELIMITERS[key];
    this.unsupported.add(key);
    return '.';
  }

  private environment(name: string) {
    const env = ENVIRONMENTS[name];
    if (name === 'array' && this.peek()?.kind === 'open') this.rawArgument();
    const body = this.parse(token => this.isCmd(token, 'end'));
    if (this.isCmd(this.peek(), 'end')) { this.next(); this.rawArgument(); }
    if (!env) { this.unsupported.add(`\\begin{${name}}`); return `{${body}}`; }
    return `${env}{${body}}`;
  }

  command(name: string): string {
    if (name === '\\') return '#';
    if (name === ',' || name === ':' || name === ';' || name === '>') return '`';
    if (name === ' ' || name === 'quad') return name === ' ' ? '~' : '~~';
    if (name === 'qquad') return '~~~~';
    if (name === '{') return 'lbrace';
    if (name === '}') return 'rbrace';
    if (name === '|') return '||';
    if (name === '%' || name === '$' || name === '_') return name === '_' ? '"_"' : name;
    if (name === '#' || name === '&') return `"${name}"`;
    if (IGNORED.has(name)) return '';
    if (SKIP_ARGUMENT.has(name)) { this.rawArgument(); return name === 'hspace' ? '~' : ''; }
    if (GREEK.includes(name)) return name;
    if (SYMBOLS[name]) return SYMBOLS[name];
    if (FUNCTIONS.includes(name)) return name;
    if (TEXT_FUNCTIONS.includes(name)) return `"${name === 'liminf' ? 'lim inf' : name === 'limsup' ? 'lim sup' : name === 'bmod' ? 'mod' : name}"`;
    if (BIG[name]) return BIG[name];
    if (name === 'frac' || name === 'dfrac' || name === 'tfrac' || name === 'cfrac') {
      const top = this.argument(), bottom = this.argument();
      return `{${top} over ${bottom}}`;
    }
    if (name === 'binom' || name === 'dbinom' || name === 'tbinom') { const top = this.argument(), bottom = this.argument(); return `{${top} CHOOSE ${bottom}}`; }
    if (name === 'sqrt') {
      if (this.peek()?.kind === 'char' && this.peek()!.value === '[') {
        this.next(); const degree = this.parse(token => token.kind === 'char' && token.value === ']');
        if (this.peek()?.value === ']') this.next();
        return `root {${degree}} of ${this.argument()}`;
      }
      return `sqrt ${this.argument()}`;
    }
    if (ACCENTS[name]) return `${ACCENTS[name]} ${this.argument()}`;
    if (FONTS[name]) return `{${FONTS[name]} ${this.argument()}}`;
    if (name === 'mathbb') { const letter = this.rawArgument().trim(); return BLACKBOARD[letter] ?? letter; }
    if (name === 'mathcal' || name === 'mathscr' || name === 'mathfrak') return this.argument();
    if (name === 'text' || name === 'textrm' || name === 'textnormal' || name === 'mbox') {
      const text = this.rawArgument().replaceAll('"', '');
      return text ? `"${text}"` : '';
    }
    if (name === 'textbf' || name === 'textit') { const text = this.rawArgument().replaceAll('"', ''); return text ? `{${name === 'textbf' ? 'bold' : 'it'} "${text}"}` : ''; }
    if (name === 'textcolor') { this.rawArgument(); return this.argument(); }
    if (name === 'boxed' || name === 'underbrace' || name === 'overbrace') return this.argument();
    if (name === 'overset' || name === 'stackrel') { const top = this.argument(); return `${this.argument()}^${top}`; }
    if (name === 'underset') { const bottom = this.argument(); return `${this.argument()}_${bottom}`; }
    if (name === 'not') {
      const next = this.peek();
      if (next?.kind === 'char' && next.value === '=') { this.next(); return 'neq'; }
      if (this.isCmd(next, 'in')) { this.next(); return 'notin'; }
      return '';
    }
    if (name === 'left') { const open = this.delimiter(); const inner = this.parse(token => this.isCmd(token, 'right')); let close = '.';
      if (this.isCmd(this.peek(), 'right')) { this.next(); close = this.delimiter(); }
      return `LEFT ${open} ${inner} RIGHT ${close}`; }
    if (name === 'right') { this.delimiter(); return ''; }
    if (name === 'begin') return this.environment(this.rawArgument().trim());
    if (name === 'end') { this.rawArgument(); return ''; }
    this.unsupported.add(`\\${name}`);
    return `"${name}"`;
  }
}

/** Drops `$…$`, `$$…$$`, `\(…\)` and `\[…\]` around pasted LaTeX. */
export function stripMathDelimiters(text: string) {
  const trimmed = text.trim();
  for (const [open, close] of [['$$', '$$'], ['\\[', '\\]'], ['\\(', '\\)'], ['$', '$']]) {
    if (trimmed.length > open.length + close.length && trimmed.startsWith(open) && trimmed.endsWith(close)) {
      return trimmed.slice(open.length, -close.length).trim();
    }
  }
  return trimmed;
}

export type LatexConversion = { script: string; unsupported: string[] };

/** LaTeX -> Hancom equation script. Unknown commands are kept as upright text and reported. */
export function latexToHwp(latex: string): LatexConversion {
  const source = stripMathDelimiters(latex);
  const parser = new LatexParser(tokenize(source));
  let script = '';
  // Unbalanced closing braces would end the parse early; keep converting after them.
  for (let guard = 0; guard < 1000; guard++) {
    script += (script ? ' ' : '') + parser.parse();
    if (!parser.next()) break;
  }
  return { script: script.replace(/\s+/g, ' ').trim(), unsupported: [...parser.unsupported] };
}

// ── Hancom script -> LaTeX ─────────────────────────────────────────────────

type HwpToken = { kind: 'word' | 'num' | 'open' | 'close' | 'sup' | 'sub' | 'amp' | 'row' | 'space' | 'thin' | 'text' | 'op' | 'char'; value: string; spaced?: boolean };
type Unit = { text: string; spaced: boolean };
const HWP_OPERATORS = ['<=>', '<->', '<=', '>=', '!=', '->', '<-', '=>', '+-', '-+', '<<', '>>', '=='];

function tokenizeHwp(script: string): HwpToken[] {
  const tokens: HwpToken[] = [];
  let spaced = false;
  const push = (token: HwpToken) => { tokens.push({ ...token, spaced }); spaced = false; };
  for (let i = 0; i < script.length;) {
    const char = script[i];
    if (/\s/.test(char)) { spaced = true; i++; continue; }
    if (char === '"') { const end = script.indexOf('"', i + 1); const stop = end < 0 ? script.length : end; push({ kind: 'text', value: script.slice(i + 1, stop) }); i = stop + 1; continue; }
    const simple: Record<string, HwpToken['kind']> = { '{': 'open', '}': 'close', '^': 'sup', '_': 'sub', '&': 'amp', '#': 'row', '~': 'space', '`': 'thin' };
    if (simple[char]) { push({ kind: simple[char], value: char }); i++; continue; }
    const operator = HWP_OPERATORS.find(op => script.startsWith(op, i));
    if (operator) { push({ kind: 'op', value: operator }); i += operator.length; continue; }
    const word = /^[A-Za-z]+/.exec(script.slice(i))?.[0];
    if (word) { push({ kind: 'word', value: word }); i += word.length; continue; }
    const number = /^\d+(?:\.\d+)?/.exec(script.slice(i))?.[0];
    if (number) { push({ kind: 'num', value: number }); i += number.length; continue; }
    const glyph = String.fromCodePoint(script.codePointAt(i)!);
    push({ kind: 'char', value: glyph }); i += glyph.length;
  }
  return tokens;
}

/** Joins LaTeX units, keeping the author's spacing and separating command names from letters. */
function joinUnits(units: Unit[]) {
  let text = '';
  for (const unit of units) {
    if (!unit.text) continue;
    const needsSpace = /\\[A-Za-z]+$/.test(text) && /^[A-Za-z0-9]/.test(unit.text);
    text += text && (unit.spaced || needsSpace) ? ` ${unit.text}` : unit.text;
  }
  return text;
}

/** True when the outer braces of `text` enclose all of it. */
function wrapped(text: string) {
  if (!text.startsWith('{') || !text.endsWith('}')) return false;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\') { i++; continue; }
    if (text[i] === '{') depth++;
    if (text[i] === '}' && --depth === 0 && i < text.length - 1) return false;
  }
  return depth === 0;
}

const LATEX_OF_HWP: Record<string, string> = {};
for (const [latex, hwp] of Object.entries(SYMBOLS)) if (!(hwp in LATEX_OF_HWP) && /^[A-Za-z]+$/.test(hwp)) LATEX_OF_HWP[hwp] = `\\${latex}`;
Object.assign(LATEX_OF_HWP, { inf: '\\infty', neq: '\\neq', leq: '\\leq', geq: '\\geq', larrow: '\\leftarrow', rarrow: '\\rightarrow',
  union: '\\cup', inter: '\\cap', bot: '\\perp', exist: '\\exists', lnot: '\\neg', superset: '\\supset', owns: '\\ni', ldots: '\\ldots',
  emptyset: '\\emptyset', lbrace: '\\{', rbrace: '\\}', smallsum: '\\sum', dint: '\\iint', tint: '\\iiint', CENTIGRADE: '{}^{\\circ}\\mathrm{C}' });
/** Upper-case Greek letters that look like Latin capitals; LaTeX has no command for them. */
const LATIN_CAPITALS: Record<string, string> = { ALPHA: 'A', BETA: 'B', EPSILON: 'E', ZETA: 'Z', ETA: 'H', IOTA: 'I', KAPPA: 'K',
  MU: 'M', NU: 'N', OMICRON: 'O', RHO: 'P', TAU: 'T', CHI: 'X' };
const LATEX_BIG: Record<string, string> = { sum: '\\sum', prod: '\\prod', coprod: '\\coprod', int: '\\int', dint: '\\iint', tint: '\\iiint',
  oint: '\\oint', lim: '\\lim', Lim: '\\lim' };
const LATEX_ENV: Record<string, string> = { matrix: 'matrix', pmatrix: 'pmatrix', bmatrix: 'bmatrix', dmatrix: 'vmatrix', cases: 'cases',
  pile: 'gathered', lpile: 'gathered', rpile: 'gathered', eqalign: 'aligned' };
const LATEX_ACCENT: Record<string, string> = { hat: 'hat', bar: 'bar', tilde: 'tilde', vec: 'vec', dot: 'dot', ddot: 'ddot', acute: 'acute',
  grave: 'grave', check: 'check', overline: 'overline', underline: 'underline', under: 'underline' };
const LATEX_DELIMITER: Record<string, string> = { '(': '(', ')': ')', '[': '[', ']': ']', '|': '|', '||': '\\|', '.': '.', '/': '/',
  lbrace: '\\{', rbrace: '\\}', '<': '\\langle', '>': '\\rangle', lceil: '\\lceil', rceil: '\\rceil', lfloor: '\\lfloor', rfloor: '\\rfloor',
  langle: '\\langle', rangle: '\\rangle' };
const LATEX_OPERATOR: Record<string, string> = { '<=': '\\leq', '>=': '\\geq', '!=': '\\neq', '->': '\\to', '<-': '\\gets', '<->': '\\leftrightarrow',
  '=>': '\\Rightarrow', '<=>': '\\Leftrightarrow', '+-': '\\pm', '-+': '\\mp', '<<': '\\ll', '>>': '\\gg', '==': '\\equiv' };

class HwpParser {
  private index = 0;
  private readonly tokens: HwpToken[];
  constructor(tokens: HwpToken[]) { this.tokens = tokens; }
  private peek() { return this.tokens[this.index]; }
  next() { return this.tokens[this.index++]; }
  private word(token: HwpToken | undefined, ...names: string[]) { return token?.kind === 'word' && names.includes(token.value.toLowerCase()); }

  sequence(stop: (token: HwpToken) => boolean = () => false): Unit[] {
    const units: Unit[] = [];
    const attach = (script: string) => { if (units.length) units[units.length - 1].text += script; else units.push({ text: `{}${script}`, spaced: false }); };
    for (let token = this.peek(); token && token.kind !== 'close' && !stop(token); token = this.peek()) {
      if (token.kind === 'sup' || token.kind === 'sub' || this.word(token, 'sup', 'sub')) {
        this.next(); const sup = token.kind === 'sup' || token.value.toLowerCase() === 'sup';
        attach(`${sup ? '^' : '_'}{${this.bare(this.unit().text)}}`); continue;
      }
      if (this.word(token, 'over', 'atop')) {
        this.next(); const top = units.pop() ?? { text: '{}', spaced: token.spaced ?? false }; const bottom = this.unit().text;
        units.push({ spaced: top.spaced, text: token.value.toLowerCase() === 'over'
          ? `\\frac{${this.bare(top.text)}}{${this.bare(bottom)}}` : `{${this.bare(top.text)} \\atop ${this.bare(bottom)}}` }); continue;
      }
      if (this.word(token, 'choose', 'binom')) {
        this.next(); const top = units.pop() ?? { text: '{}', spaced: false };
        units.push({ spaced: top.spaced, text: `\\binom{${this.bare(top.text)}}{${this.bare(this.unit().text)}}` }); continue;
      }
      if (this.word(token, 'deg')) { this.next(); attach('^{\\circ}'); continue; }
      if (this.word(token, 'prime')) { this.next(); attach('\''); continue; }
      units.push(this.unit());
    }
    return units;
  }

  private bare(text: string) { return wrapped(text) ? text.slice(1, -1) : text; }

  private delimiter(): string {
    const token = this.next();
    if (!token) return '.';
    const key = token.kind === 'word' ? token.value.toLowerCase() : token.value;
    if (token.kind === 'char' && token.value === '|' && this.peek()?.kind === 'char' && this.peek().value === '|') { this.next(); return '\\|'; }
    return LATEX_DELIMITER[key] ?? '.';
  }

  unit(): Unit {
    const token = this.next();
    if (!token) return { text: '{}', spaced: false };
    return { text: this.unitText(token), spaced: token.spaced ?? false };
  }

  private unitText(token: HwpToken): string {
    if (token.kind === 'open') { const inner = this.sequence(); if (this.peek()?.kind === 'close') this.next(); return `{${joinUnits(inner)}}`; }
    if (token.kind === 'num') return token.value;
    if (token.kind === 'text') return token.value ? `\\text{${token.value}}` : '';
    if (token.kind === 'space') return '\\ ';
    if (token.kind === 'thin') return '\\,';
    if (token.kind === 'row') return '\\\\';
    if (token.kind === 'amp') return '&';
    if (token.kind === 'op') return LATEX_OPERATOR[token.value] ?? token.value;
    if (token.kind === 'char') return ({ '%': '\\%', '$': '\\$', '\\': '\\backslash' } as Record<string, string>)[token.value] ?? token.value;
    if (token.kind !== 'word') return '';
    const word = token.value, lower = word.toLowerCase();
    if (lower === 'sqrt') return `\\sqrt{${this.bare(this.unit().text)}}`;
    if (lower === 'root') { const degree = this.unit().text; if (this.word(this.peek(), 'of')) this.next(); return `\\sqrt[${this.bare(degree)}]{${this.bare(this.unit().text)}}`; }
    if (LATEX_BIG[word] || LATEX_BIG[lower]) {
      let result = LATEX_BIG[word] ?? LATEX_BIG[lower];
      for (let part = this.peek(); part && (part.kind === 'sup' || part.kind === 'sub' || this.word(part, 'from', 'to', 'sup', 'sub')); part = this.peek()) {
        this.next(); const upper = part.kind === 'sup' || ['to', 'sup'].includes(part.value.toLowerCase());
        result += `${upper ? '^' : '_'}{${this.bare(this.unit().text)}}`;
      }
      return result;
    }
    if (lower === 'left') {
      const open = this.delimiter(); const inner = this.sequence(part => this.word(part, 'right'));
      let close = '.'; if (this.word(this.peek(), 'right')) { this.next(); close = this.delimiter(); }
      return `\\left${open} ${joinUnits(inner)} \\right${close}`;
    }
    if (LATEX_ENV[lower]) {
      if (this.peek()?.kind !== 'open') return `\\text{${word}}`;
      this.next(); const inner = this.sequence(); if (this.peek()?.kind === 'close') this.next();
      return `\\begin{${LATEX_ENV[lower]}} ${joinUnits(inner)} \\end{${LATEX_ENV[lower]}}`;
    }
    if (LATEX_ACCENT[lower]) return `\\${LATEX_ACCENT[lower]}{${this.bare(this.unit().text)}}`;
    if (lower === 'rm' || lower === 'it' || lower === 'bold') {
      const font = lower === 'rm' ? 'mathrm' : lower === 'it' ? 'mathit' : 'mathbf';
      return `\\${font}{${this.bare(this.unit().text)}}`;
    }
    if (GREEK.includes(word)) return `\\${word}`;
    const upperGreek = GREEK.find(name => name.toUpperCase() === word && name[0] === name[0].toUpperCase());
    if (upperGreek) return `\\${upperGreek}`;
    if (LATIN_CAPITALS[word]) return `\\mathrm{${LATIN_CAPITALS[word]}}`;
    if (FUNCTIONS.includes(lower)) return `\\${lower}`;
    if (LATEX_OF_HWP[word]) return LATEX_OF_HWP[word];
    if (LATEX_OF_HWP[lower] && !/arrow$/.test(lower)) return LATEX_OF_HWP[lower];
    return word;
  }
}

/** Hancom digraphs that mean the same symbols as keywords (`<=` is ≤). */
export function normalizeHwpScript(script: string) {
  return script.replace(/<=>/g, ' LRARROW ').replace(/<->/g, ' lrarrow ').replace(/<=/g, ' leq ').replace(/>=/g, ' geq ').replace(/!=/g, ' neq ')
    .replace(/=>/g, ' RARROW ').replace(/\+-/g, ' pm ').replace(/-\+/g, ' mp ');
}

/** Hancom equation script -> LaTeX. Pair with a rendering check before trusting a round trip. */
export function hwpToLatex(script: string): string {
  const parser = new HwpParser(tokenizeHwp(script));
  const units: Unit[] = [];
  for (let guard = 0; guard < 1000; guard++) {
    units.push(...parser.sequence());
    if (!parser.next()) break;
  }
  return unwrapGroup(joinUnits(units).replace(/\s+/g, ' ').trim());
}

/** `{\frac{a}{b}}` -> `\frac{a}{b}`: a group spanning the whole formula only adds noise. */
function unwrapGroup(latex: string): string {
  while (latex.startsWith('{') && latex.endsWith('}') && !latex.endsWith('\\}')) {
    let depth = 0;
    let closesAtEnd = false;
    for (let i = 0; i < latex.length; i++) {
      const ch = latex[i];
      if (ch === '\\') { i++; continue; }
      if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) { closesAtEnd = i === latex.length - 1; break; }
    }
    if (!closesAtEnd) break;
    latex = latex.slice(1, -1).trim();
  }
  return latex;
}
