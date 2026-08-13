#!/usr/bin/env node
// License-compliance gate: fail if any installed package's licence is outside the allowlist.
// Runs in CI (see .github/workflows/ci.yml) and locally via `npm run licenses`. Keeps the
// dependency tree permissive-only, since the whole runtime tree is bundled into the shipped
// extension package.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALLOW, isAllowed, resolveLicense } from './lib/licenses.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const NODE_MODULES = join(ROOT, 'node_modules');

/** All package dirs under node_modules (top-level + one level of @scope). */
function packageDirs() {
  const dirs = [];
  if (!existsSync(NODE_MODULES)) {
    return dirs;
  }
  for (const entry of readdirSync(NODE_MODULES)) {
    if (entry === '.bin' || entry === '.cache') {
      continue;
    }
    const full = join(NODE_MODULES, entry);
    if (!statSync(full).isDirectory()) {
      continue;
    }
    if (entry.startsWith('@')) {
      for (const sub of readdirSync(full)) {
        dirs.push(join(full, sub));
      }
    } else {
      dirs.push(full);
    }
  }
  return dirs;
}

const violations = [];
const inferred = [];
const tally = new Map();
let checked = 0;

for (const dir of packageDirs()) {
  const manifest = join(dir, 'package.json');
  if (!existsSync(manifest)) continue;
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(manifest, 'utf8'));
  } catch {
    continue;
  }
  if (!pkg.name) continue;
  checked += 1;

  const resolved = resolveLicense(pkg, dir);
  tally.set(resolved.license || '(none)', (tally.get(resolved.license || '(none)') ?? 0) + 1);
  if (resolved.inferred) {
    inferred.push(`${pkg.name}@${pkg.version ?? '?'} -> ${resolved.license} (read from its licence file)`);
  }
  if (!isAllowed(resolved.license)) {
    violations.push(
      `${pkg.name}@${pkg.version ?? '?'}: ${resolved.license || '(no licence field and no readable licence file)'}`,
    );
  }
}

if (violations.length > 0) {
  console.error(`License check FAILED -- ${violations.length} package(s) outside the allowlist:`);
  for (const violation of violations.sort()) {
    console.error(`  - ${violation}`);
  }
  console.error(`\nAllowlist: ${[...ALLOW].join(', ')}`);
  console.error('If a package is a false positive, add its SPDX id to ALLOW or record the elected');
  console.error('side of a dual licence in ELECTED_LICENSE, both in scripts/lib/licenses.mjs.');
  process.exit(1);
}

console.log(`License check OK -- ${checked} package(s), all within the allowlist.`);
for (const [license, count] of [...tally].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(4)}  ${license}`);
}
if (inferred.length > 0) {
  console.log(`\n${inferred.length} package(s) declared no licence field; resolved from the shipped text:`);
  for (const entry of inferred.sort()) {
    console.log(`  - ${entry}`);
  }
}
