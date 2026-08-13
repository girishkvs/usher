import hljs from 'highlight.js/lib/core';

import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import go from 'highlight.js/lib/languages/go';
import graphql from 'highlight.js/lib/languages/graphql';
import ini from 'highlight.js/lib/languages/ini';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import less from 'highlight.js/lib/languages/less';
import lua from 'highlight.js/lib/languages/lua';
import makefile from 'highlight.js/lib/languages/makefile';
import markdown from 'highlight.js/lib/languages/markdown';
import nginx from 'highlight.js/lib/languages/nginx';
import objectivec from 'highlight.js/lib/languages/objectivec';
import perl from 'highlight.js/lib/languages/perl';
import php from 'highlight.js/lib/languages/php';
import plaintext from 'highlight.js/lib/languages/plaintext';
import powershell from 'highlight.js/lib/languages/powershell';
import python from 'highlight.js/lib/languages/python';
import r from 'highlight.js/lib/languages/r';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import scss from 'highlight.js/lib/languages/scss';
import shell from 'highlight.js/lib/languages/shell';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import vbnet from 'highlight.js/lib/languages/vbnet';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

const LANGUAGES: Record<string, unknown> = {
  bash,
  c,
  cpp,
  csharp,
  css,
  diff,
  dockerfile,
  go,
  graphql,
  ini,
  java,
  javascript,
  json,
  kotlin,
  less,
  lua,
  makefile,
  markdown,
  nginx,
  objectivec,
  perl,
  php,
  plaintext,
  powershell,
  python,
  r,
  ruby,
  rust,
  scss,
  shell,
  sql,
  swift,
  typescript,
  vbnet,
  xml,
  yaml,
};

let registered = false;

function ensureRegistered(): void {
  if (registered) {
    return;
  }
  for (const [name, definition] of Object.entries(LANGUAGES)) {
    hljs.registerLanguage(name, definition as never);
  }
  hljs.registerAliases(['kql', 'kusto'], { languageName: 'sql' });
  hljs.registerAliases(['tsql', 'mssql', 'plsql'], { languageName: 'sql' });
  hljs.registerAliases(['ps', 'ps1', 'pwsh'], { languageName: 'powershell' });
  hljs.registerAliases(['cs', 'dotnet'], { languageName: 'csharp' });
  hljs.registerAliases(['yml'], { languageName: 'yaml' });
  hljs.registerAliases(['toml'], { languageName: 'ini' });
  hljs.registerAliases(['html', 'xhtml', 'svg', 'xaml', 'csproj', 'props'], { languageName: 'xml' });
  hljs.registerAliases(['jsonc', 'json5'], { languageName: 'json' });
  hljs.registerAliases(['sh', 'zsh', 'console', 'shell-session'], { languageName: 'shell' });
  hljs.registerAliases(['text', 'txt', 'log', 'output'], { languageName: 'plaintext' });
  hljs.configure({ classPrefix: 'hljs-', ignoreUnescapedHTML: true });
  registered = true;
}

/** Returns highlighted HTML, or null when the language is unknown so the caller can fall back. */
export function highlightCode(code: string, language: string): string | null {
  ensureRegistered();
  if (!language) {
    return null;
  }
  if (!hljs.getLanguage(language)) {
    return null;
  }
  try {
    return hljs.highlight(code, { language, ignoreIllegals: true }).value;
  } catch {
    return null;
  }
}
