/* ============================================================
   PRINT — physical table cards and name cards.

   The same DOM is used for the on-screen preview and for the
   300 dpi PDF / print output. All geometry is in CSS pixels at
   96 dpi; the exporter scales that DOM up to 300 dpi.
   ============================================================ */

import { FONT_MAP } from './model.js';
import { renderElementToCanvas, makePdfPages } from './export.js';
import { esc, downloadBlob, dataUrlToBytes, slugify, waitForFonts, clamp } from './utils.js';

export const PX_PER_IN = 96;
export const PT_PER_IN = 72;
export const inPx = (inches) => inches * PX_PER_IN;
export const inPt = (inches) => inches * PT_PER_IN;

export const PAPERS = {
  a4: { id: 'a4', label: 'A4 · 210 × 297 mm', w: 8.2677, h: 11.6929 },
  letter: { id: 'letter', label: 'US Letter · 8.5 × 11 in', w: 8.5, h: 11 }
};

export const TABLE_SIZES = {
  '3.5x5': { id: '3.5x5', label: '3.5 × 5 in', w: 3.5, h: 5 },
  '4x6': { id: '4x6', label: '4 × 6 in', w: 4, h: 6 },
  '5x7': { id: '5x7', label: '5 × 7 in', w: 5, h: 7 },
  a6: { id: 'a6', label: 'A6 · 105 × 148 mm', w: 4.13, h: 5.83 }
};

export const NAME_STYLES = [
  { id: 'tent', label: 'Folded tent card' },
  { id: 'flat', label: 'Flat place card' }
];

export const NAME_SIZES = {
  tent: [
    { id: '3.5x2.5', label: '3.5 × 2.5 in folded', w: 3.5, fold: 2.5, h: 5 },
    { id: '4x3', label: '4 × 3 in folded', w: 4, fold: 3, h: 6 }
  ],
  flat: [
    { id: '3.5x2', label: '3.5 × 2 in', w: 3.5, h: 2 },
    { id: '4x2.5', label: '4 × 2.5 in', w: 4, h: 2.5 }
  ]
};

export const DEFAULT_PRINT = {
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
};

const SHEET_MARGIN = 0.35;
const SHEET_GAP = 0.15;

/* ---------- settings ---------- */

export function printSettings(project) {
  const source = project.print || {};
  const table = { ...DEFAULT_PRINT.tableCards, ...(source.tableCards || {}) };
  const name = { ...DEFAULT_PRINT.nameCards, ...(source.nameCards || {}) };

  if (!TABLE_SIZES[table.size]) table.size = DEFAULT_PRINT.tableCards.size;
  if (table.layout !== 'single') table.layout = 'sheet';
  if (!PAPERS[table.paper]) table.paper = DEFAULT_PRINT.tableCards.paper;

  if (!NAME_SIZES[name.style]) name.style = DEFAULT_PRINT.nameCards.style;
  if (!NAME_SIZES[name.style].some(size => size.id === name.size)) name.size = NAME_SIZES[name.style][0].id;
  if (name.layout !== 'single') name.layout = 'sheet';
  if (!PAPERS[name.paper]) name.paper = DEFAULT_PRINT.nameCards.paper;
  if (name.sort !== 'name') name.sort = 'table';

  return { tableCards: table, nameCards: name };
}

/* ---------- planning ---------- */

function sheetPlan({ items, cardW, cardH, layout, paper, variant }) {
  const isSingle = layout === 'single';
  const pageW = isSingle ? cardW : paper.w;
  const pageH = isSingle ? cardH : paper.h;
  const innerW = paper.w - SHEET_MARGIN * 2;
  const innerH = paper.h - SHEET_MARGIN * 2;
  const cols = isSingle ? 1 : Math.max(1, Math.floor((innerW + SHEET_GAP) / (cardW + SHEET_GAP)));
  const rows = isSingle ? 1 : Math.max(1, Math.floor((innerH + SHEET_GAP) / (cardH + SHEET_GAP)));
  const perSheet = isSingle ? 1 : cols * rows;
  return {
    variant,
    items,
    total: items.length,
    layout,
    pageW,
    pageH,
    cardW,
    cardH,
    paper,
    cols,
    rows,
    perSheet,
    pageCount: items.length ? Math.ceil(items.length / perSheet) : 0
  };
}

export function planTableCards(project, settings = printSettings(project).tableCards, cards = project.cards) {
  const s = { ...printSettings(project).tableCards, ...settings };
  const size = TABLE_SIZES[s.size] || TABLE_SIZES[DEFAULT_PRINT.tableCards.size];
  const paper = PAPERS[s.paper] || PAPERS.a4;
  return {
    ...sheetPlan({ items: cards, cardW: size.w, cardH: size.h, layout: s.layout, paper, variant: 'tableCards' }),
    size,
    settings: s
  };
}

export function planNameCards(project, settings = printSettings(project).nameCards) {
  const s = { ...printSettings(project).nameCards, ...settings };
  const styleSizes = NAME_SIZES[s.style] || NAME_SIZES.tent;
  const size = styleSizes.find(item => item.id === s.size) || styleSizes[0];
  const paper = PAPERS[s.paper] || PAPERS.a4;
  const items = [];
  for (const card of project.cards) {
    card.guests.forEach((name, index) => {
      items.push({ key: `${card.id}:${index}`, name, table: card.label, tableIndex: project.cards.indexOf(card) });
    });
  }
  if (s.sort === 'name') {
    items.sort((a, b) => a.name.localeCompare(b.name) || a.table.localeCompare(b.table));
  }
  return {
    ...sheetPlan({ items, cardW: size.w, cardH: size.h, layout: s.layout, paper, variant: 'nameCards' }),
    size,
    settings: s
  };
}

/* ---------- measuring & styling ---------- */

const measureCanvas = document.createElement('canvas');
const measureCtx = measureCanvas.getContext('2d');

function fitFontSize(text, stack, { basePt, maxWidthIn, italic = false, minPt = 8, spacingEm = 0 }) {
  if (!measureCtx) return basePt;
  const maxPx = maxWidthIn * PX_PER_IN;
  const value = String(text || ' ');
  let pt = basePt;
  for (let i = 0; i < 8; i++) {
    measureCtx.font = `${italic ? 'italic ' : ''}400 ${pt * (PX_PER_IN / PT_PER_IN)}px ${stack}`;
    const spacing = value.length * spacingEm * pt * (PX_PER_IN / PT_PER_IN);
    const width = measureCtx.measureText(value).width + spacing;
    if (width <= maxPx * 0.98) break;
    pt = pt * (maxPx / width) * 0.96;
  }
  return Math.max(minPt, Math.round(pt * 10) / 10);
}

function setTypography(sheet, project) {
  const t = project.typography;
  const th = project.theme;
  sheet.style.setProperty('--print-card-bg', th.card.bg);
  sheet.style.setProperty('--print-label', th.card.labelColor);
  sheet.style.setProperty('--print-guest', th.card.guestColor);
  sheet.style.setProperty('--print-accent', th.accent);
  sheet.style.setProperty('--print-border', th.accent || th.card.border || '#d8cfbe');
  sheet.style.setProperty('--print-label-font', FONT_MAP[t.labelFont]?.stack || FONT_MAP.parisienne.stack);
  sheet.style.setProperty('--print-label-style', t.labelItalic ? 'italic' : 'normal');
  sheet.style.setProperty('--print-label-weight', '400');
  sheet.style.setProperty('--print-label-spacing', `${t.labelSpacing || 0}em`);
  sheet.style.setProperty('--print-guest-font', FONT_MAP[t.guestFont]?.stack || FONT_MAP.montserrat.stack);
  sheet.style.setProperty('--print-guest-weight', String(t.guestWeight || 500));
  sheet.style.setProperty('--print-guest-spacing', `${t.guestSpacing || 0.12}em`);
  sheet.style.setProperty('--print-guest-line-height', String(t.guestLineHeight || 1.6));
  sheet.style.setProperty('--print-guest-transform', t.guestUpper ? 'uppercase' : 'none');
  sheet.style.setProperty('--print-name-font', FONT_MAP[t.labelFont]?.stack || FONT_MAP.parisienne.stack);
  sheet.style.setProperty('--print-name-style', t.labelItalic ? 'italic' : 'normal');
  sheet.style.setProperty('--print-name-color', th.card.labelColor);
  sheet.style.setProperty('--print-table-font', FONT_MAP[t.guestFont]?.stack || FONT_MAP.montserrat.stack);
  sheet.style.setProperty('--print-table-color', th.card.guestColor);
  sheet.style.setProperty('--print-table-weight', String(t.guestWeight || 500));
  sheet.style.setProperty('--print-table-spacing', `${Math.max(0.12, t.guestSpacing || 0)}em`);
}

function tableCardElement(project, card, size, plan) {
  const padIn = size.w * 0.105;
  const padPx = inPx(padIn);
  const labelStack = FONT_MAP[project.typography.labelFont]?.stack || FONT_MAP.parisienne.stack;
  const labelBase = size.w * 0.17 * 72;
  const labelPt = fitFontSize(card.label, labelStack, {
    basePt: labelBase,
    maxWidthIn: size.w - padIn * 2,
    italic: project.typography.labelItalic,
    minPt: 14,
    spacingEm: project.typography.labelSpacing || 0
  });
  const ruleTop = inPx(size.w * 0.035);
  const ruleBottom = inPx(size.w * 0.05);
  const ruleHeight = 1.5;
  const labelHeight = labelPt * (PX_PER_IN / PT_PER_IN) * 1.08;
  const availablePx = inPx(size.h) - padPx * 2 - labelHeight - ruleTop - ruleBottom - ruleHeight;
  const n = card.guests.length;
  const useColumns = n > 14;
  const lineHeight = project.typography.guestLineHeight || 1.55;
  const baseGuestPt = size.w * 0.042 * 72;
  const guestStack = FONT_MAP[project.typography.guestFont]?.stack || FONT_MAP.montserrat.stack;
  const guestSpacing = project.typography.guestSpacing || 0;
  const columnGapIn = size.w * 0.05;
  const contentWidthIn = size.w - padIn * 2;
  const columnWidthIn = useColumns ? (contentWidthIn - columnGapIn) / 2 : contentWidthIn;

  const nameLineCounts = (pt) => {
    if (!measureCtx) return card.guests.map(() => 1);
    measureCtx.font = `400 ${pt * (PX_PER_IN / PT_PER_IN)}px ${guestStack}`;
    const maxPx = columnWidthIn * PX_PER_IN * 0.94;
    return card.guests.map((name) => {
      const display = project.typography.guestUpper ? name.toUpperCase() : name;
      const spacing = display.length * guestSpacing * pt * (PX_PER_IN / PT_PER_IN);
      const width = measureCtx.measureText(display).width + spacing;
      return Math.max(1, Math.ceil(width / Math.max(20, maxPx)));
    });
  };

  const splitColumns = (counts) => {
    if (!useColumns) {
      const total = counts.reduce((sum, value) => sum + value, 0);
      return { left: card.guests, right: [], maxLines: total };
    }
    const total = counts.reduce((sum, value) => sum + value, 0);
    let bestSplit = Math.max(1, Math.floor(card.guests.length / 2));
    let bestDifference = Infinity;
    let accumulated = 0;
    for (let split = 1; split < card.guests.length; split++) {
      accumulated += counts[split - 1];
      const difference = Math.abs(accumulated - (total - accumulated));
      if (difference < bestDifference) {
        bestDifference = difference;
        bestSplit = split;
      }
    }
    const left = card.guests.slice(0, bestSplit);
    const right = card.guests.slice(bestSplit);
    const leftLines = counts.slice(0, bestSplit).reduce((sum, value) => sum + value, 0);
    const rightLines = counts.slice(bestSplit).reduce((sum, value) => sum + value, 0);
    return { left, right, maxLines: Math.max(leftLines, rightLines) };
  };

  let guestPt = baseGuestPt;
  let guestSplit = { left: card.guests, right: [], maxLines: n };
  if (n > 0) {
    for (let pass = 0; pass < 6; pass++) {
      guestSplit = splitColumns(nameLineCounts(guestPt));
      const neededPx = guestSplit.maxLines * guestPt * (PX_PER_IN / PT_PER_IN) * lineHeight;
      if (neededPx <= availablePx) break;
      guestPt = Math.max(6, guestPt * (availablePx / neededPx) * 0.97);
    }
    // Avoid breaking an unusually long single name mid-word.
    const longestWord = card.guests
      .flatMap(name => name.split(/[\s-]+/))
      .reduce((longest, word) => word.length > longest.length ? word : longest, '');
    const wordFit = fitFontSize(
      project.typography.guestUpper ? longestWord.toUpperCase() : longestWord,
      guestStack,
      {
        basePt: guestPt,
        maxWidthIn: columnWidthIn * 0.9,
        minPt: 6,
        spacingEm: guestSpacing
      }
    );
    if (wordFit < guestPt) {
      guestPt = wordFit;
      guestSplit = splitColumns(nameLineCounts(guestPt));
    }
  }
  const overflow = n > 0 && guestPt <= 6.01 && guestSplit.maxLines * guestPt * (PX_PER_IN / PT_PER_IN) * lineHeight > availablePx + 0.5;

  const listMarkup = (names) => `<ul class="print-guests">${names.map(name => `<li>${esc(name)}</li>`).join('')}</ul>`;
  const guestsMarkup = useColumns
    ? `<div class="print-guest-columns" style="column-gap:${inPx(columnGapIn)}px">${listMarkup(guestSplit.left)}${listMarkup(guestSplit.right)}</div>`
    : listMarkup(card.guests);

  const el = document.createElement('div');
  el.className = `print-table-card${overflow ? ' is-overflow' : ''}`;
  el.style.setProperty('--print-pad', `${padPx}px`);
  el.style.setProperty('--print-label-size', `${labelPt}pt`);
  el.style.setProperty('--print-guest-size', `${guestPt}pt`);
  el.style.setProperty('--print-rule-top', `${ruleTop}px`);
  el.style.setProperty('--print-rule-bottom', `${ruleBottom}px`);
  el.innerHTML = `<div class="print-label">${esc(card.label || 'Table')}</div>
    <div class="print-card-rule"></div>${guestsMarkup}`;
  return { el, guestPt, overflow };
}

function nameCardElement(project, guest, size, settings) {
  const padIn = Math.min(0.24, size.w * 0.06);
  const padPx = inPx(padIn);
  const nameStack = FONT_MAP[project.typography.labelFont]?.stack || FONT_MAP.parisienne.stack;
  const nameBase = size.w * 0.135 * 72;
  const namePt = fitFontSize(guest.name, nameStack, {
    basePt: nameBase,
    maxWidthIn: (size.w - padIn * 2) * 0.96,
    italic: project.typography.labelItalic,
    minPt: 9
  });
  const guestStack = FONT_MAP[project.typography.guestFont]?.stack || FONT_MAP.montserrat.stack;
  const tableSize = fitFontSize(String(guest.table || 'Table').toUpperCase(), guestStack, {
    basePt: Math.max(7.5, size.w * 0.032 * 72),
    maxWidthIn: (size.w - padIn * 2) * 0.9,
    minPt: 6,
    spacingEm: Math.max(0.12, project.typography.guestSpacing || 0)
  });
  const tent = size.fold && settings.style === 'tent';
  const flatHeight = size.h;
  const panelHeight = tent ? flatHeight / 2 : flatHeight;

  const el = document.createElement('div');
  el.className = 'print-name-card';
  el.style.setProperty('--print-name-pad', `${padPx}px`);
  el.style.setProperty('--print-name-size', `${namePt}pt`);
  el.style.setProperty('--print-table-size', `${tableSize}pt`);
  el.style.setProperty('--print-name-rule-w', `${inPx(size.w * 0.18)}px`);
  el.style.setProperty('--print-name-rule-margin', `${inPx(size.w * 0.018)}px 0 ${inPx(size.w * 0.014)}px`);

  const panel = `<div class="print-name-text">${esc(guest.name)}</div>
    ${settings.showTable ? `<div class="print-name-rule"></div><div class="print-name-table">${esc(guest.table)}</div>` : ''}`;

  if (tent) {
    el.innerHTML = `
      <div class="print-name-panel print-name-panel--top" style="top:0;height:${inPx(panelHeight)}px">${panel}</div>
      <div class="print-name-panel" style="top:${inPx(panelHeight)}px;height:${inPx(panelHeight)}px">${panel}</div>
      ${settings.foldLine ? '<span class="print-fold"></span>' : ''}
      ${settings.border ? '<span class="print-hairline"></span>' : ''}`;
  } else {
    el.innerHTML = `<div class="print-name-panel" style="top:0;height:100%">${panel}</div>
      ${settings.border ? '<span class="print-hairline"></span>' : ''}`;
  }
  return { el, namePt };
}

/* ---------- sheets ---------- */

function addCropMarks(sheet, x, y, w, h) {
  const off = 0.03;
  const len = 0.105;
  const thick = 0.0075;
  const marks = [
    [x - len, y - thick / 2, len - off, thick],
    [x - thick / 2, y - len, thick, len - off],
    [x + w + off, y - thick / 2, len - off, thick],
    [x + w - thick / 2, y - len, thick, len - off],
    [x - len, y + h - thick / 2, len - off, thick],
    [x - thick / 2, y + h + off, thick, len - off],
    [x + w + off, y + h - thick / 2, len - off, thick],
    [x + w - thick / 2, y + h + off, thick, len - off]
  ];
  for (const [left, top, width, height] of marks) {
    const span = document.createElement('span');
    span.className = 'print-crop';
    span.style.left = `${inPx(left)}px`;
    span.style.top = `${inPx(top)}px`;
    span.style.width = `${inPx(width)}px`;
    span.style.height = `${inPx(height)}px`;
    sheet.appendChild(span);
  }
}

function buildSheet(project, plan, pageIndex, buildCard) {
  const safePage = clamp(pageIndex, 0, Math.max(0, plan.pageCount - 1));
  const items = plan.layout === 'single'
    ? plan.items.slice(safePage, safePage + 1)
    : plan.items.slice(safePage * plan.perSheet, (safePage + 1) * plan.perSheet);

  const sheet = document.createElement('div');
  sheet.className = 'print-sheet' + (plan.layout === 'single' ? ' print-sheet--single' : '');
  sheet.style.width = `${inPx(plan.pageW)}px`;
  sheet.style.height = `${inPx(plan.pageH)}px`;
  setTypography(sheet, project);

  if (plan.layout === 'single') {
    if (items[0]) {
      const wrap = document.createElement('div');
      wrap.className = 'print-item';
      wrap.style.cssText = `left:0;top:0;width:100%;height:100%;`;
      wrap.appendChild(buildCard(items[0]));
      sheet.appendChild(wrap);
    }
    return { el: sheet, plan, pageIndex: safePage };
  }

  // Keep partial pages aligned with the full grid so cut stacks stay consistent.
  const fullGridH = plan.rows * plan.cardH + (plan.rows - 1) * SHEET_GAP;
  const startY = (plan.pageH - fullGridH) / 2;

  items.forEach((item, index) => {
    const row = Math.floor(index / plan.cols);
    const column = index % plan.cols;
    const rowCount = Math.min(plan.cols, items.length - row * plan.cols);
    const rowW = rowCount * plan.cardW + (rowCount - 1) * SHEET_GAP;
    const startX = (plan.pageW - rowW) / 2;
    const x = startX + column * (plan.cardW + SHEET_GAP);
    const y = startY + row * (plan.cardH + SHEET_GAP);

    const wrap = document.createElement('div');
    wrap.className = 'print-item';
    wrap.style.left = `${inPx(x)}px`;
    wrap.style.top = `${inPx(y)}px`;
    wrap.style.width = `${inPx(plan.cardW)}px`;
    wrap.style.height = `${inPx(plan.cardH)}px`;
    wrap.appendChild(buildCard(item));
    sheet.appendChild(wrap);
    if (plan.settings.cropMarks && plan.layout === 'sheet') addCropMarks(sheet, x, y, plan.cardW, plan.cardH);
  });

  return { el: sheet, plan, pageIndex: safePage };
}

export function buildTableCardsSheet(project, pageIndex = 0, settings = printSettings(project).tableCards, cards = project.cards) {
  const plan = planTableCards(project, settings, cards);
  const built = buildSheet(project, plan, pageIndex, card => tableCardElement(project, card, plan.size, plan).el);
  return { ...built, plan };
}

export function buildNameCardsSheet(project, pageIndex = 0, settings = printSettings(project).nameCards) {
  const plan = planNameCards(project, settings);
  const built = buildSheet(project, plan, pageIndex, guest => nameCardElement(project, guest, plan.size, plan.settings).el);
  return { ...built, plan };
}

/* ---------- rendering & export ---------- */

export async function renderPrintPage(project, variant, pageIndex, settings, dpi = 300) {
  await waitForFonts();
  const built = variant === 'tables'
    ? buildTableCardsSheet(project, pageIndex, settings)
    : buildNameCardsSheet(project, pageIndex, settings);
  if (!built.plan.total) throw new Error('There is nothing to print yet.');
  const canvas = await renderElementToCanvas(built.el, {
    cssWidth: inPx(built.plan.pageW),
    cssHeight: inPx(built.plan.pageH),
    targetWidth: inPx(built.plan.pageW) * (dpi / 96),
    stylesheet: './css/print.css'
  });
  return { canvas, plan: built.plan, pageIndex: built.pageIndex };
}

export async function generatePrintPages(project, variant, settings, { onProgress, dpi = 300 } = {}) {
  await waitForFonts();
  const plan = variant === 'tables'
    ? planTableCards(project, settings)
    : planNameCards(project, settings);
  if (!plan.total) throw new Error(variant === 'tables' ? 'Add a table first.' : 'Add guest names first.');
  const pages = [];
  for (let index = 0; index < plan.pageCount; index++) {
    onProgress?.(index + 1, plan.pageCount);
    const built = variant === 'tables'
      ? buildTableCardsSheet(project, index, settings)
      : buildNameCardsSheet(project, index, settings);
    const canvas = await renderElementToCanvas(built.el, {
      cssWidth: inPx(plan.pageW),
      cssHeight: inPx(plan.pageH),
      targetWidth: inPx(plan.pageW) * (dpi / 96),
      stylesheet: './css/print.css'
    });
    pages.push({
      dataUrl: canvas.toDataURL('image/jpeg', 0.94),
      imageWidth: canvas.width,
      imageHeight: canvas.height,
      pageWidth: inPt(plan.pageW),
      pageHeight: inPt(plan.pageH),
      widthIn: plan.pageW,
      heightIn: plan.pageH
    });
    // Let the UI paint its progress state between heavy pages.
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return { pages, plan };
}

function printFilename(project, variant) {
  return `${slugify(project.name)}-${variant === 'tables' ? 'table-cards' : 'name-cards'}.pdf`;
}

export async function exportPrintPdf(project, variant, settings, { onProgress } = {}) {
  const { pages, plan } = await generatePrintPages(project, variant, settings, { onProgress });
  const pdfPages = pages.map(page => ({
    jpeg: dataUrlToBytes(page.dataUrl),
    imageWidth: page.imageWidth,
    imageHeight: page.imageHeight,
    pageWidth: page.pageWidth,
    pageHeight: page.pageHeight
  }));
  const bytes = makePdfPages(pdfPages, `${project.name} — ${variant === 'tables' ? 'Table cards' : 'Name cards'}`);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  downloadBlob(blob, printFilename(project, variant));
  return { pageCount: plan.pageCount, total: plan.total, perSheet: plan.perSheet, bytes: blob.size };
}

export async function printPrintSheets(project, variant, settings, { onProgress } = {}) {
  const win = window.open('', '_blank');
  if (!win) throw new Error('Your browser blocked the print window. Allow pop-ups and try again.');
  win.document.write('<!doctype html><title>Preparing print…</title><body style="font-family:sans-serif;padding:40px;color:#444">Preparing your cards for print…</body>');
  win.document.close();
  try {
    const { pages, plan } = await generatePrintPages(project, variant, settings, { onProgress });
    const widthIn = plan.pageW.toFixed(3);
    const heightIn = plan.pageH.toFixed(3);
    const title = esc(project.name);
    const images = pages.map((page, index) => `<section class="print-page"><img src="${page.dataUrl}" alt="Page ${index + 1}"></section>`).join('');
    win.document.open();
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title} — ${variant === 'tables' ? 'Table cards' : 'Name cards'}</title>
      <style>
        @page { size: ${widthIn}in ${heightIn}in; margin: 0; }
        html, body { margin: 0; padding: 0; background: #fff; }
        .print-page { width: ${widthIn}in; height: ${heightIn}in; page-break-after: always; break-after: page; display: flex; align-items: center; justify-content: center; overflow: hidden; }
        .print-page:last-child { page-break-after: auto; break-after: auto; }
        .print-page img { width: 100%; height: 100%; display: block; object-fit: contain; }
        @media screen {
          body { background: #2a2722; padding: 20px; }
          .print-page { margin: 0 auto 20px; box-shadow: 0 18px 50px rgba(0,0,0,.35); background: #fff; }
        }
      </style></head><body>${images}
      <script>
        Promise.all([...document.images].map(image => image.decode().catch(() => {}))).then(() => {
          setTimeout(() => { window.focus(); window.print(); }, 200);
        });
      <\/script></body></html>`);
    win.document.close();
    return { pageCount: plan.pageCount, total: plan.total };
  } catch (error) {
    win.close();
    throw error;
  }
}

/** Individual one-page PDF for a single table card. */
export async function downloadTableCardPdf(project, card, settings = printSettings(project).tableCards) {
  await waitForFonts();
  const plan = planTableCards(project, { ...settings, layout: 'single' }, [card]);
  const built = buildTableCardsSheet(project, 0, { ...settings, layout: 'single' }, [card]);
  const canvas = await renderElementToCanvas(built.el, {
    cssWidth: inPx(plan.pageW),
    cssHeight: inPx(plan.pageH),
    targetWidth: inPx(plan.pageW) * (300 / 96),
    stylesheet: './css/print.css'
  });
  const page = {
    jpeg: dataUrlToBytes(canvas.toDataURL('image/jpeg', 0.95)),
    imageWidth: canvas.width,
    imageHeight: canvas.height,
    pageWidth: inPt(plan.pageW),
    pageHeight: inPt(plan.pageH)
  };
  const bytes = makePdfPages([page], `${project.name} — ${card.label}`);
  downloadBlob(new Blob([bytes], { type: 'application/pdf' }), `${slugify(project.name)}-${slugify(card.label)}.pdf`);
  return { bytes: bytes.length };
}
