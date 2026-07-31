#!/usr/bin/env node
/*
 * check-undeclared.js — report calls to names the file never declares.
 *
 * Three bugs have had exactly this shape, each a reference left behind when a block of
 * code was removed and something added later happened to sit inside the range:
 *
 *   orbiting     a leftover from the hand-rolled orbit controls
 *   WEB_TOOL     defined by a patch that aborted; the callers shipped
 *   paintFinal   swallowed when the Visuals overlay was deleted
 *
 * Neither existing check finds these. The parser cannot, because the syntax is valid.
 * A stubbed-DOM harness cannot, unless that particular line happens to run.
 *
 *   node tools/check-undeclared.js index.html
 */
const fs = require('fs');
const file = process.argv[2] || 'index.html';
const src = fs.readFileSync(file, 'utf8');
const m = src.match(/<script type="module">([\s\S]*)<\/script>\s*$/);
if (!m) { console.error('no module script found in ' + file); process.exit(2); }
const code = m[1];

/* A scanner, not regexes. Stripping comments and strings with regexes fails on a file
   this size: one apparent block-comment opener inside a string or a regex literal
   swallows everything after it, and the checker then reports nothing at all — which is
   worse than useless, because it reports success. This walks character by character. */
function blank(s) {
  const out = new Array(s.length);
  let i = 0, prev = '';
  const regexPos = () => prev === '' || /[({[,;:=!&|?+\-*%~^<>]$/.test(prev) ||
    /\b(return|typeof|instanceof|in|of|new|delete|void|case|do|else|yield|await)$/.test(prev);
  while (i < s.length) {
    const c = s[i], n = s[i + 1];
    if (c === '/' && n === '/') { while (i < s.length && s[i] !== '\n') out[i++] = ' '; continue; }
    if (c === '/' && n === '*') {
      out[i++] = ' '; out[i++] = ' ';
      while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) { out[i] = s[i] === '\n' ? '\n' : ' '; i++; }
      if (i < s.length) { out[i++] = ' '; out[i++] = ' '; }
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; out[i++] = ' ';
      while (i < s.length) {
        if (s[i] === '\\') { out[i++] = ' '; if (i < s.length) out[i++] = ' '; continue; }
        if (s[i] === q) { out[i++] = ' '; break; }
        out[i] = s[i] === '\n' ? '\n' : ' '; i++;
      }
      prev = 'x'; continue;
    }
    if (c === '/' && regexPos()) {
      out[i++] = ' '; let inClass = false;
      while (i < s.length) {
        if (s[i] === '\\') { out[i++] = ' '; if (i < s.length) out[i++] = ' '; continue; }
        if (s[i] === '[') inClass = true;
        else if (s[i] === ']') inClass = false;
        else if (s[i] === '/' && !inClass) { out[i++] = ' '; break; }
        else if (s[i] === '\n') break;
        out[i++] = ' ';
      }
      while (i < s.length && /[gimsuyd]/.test(s[i])) out[i++] = ' ';
      prev = 'x'; continue;
    }
    out[i] = c;
    if (!/\s/.test(c)) prev = (prev + c).slice(-12);
    i++;
  }
  return out.join('');
}
const clean = blank(code);

/* Declarations read from the cleaned source, so a name inside a comment cannot count as
   one — that would hide the very bug this looks for. */
const declared = new Set();
const add = n => { if (n && /^[A-Za-z_$][\w$]*$/.test(n)) declared.add(n); };
for (const x of clean.matchAll(/\bfunction\s*\*?\s*([A-Za-z_$][\w$]*)/g)) add(x[1]);
for (const x of clean.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)/g)) add(x[1]);
for (const x of clean.matchAll(/\b(?:const|let|var)\s+([^;=\n]+)/g))
  x[1].split(',').forEach(p => add(p.replace(/[[\]{}]/g, ' ').split(':').pop().trim().split(/[\s=(]/)[0]));
for (const x of clean.matchAll(/([A-Za-z_$][\w$]*)\s*=>/g)) add(x[1]);
for (const x of clean.matchAll(/\(([^()]{0,300})\)\s*=>/g))
  x[1].split(',').forEach(p => add(p.trim().split(/[=\s]/)[0]));
for (const x of clean.matchAll(/function[^(]{0,60}\(([^()]{0,300})\)/g))
  x[1].split(',').forEach(p => add(p.trim().split(/[=\s]/)[0]));
for (const x of clean.matchAll(/catch\s*\(\s*([A-Za-z_$][\w$]*)/g)) add(x[1]);
/* Object-literal and class method shorthand — `get(){}`, `paint(a,b){}` — is a
   declaration, not a call. No valid call is followed by a brace, so this is safe: it
   cannot hide a genuinely missing function, because `missing(x) {` is not valid JS. */
for (const x of clean.matchAll(/([A-Za-z_$][\w$]*)\s*\([^()]{0,200}\)\s*\{/g)) add(x[1]);
for (const x of clean.matchAll(/\bimport\s*\{([^}]*)\}/g))
  x[1].split(',').forEach(p => add(p.trim().split(/\s+as\s+/).pop()));
for (const x of clean.matchAll(/\bimport\s+\*\s+as\s+([A-Za-z_$][\w$]*)/g)) add(x[1]);

const BUILTIN = new Set((`
  THREE OrbitControls TransformControls GLTFLoader GLTFExporter SkeletonUtils
  document window console navigator location history globalThis
  Math JSON Object Array String Number Boolean Set Map WeakMap WeakSet Promise Date
  Error TypeError RangeError RegExp Symbol Function Proxy Reflect BigInt Intl
  setTimeout setInterval clearTimeout clearInterval queueMicrotask
  requestAnimationFrame cancelAnimationFrame addEventListener removeEventListener
  fetch atob btoa parseInt parseFloat isFinite isNaN structuredClone eval
  encodeURIComponent decodeURIComponent encodeURI decodeURI
  Uint8Array Uint16Array Uint32Array Int8Array Int16Array Int32Array
  Float32Array Float64Array ArrayBuffer DataView
  Blob File FileReader URL FormData Headers Request Response AbortController
  Image Audio Worker MediaRecorder VideoEncoder VideoFrame AudioContext OffscreenCanvas
  ResizeObserver MutationObserver IntersectionObserver
  indexedDB localStorage sessionStorage performance devicePixelRatio
  alert confirm prompt
  if for while do switch catch finally return throw typeof instanceof new delete void
  yield await async function class extends super this arguments import export default
`).trim().split(/\s+/));

const problems = [];
const rawLines = code.split('\n');
clean.split('\n').forEach((line, i) => {
  for (const x of line.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
    const name = x[2];
    if (BUILTIN.has(name) || declared.has(name)) continue;
    if (problems.some(p => p.name === name)) continue;
    problems.push({ name, line: i + 1, text: (rawLines[i] || '').trim().slice(0, 90) });
  }
});
console.log(file + ' — ' + declared.size + ' names declared, ' + rawLines.length + ' lines scanned');
if (!problems.length) { console.log('no calls to undeclared names'); process.exit(0); }
console.log('\nCALLS TO UNDECLARED NAMES\n');
problems.forEach(p => { console.log('  L' + p.line + '  ' + p.name + '()'); console.log('     ' + p.text); });
console.log('\n' + problems.length + ' problem' + (problems.length > 1 ? 's' : ''));
process.exit(1);
