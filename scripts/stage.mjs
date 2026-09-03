// Build the current working tree and publish it to the staging URL.
//
// ---------------------------------------------------------------------------
// One command, because the interesting part is the environment
//
// A staging build is not `npm run build`. Three things differ from the Pages
// build, and getting any of them wrong produces a site that loads and then
// fails in a way that looks like a code bug:
//
//   BASE_PATH        Pages serves from /Torjuman/, this host serves from /.
//                    Wrong, and index.html loads and 404s on its own JS.
//   VITE_PROXY_URL   Actions injects this from a repository variable, which
//                    does not exist on your machine. Unset is a supported
//                    state, and it means importing is switched off — which
//                    would look exactly like the bug you were staging to test.
//   VITE_CATALOG_URL Derived from GITHUB_REPOSITORY in CI, absent here, and
//                    absent means no refreshable catalog.
//
// So they live here rather than in a shell command you retype from memory.
//
// There is also a trap that makes the shell version actively wrong on this
// machine. Git Bash rewrites a bare "/" in an argument or an inline env
// assignment into the MSYS root, so
//
//     BASE_PATH=/ npm run build          # in Git Bash
//
// builds with base "C:/Program Files/Git/", and every asset href in the output
// carries it. Passing the value through an env object, as below, goes nowhere
// near a POSIX shell and is not rewritten.
// ---------------------------------------------------------------------------

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const PROXY = 'https://hashiya-proxy.khacha.workers.dev';
const CATALOG =
  'https://raw.githubusercontent.com/khacha329/Torjuman/main/public/catalog.json';
const URL_OUT = 'https://hashiya-staging.khacha.workers.dev';

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

// wrangler is installed globally, and %APPDATA%\npm is not always on PATH —
// which is the failure that cost an evening the first time. Try PATH, then the
// place npm actually put it, and say so rather than emitting "not recognized".
function wranglerCommand() {
  const probe = spawnSync('wrangler', ['--version'], { shell: true, stdio: 'ignore' });
  if (probe.status === 0) return 'wrangler';

  const appdata = process.env.APPDATA;
  const fallback = appdata ? join(appdata, 'npm', 'wrangler.cmd') : null;
  if (fallback && existsSync(fallback)) return fallback;

  console.error(
    'wrangler was not found on PATH or in %APPDATA%\npm.\n' +
      'Install it with:  npm install --global wrangler\n' +
      'then:             wrangler login',
  );
  process.exit(1);
}

const sha = git('rev-parse', 'HEAD');
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
const dirty = git('status', '--porcelain') !== '';

console.log(`Staging ${branch} at ${sha.slice(0, 7)}${dirty ? ' (uncommitted changes)' : ''}`);
if (dirty) {
  // Not an error. Staging an unpushed working tree is the whole point — but
  // the version this build reports is the commit, so the version will not
  // account for whatever is uncommitted. Better said out loud than discovered
  // while comparing two builds that claim the same version.
  console.log('  note: the version shown in Settings is the commit, not your edits.');
}

const env = {
  ...process.env,
  BASE_PATH: '/',
  VITE_PROXY_URL: PROXY,
  VITE_CATALOG_URL: CATALOG,
  // resolveVersion() reads this, so Settings reads "0.1.0+<sha>" rather than
  // "0.1.0-local" — which would be indistinguishable from a dev build.
  GITHUB_SHA: sha,
};

const build = spawnSync('npm', ['run', 'build'], {
  cwd: ROOT,
  env,
  stdio: 'inherit',
  shell: true,
});
if (build.status !== 0) process.exit(build.status ?? 1);

// ---------------------------------------------------------------------------
// Prune anything git would not commit.
//
// Two reasons, and either alone would be enough.
//
// Licensing. Vite copies the whole of public/ into dist/, and it neither knows
// nor cares about .gitignore — so a build on a machine that has the licensed
// QUL resources installed locally contains them, and `wrangler deploy` would
// then publish them to a public URL. Unlisted is not private. The standing rule
// for this project is to ship pointers rather than content, and a staging host
// is not an exception to it.
//
// Fidelity. Staging exists to show what a tester will get. CI builds from a
// clean checkout, so it has exactly the committed files and no more; a staging
// build carrying three extra resources would hide the entire class of bug that
// Amendment 17 Part 1 was about — a resource missing from the deployed build
// while working perfectly on the machine that built it.
//
// `git check-ignore` is the authority rather than a second list kept in step
// with .gitignore, because a second list is a thing that drifts.
// ---------------------------------------------------------------------------
const publicDir = join(ROOT, 'public');
const distDir = join(ROOT, 'dist');
const pruned = [];

function prune(relative) {
  const source = join(publicDir, relative);
  if (!existsSync(source)) return;

  // check-ignore exits 1 for "not ignored", which is not an error here.
  const ignored = spawnSync('git', ['check-ignore', '-q', source], { cwd: ROOT }).status === 0;
  if (!ignored) return;

  const built = join(distDir, relative);
  if (existsSync(built)) {
    rmSync(built);
    pruned.push(relative);
  }
}

for (const dir of ['qul', 'quran']) {
  const from = join(publicDir, dir);
  if (!existsSync(from)) continue;
  for (const name of readdirSync(from)) prune(`${dir}/${name}`);
}

if (pruned.length > 0) {
  console.log(`\nPruned ${pruned.length} uncommitted file(s) from dist/ before deploying:`);
  for (const file of pruned) console.log(`  ${file}`);
  console.log('  (not redistributable, and CI would not have them either)');
}

if (process.argv.includes('--build-only')) {
  console.log('\nBuilt into dist/ — not deployed (--build-only).');
  process.exit(0);
}

const deploy = spawnSync(wranglerCommand(), ['deploy'], {
  cwd: join(ROOT, 'staging'),
  stdio: 'inherit',
  shell: true,
});
if (deploy.status !== 0) process.exit(deploy.status ?? 1);

console.log(`\nStaged at ${URL_OUT}`);
console.log('The Pages site and its testers are untouched.');
