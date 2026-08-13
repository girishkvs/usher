import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '../shared/settings.js';

function fields(): NodeListOf<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement> {
  return document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[data-setting]');
}

function listFields(): NodeListOf<HTMLTextAreaElement> {
  return document.querySelectorAll<HTMLTextAreaElement>('[data-setting-list]');
}

function applyToForm(settings: Settings): void {
  for (const field of Array.from(fields())) {
    const key = field.dataset.setting as keyof Settings;
    const value = settings[key];
    if (field instanceof HTMLInputElement &&
        field.type === 'checkbox') {
      field.checked = Boolean(value);
    } else {
      field.value = String(value ?? '');
    }
    const output = document.querySelector<HTMLOutputElement>(`[data-output="${key}"]`);
    if (output) {
      output.textContent = String(value);
    }
  }
  for (const field of Array.from(listFields())) {
    const key = field.dataset.settingList as keyof Settings;
    const value = settings[key];
    field.value = Array.isArray(value) ? value.join('\n') : '';
  }
}

function readForm(current: Settings): Settings {
  const next = { ...current } as unknown as Record<string, unknown>;
  for (const field of Array.from(fields())) {
    const key = field.dataset.setting as string;
    const fallback = (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[key];
    if (field instanceof HTMLInputElement &&
        field.type === 'checkbox') {
      next[key] = field.checked;
    } else if (typeof fallback === 'number') {
      const parsed = Number(field.value);
      next[key] = Number.isFinite(parsed) ? parsed : fallback;
    } else {
      next[key] = field.value;
    }
  }
  for (const field of Array.from(listFields())) {
    const key = field.dataset.settingList as string;
    next[key] = field.value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }
  return next as unknown as Settings;
}

function flash(message: string): void {
  const state = document.getElementById('save-state');
  if (!state) {
    return;
  }
  state.textContent = message;
  state.classList.add('is-flash');
  setTimeout(() => {
    state.textContent = 'Changes save automatically.';
    state.classList.remove('is-flash');
  }, 1600);
}

async function main(): Promise<void> {
  let settings = await loadSettings();
  applyToForm(settings);

  const persist = async (): Promise<void> => {
    settings = readForm(settings);
    await saveSettings(settings);
    applyToForm(settings);
    flash('Saved');
  };

  for (const field of [...Array.from(fields()), ...Array.from(listFields())]) {
    field.addEventListener('change', () => void persist());
    if (field instanceof HTMLInputElement &&
        (field.type === 'range' || field.type === 'number')) {
      field.addEventListener('input', () => {
        const output = document.querySelector<HTMLOutputElement>(`[data-output="${field.dataset.setting}"]`);
        if (output) {
          output.textContent = field.value;
        }
      });
    }
  }

  const fileAccess = await chrome.extension.isAllowedFileSchemeAccess();
  const state = document.getElementById('file-access-state');
  if (state) {
    state.textContent = fileAccess
      ? 'File access is enabled — local .md files render automatically.'
      : 'File access is OFF. Local .md files will not render until you enable it.';
    state.classList.toggle('is-ok', fileAccess);
    state.classList.toggle('is-warn', !fileAccess);
  }

  document.getElementById('open-extension-page')?.addEventListener('click', () => {
    void chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
  });

  document.getElementById('open-notices')?.addEventListener('click', () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL('THIRD-PARTY-NOTICES.txt') });
  });

  const versionLine = document.getElementById('version-line');
  if (versionLine) {
    const manifest = chrome.runtime.getManifest();
    versionLine.textContent = `${manifest.name} ${manifest.version}`;
  }

  document.getElementById('export')?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'usher-settings.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 4000);
  });

  const importInput = document.getElementById('import-file') as HTMLInputElement | null;
  document.getElementById('import')?.addEventListener('click', () => importInput?.click());
  importInput?.addEventListener('change', () => {
    const file = importInput.files?.[0];
    if (!file) {
      return;
    }
    void file.text().then(async (text) => {
      try {
        const parsed = JSON.parse(text) as Partial<Settings>;
        settings = { ...DEFAULT_SETTINGS, ...parsed };
        await saveSettings(settings);
        applyToForm(settings);
        flash('Imported');
      } catch {
        flash('That file is not valid Usher settings');
      }
      importInput.value = '';
    });
  });

  document.getElementById('reset')?.addEventListener('click', () => {
    settings = { ...DEFAULT_SETTINGS };
    void saveSettings(settings).then(() => {
      applyToForm(settings);
      flash('Reset to defaults');
    });
  });
}

void main();
