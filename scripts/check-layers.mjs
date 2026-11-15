// The import graph of src/, by directory: what imports what, and where the
// cycles are.
//
//   node scripts/check-layers.mjs            print the report
//   node scripts/check-layers.mjs --check    also fail (exit 1) on any edge
//                                            docs/refactor/layers.json forbids
//
// This is the measurable half of the restructure in docs/refactor/. A step
// that claims to untangle something has to move these numbers, and a step that
// claims to only move code must not add an edge. The report is plain text so
// two runs can be compared with `diff`.
//
// Imports are found by pattern, not by the compiler: `from '…'`, `import('…')`
// and side-effect `import '…'`, relative paths only (packages are not part of
// the layering). Type-only imports count — a type import is still a
// dependency a reader has to follow, and it is how the one file-level cycle in
// the tree exists. They are reported separately so the difference is visible.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const ROOT = resolve(process.cwd(), 'src');
const RULES = resolve(process.cwd(), 'docs/refactor/layers.json');

/** Directories split one level deeper, because their halves are separate layers. */
const SPLIT = new Set(['platform', 'translation', 'ui']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(path);
  }
  return out;
}

/**
 * `src/ui/reader/BlockList.tsx` → `ui/reader`; `src/App.tsx` → `(root)`.
 * `src/types.ts` is its own unit: everything imports it, so folding it into
 * `(root)` with App.tsx would put every directory in one cycle through App.
 */
function unitOf(file) {
  const parts = relative(ROOT, file).split(sep);
  if (parts.length === 1) return parts[0] === 'types.ts' ? 'types' : '(root)';
  if (SPLIT.has(parts[0]) && parts.length > 2) return `${parts[0]}/${parts[1]}`;
  return parts[0];
}

function resolveImport(from, spec) {
  const base = resolve(dirname(from), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const IMPORT = /(?:^|\n)\s*(import|export)\s+(type\s+)?(?:[^'"]*?\sfrom\s+)?['"](\.{1,2}\/[^'"]+)['"]|import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;

const files = walk(ROOT);
/** file → [{ to, typeOnly }] */
const fileEdges = new Map();
const unresolved = [];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const edges = [];
  for (const match of text.matchAll(IMPORT)) {
    const spec = match[3] ?? match[4];
    const typeOnly = Boolean(match[2]);
    const to = resolveImport(file, spec);
    if (!to) {
      unresolved.push(`${relative(ROOT, file)} → ${spec}`);
      continue;
    }
    // Stylesheets and declaration files are not modules in the layering.
    if (!to.startsWith(ROOT) || !/\.(ts|tsx)$/.test(to) || to.endsWith('.d.ts')) continue;
    edges.push({ to, typeOnly });
  }
  fileEdges.set(file, edges);
}

// Directory edges, counting files.
/** "a → b" → { value: n, type: n } */
const unitEdges = new Map();
for (const [file, edges] of fileEdges) {
  const from = unitOf(file);
  for (const { to, typeOnly } of edges) {
    const target = unitOf(to);
    if (target === from) continue;
    const key = `${from} → ${target}`;
    const entry = unitEdges.get(key) ?? { value: 0, type: 0, files: new Set() };
    if (typeOnly) entry.type += 1;
    else entry.value += 1;
    entry.files.add(`${relative(ROOT, file)} → ${relative(ROOT, to)}`);
    unitEdges.set(key, entry);
  }
}

const units = [...new Set(files.map(unitOf))].sort();
const adjacency = new Map(units.map((unit) => [unit, new Set()]));
for (const key of unitEdges.keys()) {
  const [from, to] = key.split(' → ');
  adjacency.get(from).add(to);
}

// Tarjan's strongly connected components.
function components(nodes, next) {
  let index = 0;
  const stack = [];
  const meta = new Map();
  const found = [];
  const visit = (node) => {
    meta.set(node, { index, low: index, onStack: true });
    index += 1;
    stack.push(node);
    for (const to of next(node)) {
      if (!meta.has(to)) {
        visit(to);
        meta.get(node).low = Math.min(meta.get(node).low, meta.get(to).low);
      } else if (meta.get(to).onStack) {
        meta.get(node).low = Math.min(meta.get(node).low, meta.get(to).index);
      }
    }
    if (meta.get(node).low === meta.get(node).index) {
      const component = [];
      let member;
      do {
        member = stack.pop();
        meta.get(member).onStack = false;
        component.push(member);
      } while (member !== node);
      if (component.length > 1) found.push(component.sort());
    }
  };
  for (const node of nodes) if (!meta.has(node)) visit(node);
  return found.sort((a, b) => b.length - a.length);
}

const unitCycles = components(units, (unit) => adjacency.get(unit));
const fileCycles = components(files, (file) => fileEdges.get(file).map((edge) => edge.to)).map((component) =>
  component.map((file) => relative(ROOT, file)),
);

const mutual = [];
for (const key of unitEdges.keys()) {
  const [from, to] = key.split(' → ');
  if (from < to && unitEdges.has(`${to} → ${from}`)) mutual.push(`${from} ↔ ${to}`);
}

// ---------------------------------------------------------------------------
// Report

const lines = [];
lines.push(`files: ${files.length}`);
lines.push(`directory edges: ${unitEdges.size}`);
lines.push(`directories in a cycle: ${unitCycles.reduce((sum, c) => sum + c.length, 0)} (in ${unitCycles.length} component${unitCycles.length === 1 ? '' : 's'})`);
lines.push(`directory pairs importing each other: ${mutual.length}`);
lines.push(`file-level cycles: ${fileCycles.length}`);
lines.push('');
lines.push('== imports, by directory (value imports + type-only imports, in files) ==');
for (const unit of units) {
  const targets = [...adjacency.get(unit)].sort();
  if (targets.length === 0) {
    lines.push(`${unit}: (nothing)`);
    continue;
  }
  const parts = targets.map((to) => {
    const { value, type } = unitEdges.get(`${unit} → ${to}`);
    return type ? `${to} ${value}+${type}t` : `${to} ${value}`;
  });
  lines.push(`${unit}: ${parts.join(', ')}`);
}
lines.push('');
lines.push('== directory cycles (strongly connected components) ==');
if (unitCycles.length === 0) lines.push('none');
for (const component of unitCycles) lines.push(`{${component.join(', ')}}`);
lines.push('');
lines.push('== directory pairs importing each other ==');
if (mutual.length === 0) lines.push('none');
for (const pair of mutual.sort()) {
  const [a, b] = pair.split(' ↔ ');
  lines.push(pair);
  for (const edge of [...unitEdges.get(`${a} → ${b}`).files, ...unitEdges.get(`${b} → ${a}`).files].sort()) {
    lines.push(`    ${edge}`);
  }
}
lines.push('');
lines.push('== file-level cycles ==');
if (fileCycles.length === 0) lines.push('none');
for (const component of fileCycles) lines.push(`{${component.join(', ')}}`);
if (unresolved.length > 0) {
  lines.push('');
  lines.push('== imports that did not resolve to a file ==');
  for (const entry of unresolved.sort()) lines.push(entry);
}

// ---------------------------------------------------------------------------
// Rules: edges that must not exist. Off until docs/refactor/layers.json lists
// some — the restructure adds a rule in the same step that makes it true.

let violations = [];
if (existsSync(RULES)) {
  const { forbidden = [] } = JSON.parse(readFileSync(RULES, 'utf8'));
  for (const rule of forbidden) {
    const from = new RegExp(`^(?:${rule.from})$`);
    const to = new RegExp(`^(?:${rule.to})$`);
    for (const [key, entry] of unitEdges) {
      const [a, b] = key.split(' → ');
      if (!from.test(a) || !to.test(b)) continue;
      if (rule.typesAllowed && entry.value === 0) continue;
      for (const edge of entry.files) violations.push(`${rule.why ?? `${rule.from} must not import ${rule.to}`}: ${edge}`);
    }
  }
  lines.push('');
  lines.push(`== rules (${forbidden.length} in docs/refactor/layers.json) ==`);
  lines.push(violations.length === 0 ? 'all hold' : violations.join('\n'));
}

console.log(lines.join('\n'));

if (process.argv.includes('--check') && violations.length > 0) {
  console.error(`\n${violations.length} forbidden import${violations.length === 1 ? '' : 's'}.`);
  process.exit(1);
}
