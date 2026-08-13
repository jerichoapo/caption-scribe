const api = globalThis.browser ?? globalThis.chrome;

const DEFAULTS = {
  timestamps: 'paragraph',
  frontmatter: 'full',
  wordBudget: 100,
  headings: true,
  linkTimestamps: true,
  capitalize: false,
  intervalMinutes: 5,
  gapThreshold: 2,
  filenamePattern: '{date}-{slug}',
};

const FIELDS = ['filenamePattern', 'gapThreshold', 'intervalMinutes'];
const el = (id) => document.getElementById(id);

load();

async function load() {
  const stored = await api.storage.sync.get('options');
  const options = { ...DEFAULTS, ...(stored?.options ?? {}) };
  for (const key of FIELDS) el(key).value = options[key];

  for (const key of FIELDS) {
    el(key).addEventListener('change', async () => {
      const raw = el(key).value;
      const value = el(key).type === 'number' ? Number(raw) : raw.trim();
      if (el(key).type === 'number' && !Number.isFinite(value)) return;
      const current = (await api.storage.sync.get('options'))?.options ?? {};
      await api.storage.sync.set({ options: { ...current, [key]: value } });
      setStatus('Saved.');
    });
  }

  el('reset').addEventListener('click', async () => {
    await api.storage.sync.set({ options: { ...DEFAULTS } });
    for (const key of FIELDS) el(key).value = DEFAULTS[key];
    setStatus('Reset to defaults.');
  });
}

function setStatus(message) {
  el('status').textContent = message;
  el('status').className = 'status ok';
  setTimeout(() => {
    el('status').textContent = '';
  }, 2000);
}
