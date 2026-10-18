/* Core data model, defaults, layout maths and project templates. */

import { PRESETS, TEMPLATES } from './presets.js';

export const SCHEMA_VERSION = 1;
export const PAGE_RATIOS = {
  '2:3': { label: '2 : 3 · poster', width: 2000, height: 3000 },
  '3:4': { label: '3 : 4 · portrait', width: 2000, height: 2667 },
  '4:5': { label: '4 : 5 · portrait', width: 2000, height: 2500 },
  '1:1': { label: '1 : 1 · square', width: 2400, height: 2400 }
};

export const FONTS = [
  { id: 'great-vibes', label: 'Great Vibes', stack: "'Great Vibes', cursive", kind: 'script' },
  { id: 'parisienne', label: 'Parisienne', stack: "'Parisienne', cursive", kind: 'script' },
  { id: 'pinyon-script', label: 'Pinyon Script', stack: "'Pinyon Script', cursive", kind: 'script' },
  { id: 'playfair-display', label: 'Playfair Display', stack: "'Playfair Display', serif", kind: 'serif' },
  { id: 'cormorant-garamond', label: 'Cormorant Garamond', stack: "'Cormorant Garamond', serif", kind: 'serif' },
  { id: 'jost', label: 'Jost', stack: "'Jost', sans-serif", kind: 'sans' },
  { id: 'montserrat', label: 'Montserrat', stack: "'Montserrat', sans-serif", kind: 'sans' }
];

export const FONT_MAP = Object.fromEntries(FONTS.map(f => [f.id, f]));

export const BACKGROUNDS = [
  { id: 'mirror', label: 'Mirror' },
  { id: 'paper', label: 'Fine paper' },
  { id: 'linen', label: 'Linen' },
  { id: 'solid', label: 'Flat colour' },
  { id: 'photo', label: 'Your photo' }
];

export const FRAMES = [
  { id: 'baroque', label: 'Baroque arch' },
  { id: 'arch', label: 'Simple arch' },
  { id: 'line', label: 'Fine line' },
  { id: 'none', label: 'No frame' }
];

export const PINS = [
  { id: 'seal', label: 'Gold seal' },
  { id: 'pin', label: 'Brass pin' },
  { id: 'wax', label: 'Wax seal' },
  { id: 'none', label: 'No pin' }
];

export const uid = () => (globalThis.crypto?.randomUUID
  ? crypto.randomUUID()
  : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));

export const clone = (value) => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

export function deepMerge(base, patch) {
  if (Array.isArray(patch)) return clone(patch);
  if (patch && typeof patch === 'object') {
    const out = { ...(base && typeof base === 'object' ? base : {}) };
    for (const [key, value] of Object.entries(patch)) {
      out[key] = value && typeof value === 'object' && !Array.isArray(value)
        ? deepMerge(base?.[key], value)
        : clone(value);
    }
    return out;
  }
  return patch === undefined ? clone(base) : patch;
}

export const fontStack = (id) => FONT_MAP[id]?.stack || FONT_MAP.jost.stack;

export function defaultHeader(title = 'Our Favorite People', date = 'June 10, 2026') {
  return {
    title,
    date,
    showDate: true,
    divider: true,
    y: 330,
    maxWidth: 86
  };
}

export function defaultLayout(count = 12) {
  return {
    auto: true,
    columns: count <= 6 ? 3 : 4,
    marginX: 120,
    gapX: 56,
    gapY: 104,
    top: 900,
    bottom: 120,
    vAlign: 'top'
  };
}

export function parseGuestList(text) {
  return String(text || '')
    .split(/\r?\n|,/)
    .map(name => name.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
}

const FIRST_NAMES = [
  'Ava', 'Noah', 'Isla', 'Liam', 'Mia', 'Ethan', 'Sofia', 'Henry', 'Grace', 'Olivia',
  'Mateo', 'Amelia', 'Lucas', 'Chloe', 'James', 'Elena', 'Benjamin', 'Nora', 'Charlotte', 'Daniel',
  'Freya', 'Samuel', 'Layla', 'Owen', 'Zoe', 'Jack', 'Priya', 'Harper', 'Leo', 'Aurora',
  'Caleb', 'Nina', 'Elliot', 'Maya', 'Finn', 'Ruby', 'Scarlett', 'Julian', 'Alice', 'Mason',
  'Ines', 'Theo', 'Hazel', 'Sebastian', 'Lila', 'Violet', 'Ezra', 'Clara', 'Hugo', 'Sadie',
  'Milo', 'Anya', 'Jasper', 'Esme', 'Willow', 'Aiden', 'Rose', 'Felix', 'Ivy', 'Ronan',
  'Tessa', 'Declan', 'Ada', 'Eliza', 'Oscar', 'Maeve', 'Levi', 'Cora', 'Arlo', 'June',
  'Silas', 'Noor', 'Stella', 'Gabriel', 'Wren', 'Roman', 'Daisy', 'Emil', 'Lena', 'Beau',
  'Sana', 'Iris', 'Nathan', 'Faye', 'Cole', 'Ruth', 'Miles', 'Celine', 'Asher', 'Talia',
  'Lily', 'Jonah', 'Elodie', 'Wyatt', 'Naomi', 'Graham', 'Camille', 'Reid', 'Alma', 'Florence',
  'Desmond', 'Maren', 'Tobias', 'Suki', 'Barrett', 'Adeline', 'Malcolm', 'Elio', 'Willa', 'August',
  'June', 'Rafael', 'Saoirse', 'Kai', 'Margot', 'Nico', 'Pearl', 'Arthur', 'Delphine', 'Remy'
];

const LAST_NAMES = [
  'Thompson', 'Bennett', 'Montgomery', 'Foster', 'Sinclair', 'Brooks', 'Delgado', 'Walsh', 'Kim', 'Chen',
  'Rivera', 'Hart', 'Meyer', 'Dupont', 'Okafor', 'Rossi', 'Cole', 'Lindqvist', 'Reid', 'Park',
  'Jensen', 'Wright', 'Haddad', 'Murphy', 'Abara', 'Sullivan', 'Nair', 'Ellis', 'Martins', 'Bianchi',
  'Turner', 'Petrova', 'Hayes', 'Goldberg', 'Andersen', 'Patel', 'Moore', 'Vega', 'Fontaine', 'Clarke',
  'Moreau', 'Grant', 'Nguyen', 'Roth', 'Brooks', 'Adams', 'Cohen', 'Hoffmann', 'Laurent', 'Williams',
  'Ivanova', 'King', 'Walker', 'James', 'Scott', 'McCarthy', 'Wagner', 'Campbell', 'Byrne', 'Morgan',
  'Reed', 'Osei', 'Lindberg', 'Kelly', 'Franklin', 'Sato', 'Castillo', 'Rahman', 'Pierce', 'Costa',
  'Holloway', 'Novak', 'Fischer', 'Ahmed', 'Palmer', 'Dubois', 'Anderson', 'Adeyemi', 'Harrington',
  'Weiss', 'Mercer', 'Price', 'Martin', 'Ito', 'Roux', 'Callahan', 'Lane', 'Stone', 'Quinn',
  'Ford', 'Romano', 'Bell', 'Sato', 'Cohen', 'Foster', 'Hayes', 'Nguyen', 'Rossi', 'Grant'
];

const sampleNames = [];
for (let i = 0; i < 130; i++) {
  sampleNames.push(`${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[(i * 7 + 3) % LAST_NAMES.length]}`);
}

function demoCards(count) {
  const cards = [];
  let cursor = 0;
  for (let i = 0; i < count; i++) {
    const n = 8 + (i % 3);
    const guests = [];
    for (let g = 0; g < n; g++) guests.push(sampleNames[cursor++ % sampleNames.length]);
    cards.push({ id: uid(), label: `table ${i + 1}`, guests, x: 0, y: 0, rotation: 0 });
  }
  return cards;
}

function emptyCards(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: uid(), label: `table ${i + 1}`, guests: [], x: 0, y: 0, rotation: 0
  }));
}

export function createProject(templateId = 'gilded-demo', opts = {}) {
  const template = TEMPLATES.find(t => t.id === templateId) || TEMPLATES[0];
  const preset = PRESETS[template.preset] || PRESETS.gilded;
  const tableCount = template.demo ? 12 : (template.tables || 8);
  const cards = template.demo
    ? demoCards(tableCount)
    : template.guestsPerTable > 0
      ? dealCards(tableCount, template.guestsPerTable)
      : emptyCards(tableCount);

  const project = {
    schema: SCHEMA_VERSION,
    id: uid(),
    name: opts.name || template.projectName || 'Untitled chart',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    width: 2000,
    height: 3000,
    header: defaultHeader(template.title, template.date),
    typography: clone(preset.typography),
    theme: clone(preset.theme),
    layout: defaultLayout(tableCount),
    cards,
    print: {
      tableCards: {
        size: '3.5x5',
        layout: 'sheet',
        paper: 'a4',
        cropMarks: true
      },
      nameCards: {
        style: 'tent',
        size: '3.5x2.5',
        layout: 'sheet',
        paper: 'a4',
        cropMarks: true,
        foldLine: true,
        showTable: true,
        border: false,
        sort: 'table'
      }
    }
  };
  project.theme.preset = preset.id;
  ensureGuestRoster(project);
  applyAutoPositions(project);
  return project;
}

function dealCards(tableCount, perTable) {
  const cards = [];
  let cursor = (tableCount * 3) % 40;
  for (let i = 0; i < tableCount; i++) {
    const guests = [];
    for (let g = 0; g < perTable; g++) guests.push(sampleNames[cursor++ % sampleNames.length]);
    cards.push({ id: uid(), label: `table ${i + 1}`, guests, x: 0, y: 0, rotation: 0 });
  }
  return cards;
}

export function applyPreset(project, presetId) {
  const preset = PRESETS[presetId];
  if (!preset) return project;
  const next = clone(project);
  next.theme = clone(preset.theme);
  next.theme.preset = preset.id;
  next.typography = clone(preset.typography);
  next.updatedAt = Date.now();
  return next;
}

export function setRatio(project, ratioKey) {
  const ratio = PAGE_RATIOS[ratioKey];
  if (!ratio) return project;
  const next = clone(project);
  next.width = ratio.width;
  next.height = ratio.height;
  next.updatedAt = Date.now();
  if (next.layout.auto) applyAutoPositions(next);
  return next;
}

export function ratioKeyOf(project) {
  return Object.keys(PAGE_RATIOS).find(k => {
    const r = PAGE_RATIOS[k];
    return r.width === project.width && r.height === project.height;
  }) || '2:3';
}

export function estimateCardHeight(card, project, cardWidth) {
  const t = project.typography;
  const padX = cardPaddingX(cardWidth);
  const padY = cardPaddingY(cardWidth);
  const labelHeight = t.labelSize * 1.12;
  const ruleBlock = 2 + 15 + 18;
  const lines = Math.max(1, card.guests.length);
  const guestHeight = lines * t.guestSize * t.guestLineHeight;
  const border = Math.max(0, project.theme.card.borderWidth || 0) * 2;
  return Math.round(padY * 2 + labelHeight + ruleBlock + guestHeight + border);
}

export const cardPaddingX = (width) => Math.round(Math.max(18, width * 0.105));
export const cardPaddingY = (width) => Math.round(Math.max(16, width * 0.1));

export function computeLayout(project) {
  const { layout } = project;
  const columns = Math.max(1, Math.min(8, layout.columns || 4));
  const usable = project.width - layout.marginX * 2;
  const cardWidth = Math.max(90, (usable - (columns - 1) * layout.gapX) / columns);
  const cards = project.cards;
  const positions = {};
  let y = layout.top;
  let tallestRow = 0;

  for (let i = 0; i < cards.length; i += columns) {
    const row = cards.slice(i, i + columns);
    const rowHeights = row.map(card => estimateCardHeight(card, project, cardWidth));
    const rowHeight = Math.max(...rowHeights);
    tallestRow = Math.max(tallestRow, rowHeight);
    const rowWidth = row.length * cardWidth + (row.length - 1) * layout.gapX;
    const startX = (project.width - rowWidth) / 2;

    row.forEach((card, column) => {
      positions[card.id] = {
        x: Math.round(startX + column * (cardWidth + layout.gapX)),
        y: Math.round(y),
        width: Math.round(cardWidth),
        height: rowHeights[column]
      };
    });
    y += rowHeight + layout.gapY;
  }

  const contentBottom = cards.length ? y - layout.gapY : layout.top;
  let offset = 0;
  if (layout.vAlign === 'center' && cards.length) {
    const available = project.height - layout.top - layout.bottom;
    offset = Math.max(0, (available - (contentBottom - layout.top)) / 2);
  }
  if (offset) {
    for (const pos of Object.values(positions)) pos.y = Math.round(pos.y + offset);
    y += offset;
  }

  return {
    positions,
    cardWidth,
    contentTop: layout.top + offset,
    contentBottom: y - (cards.length ? layout.gapY : 0),
    bottom: y - (cards.length ? layout.gapY : 0),
    overflow: (y - (cards.length ? layout.gapY : 0)) > project.height - 8
  };
}

/** Bake auto-layout coordinates into cards so they can be dragged freely. */
export function bakeAutoPositions(project) {
  const next = clone(project);
  const { positions } = computeLayout(next);
  next.cards.forEach(card => {
    const pos = positions[card.id];
    if (pos) { card.x = pos.x; card.y = pos.y; }
  });
  next.layout.auto = false;
  next.updatedAt = Date.now();
  return next;
}

export function applyAutoPositions(project) {
  const { positions } = computeLayout(project);
  project.cards.forEach(card => {
    const pos = positions[card.id];
    if (pos) { card.x = pos.x; card.y = pos.y; }
  });
  return project;
}

export function autoFitTables(project) {
  const work = clone(project);
  work.layout.auto = true;
  const H = work.height;
  const start = {
    guestSize: work.typography.guestSize,
    labelSize: work.typography.labelSize,
    gapY: work.layout.gapY
  };
  for (let columns = work.layout.columns; columns <= 6; columns++) {
    work.layout.columns = columns;
    for (let step = 0; step <= 12; step++) {
      const s = 1 - step * 0.04;
      work.typography.guestSize = Math.max(11, +(start.guestSize * s).toFixed(1));
      work.typography.labelSize = Math.max(38, Math.round(start.labelSize * Math.max(0.72, s)));
      work.layout.gapY = Math.max(38, Math.round(start.gapY * Math.max(0.55, s)));
      if (!computeLayout(work).overflow) {
        work.updatedAt = Date.now();
        return { project: work, fitted: true };
      }
    }
  }
  work.updatedAt = Date.now();
  return { project: work, fitted: false };
}

export function normalizeProject(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.cards)) {
    throw new Error('This file does not look like a Gilded seating chart.');
  }
  const base = createProject('blank');
  const next = deepMerge(base, raw);
  next.schema = SCHEMA_VERSION;
  next.id = typeof raw.id === 'string' && raw.id ? raw.id : uid();
  next.name = String(raw.name || 'Imported chart').slice(0, 120);
  next.width = Number(next.width) || 2000;
  next.height = Number(next.height) || 3000;
  next.cards = next.cards.map((card, i) => ({
    id: typeof card.id === 'string' && card.id ? card.id : uid(),
    label: String(card.label || `table ${i + 1}`).slice(0, 80),
    guests: Array.isArray(card.guests) ? card.guests.map(g => String(g).slice(0, 120)) : [],
    x: Number(card.x) || 0,
    y: Number(card.y) || 0,
    rotation: Number(card.rotation) || 0
  }));
  next.createdAt = Number(next.createdAt) || Date.now();
  next.updatedAt = Number(next.updatedAt) || Date.now();
  next.layout.columns = Math.max(1, Math.min(8, Number(next.layout.columns) || 4));

  if (Array.isArray(raw.guests) && raw.guests.length) {
    const cardIds = new Set(next.cards.map(card => card.id));
    next.guests = raw.guests
      .filter(guest => guest && typeof guest.name === 'string' && guest.name.trim())
      .map(guest => ({
        id: typeof guest.id === 'string' && guest.id ? guest.id : uid(),
        name: String(guest.name).trim().slice(0, 120),
        tableId: cardIds.has(guest.tableId) ? guest.tableId : null
      }));
  } else {
    next.guests = [];
  }
  ensureGuestRoster(next);
  return next;
}

/**
 * The roster is the single source of truth for names.
 * `card.guests` stays as a derived array so the mirror renderer and
 * print engine can keep using the familiar card shape.
 */
export function syncGuestAssignments(project) {
  const tableIds = new Set(project.cards.map(card => card.id));
  if (!Array.isArray(project.guests)) project.guests = [];
  project.guests.forEach(guest => {
    if (guest.tableId && !tableIds.has(guest.tableId)) guest.tableId = null;
    guest.name = String(guest.name || '').trim().slice(0, 120);
  });
  project.guests = project.guests.filter(guest => guest.name);
  project.cards.forEach(card => {
    card.guests = project.guests
      .filter(guest => guest.tableId === card.id)
      .map(guest => guest.name);
  });
  return project;
}

/** Upgrade old projects (where names only lived in card.guests) to a roster. */
export function ensureGuestRoster(project) {
  const cardIds = new Set(project.cards.map(card => card.id));
  const hasCardNames = project.cards.some(card => Array.isArray(card.guests) && card.guests.length);
  const shouldBuild = !Array.isArray(project.guests) || (!project.guests.length && hasCardNames);

  if (shouldBuild) {
    project.guests = [];
    project.cards.forEach(card => {
      (card.guests || []).forEach(name => {
        const clean = String(name || '').trim();
        if (clean) project.guests.push({ id: uid(), name: clean, tableId: card.id });
      });
    });
  } else {
    project.guests = project.guests
      .filter(guest => guest && typeof guest.name === 'string' && guest.name.trim())
      .map(guest => ({
        id: typeof guest.id === 'string' && guest.id ? guest.id : uid(),
        name: String(guest.name).trim().slice(0, 120),
        tableId: cardIds.has(guest.tableId) ? guest.tableId : null
      }));
  }

  syncGuestAssignments(project);
  return project;
}

export function projectStats(project) {
  const roster = Array.isArray(project.guests) ? project.guests : null;
  return {
    tables: project.cards.length,
    guests: roster ? roster.length : project.cards.reduce((sum, card) => sum + card.guests.length, 0),
    unassigned: roster ? roster.filter(guest => !guest.tableId).length : 0
  };
}

export function formatUpdated(timestamp) {
  if (!timestamp) return 'Just now';
  const date = new Date(timestamp);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return 'Today, ' + date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

export function nextTableLabel(project) {
  return `table ${project.cards.length + 1}`;
}

export { PRESETS, TEMPLATES, sampleNames };
