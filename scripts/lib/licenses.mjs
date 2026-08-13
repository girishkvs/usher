// Shared licence resolution for scripts/check-licenses.mjs and scripts/gen-notices.mjs.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const LICENSE_FILE_PATTERN = /^(LICEN[CS]E|COPYING|NOTICE)(\.|$)/i;

// SPDX identifiers we accept: permissive OSS licences that are clean for redistribution.
// Matches the allowlist used across the author's other repos (Baton, mcp-pacemaker).
export const ALLOW = new Set([
  'MIT',
  'MIT-0',
  'ISC',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'CC0-1.0',
  'CC-BY-4.0',
  'Unlicense',
  'BlueOak-1.0.0',
  'Python-2.0',
  'Zlib',
]);

/**
 * Dual-licensed packages: record which side we take so the notice is unambiguous.
 * DOMPurify is "(MPL-2.0 OR Apache-2.0)"; we elect Apache-2.0 to keep the tree permissive.
 */
export const ELECTED_LICENSE = {
  dompurify: 'Apache-2.0',
};

/** Locate and read the licence text a package ships, which permissive licences require us to reproduce. */
export function licenseTextOf(dir) {
  if (!existsSync(dir)) {
    return null;
  }
  const candidates = readdirSync(dir).filter((entry) => LICENSE_FILE_PATTERN.test(entry));
  candidates.sort((a, b) => a.length - b.length);
  for (const candidate of candidates) {
    try {
      const text = readFileSync(join(dir, candidate), 'utf8').trim();
      if (text) {
        return text;
      }
    } catch {
      // Directory entry or unreadable file: try the next candidate.
    }
  }
  return null;
}

/**
 * Some packages ship a licence file but omit the package.json field (khroma, a mermaid
 * dependency, is one). Inferring from the text is more correct than an allowlist exception.
 */
export function inferLicense(text) {
  if (!text) {
    return '';
  }
  const sample = text.slice(0, 4000);
  if (/The MIT License|Permission is hereby granted, free of charge/i.test(sample)) {
    return 'MIT';
  }
  if (/Apache License/i.test(sample) && /Version 2\.0/i.test(sample)) {
    return 'Apache-2.0';
  }
  if (/Permission to use, copy, modify, and(\/or)? distribute/i.test(sample)) {
    return 'ISC';
  }
  if (/Redistribution and use in source and binary forms/i.test(sample)) {
    return /Neither the name|contributors may be used to endorse/i.test(sample) ? 'BSD-3-Clause' : 'BSD-2-Clause';
  }
  if (/free and unencumbered software released into the public domain/i.test(sample)) {
    return 'Unlicense';
  }
  if (/CC0 1\.0|Creative Commons Zero/i.test(sample)) {
    return 'CC0-1.0';
  }
  return '';
}

/** Declared licence from a package.json (handles string, {type}, and legacy licenses[]). */
export function declaredLicense(pkg) {
  if (ELECTED_LICENSE[pkg.name]) {
    return ELECTED_LICENSE[pkg.name];
  }
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license && typeof pkg.license === 'object' && pkg.license.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l?.type ?? l).filter(Boolean).join(' OR ');
  return '';
}

/** Declared licence, falling back to inference from the shipped licence text. */
export function resolveLicense(pkg, dir) {
  const declared = declaredLicense(pkg);
  if (declared) {
    return { license: declared, inferred: false };
  }
  const inferred = inferLicense(licenseTextOf(dir));
  return { license: inferred, inferred: inferred !== '' };
}

/** True if an SPDX expression is satisfied by the allowlist. OR = any allowed; AND = all allowed. */
export function isAllowed(expr) {
  if (!expr) return false;
  const cleaned = expr.replace(/[()]/g, ' ').trim();
  if (ALLOW.has(cleaned)) return true;
  if (/\bOR\b/i.test(cleaned)) {
    return cleaned.split(/\bOR\b/i).some((part) => isAllowed(part.trim()));
  }
  if (/\bAND\b/i.test(cleaned)) {
    return cleaned.split(/\bAND\b/i).every((part) => isAllowed(part.trim()));
  }
  return ALLOW.has(cleaned.replace(/\s+/g, ''));
}
