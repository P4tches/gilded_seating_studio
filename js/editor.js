/* ============================================================
   GILDED — editor
   Panels, artboard interaction, drag, zoom, history and export UI.
   ============================================================ */

import {
  BACKGROUNDS, FRAMES, PINS, FONTS, PAGE_RATIOS, PRESETS,
  clone, computeLayout, applyAutoPositions, autoFitTables,
  applyPreset, setRatio, ratioKeyOf, projectStats, nextTableLabel, uid,
  ensureGuestRoster, syncGuestAssignments, parseGuestList
} from './model.js';
import { renderArtboard } from './render.js';
import { saveProject, deleteProject } from './db.js';
import {
  exportPng, exportPdf, printProject, projectToJson, PNG_WIDTHS, PAGE_SIZES
} from './export.js';
import {
  PAPERS, TABLE_SIZES, NAME_SIZES, NAME_STYLES, printSettings, inPx,
  planTableCards, planNameCards, buildTableCardsSheet, buildNameCardsSheet,
  exportPrintPdf, printPrintSheets, downloadTableCardPdf
} from './print.js';
import { icon } from './icons.js';
import {
  $, $$, el, esc, toast, openModal, confirmDialog, downloadText, slugify,
  preparePhoto, isTypingTarget, clamp, debounce
} from './utils.js';

const HISTORY_LIMIT = 80;
const COALESCE_MS = 900;

/* ---------- helpers ---------- */

function getPath(object, path) {
  return path.split('.').reduce((value, key) => value?.[key], object);
}

function setPath(object, path, value) {
  const parts = path.split('.');
  let cursor = object;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cursor[parts[i]] === undefined || cursor[parts[i]] === null) cursor[parts[i]] = {};
    cursor = cursor[parts[i]];
  }
  cursor[parts[parts.length - 1]] = value;
}

const fmt = (value) => {
  if (typeof value !== 'number') return String(value ?? '');
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 100) / 100);
};

function guestPreview(names) {
  if (!names || !names.length) return 'No names assigned yet.';
  const shown = names.slice(0, 3).map(esc).join(' · ');
  return names.length > 3 ? `${shown} <span class="guest-more">+${names.length - 3}</span>` : shown;
}

const fontOptions = (selected) => FONTS.map(font =>
  `<option value="${font.id}" ${font.id === selected ? 'selected' : ''}>${esc(font.label)}</option>`
).join('');

const optionButtons = (path, options, current) => `
  <div class="option-grid" data-option-group="${path}">
    ${options.map(option => `<button class="option-btn ${String(current) === String(option.id) ? 'is-active' : ''}" type="button" data-option-path="${path}" data-option-value="${esc(option.id)}">${esc(option.label)}</button>`).join('')}
  </div>`;

function rangeField(label, path, value, min, max, step, unit = '') {
  return `<label class="field">
    <span class="field-label">${label}<span class="field-value" data-out="${path}" data-unit="${unit}">${fmt(value)}${unit ? ' ' + unit : ''}</span></span>
    <input class="range" type="range" data-path="${path}" min="${min}" max="${max}" step="${step}" value="${value}">
  </label>`;
}

function selectField(label, path, value, options) {
  return `<label class="field">
    <span class="field-label">${label}</span>
    <select class="select" data-path="${path}">${options.map(option =>
      `<option value="${esc(option.value ?? option.id)}" ${String(value) === String(option.value ?? option.id) ? 'selected' : ''}>${esc(option.label)}</option>`
    ).join('')}</select>
  </label>`;
}

function colorField(label, path, value) {
  return `<label class="field">
    <span class="field-label">${label}</span>
    <div class="color-row">
      <input class="color-input" type="color" data-path="${path}" value="${esc(value)}" aria-label="${esc(label)}">
      <input class="input color-hex" type="text" data-path="${path}" data-hex="true" value="${esc(value)}" maxlength="7" spellcheck="false" aria-label="${esc(label)} hex value">
    </div>
  </label>`;
}

function switchField(label, path, checked) {
  return `<label class="switch">
    <span class="switch-text">${label}</span>
    <input type="checkbox" data-path="${path}" ${checked ? 'checked' : ''}>
    <span class="switch-track"></span>
  </label>`;
}

/* ---------- markup ---------- */

function editorShell(project, cardCount, guestCount) {
  return `<div class="editor" id="editor">
    <header class="topbar">
      <div class="topbar-left">
        <button class="icon-btn back-btn" type="button" data-action="back" aria-label="All charts" title="All charts">${icon('arrow-left', 18)}</button>
        <span class="divider-v"></span>
        <div class="project-name-wrap">
          <input class="project-name" id="project-name" value="${esc(project.name)}" maxlength="90" aria-label="Chart name" spellcheck="false">
        </div>
        <span class="save-state" id="save-state">Saved</span>
      </div>
      <div class="topbar-right">
        <div class="topbar-tools">
          <button class="icon-btn" type="button" data-action="undo" aria-label="Undo" title="Undo (Ctrl/⌘ Z)" disabled>${icon('undo', 18)}</button>
          <button class="icon-btn" type="button" data-action="redo" aria-label="Redo" title="Redo (Ctrl/⌘ Shift Z)" disabled>${icon('redo', 18)}</button>
        </div>
        <button class="btn btn-ghost" type="button" data-action="preview">${icon('eye', 17)}<span class="btn-label">Preview</span></button>
        <button class="btn btn-gold" type="button" data-action="print">${icon('printer', 17)}<span class="btn-label">Print</span></button>
        <div class="menu-wrap">
          <button class="icon-btn" type="button" data-action="menu" aria-label="More actions" aria-haspopup="menu">${icon('more', 19)}</button>
          <div class="menu" id="editor-menu" role="menu">
            <div class="menu-note">This chart</div>
            <button class="menu-item" type="button" data-menu-action="duplicate">${icon('copy', 15)} Duplicate chart</button>
            <button class="menu-item" type="button" data-menu-action="backup">${icon('download', 15)} Download project file</button>
            <button class="menu-item" type="button" data-menu-action="mirror-export">${icon('image', 15)} Export mirror image</button>
            <button class="menu-item" type="button" data-menu-action="save">${icon('check', 15)} Save now</button>
            <div class="menu-sep"></div>
            <button class="menu-item" type="button" data-menu-action="shortcuts">${icon('type', 15)} Keyboard shortcuts</button>
            <button class="menu-item" type="button" data-menu-action="guide">${icon('sparkles', 15)} How Gilded works</button>
            <div class="menu-sep"></div>
            <button class="menu-item menu-item--danger" type="button" data-menu-action="delete">${icon('trash', 15)} Delete chart</button>
          </div>
        </div>
      </div>
    </header>

    <div class="editor-body">
      <aside class="sidebar" id="sidebar" aria-label="Design controls">
        <div class="sidebar-tabs" role="tablist">
          <button class="sidebar-tab is-active" type="button" data-tab="design" role="tab">${icon('palette', 15)} Design</button>
          <button class="sidebar-tab" type="button" data-tab="tables" role="tab">${icon('table', 15)} Tables <span class="tab-count" id="tables-tab-count">${cardCount}</span></button>
          <button class="sidebar-tab" type="button" data-tab="guests" role="tab">${icon('users', 15)} Guests <span class="tab-count" id="guests-tab-count">${guestCount}</span></button>
        </div>
        <div class="sidebar-scroll" id="sidebar-scroll">
          <section class="sidebar-panel is-active" id="panel-design" role="tabpanel" aria-label="Design"></section>
          <section class="sidebar-panel" id="panel-tables" role="tabpanel" aria-label="Tables"></section>
          <section class="sidebar-panel" id="panel-guests" role="tabpanel" aria-label="Guests"></section>
        </div>
      </aside>

      <div class="stage-wrap" id="stage-wrap">
        <div class="stage" id="stage">
          <div class="stage-canvas" id="stage-canvas">
            <div class="artboard-scaler" id="artboard-scaler"></div>
          </div>
        </div>
        <div class="stage-badges" id="stage-badges"></div>
        <div class="zoom-pill" role="group" aria-label="Zoom">
          <button class="icon-btn" type="button" data-action="zoom-out" aria-label="Zoom out">${icon('minus', 15)}</button>
          <button class="zoom-label" type="button" data-action="zoom-fit" title="Fit to screen">100%</button>
          <button class="icon-btn" type="button" data-action="zoom-in" aria-label="Zoom in">${icon('plus', 15)}</button>
          <span class="zoom-sep"></span>
          <button class="icon-btn" type="button" data-action="zoom-fit" aria-label="Fit to screen" title="Fit to screen">${icon('fit', 15)}</button>
        </div>
      </div>

      <aside class="inspector" id="inspector" aria-label="Selected table card"></aside>
    </div>

    <nav class="mobile-nav" aria-label="Editor panels">
      <button type="button" data-mobile="design">${icon('palette', 18)}<span>Design</span></button>
      <button type="button" data-mobile="tables">${icon('table', 18)}<span>Tables</span></button>
      <button type="button" data-mobile="guests">${icon('users', 18)}<span>Guests</span></button>
      <button type="button" data-mobile="card">${icon('sliders', 18)}<span>Card</span></button>
    </nav>
    <div class="drawer-backdrop" id="drawer-backdrop"></div>
  </div>
  <input type="file" id="photo-input" accept="image/*" hidden>`;
}

/* ---------- mount ---------- */

export function mountEditor(root, incomingProject, options = {}) {
  const project = clone(incomingProject);
  ensureGuestRoster(project);
  root.innerHTML = editorShell(project, project.cards.length, project.guests.length);

  const editor = $('#editor', root);
  const stage = $('#stage', root);
  const stageWrap = $('#stage-wrap', root);
  const stageCanvas = $('#stage-canvas', root);
  const scaler = $('#artboard-scaler', root);
  const sidebar = $('#sidebar', root);
  const sidebarScroll = $('#sidebar-scroll', root);
  const panelDesign = $('#panel-design', root);
  const panelTables = $('#panel-tables', root);
  const panelGuests = $('#panel-guests', root);
  const inspector = $('#inspector', root);
  const stageBadges = $('#stage-badges', root);
  const zoomReadout = $('.zoom-label', root);
  const saveState = $('#save-state', root);
  const projectName = $('#project-name', root);
  const menu = $('#editor-menu', root);
  const backdrop = $('#drawer-backdrop', root);
  const photoInput = $('#photo-input', root);
  const mobileButtons = $$('[data-mobile]', root);
  const topbar = $('.topbar', root);

  const state = {
    project,
    past: [],
    future: [],
    selectedId: null,
    zoom: 1,
    fitScale: 1,
    activeTab: 'design',
    activeDrawer: null,
    openTables: new Set(project.cards[0] ? [project.cards[0].id] : []),
    lastHistoryKey: null,
    lastHistoryAt: 0,
    drag: null,
    destroyed: false,
    skipSaveOnDestroy: false,
    preview: null,
    selectedGuestId: null,
    guestSearch: '',
    guestAddOpen: project.guests.length === 0,
    guestPanelBuilt: false,
    guestHighlightTable: null,
    guestDrag: null,
    guestSuppressClick: false
  };

  const cleanups = [];
  const listen = (target, type, handler, opts) => {
    target.addEventListener(type, handler, opts);
    cleanups.push(() => target.removeEventListener(type, handler, opts));
  };

  state.project.print = printSettings(state.project);
  document.title = `${project.name} · Gilded`;

  /* ---------- save ---------- */

  function setSaveState(kind) {
    if (!saveState) return;
    saveState.classList.toggle('is-saving', kind === 'saving');
    saveState.classList.toggle('is-error', kind === 'error');
    saveState.textContent = kind === 'saving' ? 'Saving…' : kind === 'error' ? 'Not saved' : 'Saved';
  }

  async function persist() {
    if (state.destroyed && state.skipSaveOnDestroy) return;
    setSaveState('saving');
    try {
      await saveProject(clone(state.project));
      if (!state.destroyed) setSaveState('saved');
    } catch (error) {
      console.error(error);
      setSaveState('error');
      if (!state.destroyed) toast('This chart could not be saved. Storage may be full.', { tone: 'error' });
    }
  }

  const saveLater = debounce(persist, 480);

  async function flushSave() {
    saveLater.cancel();
    await persist();
  }

  /* ---------- history ---------- */

  function pushHistory(snapshot) {
    state.past.push(snapshot);
    if (state.past.length > HISTORY_LIMIT) state.past.shift();
    state.future = [];
    state.lastHistoryKey = null;
    state.lastHistoryAt = 0;
    updateHistoryButtons();
  }

  function updateHistoryButtons() {
    const undo = $('[data-action="undo"]', root);
    const redo = $('[data-action="redo"]', root);
    if (undo) undo.disabled = state.past.length === 0;
    if (redo) redo.disabled = state.future.length === 0;
  }

  function apply(mutator, { history = true, key = null, render = true, rebuild = false } = {}) {
    const before = clone(state.project);
    const draft = clone(state.project);
    const result = mutator(draft) || draft;
    result.updatedAt = Date.now();

    if (history) {
      const now = Date.now();
      const coalesce = key && key === state.lastHistoryKey && now - state.lastHistoryAt < COALESCE_MS;
      if (!coalesce) pushHistory(before);
      state.lastHistoryKey = key;
      state.lastHistoryAt = now;
    }

    state.project = result;
    syncGuestAssignments(state.project);
    if (state.project.layout.auto) applyAutoPositions(state.project);
    if (state.selectedId && !state.project.cards.some(card => card.id === state.selectedId)) {
      state.selectedId = null;
      editor.classList.remove('has-selection');
      inspector.classList.remove('is-open');
    }
    if (render) renderStage();
    syncPanels(rebuild);
    if (!state.selectedId) renderInspector();
    setSaveState('saving');
    saveLater();
    updateHistoryButtons();
    updateMobileNav();
  }

  function replaceProject(next, { history = true, rebuild = true, reRenderPanels = true } = {}) {
    if (history) pushHistory(clone(state.project));
    state.project = clone(next);
    ensureGuestRoster(state.project);
    state.project.updatedAt = Date.now();
    if (state.project.layout.auto) applyAutoPositions(state.project);
    if (state.selectedId && !state.project.cards.some(card => card.id === state.selectedId)) state.selectedId = null;
    if (reRenderPanels) {
      renderDesignPanel();
      renderTablesPanel();
    }
    renderStage();
    renderInspector();
    syncPanels(rebuild);
    setSaveState('saving');
    saveLater();
    updateHistoryButtons();
    updateMobileNav();
  }

  function undo() {
    if (!state.past.length) return;
    const snapshot = state.past.pop();
    state.future.push(clone(state.project));
    if (state.future.length > HISTORY_LIMIT) state.future.shift();
    replaceProject(snapshot, { history: false, rebuild: true });
    toast('Undone.');
  }

  function redo() {
    if (!state.future.length) return;
    const snapshot = state.future.pop();
    state.past.push(clone(state.project));
    if (state.past.length > HISTORY_LIMIT) state.past.shift();
    replaceProject(snapshot, { history: false, rebuild: true });
    toast('Redone.');
  }

  /* ---------- stage scaling ---------- */

  function measureFit() {
    const cs = getComputedStyle(stage);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const availableW = Math.max(80, stage.clientWidth - padX);
    const availableH = Math.max(80, stage.clientHeight - padY);
    state.fitScale = Math.max(0.02, Math.min(availableW / state.project.width, availableH / state.project.height, 1));
  }

  function applyZoom(preserveCenter = true) {
    const oldWidth = parseFloat(stageCanvas.style.width) || 0;
    const oldHeight = parseFloat(stageCanvas.style.height) || 0;
    let centerX = 0.5;
    let centerY = 0.5;
    if (preserveCenter && oldWidth > 0) {
      centerX = (stage.scrollLeft + stage.clientWidth / 2) / oldWidth;
      centerY = (stage.scrollTop + stage.clientHeight / 2) / oldHeight;
    }
    const scale = state.fitScale * state.zoom;
    const newWidth = state.project.width * scale;
    const newHeight = state.project.height * scale;
    scaler.style.transform = `scale(${scale})`;
    stageCanvas.style.width = `${newWidth}px`;
    stageCanvas.style.height = `${newHeight}px`;
    if (preserveCenter && oldWidth > 0) {
      stage.scrollLeft = centerX * newWidth - stage.clientWidth / 2;
      stage.scrollTop = centerY * newHeight - stage.clientHeight / 2;
    }
    if (zoomReadout) zoomReadout.textContent = `${Math.round(scale * 100)}%`;
  }

  function fitToScreen() {
    state.zoom = 1;
    measureFit();
    applyZoom(false);
  }

  function setZoom(next) {
    state.zoom = clamp(next, 0.4, 6);
    applyZoom(true);
  }

  /* ---------- render ---------- */

  function renderStage() {
    const art = renderArtboard(state.project, { interactive: true });
    scaler.replaceChildren(art);
    paintSelection();
    measureFit();
    applyZoom(true);
    updateStageBadges();
  }

  function paintSelection() {
    $$('.table-card', scaler).forEach(card => {
      card.classList.toggle('is-selected', card.dataset.cardId === state.selectedId);
    });
  }

  function updateStageBadges() {
    if (!stageBadges) return;
    const stats = projectStats(state.project);
    const layout = computeLayout(state.project);
    stageBadges.innerHTML = `
      <span class="pill"><span class="dot"></span>${state.project.layout.auto ? 'Auto layout' : 'Free placement'}</span>
      <span class="pill">${stats.tables} tables · ${stats.guests} guests</span>
      ${layout.overflow ? '<span class="pill pill--warning">Runs past the page</span>' : ''}`;
  }

  function renderDesignPanel() {
    const p = state.project;
    const bg = p.theme.background;
    const t = p.typography;
    const savedScroll = sidebarScroll.scrollTop;

    const backgroundControls = bg.type === 'photo'
      ? `<div class="photo-preview">
            ${bg.image
              ? `<img src="${bg.image}" alt="Chart background photo">`
              : `<div class="photo-placeholder">${icon('image', 22)}<span>Add a photo of your mirror or venue</span></div>`}
          </div>
          <div class="btn-row" style="margin-bottom:12px">
            <button class="btn btn-dark btn-sm" type="button" data-action="upload-photo">${icon('image', 15)} ${bg.image ? 'Replace photo' : 'Choose photo'}</button>
            ${bg.image ? `<button class="btn btn-ghost btn-sm" type="button" data-action="remove-photo">${icon('trash', 15)} Remove</button>` : ''}
          </div>
          ${rangeField('Photo overlay', 'theme.background.overlay', bg.overlay ?? 0, 0, 0.9, 0.01, '')}
          <p class="field-note">A warm overlay keeps the gold lettering readable on busy photos.</p>`
      : bg.type === 'mirror'
        ? `<div class="field-note" style="margin:0 0 2px">Soft garden light and glass reflections are built in — no photo needed.</div>`
        : colorField('Paper colour', 'theme.background.color', bg.color);

    panelDesign.innerHTML = `
      <section class="section">
        <div class="section-head">
          <h3 class="section-title">The look</h3>
          <span class="section-action">${esc((p.theme.preset || 'custom').replace(/^./, c => c.toUpperCase()))}</span>
        </div>
        <div class="preset-grid">
          ${['gilded', 'ivory', 'garden', 'noir', 'blush'].map(id => {
            const preset = PRESETS[id];
            if (!preset) return '';
            const style = presetThumbStyleInline(preset);
            return `<button class="preset-card ${p.theme.preset === id ? 'is-active' : ''}" type="button" data-preset="${id}" title="${esc(preset.tagline)}">
              <span class="preset-check">${icon('check', 10, 2.6)}</span>
              <span class="preset-thumb" style="${style}">Aa</span>
              <span class="preset-meta"><span class="preset-name">${esc(preset.name)}</span>
                <span class="preset-dots">${preset.swatches.map(color => `<i style="background:${color}"></i>`).join('')}</span>
              </span>
            </button>`;
          }).join('')}
        </div>
      </section>

      <section class="section">
        <h3 class="section-title" style="margin-bottom:11px">Page &amp; background</h3>
        ${selectField('Proportion', 'ratio', ratioKeyOf(p), Object.entries(PAGE_RATIOS).map(([id, ratio]) => ({ id, label: ratio.label })))}
        <div class="field">
          <span class="field-label">Background</span>
          ${optionButtons('theme.background.type', BACKGROUNDS, bg.type)}
        </div>
        ${backgroundControls}
        <div class="field" style="margin-top:13px">
          <span class="field-label">Frame</span>
          ${optionButtons('theme.frame.style', FRAMES, p.theme.frame.style)}
        </div>
        ${p.theme.frame.style !== 'none' ? colorField('Frame metal', 'theme.frame.color', p.theme.frame.color) : ''}
      </section>

      <section class="section">
        <div class="section-head"><h3 class="section-title">Title &amp; date</h3></div>
        <label class="field">
          <span class="field-label">Headline <span class="field-value">Enter for a new line</span></span>
          <textarea class="textarea" data-path="header.title" rows="2" style="min-height:54px" spellcheck="false">${esc(p.header.title)}</textarea>
        </label>
        <label class="field">
          <span class="field-label">Date or subtitle</span>
          <input class="input" type="text" data-path="header.date" value="${esc(p.header.date)}" spellcheck="false">
        </label>
        <div style="display:grid;gap:8px;margin:2px 0 12px">
          ${switchField('Show the date', 'header.showDate', p.header.showDate)}
          ${switchField('Flanking rules', 'header.divider', p.header.divider)}
        </div>
        <div class="input-row">
          ${selectField('Headline font', 'typography.titleFont', t.titleFont, FONTS.map(f => ({ id: f.id, label: f.label })))}
          ${selectField('Date font', 'typography.dateFont', t.dateFont, FONTS.map(f => ({ id: f.id, label: f.label })))}
        </div>
        ${switchField('Italic headline', 'typography.titleItalic', t.titleItalic)}
        <div style="height:10px"></div>
        ${rangeField('Headline size', 'typography.titleSize', t.titleSize, 50, 340, 1, 'px')}
        ${rangeField('Date size', 'typography.dateSize', t.dateSize, 14, 78, 1, 'px')}
        ${rangeField('Date tracking', 'typography.dateSpacing', t.dateSpacing, 0, 0.6, 0.01, 'em')}
        ${rangeField('Headline tracking', 'typography.titleSpacing', t.titleSpacing, -0.05, 0.25, 0.005, 'em')}
        ${rangeField('Headline line height', 'typography.titleLineHeight', t.titleLineHeight, 0.8, 1.5, 0.01, '')}
        ${rangeField('Title width', 'header.maxWidth', p.header.maxWidth, 40, 98, 1, '%')}
        ${rangeField('Title position', 'header.y', p.header.y, 40, 1600, 2, 'px')}
      </section>

      <section class="section">
        <div class="section-head"><h3 class="section-title">Table cards</h3></div>
        <div class="input-row">
          ${selectField('Table name font', 'typography.labelFont', t.labelFont, FONTS.map(f => ({ id: f.id, label: f.label })))}
          ${selectField('Guest font', 'typography.guestFont', t.guestFont, FONTS.map(f => ({ id: f.id, label: f.label })))}
        </div>
        ${switchField('Italic table names', 'typography.labelItalic', t.labelItalic)}
        <div style="height:10px"></div>
        ${rangeField('Table name size', 'typography.labelSize', t.labelSize, 20, 150, 1, 'px')}
        ${rangeField('Guest name size', 'typography.guestSize', t.guestSize, 8, 44, 0.5, 'px')}
        ${rangeField('Guest line height', 'typography.guestLineHeight', t.guestLineHeight, 1, 2.4, 0.01, '')}
        ${rangeField('Guest tracking', 'typography.guestSpacing', t.guestSpacing, 0, 0.4, 0.005, 'em')}
        ${switchField('Uppercase guest names', 'typography.guestUpper', t.guestUpper)}
        <div style="height:12px"></div>
        ${colorField('Card colour', 'theme.card.bg', p.theme.card.bg)}
        ${colorField('Table name ink', 'theme.card.labelColor', p.theme.card.labelColor)}
        ${colorField('Guest ink', 'theme.card.guestColor', p.theme.card.guestColor)}
        <div class="input-row">
          ${selectField('Pin style', 'theme.card.pin', p.theme.card.pin, PINS.map(pin => ({ id: pin.id, label: pin.label })))}
          ${selectField('Card shadow', 'theme.card.shadow', String(p.theme.card.shadow), [{ id: 'true', label: 'Soft shadow' }, { id: 'false', label: 'Flat' }])}
        </div>
        ${p.theme.card.pin !== 'none' ? colorField('Pin colour', 'theme.card.pinColor', p.theme.card.pinColor) : ''}
        ${p.theme.card.pin !== 'none' ? rangeField('Pin size', 'theme.card.pinSize', p.theme.card.pinSize, 20, 140, 1, 'px') : ''}
        ${rangeField('Card corner radius', 'theme.card.radius', p.theme.card.radius, 0, 24, 1, 'px')}
        ${rangeField('Card border', 'theme.card.borderWidth', p.theme.card.borderWidth, 0, 6, 0.5, 'px')}
        ${p.theme.card.borderWidth > 0 ? colorField('Border colour', 'theme.card.border', p.theme.card.border) : ''}
      </section>

      <section class="section">
        <div class="section-head">
          <h3 class="section-title">Layout</h3>
          ${!p.layout.auto ? '<span class="section-action">Free placement</span>' : ''}
        </div>
        ${switchField('Auto layout', 'layout.auto', p.layout.auto)}
        <p class="field-note" style="margin:5px 0 12px">${p.layout.auto ? 'Cards are arranged in a tidy grid. Drag any card to place it freely.' : 'Cards keep their positions. “Tidy up” re-enables the grid.'}</p>
        ${rangeField('Columns', 'layout.columns', p.layout.columns, 1, 6, 1, '')}
        ${rangeField('Column gap', 'layout.gapX', p.layout.gapX, 0, 300, 1, 'px')}
        ${rangeField('Row gap', 'layout.gapY', p.layout.gapY, 0, 300, 1, 'px')}
        ${rangeField('Side margin', 'layout.marginX', p.layout.marginX, 0, 500, 1, 'px')}
        ${rangeField('Grid top', 'layout.top', p.layout.top, 300, 1800, 2, 'px')}
        ${selectField('Vertical balance', 'layout.vAlign', p.layout.vAlign, [{ id: 'top', label: 'Start from the top' }, { id: 'center', label: 'Centre on the page' }])}
        <div class="btn-row" style="margin-top:12px">
          <button class="btn btn-dark btn-sm" type="button" data-action="tidy">${icon('layout-grid', 15)} Tidy up</button>
          <button class="btn btn-dark btn-sm" type="button" data-action="fit-page">${icon('fit', 15)} Fit to page</button>
        </div>
        ${layoutOverflowMessage()}
      </section>`;

    requestAnimationFrame(() => { sidebarScroll.scrollTop = savedScroll; });
  }

  function layoutOverflowMessage() {
    const layout = computeLayout(state.project);
    if (!layout.overflow) {
      return `<p class="field-note" style="margin-top:10px">Table grid ends at ${Math.round(layout.bottom)} of ${state.project.height} px.</p>`;
    }
    return `<p class="field-note field-note--warning" style="margin-top:10px">The tables run past the page bottom. Use <strong>Fit to page</strong> or add a column.</p>`;
  }

  function presetThumbStyleInline(preset) {
    const bg = preset.theme.background;
    const background = bg.type === 'mirror'
      ? 'radial-gradient(70% 55% at 50% 18%, rgba(255,255,255,.55), transparent 60%), linear-gradient(150deg,#d6ddd2,#b8c4b7 55%,#e8e0ce)'
      : bg.color;
    return `background:${background};color:${preset.theme.ink};font-family:${FONTS.find(f => f.id === preset.typography.titleFont)?.stack || 'serif'};`;
  }

  function renderTablesPanel() {
    const p = state.project;
    const stats = projectStats(p);
    panelTables.innerHTML = `
      <div class="tables-toolbar">
        <button class="btn btn-gold btn-sm" type="button" data-action="add-table">${icon('plus', 15)} Add table</button>
        <button class="btn btn-dark btn-sm" type="button" data-action="renumber" title="Number generic table names in order">${icon('refresh', 15)} Renumber</button>
      </div>
      <div class="tables-summary">
        <p data-tables-stats>${stats.tables} tables · ${stats.guests} guests</p>
        <p>${icon('move', 12)} drag onto the chart</p>
      </div>
      <div class="table-list">
        ${p.cards.length ? p.cards.map((card, index) => tableItem(card, index)).join('') : `<div class="gallery-empty" style="padding:28px 10px"><h3>No tables yet</h3><p>Add your first table to start assigning guests.</p></div>`}
      </div>`;
  }

  function tableItem(card, index) {
    const open = state.openTables.has(card.id);
    const selected = card.id === state.selectedId;
    return `<div class="table-item ${open ? 'is-open' : ''} ${selected ? 'is-selected' : ''}" data-table-id="${card.id}">
      <div class="table-summary" data-action="toggle-table" data-id="${card.id}" role="button" tabindex="0" aria-expanded="${open}">
        <span class="table-index">${index + 1}</span>
        <span class="table-summary-main">
          <span class="table-summary-name">${esc(card.label || 'Table ' + (index + 1))}</span>
          <span class="table-summary-sub">${card.guests.length} ${card.guests.length === 1 ? 'guest' : 'guests'}</span>
        </span>
        <div class="table-actions">
          <button class="icon-btn" type="button" data-action="table-up" data-id="${card.id}" aria-label="Move table up" title="Move up">${icon('arrow-up', 13)}</button>
          <button class="icon-btn" type="button" data-action="table-down" data-id="${card.id}" aria-label="Move table down" title="Move down">${icon('arrow-down', 13)}</button>
          <button class="icon-btn" type="button" data-action="print-table" data-id="${card.id}" aria-label="Download this table card as a PDF" title="Download this table's PDF">${icon('printer', 13)}</button>
          <button class="icon-btn" type="button" data-action="table-delete" data-id="${card.id}" aria-label="Delete table" title="Delete table">${icon('trash', 13)}</button>
        </div>
        <span class="table-chevron">${icon('chevron-down', 14)}</span>
      </div>
      <div class="table-body" ${open ? '' : 'hidden'}>
        <label class="field">
          <span class="field-label">Table name</span>
          <input class="input" type="text" data-card-field="label" data-card-id="${card.id}" value="${esc(card.label)}" maxlength="80" spellcheck="false">
        </label>
        <div class="table-guest-row">
          <div class="table-guest-copy">
            <span class="field-label" style="margin:0">Guests <span class="field-value" data-guest-count="${card.id}">${card.guests.length} names</span></span>
            <span class="table-guest-names" data-guest-preview="${card.id}">${guestPreview(card.guests)}</span>
          </div>
          <button class="btn btn-dark btn-xs" type="button" data-action="arrange-guests" data-id="${card.id}">${icon('users', 12)} Arrange</button>
        </div>
        <div class="table-body-actions">
          <span class="guest-count">${card.guests.length ? 'Drag names in the Guests tab' : 'Add names in the Guests tab'}</span>
          <button class="btn btn-ghost btn-xs" type="button" data-action="show-card" data-id="${card.id}">Show on chart ${icon('arrow-up-right', 12)}</button>
        </div>
      </div>
    </div>`;
  }

  function renderInspector() {
    const card = state.project.cards.find(item => item.id === state.selectedId);
    if (!card) {
      inspector.innerHTML = '';
      editor.classList.remove('has-selection');
      return;
    }
    editor.classList.add('has-selection');
    const computed = computeLayout(state.project);
    const pos = state.project.layout.auto ? computed.positions[card.id] : null;
    const x = pos ? pos.x : card.x;
    const y = pos ? pos.y : card.y;
    inspector.innerHTML = `
      <div class="inspector-head">
        <div style="min-width:0">
          <span class="inspector-kicker">Table card</span>
          <h2 class="inspector-title" data-inspector-title>${esc(card.label || 'Untitled table')}</h2>
        </div>
        <button class="icon-btn" type="button" data-inspector-action="close" aria-label="Close inspector">${icon('x', 17)}</button>
      </div>
      <div class="inspector-scroll">
        <div class="section">
          <label class="field">
            <span class="field-label">Table name</span>
            <input class="input" type="text" data-inspector="label" value="${esc(card.label)}" maxlength="80" spellcheck="false">
          </label>
          <div class="field">
            <span class="field-label">Guests <span class="field-value" data-inspector-count>${card.guests.length} names</span></span>
            <p class="inspector-guest-names" data-inspector-guest-names>${guestPreview(card.guests)}</p>
          </div>
          <button class="btn btn-dark btn-sm btn-block" type="button" data-inspector-action="arrange">${icon('users', 14)} Arrange names in Guests</button>
          <p class="inspector-tip">${icon('move', 13)} Enter names once in the Guests tab, then drag them between tables.</p>
        </div>
        <div class="section">
          <h3 class="section-title" style="margin-bottom:9px">Placement</h3>
          <div class="input-row">
            <label class="field"><span class="field-label">X</span><input class="input" type="number" data-inspector="x" value="${Math.round(x)}" step="1"></label>
            <label class="field"><span class="field-label">Y</span><input class="input" type="number" data-inspector="y" value="${Math.round(y)}" step="1"></label>
          </div>
          <label class="field">
            <span class="field-label">Rotation <span class="field-value" data-out-inspector="rotation">${fmt(card.rotation || 0)}°</span></span>
            <input class="range" type="range" data-inspector="rotation" min="-10" max="10" step="0.1" value="${card.rotation || 0}">
          </label>
          <p class="field-note" data-placement-note>${state.project.layout.auto ? 'Editing a position turns off auto layout for the whole chart.' : 'This card is placed freely. Drag it on the chart, or nudge with arrow keys.'}</p>
        </div>
        <div class="section">
          <h3 class="section-title" style="margin-bottom:8px">Card styling</h3>
          <p class="field-note">Fonts, colours and pins are shared by every table. Change them in <strong>Design → Table cards</strong>.</p>
        </div>
      </div>
      <div class="inspector-foot">
        <button class="btn btn-dark" type="button" data-inspector-action="duplicate">${icon('copy', 15)} Duplicate</button>
        <button class="btn btn-danger" type="button" data-inspector-action="delete">${icon('trash', 15)} Delete</button>
      </div>`;
    syncInspector();
  }

  /* ---------- syncing ---------- */

  function syncFormValues(scope = root) {
    $$('[data-path]', scope).forEach(input => {
      if (input === document.activeElement && input.matches('input, textarea')) return;
      const path = input.dataset.path;
      if (path === 'ratio') {
        input.value = ratioKeyOf(state.project);
        return;
      }
      const value = getPath(state.project, path);
      if (value === undefined || value === null) return;
      if (input.type === 'checkbox') input.checked = Boolean(value);
      else if (input.type === 'color') input.value = value;
      else input.value = value;
    });
    $$('[data-out]', scope).forEach(output => {
      const path = output.dataset.out;
      const value = getPath(state.project, path);
      const unit = output.dataset.unit || '';
      output.textContent = `${fmt(value)}${unit ? ' ' + unit : ''}`;
    });
    const nameInput = $('#project-name', root);
    if (nameInput && nameInput !== document.activeElement) nameInput.value = state.project.name;
    const title = $('#save-state', root);
    if (title) { /* save state is managed separately */ }
  }

  function syncInspector() {
    const card = state.project.cards.find(item => item.id === state.selectedId);
    if (!card) return;
    const title = $('[data-inspector-title]', inspector);
    if (title) title.textContent = card.label || 'Untitled table';
    const count = $('[data-inspector-count]', inspector);
    if (count) count.textContent = `${card.guests.length} names`;
    const guestNames = $('[data-inspector-guest-names]', inspector);
    if (guestNames) guestNames.innerHTML = guestPreview(card.guests);
    const computed = computeLayout(state.project);
    const pos = state.project.layout.auto ? computed.positions[card.id] : null;
    const x = pos ? pos.x : card.x;
    const y = pos ? pos.y : card.y;
    const setIfIdle = (field, value) => {
      const input = $(`[data-inspector="${field}"]`, inspector);
      if (input && input !== document.activeElement) input.value = value;
    };
    setIfIdle('label', card.label);
    setIfIdle('x', Math.round(x));
    setIfIdle('y', Math.round(y));
    setIfIdle('rotation', card.rotation || 0);
    const rotationOut = $('[data-out-inspector="rotation"]', inspector);
    if (rotationOut) rotationOut.textContent = `${fmt(card.rotation || 0)}°`;
    const note = $('[data-placement-note]', inspector);
    if (note) note.textContent = state.project.layout.auto
      ? 'Editing a position turns off auto layout for the whole chart.'
      : 'This card is placed freely. Drag it on the chart, or nudge with arrow keys.';
  }

  function syncTableSummaries() {
    const p = state.project;
    $$('.table-item', panelTables).forEach(item => {
      const card = p.cards.find(c => c.id === item.dataset.tableId);
      if (!card) return;
      const summaryName = $('.table-summary-name', item);
      const summarySub = $('.table-summary-sub', item);
      const count = $('[data-guest-count]', item);
      const preview = $('[data-guest-preview]', item);
      if (summaryName) summaryName.textContent = card.label || 'Untitled table';
      if (summarySub) summarySub.textContent = `${card.guests.length} ${card.guests.length === 1 ? 'guest' : 'guests'}`;
      if (count) count.textContent = `${card.guests.length} names`;
      if (preview) preview.innerHTML = guestPreview(card.guests);
      item.classList.toggle('is-selected', card.id === state.selectedId);
    });
    const stats = projectStats(p);
    const statsEl = $('[data-tables-stats]', panelTables);
    if (statsEl) statsEl.textContent = `${stats.tables} tables · ${stats.guests} guests`;
    const tabCount = $('#tables-tab-count', root);
    if (tabCount) tabCount.textContent = String(stats.tables);
  }

  function updateOptionStates() {
    $$('[data-option-group]', root).forEach(group => {
      const path = group.dataset.optionGroup;
      const current = String(getPath(state.project, path));
      $$('[data-option-value]', group).forEach(button => {
        button.classList.toggle('is-active', button.dataset.optionValue === current);
      });
    });
    $$('[data-preset]', root).forEach(button => {
      button.classList.toggle('is-active', button.dataset.preset === state.project.theme.preset);
      const check = $('.preset-check', button);
      if (check) check.style.display = button.dataset.preset === state.project.theme.preset ? 'flex' : '';
    });
  }

  function syncPanels(rebuildTables = false) {
    if (rebuildTables) {
      renderTablesPanel();
    } else {
      syncTableSummaries();
    }
    syncFormValues(panelDesign);
    syncFormValues(inspector);
    syncInspector();
    updateOptionStates();
    updateStageBadges();
    updateHistoryButtons();
    refreshGuestPanel();
  }

  /* ---------- field changes ---------- */

  function readInputValue(input) {
    if (input.type === 'checkbox') return input.checked;
    if (input.type === 'range' || input.type === 'number') {
      if (input.value === '') return null;
      return Number(input.value);
    }
    return input.value;
  }

  function applyPath(path, value, options = {}) {
    const current = getPath(state.project, path);
    if (String(current) === String(value)) return;

    if (path === 'ratio') {
      apply(project => setRatio(project, value), { history: true });
      return;
    }

    if (path === 'layout.auto') {
      apply(project => {
        if (value) {
          project.layout.auto = true;
          applyAutoPositions(project);
        } else {
          const { positions } = computeLayout(project);
          project.cards.forEach(card => {
            const pos = positions[card.id];
            if (pos) { card.x = pos.x; card.y = pos.y; }
          });
          project.layout.auto = false;
        }
        return project;
      }, { history: true });
      return;
    }

    if (path === 'theme.card.shadow') value = value === 'true' || value === true;

    apply(project => {
      setPath(project, path, value);
      if (path.startsWith('theme.') || path.startsWith('typography.')) project.theme.preset = 'custom';
      return project;
    }, { key: 'field:' + path });

    if (path === 'theme.background.type' || path === 'theme.card.pin' || path === 'theme.card.borderWidth') {
      renderDesignPanel();
      syncPanels();
    }
  }

  function onPathControl(input, force = false) {
    const path = input.dataset.path;
    let value = readInputValue(input);
    if (value === null) return;
    if (input.dataset.hex) {
      if (!/^#?[0-9a-fA-F]{6}$/.test(String(value))) return;
      value = '#' + String(value).replace('#', '').toLowerCase();
    }
    if (!force && input.type === 'range') {
      // The live feedback is worth more than a hundred history entries.
      applyPath(path, value, { coalesce: true });
    } else {
      applyPath(path, value);
    }
  }

  /* ---------- table editing ---------- */

  function updateCardLabel(id, raw) {
    const value = String(raw).slice(0, 80);
    apply(project => {
      const card = project.cards.find(c => c.id === id);
      if (card) card.label = value;
      return project;
    }, { key: `card:label:${id}` });
    syncTableSummaries();
    syncInspector();
  }

  function addTable() {
    const card = {
      id: uid(),
      label: nextTableLabel(state.project),
      guests: [],
      x: 0,
      y: 0,
      rotation: 0
    };
    state.openTables.add(card.id);
    apply(project => {
      project.cards.push(card);
      return project;
    }, { history: true, rebuild: true });
    requestAnimationFrame(() => {
      if (state.activeTab === 'guests' && state.guestPanelBuilt) {
        const zone = $(`[data-guest-drop="${cssEscape(card.id)}"]`, panelGuests);
        zone?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
      const item = $(`[data-table-id="${cssEscape(card.id)}"]`, panelTables);
      item?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }

  function deleteTable(id) {
    const card = state.project.cards.find(c => c.id === id);
    if (!card) return;
    if (state.selectedId === id) {
      state.selectedId = null;
      editor.classList.remove('has-selection');
      inspector.classList.remove('is-open');
      closeDrawer();
    }
    state.openTables.delete(id);
    const guestCount = card.guests.length;
    apply(project => {
      project.guests.forEach(guest => { if (guest.tableId === id) guest.tableId = null; });
      project.cards = project.cards.filter(c => c.id !== id);
      return project;
    }, { history: true, rebuild: true });
    renderInspector();
    toast(guestCount
      ? `“${card.label}” removed — ${guestCount} guest${guestCount === 1 ? '' : 's'} moved to Unassigned.`
      : `“${card.label}” removed.`, {
      action: { label: 'Undo', onClick: () => undo() }
    });
  }

  function moveTable(id, direction) {
    const index = state.project.cards.findIndex(c => c.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= state.project.cards.length) return;
    apply(project => {
      const [card] = project.cards.splice(index, 1);
      project.cards.splice(target, 0, card);
      return project;
    }, { history: true, rebuild: true });
    requestAnimationFrame(() => {
      $(`[data-table-id="${cssEscape(id)}"]`, panelTables)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }

  function renumberTables() {
    let changed = false;
    apply(project => {
      project.cards.forEach((card, index) => {
        if (!card.label.trim() || /^table\s*\d*$/i.test(card.label)) {
          const label = `table ${index + 1}`;
          if (card.label !== label) changed = true;
          card.label = label;
        }
      });
      return project;
    }, { history: true, rebuild: true });
    toast(changed ? 'Table numbers updated.' : 'Custom table names were left unchanged.');
  }

  function selectCard(id, { open = true } = {}) {
    state.selectedId = id;
    paintSelection();
    editor.classList.toggle('has-selection', Boolean(id));
    renderInspector();
    $$('.table-item', panelTables).forEach(item => item.classList.toggle('is-selected', item.dataset.tableId === id));
    if (id && open) openInspectorDrawer();
    if (!id) {
      inspector.classList.remove('is-open');
      maybeCloseBackdrop();
    }
    updateMobileNav();
  }

  function clearSelection() {
    if (!state.selectedId && !inspector.classList.contains('is-open')) return;
    selectCard(null);
  }

  function duplicateSelected() {
    const source = state.project.cards.find(c => c.id === state.selectedId);
    if (!source) return;
    const copy = clone(source);
    copy.id = uid();
    copy.label = `${source.label} copy`.slice(0, 80);
    copy.rotation = source.rotation;
    copy.guests = [];
    pushHistory(clone(state.project));
    if (state.project.layout.auto) {
      const { positions } = computeLayout(state.project);
      state.project.cards.forEach(card => {
        const pos = positions[card.id];
        if (pos) { card.x = pos.x; card.y = pos.y; }
      });
      state.project.layout.auto = false;
    }
    copy.x = source.x + 36;
    copy.y = source.y + 40;
    state.project.cards.push(copy);
    syncGuestAssignments(state.project);
    state.selectedId = copy.id;
    state.project.updatedAt = Date.now();
    renderStage();
    renderInspector();
    syncPanels(true);
    setSaveState('saving');
    saveLater();
    toast('Table duplicated — its guests stayed at the original table.');
  }

  function deleteSelected() {
    const card = state.project.cards.find(c => c.id === state.selectedId);
    if (!card) return;
    const guestCount = card.guests.length;
    pushHistory(clone(state.project));
    state.project.guests.forEach(guest => { if (guest.tableId === card.id) guest.tableId = null; });
    state.project.cards = state.project.cards.filter(c => c.id !== card.id);
    syncGuestAssignments(state.project);
    state.selectedId = null;
    editor.classList.remove('has-selection');
    inspector.classList.remove('is-open');
    state.project.updatedAt = Date.now();
    if (state.project.layout.auto) applyAutoPositions(state.project);
    renderStage();
    renderInspector();
    syncPanels(true);
    updateHistoryButtons();
    setSaveState('saving');
    saveLater();
    closeDrawer();
    toast(guestCount
      ? `“${card.label}” removed — ${guestCount} guest${guestCount === 1 ? '' : 's'} moved to Unassigned.`
      : `“${card.label}” removed.`, { action: { label: 'Undo', onClick: () => undo() } });
  }

  function setCardPosition(id, axis, value) {
    const card = state.project.cards.find(c => c.id === id);
    if (!card) return;
    apply(project => {
      if (project.layout.auto) {
        const { positions } = computeLayout(project);
        project.cards.forEach(item => {
          const pos = positions[item.id];
          if (pos) { item.x = pos.x; item.y = pos.y; }
        });
        project.layout.auto = false;
      }
      const target = project.cards.find(item => item.id === id);
      const limit = axis === 'x' ? project.width : project.height;
      target[axis] = clamp(Math.round(Number(value) || 0), 0, limit - 40);
      return project;
    }, { key: `position:${axis}:${id}` });
    syncInspector();
  }

  function showCardOnStage(id) {
    state.openTables.add(id);
    selectCard(id, { open: true });
    closeSidebar();
    requestAnimationFrame(() => {
      const cardEl = $(`[data-card-id="${cssEscape(id)}"]`, scaler);
      if (cardEl) cardEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    });
  }

  function cssEscape(value) {
    if (window.CSS?.escape) return CSS.escape(value);
    return String(value).replace(/["\\]/g, '\\$&');
  }

  /* ---------- guests workspace ---------- */

  function ensureGuestPanel() {
    if (state.guestPanelBuilt) return;
    panelGuests.innerHTML = `
      <div class="guest-add">
        <button class="guest-add-head" type="button" data-action="toggle-guest-add" aria-expanded="${state.guestAddOpen}">
          <span class="guest-add-title">${icon('plus', 14)} Add names</span>
          <span class="guest-add-hint">Paste one per line</span>
          <span class="guest-add-chevron ${state.guestAddOpen ? 'is-open' : ''}">${icon('chevron-down', 14)}</span>
        </button>
        <div class="guest-add-body" data-guest-add-body ${state.guestAddOpen ? '' : 'hidden'}>
          <textarea class="textarea guest-bulk" data-bulk-guests rows="5" placeholder="Ava Thompson&#10;Noah Bennett&#10;Isla Montgomery&#10;…"></textarea>
          <div class="guest-add-foot">
            <span class="guest-add-count" data-bulk-count>0 names</span>
            <button class="btn btn-gold btn-sm" type="button" data-action="add-guests" disabled>Add to unassigned</button>
          </div>
          <p class="field-note">One guest per line. Commas work too. New names land in Unassigned.</p>
        </div>
      </div>
      <div class="guest-topbar">
        <input class="input guest-search" type="search" data-guest-search placeholder="Find a name…" autocomplete="off">
      </div>
      <div class="guest-selection" data-guest-selection hidden>
        <span class="guest-selection-name"><strong data-guest-selected-name></strong> selected</span>
        <span class="guest-selection-hint">Tap a table to move them</span>
        <button class="guest-selection-cancel" type="button" data-action="clear-guest-selection">Cancel</button>
      </div>
      <div class="guest-stats" data-guest-stats></div>
      <section class="guest-section">
        <div class="section-head">
          <h3 class="section-title">Unassigned</h3>
          <span class="guest-count-badge" data-unassigned-count>0</span>
        </div>
        <div data-guest-unassigned></div>
        <div class="guest-tools">
          <button class="btn btn-dark btn-sm" type="button" data-action="deal-unassigned">${icon('sparkles', 14)} Deal evenly</button>
          <span class="guest-tool-note">or drag names into tables</span>
        </div>
      </section>
      <section class="guest-section">
        <div class="section-head">
          <h3 class="section-title">Tables</h3>
          <button class="section-action" type="button" data-action="add-table">${icon('plus', 12)} New table</button>
        </div>
        <div data-guest-tables></div>
        <button class="btn btn-ghost btn-sm btn-block guest-unassign-all" type="button" data-action="unassign-all">Move every name back to Unassigned</button>
      </section>
      <p class="guest-footnote">Drag the grip, or tap a name then tap a table. Changes appear on the chart instantly.</p>`;
    state.guestPanelBuilt = true;
    updateBulkAddState();
    updateGuestStats();
    updateGuestSelectionBar();
  }

  function renderGuestZones() {
    if (!state.guestPanelBuilt) return;
    const unassignedContainer = $('[data-guest-unassigned]', panelGuests);
    const tablesContainer = $('[data-guest-tables]', panelGuests);
    if (!unassignedContainer || !tablesContainer) return;
    const unassigned = state.project.guests.filter(guest => !guest.tableId);
    unassignedContainer.innerHTML = unassignedZone(unassigned);
    tablesContainer.innerHTML = state.project.cards.length
      ? state.project.cards.map((card, index) => tableZone(card, index)).join('')
      : `<div class="guest-empty-tables">Add a table to start seating guests.</div>`;
    updateGuestStats();
    applyGuestFilter();
    updateGuestChipSelection();
    requestAnimationFrame(() => {
      if (!state.guestHighlightTable) return;
      const zone = $(`[data-guest-drop="${cssEscape(state.guestHighlightTable)}"]`, panelGuests);
      if (zone) {
        zone.classList.add('is-highlighted');
        zone.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => zone.classList.remove('is-highlighted'), 1600);
      }
      state.guestHighlightTable = null;
    });
  }

  function unassignedZone(guests) {
    const empty = state.project.guests.length
      ? 'Everyone is seated.'
      : 'Paste your guest list above to begin.';
    return `<div class="guest-drop-zone guest-drop-zone--unassigned ${state.selectedGuestId ? 'can-receive' : ''}" data-guest-drop="unassigned" data-drop-table="unassigned" tabindex="0" role="group" aria-label="Unassigned guests">
      <div class="guest-zone-head">
        <span class="guest-zone-title">Unassigned names</span>
        <span class="guest-zone-count" data-unassigned-zone-count>${guests.length}</span>
      </div>
      <div class="guest-chips">${guests.map(guestChipMarkup).join('') || `<span class="guest-zone-empty">${empty}</span>`}</div>
    </div>`;
  }

  function tableZone(card, index) {
    const guests = state.project.guests.filter(guest => guest.tableId === card.id);
    return `<div class="guest-table-zone ${state.selectedGuestId ? 'can-receive' : ''}" data-guest-drop="${card.id}" data-drop-table="${card.id}" tabindex="0" role="group" aria-label="${esc(card.label)} guest list">
      <div class="guest-zone-head">
        <span class="guest-zone-index">${index + 1}</span>
        <span class="guest-zone-title">${esc(card.label || 'Table ' + (index + 1))}</span>
        <span class="guest-zone-count">${guests.length}</span>
      </div>
      <div class="guest-chips">${guests.map(guestChipMarkup).join('') || '<span class="guest-zone-empty">Drop names here</span>'}</div>
    </div>`;
  }

  function guestChipMarkup(guest) {
    const selected = state.selectedGuestId === guest.id;
    return `<div class="guest-chip ${selected ? 'is-selected' : ''}" data-guest-id="${guest.id}" data-guest-name="${esc(guest.name)}" role="button" tabindex="0" aria-pressed="${selected}" aria-label="${esc(guest.name)}">
      <span class="guest-chip-grip" aria-hidden="true">${icon('grip', 12)}</span>
      <span class="guest-chip-name" title="${esc(guest.name)}">${esc(guest.name)}</span>
      <button class="guest-chip-btn" type="button" data-guest-action="rename" data-guest-id="${guest.id}" aria-label="Rename ${esc(guest.name)}" title="Rename">${icon('pencil', 11)}</button>
      <button class="guest-chip-btn" type="button" data-guest-action="remove" data-guest-id="${guest.id}" aria-label="Remove ${esc(guest.name)}" title="Remove">${icon('x', 11)}</button>
    </div>`;
  }

  function refreshGuestPanel() {
    updateGuestStats();
    if (!state.guestPanelBuilt) return;
    if (state.activeTab === 'guests') renderGuestZones();
    updateGuestSelectionBar();
  }

  function updateGuestStats() {
    const stats = projectStats(state.project);
    const tabCount = $('#guests-tab-count', root);
    if (tabCount) tabCount.textContent = String(stats.guests);
    if (!state.guestPanelBuilt) return;
    const statsEl = $('[data-guest-stats]', panelGuests);
    if (statsEl) {
      const filter = state.guestSearch.trim();
      const matches = filter
        ? state.project.guests.filter(guest => guest.name.toLowerCase().includes(filter.toLowerCase())).length
        : null;
      statsEl.innerHTML = `<span>${stats.guests} name${stats.guests === 1 ? '' : 's'}</span>
        <span class="dot-sep"></span>
        <span>${stats.unassigned ? `${stats.unassigned} unassigned` : 'everyone seated'}</span>
        ${matches !== null ? `<span class="dot-sep"></span><span>${matches} match${matches === 1 ? '' : 'es'}</span>` : ''}`;
    }
    const unassignedCount = $('[data-unassigned-count]', panelGuests);
    if (unassignedCount) unassignedCount.textContent = String(stats.unassigned);
    const unassignedZoneCount = $('[data-unassigned-zone-count]', panelGuests);
    if (unassignedZoneCount) unassignedZoneCount.textContent = String(stats.unassigned);
    const deal = $('[data-action="deal-unassigned"]', panelGuests);
    if (deal) deal.disabled = stats.unassigned === 0 || stats.tables === 0;
    const unassignAll = $('[data-action="unassign-all"]', panelGuests);
    if (unassignAll) unassignAll.disabled = stats.guests - stats.unassigned === 0;
  }

  function updateBulkAddState() {
    if (!state.guestPanelBuilt) return;
    const textarea = $('[data-bulk-guests]', panelGuests);
    const names = textarea ? parseGuestList(textarea.value) : [];
    const count = $('[data-bulk-count]', panelGuests);
    if (count) count.textContent = `${names.length} name${names.length === 1 ? '' : 's'}`;
    const button = $('[data-action="add-guests"]', panelGuests);
    if (button) button.disabled = names.length === 0;
  }

  function setGuestAddOpen(open) {
    state.guestAddOpen = open;
    const body = $('[data-guest-add-body]', panelGuests);
    const head = $('[data-action="toggle-guest-add"]', panelGuests);
    const chevron = $('.guest-add-chevron', panelGuests);
    if (body) body.hidden = !open;
    if (head) head.setAttribute('aria-expanded', String(open));
    if (chevron) chevron.classList.toggle('is-open', open);
    if (open) $('[data-bulk-guests]', panelGuests)?.focus();
  }

  function toggleGuestAdd() {
    setGuestAddOpen(!state.guestAddOpen);
  }

  function addGuestsFromBulk() {
    const textarea = $('[data-bulk-guests]', panelGuests);
    if (!textarea) return;
    const names = parseGuestList(textarea.value);
    if (!names.length) return;
    apply(project => {
      names.forEach(name => project.guests.push({ id: uid(), name: name.slice(0, 120), tableId: null }));
      return project;
    }, { history: true });
    textarea.value = '';
    updateBulkAddState();
    setGuestAddOpen(false);
    clearGuestSelection();
    requestAnimationFrame(() => {
      $('[data-guest-unassigned]', panelGuests)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    toast(`Added ${names.length} name${names.length === 1 ? '' : 's'} to Unassigned.`, {
      action: { label: 'Undo', onClick: () => undo() }
    });
  }

  function applyGuestFilter() {
    if (!state.guestPanelBuilt) return;
    const query = state.guestSearch.trim().toLowerCase();
    $$('.guest-chip', panelGuests).forEach(chip => {
      const name = (chip.dataset.guestName || '').toLowerCase();
      chip.hidden = Boolean(query) && !name.includes(query);
    });
    updateGuestStats();
  }

  function toggleGuestSelection(guestId) {
    state.selectedGuestId = state.selectedGuestId === guestId ? null : guestId;
    updateGuestChipSelection();
    updateGuestSelectionBar();
  }

  function clearGuestSelection() {
    state.selectedGuestId = null;
    updateGuestChipSelection();
    updateGuestSelectionBar();
  }

  function updateGuestChipSelection() {
    if (!state.guestPanelBuilt) return;
    $$('.guest-chip', panelGuests).forEach(chip => {
      const selected = chip.dataset.guestId === state.selectedGuestId;
      chip.classList.toggle('is-selected', selected);
      chip.setAttribute('aria-pressed', String(selected));
    });
    $$('[data-guest-drop]', panelGuests).forEach(zone => {
      zone.classList.toggle('can-receive', Boolean(state.selectedGuestId));
    });
  }

  function updateGuestSelectionBar() {
    if (!state.guestPanelBuilt) return;
    const bar = $('[data-guest-selection]', panelGuests);
    if (!bar) return;
    const guest = state.project.guests.find(item => item.id === state.selectedGuestId);
    bar.hidden = !guest;
    const name = $('[data-guest-selected-name]', bar);
    if (name) name.textContent = guest?.name || '';
    if (guest) bar.classList.add('is-visible');
    else bar.classList.remove('is-visible');
  }

  function moveGuest(guestId, tableId, index) {
    const target = tableId || null;
    state.selectedGuestId = null;
    apply(project => {
      const moved = project.guests.find(guest => guest.id === guestId);
      if (!moved) return project;
      const remaining = project.guests.filter(guest => guest.id !== guestId);
      const targetGuests = remaining.filter(guest => guest.tableId === target);
      const safeIndex = clamp(Number(index) || 0, 0, targetGuests.length);
      let insertAt;
      if (safeIndex < targetGuests.length) {
        const nextGuest = targetGuests[safeIndex];
        insertAt = remaining.findIndex(guest => guest.id === nextGuest.id);
      } else if (targetGuests.length) {
        const last = targetGuests[targetGuests.length - 1];
        insertAt = remaining.findIndex(guest => guest.id === last.id) + 1;
      } else {
        insertAt = remaining.length;
      }
      moved.tableId = target;
      remaining.splice(Math.max(0, insertAt), 0, moved);
      project.guests = remaining;
      return project;
    }, { history: true });
    updateGuestSelectionBar();
  }

  function dealUnassigned() {
    if (!state.project.cards.length) {
      toast('Add a table before dealing names.', { tone: 'error' });
      return;
    }
    const unassigned = state.project.guests.filter(guest => !guest.tableId);
    if (!unassigned.length) {
      toast('Everyone is already seated.');
      return;
    }
    apply(project => {
      const counts = new Map(project.cards.map(card => [
        card.id,
        project.guests.filter(guest => guest.tableId === card.id).length
      ]));
      project.guests.forEach(guest => {
        if (guest.tableId) return;
        const target = project.cards.reduce((best, card) =>
          counts.get(card.id) < counts.get(best.id) ? card : best
        , project.cards[0]);
        guest.tableId = target.id;
        counts.set(target.id, counts.get(target.id) + 1);
      });
      return project;
    }, { history: true });
    clearGuestSelection();
    toast(`Dealt ${unassigned.length} name${unassigned.length === 1 ? '' : 's'} across ${state.project.cards.length} tables.`, {
      action: { label: 'Undo', onClick: () => undo() }
    });
  }

  async function unassignAllGuests() {
    const assigned = state.project.guests.filter(guest => guest.tableId).length;
    if (!assigned) return;
    const ok = await confirmDialog({
      title: 'Move every name back?',
      message: `${assigned} guest${assigned === 1 ? '' : 's'} will return to the Unassigned pool. You can undo this.`,
      confirmLabel: 'Unassign everyone'
    });
    if (!ok) return;
    apply(project => {
      project.guests.forEach(guest => { guest.tableId = null; });
      return project;
    }, { history: true });
    clearGuestSelection();
    toast(`${assigned} name${assigned === 1 ? '' : 's'} moved to Unassigned.`, {
      action: { label: 'Undo', onClick: () => undo() }
    });
  }

  function openGuestRenameDialog(guestId) {
    const guest = state.project.guests.find(item => item.id === guestId);
    if (!guest) return;
    const modal = openModal({
      title: 'Rename guest',
      size: 'sm',
      body: `<label class="field"><span class="field-label">Guest name</span>
        <input class="input" id="guest-rename-input" value="${esc(guest.name)}" maxlength="120" autocomplete="off" spellcheck="false"></label>`,
      footer: `<button class="btn btn-ghost" type="button" data-cancel>Cancel</button>
        <button class="btn btn-gold" type="button" data-save>Save name</button>`
    });
    const input = modal.root.querySelector('#guest-rename-input');
    input.select();
    const save = () => {
      const name = input.value.trim();
      if (!name) { input.focus(); return; }
      apply(project => {
        const target = project.guests.find(item => item.id === guestId);
        if (target) target.name = name;
        return project;
      }, { history: true });
      modal.close();
    };
    modal.root.querySelector('[data-save]').addEventListener('click', save);
    modal.root.querySelector('[data-cancel]').addEventListener('click', modal.close);
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); save(); }
    });
  }

  function removeGuest(guestId) {
    const guest = state.project.guests.find(item => item.id === guestId);
    if (!guest) return;
    apply(project => {
      project.guests = project.guests.filter(item => item.id !== guestId);
      return project;
    }, { history: true });
    if (state.selectedGuestId === guestId) clearGuestSelection();
    toast(`Removed ${guest.name}.`, { action: { label: 'Undo', onClick: () => undo() } });
  }

  function showGuestsForTable(cardId) {
    state.selectedGuestId = null;
    state.guestHighlightTable = cardId;
    ensureGuestPanel();
    setTab('guests');
    if (isMobileSidebar()) openSidebar('guests');
    requestAnimationFrame(() => {
      const zone = $(`[data-guest-drop="${cssEscape(cardId)}"]`, panelGuests);
      if (zone) {
        zone.classList.add('is-highlighted');
        zone.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => zone.classList.remove('is-highlighted'), 1700);
      }
      state.guestHighlightTable = null;
    });
  }

  /* ---------- guest drag & drop ---------- */

  function beginGuestPointer(event) {
    const chip = event.target.closest('.guest-chip');
    if (!chip) return;
    if (event.target.closest('[data-guest-action]')) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.pointerType !== 'mouse' && !event.target.closest('.guest-chip-grip')) return;
    state.guestDrag = {
      guestId: chip.dataset.guestId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
      sourceEl: chip,
      ghost: null,
      line: null,
      dropTable: undefined,
      dropIndex: undefined
    };
  }

  function moveGuestPointer(event) {
    const drag = state.guestDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.moved && distance < 5) return;

    if (!drag.moved) {
      drag.moved = true;
      state.selectedGuestId = null;
      updateGuestChipSelection();
      updateGuestSelectionBar();
      drag.sourceEl.classList.add('is-dragging');
      document.body.classList.add('is-dragging-guest');
      const guest = state.project.guests.find(item => item.id === drag.guestId);
      const ghost = document.createElement('div');
      ghost.className = 'guest-drag-ghost';
      ghost.textContent = guest?.name || 'Guest';
      document.body.appendChild(ghost);
      drag.ghost = ghost;
    }

    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    if (drag.ghost) {
      drag.ghost.style.left = `${event.clientX}px`;
      drag.ghost.style.top = `${event.clientY}px`;
    }

    const scroller = sidebarScroll;
    const scrollRect = scroller.getBoundingClientRect();
    if (event.clientY < scrollRect.top + 54) scroller.scrollTop -= 14;
    else if (event.clientY > scrollRect.bottom - 54) scroller.scrollTop += 14;

    const under = document.elementFromPoint(event.clientX, event.clientY);
    const zone = under?.closest('[data-guest-drop]');
    updateGuestDropTarget(zone, event.clientX, event.clientY);
  }

  function updateGuestDropTarget(zone, x, y) {
    const drag = state.guestDrag;
    if (!drag) return;
    $$('[data-guest-drop]', panelGuests).forEach(item => item.classList.toggle('is-drop-target', item === zone));
    if (!zone) {
      drag.dropTable = undefined;
      drag.dropIndex = undefined;
      drag.line?.remove();
      drag.line = null;
      return;
    }
    const container = $('.guest-chips', zone);
    if (!container) return;
    const chips = [...container.querySelectorAll('.guest-chip')]
      .filter(chip => chip !== drag.sourceEl && !chip.hidden);
    let index = chips.length;
    for (let i = 0; i < chips.length; i++) {
      const rect = chips[i].getBoundingClientRect();
      if (y < rect.top + rect.height / 2 || (y <= rect.bottom && x < rect.left + rect.width / 2)) {
        index = i;
        break;
      }
    }
    drag.dropTable = zone.dataset.dropTable;
    drag.dropIndex = index;

    if (!drag.line || drag.line.parentElement !== container) {
      drag.line?.remove();
      drag.line = document.createElement('span');
      drag.line.className = 'guest-drop-line';
      container.appendChild(drag.line);
    }
    const containerRect = container.getBoundingClientRect();
    const line = drag.line;
    if (chips[index]) {
      const rect = chips[index].getBoundingClientRect();
      line.style.left = `${rect.left - containerRect.left - 4}px`;
      line.style.top = `${rect.top - containerRect.top}px`;
      line.style.height = `${rect.height}px`;
    } else if (chips.length) {
      const rect = chips[chips.length - 1].getBoundingClientRect();
      line.style.left = `${rect.right - containerRect.left + 3}px`;
      line.style.top = `${rect.top - containerRect.top}px`;
      line.style.height = `${rect.height}px`;
    } else {
      line.style.left = '8px';
      line.style.top = '12px';
      line.style.height = '20px';
    }
  }

  function cleanupGuestDrag() {
    const drag = state.guestDrag;
    if (!drag) return;
    drag.sourceEl?.classList.remove('is-dragging');
    drag.ghost?.remove();
    drag.line?.remove();
    document.body.classList.remove('is-dragging-guest');
    $$('[data-guest-drop]', panelGuests).forEach(item => item.classList.remove('is-drop-target'));
    state.guestDrag = null;
  }

  function endGuestPointer(event) {
    const drag = state.guestDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const moved = drag.moved;
    const dropTable = drag.dropTable;
    const dropIndex = drag.dropIndex;
    cleanupGuestDrag();
    if (!moved) return;
    state.guestSuppressClick = true;
    setTimeout(() => { state.guestSuppressClick = false; }, 80);
    if (dropTable !== undefined) {
      moveGuest(drag.guestId, dropTable === 'unassigned' ? null : dropTable, dropIndex ?? 0);
    }
  }

  /* ---------- drawers & tabs ---------- */

  function isMobileSidebar() {
    return window.matchMedia('(max-width: 860px)').matches;
  }

  function isDrawerInspector() {
    return window.matchMedia('(max-width: 1220px)').matches;
  }

  function openBackdrop() {
    if (isMobileSidebar() || isDrawerInspector()) {
      backdrop.classList.add('is-open');
    }
  }

  function closeBackdrop() {
    backdrop.classList.remove('is-open');
  }

  function maybeCloseBackdrop() {
    if (!sidebar.classList.contains('is-open') && !inspector.classList.contains('is-open')) {
      closeBackdrop();
    }
  }

  function openInspectorDrawer() {
    if (!isDrawerInspector()) return;
    sidebar.classList.remove('is-open');
    inspector.classList.add('is-open');
    openBackdrop();
    updateMobileNav();
  }

  function closeDrawer() {
    sidebar.classList.remove('is-open');
    inspector.classList.remove('is-open');
    closeBackdrop();
    updateMobileNav();
  }

  function openSidebar(tab) {
    if (tab) setTab(tab);
    inspector.classList.remove('is-open');
    sidebar.classList.add('is-open');
    if (isMobileSidebar()) openBackdrop();
    updateMobileNav();
  }

  function closeSidebar() {
    sidebar.classList.remove('is-open');
    maybeCloseBackdrop();
    updateMobileNav();
  }

  function setTab(tab) {
    state.activeTab = tab;
    $$('.sidebar-tab', sidebar).forEach(button => button.classList.toggle('is-active', button.dataset.tab === tab));
    $$('.sidebar-panel', sidebar).forEach(panel => panel.classList.toggle('is-active', panel.id === `panel-${tab}`));
    if (tab === 'tables') renderTablesPanel();
    if (tab === 'guests') {
      ensureGuestPanel();
      refreshGuestPanel();
    }
    updateMobileNav();
  }

  function updateMobileNav() {
    mobileButtons.forEach(button => {
      const kind = button.dataset.mobile;
      button.classList.toggle('is-active',
        (kind === 'design' && sidebar.classList.contains('is-open') && state.activeTab === 'design') ||
        (kind === 'tables' && sidebar.classList.contains('is-open') && state.activeTab === 'tables') ||
        (kind === 'guests' && sidebar.classList.contains('is-open') && state.activeTab === 'guests') ||
        (kind === 'card' && inspector.classList.contains('is-open'))
      );
    });
  }

  /* ---------- drag ---------- */

  function beginCardPointer(event) {
    const cardEl = event.target.closest('.table-card');
    if (!cardEl) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target.closest('.zoom-pill')) return;
    const card = state.project.cards.find(c => c.id === cardEl.dataset.cardId);
    if (!card) return;
    event.preventDefault();
    event.stopPropagation();
    selectCard(card.id, { open: false });

    const computed = computeLayout(state.project);
    const pos = state.project.layout.auto ? computed.positions[card.id] : null;
    state.drag = {
      id: card.id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: pos ? pos.x : card.x,
      startY: pos ? pos.y : card.y,
      scale: state.fitScale * state.zoom,
      before: clone(state.project),
      moved: false,
      element: cardEl,
      width: cardEl.offsetWidth,
      height: cardEl.offsetHeight
    };
    cardEl.classList.add('is-dragging');
    cardEl.setPointerCapture?.(event.pointerId);
  }

  function moveCardPointer(event) {
    const drag = state.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = (event.clientX - drag.startClientX) / drag.scale;
    const dy = (event.clientY - drag.startClientY) / drag.scale;
    if (!drag.moved && Math.hypot(dx * drag.scale, dy * drag.scale) < 3) return;
    if (!drag.moved) {
      drag.moved = true;
      if (state.project.layout.auto) {
        const { positions } = computeLayout(state.project);
        state.project.cards.forEach(card => {
          const pos = positions[card.id];
          if (pos) { card.x = pos.x; card.y = pos.y; }
        });
        state.project.layout.auto = false;
      }
      const card = state.project.cards.find(c => c.id === drag.id);
      drag.startX = card.x;
      drag.startY = card.y;
    }
    const card = state.project.cards.find(c => c.id === drag.id);
    if (!card) return;
    const x = clamp(Math.round(drag.startX + dx), 0, state.project.width - drag.width);
    const y = clamp(Math.round(drag.startY + dy), 0, state.project.height - drag.height);
    if (card.x === x && card.y === y) return;
    card.x = x;
    card.y = y;
    card.rotation = card.rotation || 0;
    state.project.updatedAt = Date.now();
    drag.element.style.left = `${x}px`;
    drag.element.style.top = `${y}px`;
    const xInput = $('[data-inspector="x"]', inspector);
    const yInput = $('[data-inspector="y"]', inspector);
    if (xInput && xInput !== document.activeElement) xInput.value = Math.round(x);
    if (yInput && yInput !== document.activeElement) yInput.value = Math.round(y);
    const note = $('[data-placement-note]', inspector);
    if (note) note.textContent = 'This card is placed freely. Drag it on the chart, or nudge with arrow keys.';
    updateStageBadges();
    setSaveState('saving');
  }

  function endCardPointer(event) {
    const drag = state.drag;
    if (!drag || (event && event.pointerId !== drag.pointerId)) return;
    drag.element.classList.remove('is-dragging');
    if (drag.moved) {
      pushHistory(drag.before);
      syncPanels();
      setSaveState('saving');
      saveLater();
      updateStageBadges();
    } else {
      const tapped = event?.type === 'pointerup';
      if (tapped && (isDrawerInspector() || isMobileSidebar())) openInspectorDrawer();
    }
    state.drag = null;
  }

  /* ---------- preview ---------- */

  function openPreview() {
    closeMenu();
    closeDrawer();
    const overlay = el(`<div class="preview-overlay" role="dialog" aria-modal="true" aria-label="Seating chart preview">
      <header class="preview-bar">
        <div class="preview-bar-left">
          <span class="brand-sub">Preview</span>
          <span class="preview-title">${esc(state.project.name)}</span>
        </div>
        <div class="preview-bar-actions">
          <button class="btn btn-ghost btn-sm" type="button" data-preview-export>${icon('download', 15)} Export</button>
          <button class="icon-btn" type="button" data-preview-close aria-label="Close preview">${icon('x', 19)}</button>
        </div>
      </header>
      <div class="preview-stage" data-preview-stage></div>
    </div>`);
    const stageEl = $('[data-preview-stage]', overlay);
    const box = document.createElement('div');
    box.className = 'preview-canvas';
    const art = renderArtboard(state.project, { interactive: false });
    art.style.position = 'absolute';
    art.style.top = '0';
    art.style.left = '0';
    art.style.transformOrigin = 'top left';
    box.appendChild(art);
    stageEl.appendChild(box);
    document.body.appendChild(overlay);
    state.preview = overlay;

    const fit = () => {
      const style = getComputedStyle(stageEl);
      const availW = stageEl.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const availH = stageEl.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const scale = Math.max(0.02, Math.min(availW / state.project.width, availH / state.project.height));
      box.style.width = `${state.project.width * scale}px`;
      box.style.height = `${state.project.height * scale}px`;
      art.style.transform = `scale(${scale})`;
    };
    const observer = new ResizeObserver(fit);
    observer.observe(stageEl);
    requestAnimationFrame(fit);
    state.preview = { overlay, observer };

    $('[data-preview-close]', overlay).addEventListener('click', closePreview);
    $('[data-preview-export]', overlay).addEventListener('click', () => openExportModal());
    overlay.addEventListener('pointerdown', (event) => {
      if (event.target === overlay) closePreview();
    });
  }

  function closePreview() {
    if (!state.preview) return;
    state.preview.observer?.disconnect();
    state.preview.overlay?.remove();
    state.preview = null;
  }

  /* ---------- export ---------- */

  function openPrintStudio() {
    closeMenu();
    state.project.print = printSettings(state.project);

    let tab = 'tables';
    let pageIndex = 0;
    let busy = false;
    let currentSheet = null;
    let currentScaler = null;
    let currentPageW = 0;
    let currentPageH = 0;
    let resizeObserver = null;

    const modal = openModal({
      title: 'Print table cards & name cards',
      subtitle: 'Physical, paper-sized PDFs — one for each table and one for every guest.',
      size: 'xl',
      className: 'print-modal',
      onClose: () => resizeObserver?.disconnect(),
      body: `<div class="print-studio">
        <div class="seg print-tabs" data-print-tabs>
          <button type="button" class="is-active" data-print-tab="tables">${icon('table', 14)} Table cards</button>
          <button type="button" data-print-tab="names">${icon('users', 14)} Name cards</button>
        </div>
        <div class="print-layout">
          <div class="print-preview-pane">
            <div class="print-preview-head">
              <span class="print-meta" data-print-meta></span>
              <div class="print-page-nav">
                <button class="icon-btn icon-btn--sm" type="button" data-print-prev aria-label="Previous page">${icon('chevron-left', 15)}</button>
                <span class="print-page-label" data-print-page>Page 1 of 1</span>
                <button class="icon-btn icon-btn--sm" type="button" data-print-next aria-label="Next page">${icon('chevron-right', 15)}</button>
              </div>
            </div>
            <div class="print-preview-stage" data-print-preview></div>
            <p class="field-note">Preview is scaled to fit. PDF pages are rendered at 300 dpi.</p>
          </div>
          <div class="print-settings" data-print-settings></div>
        </div>
      </div>`,
      footer: `<button class="btn btn-ghost" type="button" data-print-close>Close</button>
        <button class="btn btn-dark" type="button" data-print-now>${icon('printer', 16)} Print now</button>
        <button class="btn btn-gold" type="button" data-print-download>${icon('download', 16)} Download PDF</button>`
    });

    const tabsEl = modal.root.querySelector('[data-print-tabs]');
    const settingsEl = modal.root.querySelector('[data-print-settings]');
    const previewStage = modal.root.querySelector('[data-print-preview]');
    const metaEl = modal.root.querySelector('[data-print-meta]');
    const pageLabel = modal.root.querySelector('[data-print-page]');
    const prevButton = modal.root.querySelector('[data-print-prev]');
    const nextButton = modal.root.querySelector('[data-print-next]');
    const closeButton = modal.root.querySelector('[data-print-close]');
    const printButton = modal.root.querySelector('[data-print-now]');
    const downloadButton = modal.root.querySelector('[data-print-download]');

    const settingsFor = () => tab === 'tables'
      ? state.project.print.tableCards
      : state.project.print.nameCards;

    const currentPlan = () => tab === 'tables'
      ? planTableCards(state.project, settingsFor())
      : planNameCards(state.project, settingsFor());

    const printSelect = (label, group, key, value, options) => `<label class="field">
      <span class="field-label">${label}</span>
      <select class="select" data-print-group="${group}" data-print-key="${key}">
        ${options.map(option => `<option value="${esc(option.id)}" ${String(option.id) === String(value) ? 'selected' : ''}>${esc(option.label)}</option>`).join('')}
      </select>
    </label>`;

    const printSwitch = (label, group, key, checked) => `<label class="switch">
      <span class="switch-text">${label}</span>
      <input type="checkbox" data-print-group="${group}" data-print-key="${key}" ${checked ? 'checked' : ''}>
      <span class="switch-track"></span>
    </label>`;

    function statsText(plan) {
      const noun = tab === 'tables' ? 'table card' : 'name card';
      const perPage = plan.layout === 'single' ? 'one per page' : `${plan.perSheet} per sheet`;
      return `${plan.total} ${noun}${plan.total === 1 ? '' : 's'} · ${perPage} · ${plan.pageCount} page${plan.pageCount === 1 ? '' : 's'}`;
    }

    function renderSettings() {
      const savedScroll = settingsEl.scrollTop;
      const s = settingsFor();
      const plan = currentPlan();
      if (tab === 'tables') {
        settingsEl.innerHTML = `
          <div class="section">
            <h3 class="section-title">Table cards</h3>
            <p class="section-desc">One card per table, using the chart's card colour, table-name script and guest list. Pin them to the mirror or stand them on the tables.</p>
            ${printSelect('Card size', 'tableCards', 'size', s.size, Object.values(TABLE_SIZES))}
            ${printSelect('Layout', 'tableCards', 'layout', s.layout, [
              { id: 'sheet', label: 'Sheets — several per page' },
              { id: 'single', label: 'One card per page' }
            ])}
            ${s.layout === 'sheet' ? printSelect('Paper', 'tableCards', 'paper', s.paper, Object.values(PAPERS)) : ''}
            ${s.layout === 'sheet' ? printSwitch('Crop marks', 'tableCards', 'cropMarks', s.cropMarks) : ''}
            <div class="print-stat">${statsText(plan)}</div>
            ${plan.total === 0 ? `<p class="field-note field-note--warning">Add at least one table before printing.</p>` : ''}
            ${s.layout === 'sheet' && plan.perSheet === 1 ? '<p class="field-note field-note--warning">Only one card fits on this paper at this size. Choose “One card per page” for a clean, exact-size page.</p>' : ''}
            <p class="field-note">Tip: use the printer icon in the Tables panel to download one table on its own.</p>
            <button class="btn btn-dark btn-sm btn-block" type="button" data-print-edit-style>${icon('palette', 14)} Edit card styling</button>
          </div>
          <div class="section">
            <h3 class="section-title" style="margin-bottom:8px">What prints</h3>
            <p class="field-note">The card colour and inks come from the chart. Long guest lists shrink to fit; tables with many names switch to two columns automatically.</p>
          </div>`;
      } else {
        const sizes = NAME_SIZES[s.style] || NAME_SIZES.tent;
        settingsEl.innerHTML = `
          <div class="section">
            <h3 class="section-title">Name cards</h3>
            <p class="section-desc">One card for every guest, with their table printed underneath. Use flat place cards or a folded tent for the table.</p>
            ${printSelect('Card style', 'nameCards', 'style', s.style, NAME_STYLES)}
            ${printSelect('Size', 'nameCards', 'size', s.size, sizes)}
            ${printSelect('Layout', 'nameCards', 'layout', s.layout, [
              { id: 'sheet', label: 'Sheets — several per page' },
              { id: 'single', label: 'One card per page' }
            ])}
            ${s.layout === 'sheet' ? printSelect('Paper', 'nameCards', 'paper', s.paper, Object.values(PAPERS)) : ''}
            ${s.layout === 'sheet' ? printSwitch('Crop marks', 'nameCards', 'cropMarks', s.cropMarks) : ''}
            ${s.style === 'tent' ? printSwitch('Fold line', 'nameCards', 'foldLine', s.foldLine) : ''}
            ${printSwitch('Show table name', 'nameCards', 'showTable', s.showTable)}
            ${printSwitch('Hairline border', 'nameCards', 'border', s.border)}
            ${printSelect('Order', 'nameCards', 'sort', s.sort, [
              { id: 'table', label: 'By table, then guest order' },
              { id: 'name', label: 'Alphabetical by guest' }
            ])}
            <div class="print-stat">${statsText(plan)}</div>
            ${plan.total === 0 ? `<p class="field-note field-note--warning">Add guests in the Guests tab and assign them to a table before printing name cards.</p>` : ''}
            ${projectStats(state.project).unassigned ? `<p class="field-note field-note--warning">${projectStats(state.project).unassigned} unassigned guest${projectStats(state.project).unassigned === 1 ? '' : 's'} won’t print. Assign them in the Guests tab first.</p>` : ''}
            ${s.layout === 'sheet' && plan.perSheet === 1 ? '<p class="field-note field-note--warning">Only one card fits on this paper at this size. Choose “One card per page” for an exact-size page.</p>' : ''}
            <p class="field-note">${s.style === 'tent'
              ? 'Cut on the crop marks, then fold along the dashed line with the printed side out. The top half prints inverted on purpose so the name reads upright on both sides.'
              : 'Flat cards for place settings or an escort-card display.'}</p>
            <button class="btn btn-dark btn-sm btn-block" type="button" data-print-edit-style>${icon('palette', 14)} Edit chart fonts & colours</button>
          </div>
          <div class="section">
            <h3 class="section-title" style="margin-bottom:8px">What prints</h3>
            <p class="field-note">Guest names use the chart's table-name font. Table names use the guest-list font. Colours match the chart's cards.</p>
          </div>`;
      }
      if (busy) {
        downloadButton.disabled = true;
        printButton.disabled = true;
      } else {
        downloadButton.disabled = plan.total === 0;
        printButton.disabled = plan.total === 0;
      }
      requestAnimationFrame(() => { settingsEl.scrollTop = savedScroll; });
    }

    function fitPreview() {
      if (!currentSheet) return;
      const style = getComputedStyle(previewStage);
      const availableW = previewStage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const availableH = previewStage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const scale = Math.max(0.02, Math.min(availableW / inPx(currentPageW), availableH / inPx(currentPageH), 1));
      currentSheet.style.transform = `scale(${scale})`;
      currentScaler.style.width = `${inPx(currentPageW) * scale}px`;
      currentScaler.style.height = `${inPx(currentPageH) * scale}px`;
    }

    function renderPreview() {
      const plan = currentPlan();
      if (plan.pageCount) pageIndex = clamp(pageIndex, 0, plan.pageCount - 1);
      else pageIndex = 0;

      pageLabel.textContent = plan.pageCount ? `Page ${pageIndex + 1} of ${plan.pageCount}` : 'No pages';
      metaEl.textContent = plan.total ? statsText(plan) : '';
      prevButton.disabled = !plan.total || pageIndex <= 0;
      nextButton.disabled = !plan.total || pageIndex >= plan.pageCount - 1;
      downloadButton.disabled = busy || plan.total === 0;
      printButton.disabled = busy || plan.total === 0;
      previewStage.replaceChildren();
      currentSheet = null;
      currentScaler = null;

      if (!plan.total) {
        previewStage.innerHTML = `<div class="print-empty">
          ${icon(tab === 'tables' ? 'table' : 'users', 28)}
          <strong>${tab === 'tables' ? 'No tables yet' : 'No guest names yet'}</strong>
          <span>${tab === 'tables' ? 'Add a table in the Tables panel, then come back to print.' : 'Add guests in the Guests tab and assign them to a table.'}</span>
        </div>`;
        return;
      }

      const built = tab === 'tables'
        ? buildTableCardsSheet(state.project, pageIndex, settingsFor())
        : buildNameCardsSheet(state.project, pageIndex, settingsFor());
      const scaler = document.createElement('div');
      scaler.className = 'print-preview-scaler';
      scaler.appendChild(built.el);
      previewStage.appendChild(scaler);
      currentSheet = built.el;
      currentScaler = scaler;
      currentPageW = built.plan.pageW;
      currentPageH = built.plan.pageH;
      requestAnimationFrame(() => requestAnimationFrame(fitPreview));
    }

    function updatePrintSetting(group, key, value) {
      const next = clone(state.project.print);
      next[group][key] = value;
      if (group === 'nameCards' && key === 'style') {
        const sizes = NAME_SIZES[value] || [];
        if (sizes.length && !sizes.some(size => size.id === next.nameCards.size)) next.nameCards.size = sizes[0].id;
      }
      state.project.print = printSettings({ ...state.project, print: next });
      state.project.updatedAt = Date.now();
      pageIndex = 0;
      setSaveState('saving');
      saveLater();
      renderSettings();
      renderPreview();
    }

    function switchTab(nextTab) {
      if (busy) return;
      tab = nextTab;
      pageIndex = 0;
      settingsEl.scrollTop = 0;
      tabsEl.querySelectorAll('[data-print-tab]').forEach(button => {
        button.classList.toggle('is-active', button.dataset.printTab === nextTab);
      });
      renderSettings();
      renderPreview();
    }

    function setBusy(value, label = 'Rendering…') {
      busy = value;
      closeButton.disabled = value;
      downloadButton.disabled = value || currentPlan().total === 0;
      printButton.disabled = value || currentPlan().total === 0;
      prevButton.disabled = value;
      nextButton.disabled = value;
      tabsEl.querySelectorAll('button').forEach(button => { button.disabled = value; });
      settingsEl.querySelectorAll('select, input, button').forEach(control => { control.disabled = value; });
      if (value) {
        downloadButton.innerHTML = `<span class="spinner"></span> ${label}`;
        printButton.innerHTML = `<span class="spinner"></span> Preparing…`;
      } else {
        downloadButton.innerHTML = `${icon('download', 16)} Download PDF`;
        printButton.innerHTML = `${icon('printer', 16)} Print now`;
        renderSettings();
        renderPreview();
      }
    }

    async function downloadPdf() {
      if (busy) return;
      const plan = currentPlan();
      if (!plan.total) return;
      const variant = tab === 'tables' ? 'tables' : 'names';
      setBusy(true, 'Preparing…');
      try {
        const result = await exportPrintPdf(state.project, variant, settingsFor(), {
          onProgress: (current, total) => {
            downloadButton.innerHTML = `<span class="spinner"></span> Rendering ${current} / ${total}…`;
          }
        });
        toast(`${tab === 'tables' ? 'Table cards' : 'Name cards'} PDF downloaded · ${result.pageCount} page${result.pageCount === 1 ? '' : 's'}.`);
        modal.close();
      } catch (error) {
        console.error(error);
        setBusy(false);
        toast(exportErrorMessage(error), { tone: 'error', duration: 6000 });
      }
    }

    async function printNow() {
      if (busy) return;
      const plan = currentPlan();
      if (!plan.total) return;
      const variant = tab === 'tables' ? 'tables' : 'names';
      setBusy(true, 'Preparing…');
      try {
        await printPrintSheets(state.project, variant, settingsFor(), {
          onProgress: (current, total) => {
            downloadButton.innerHTML = `<span class="spinner"></span> Rendering ${current} / ${total}…`;
          }
        });
        toast('Print window opened.');
        modal.close();
      } catch (error) {
        console.error(error);
        setBusy(false);
        toast(exportErrorMessage(error), { tone: 'error', duration: 6000 });
      }
    }

    tabsEl.addEventListener('click', (event) => {
      const button = event.target.closest('[data-print-tab]');
      if (button) switchTab(button.dataset.printTab);
    });

    settingsEl.addEventListener('change', (event) => {
      const control = event.target.closest('[data-print-group]');
      if (!control) return;
      const value = control.type === 'checkbox' ? control.checked : control.value;
      updatePrintSetting(control.dataset.printGroup, control.dataset.printKey, value);
    });

    settingsEl.addEventListener('click', (event) => {
      if (!event.target.closest('[data-print-edit-style]')) return;
      modal.close();
      setTab('design');
      if (isMobileSidebar()) openSidebar('design');
      setTimeout(() => {
        const heading = [...$$('.section-title', panelDesign)].find(el => el.textContent.trim().toLowerCase() === 'table cards');
        heading?.closest('.section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 220);
    });

    prevButton.addEventListener('click', () => {
      if (pageIndex <= 0) return;
      pageIndex -= 1;
      renderPreview();
    });
    nextButton.addEventListener('click', () => {
      if (pageIndex >= currentPlan().pageCount - 1) return;
      pageIndex += 1;
      renderPreview();
    });
    closeButton.addEventListener('click', () => modal.close());
    downloadButton.addEventListener('click', downloadPdf);
    printButton.addEventListener('click', printNow);

    resizeObserver = new ResizeObserver(() => fitPreview());
    resizeObserver.observe(previewStage);
    renderSettings();
    renderPreview();
  }

  async function printTableCard(id) {
    const card = state.project.cards.find(item => item.id === id);
    if (!card) return;
    state.project.print = printSettings(state.project);
    toast(`Preparing “${card.label}”…`, { duration: 1800 });
    try {
      await downloadTableCardPdf(state.project, card, state.project.print.tableCards);
      toast('Table card PDF downloaded.');
    } catch (error) {
      console.error(error);
      toast(exportErrorMessage(error), { tone: 'error', duration: 6000 });
    }
  }

  function openExportModal() {
    closeMenu();
    let format = 'png';
    let pngWidth = 4000;
    let pageId = 'design';
    let busy = false;

    const modal = openModal({
      title: 'Export the mirror chart',
      subtitle: 'This exports the full mirror mockup. For printed table cards and name cards, use Print.',
      size: 'md',
      body: `
        <div class="seg export-tabs" data-export-tabs>
          <button type="button" class="is-active" data-format="png">${icon('image', 14)} PNG image</button>
          <button type="button" data-format="pdf">${icon('file', 14)} PDF / print</button>
        </div>
        <div data-export-panel="png">
          <div class="field">
            <span class="field-label">Resolution <span class="field-value" data-export-size></span></span>
            <div class="export-options">
              ${PNG_WIDTHS.map(option => `<button class="export-option ${option.value === pngWidth ? 'is-active' : ''}" type="button" data-png-width="${option.value}"><b>${option.label}</b><small>${option.hint}</small></button>`).join('')}
            </div>
          </div>
          <div class="export-note">${icon('sparkles', 16)}<span>PNG is perfect for sharing on screen, sending to a printer, or printing at home. Choose High for a 4000 px wide file.</span></div>
        </div>
        <div data-export-panel="pdf" hidden>
          <div class="field">
            <span class="field-label">Print page size</span>
            <div class="export-options export-options--pages">
              ${PAGE_SIZES.map(page => `<button class="export-option ${page.id === pageId ? 'is-active' : ''}" type="button" data-page-id="${page.id}"><b>${esc(page.label)}</b><small>${esc(page.hint)}</small></button>`).join('')}
            </div>
          </div>
          <div class="export-note">${icon('printer', 16)}<span>The PDF embeds a high-resolution image with the exact page size. For the crispest print, choose the page closest to your chart's proportions.</span></div>
        </div>
        <div class="export-preview-row"><strong data-export-summary></strong><span data-export-detail></span></div>`,
      footer: `<button class="btn btn-ghost" type="button" data-export-cancel>Cancel</button>
        <button class="btn btn-dark" type="button" data-export-print>${icon('printer', 16)} Print</button>
        <button class="btn btn-gold" type="button" data-export-go>${icon('download', 16)} Download PNG</button>`
    });

    const goButton = modal.root.querySelector('[data-export-go]');
    const printButton = modal.root.querySelector('[data-export-print]');

    const updateSummary = () => {
      const size = modal.root.querySelector('[data-export-size]');
      const summary = modal.root.querySelector('[data-export-summary]');
      const detail = modal.root.querySelector('[data-export-detail]');
      if (size) size.textContent = `${pngWidth} × ${Math.round(pngWidth * state.project.height / state.project.width)} px`;
      if (summary) summary.textContent = format === 'png' ? 'PNG image' : 'PDF document';
      const page = PAGE_SIZES.find(p => p.id === pageId);
      if (detail) {
        detail.textContent = format === 'png'
          ? `${pngWidth} px wide · ready for print or screen`
          : `${page?.label} · ${page?.hint}`;
      }
      goButton.innerHTML = `${icon('download', 16)} Download ${format === 'png' ? 'PNG' : 'PDF'}`;
    };
    updateSummary();

    const setBusy = (isBusy, label = 'Rendering…') => {
      busy = isBusy;
      modal.root.querySelectorAll('[data-export-go], [data-export-print], [data-export-cancel]').forEach(button => { button.disabled = isBusy; });
      if (isBusy) {
        goButton.innerHTML = `<span class="spinner"></span> ${label}`;
        printButton.innerHTML = `<span class="spinner"></span> Preparing…`;
      } else {
        updateSummary();
        printButton.innerHTML = `${icon('printer', 16)} Print`;
      }
    };

    modal.root.querySelectorAll('[data-format]').forEach(button => {
      button.addEventListener('click', () => {
        if (busy) return;
        format = button.dataset.format;
        modal.root.querySelectorAll('[data-format]').forEach(item => item.classList.toggle('is-active', item === button));
        modal.root.querySelectorAll('[data-export-panel]').forEach(panel => { panel.hidden = panel.dataset.exportPanel !== format; });
        updateSummary();
      });
    });
    modal.root.querySelectorAll('[data-png-width]').forEach(button => {
      button.addEventListener('click', () => {
        if (busy) return;
        pngWidth = Number(button.dataset.pngWidth);
        modal.root.querySelectorAll('[data-png-width]').forEach(item => item.classList.toggle('is-active', item === button));
        updateSummary();
      });
    });
    modal.root.querySelectorAll('[data-page-id]').forEach(button => {
      button.addEventListener('click', () => {
        if (busy) return;
        pageId = button.dataset.pageId;
        modal.root.querySelectorAll('[data-page-id]').forEach(item => item.classList.toggle('is-active', item === button));
        updateSummary();
      });
    });
    modal.root.querySelector('[data-export-cancel]').addEventListener('click', modal.close);

    goButton.addEventListener('click', async () => {
      if (busy) return;
      setBusy(true, format === 'png' ? 'Rendering PNG…' : 'Rendering PDF…');
      try {
        if (format === 'png') {
          const result = await exportPng(state.project, { width: pngWidth });
          toast(`PNG downloaded · ${result.width} × ${result.height} px`);
        } else {
          const result = await exportPdf(state.project, { width: 4000, pageId });
          toast(`PDF downloaded · ${result.page}`);
        }
        modal.close();
      } catch (error) {
        console.error(error);
        setBusy(false);
        toast(exportErrorMessage(error), { tone: 'error', duration: 6500 });
      }
    });

    printButton.addEventListener('click', async () => {
      if (busy) return;
      setBusy(true, 'Preparing print…');
      try {
        await printProject(state.project, { pageId, width: 3500 });
        setBusy(false);
        modal.close();
        toast('Print window opened.');
      } catch (error) {
        console.error(error);
        setBusy(false);
        toast(exportErrorMessage(error), { tone: 'error', duration: 6500 });
      }
    });
  }

  function exportErrorMessage(error) {
    if (location.protocol === 'file:') {
      return 'Export needs the studio served over HTTP. Run the local server described in the README and try again.';
    }
    return error?.message || 'The export could not be created. Please try again.';
  }

  /* ---------- shortcuts ---------- */

  function openShortcuts() {
    closeMenu();
    openModal({
      title: 'Keyboard shortcuts',
      size: 'sm',
      body: `<ul class="info-list">
        <li><span class="kbd">⌘</span><span class="kbd">Z</span><span>Undo &nbsp;·&nbsp; <span class="kbd">⇧</span><span class="kbd">⌘</span><span class="kbd">Z</span> redo</span></li>
        <li>${icon('move', 17)}<span>Arrow keys nudge the selected card. Hold <span class="kbd">Shift</span> for larger steps.</span></li>
        <li>${icon('copy', 17)}<span><span class="kbd">⌘</span><span class="kbd">D</span> duplicates the selected card.</span></li>
        <li>${icon('trash', 17)}<span><span class="kbd">Del</span> removes the selected card — undo is always available.</span></li>
        <li>${icon('check', 17)}<span><span class="kbd">⌘</span><span class="kbd">S</span> saves immediately. Everything also autosaves.</span></li>
        <li>${icon('eye', 17)}<span><span class="kbd">Esc</span> clears the selection or closes a panel.</span></li>
      </ul>`,
      footer: `<button class="btn btn-gold" type="button" data-close>Close</button>`
    });
    requestAnimationFrame(() => {
      const current = $$('.modal-backdrop').at(-1);
      current?.querySelector('[data-close]')?.addEventListener('click', () => current.querySelector('.modal-close')?.click());
    });
  }

  /* ---------- project actions ---------- */

  function openGuide() {
    closeMenu();
    openModal({
      title: 'A chart in four steps',
      size: 'md',
      body: `<ul class="info-list">
        <li>${icon('palette', 18)}<span><strong>Pick a look.</strong> Presets change the paper, frame, fonts and card styling together. Every detail can be adjusted afterwards.</span></li>
        <li>${icon('users', 18)}<span><strong>Enter your people once.</strong> In the Guests tab, paste the whole list into Unassigned. Then drag names into tables — or tap a name then tap a table — and reorder within a table by dragging.</span></li>
        <li>${icon('move', 18)}<span><strong>Place the cards.</strong> Auto layout keeps a tidy grid. Drag any card to break free and position it exactly.</span></li>
        <li>${icon('printer', 18)}<span><strong>Print.</strong> The gold Print button makes paper-sized table cards and a name card for every guest — with crop marks and fold lines. Export the mirror mockup separately from the ··· menu.</span></li>
      </ul>`,
      footer: `<button class="btn btn-gold" type="button" data-close>Start designing</button>`
    });
    requestAnimationFrame(() => {
      const current = $$('.modal-backdrop').at(-1);
      current?.querySelector('[data-close]')?.addEventListener('click', () => current.querySelector('.modal-close')?.click());
    });
  }

  function closeMenu() {
    menu.classList.remove('is-open');
  }

  function toggleMenu() {
    menu.classList.toggle('is-open');
  }

  async function duplicateProject() {
    closeMenu();
    await flushSave();
    const copy = clone(state.project);
    copy.id = uid();
    copy.name = `${state.project.name} copy`.slice(0, 90);
    copy.createdAt = Date.now();
    copy.updatedAt = Date.now();
    try {
      await saveProject(copy);
      toast('Chart duplicated.');
      options.onOpenProject?.(copy.id);
    } catch (error) {
      console.error(error);
      toast('That copy could not be saved.', { tone: 'error' });
    }
  }

  async function backupProject() {
    closeMenu();
    downloadText(projectToJson(state.project), `${slugify(state.project.name)}.gilded.json`);
    toast('Project file downloaded.');
  }

  async function deleteCurrentProject() {
    closeMenu();
    const ok = await confirmDialog({
      title: 'Delete this chart?',
      message: `“${state.project.name}” will be removed from this device. This cannot be undone.`,
      confirmLabel: 'Delete chart'
    });
    if (!ok) return;
    state.skipSaveOnDestroy = true;
    saveLater.cancel();
    try {
      await deleteProject(state.project.id);
      toast('Chart deleted.');
      options.onDelete?.();
    } catch (error) {
      console.error(error);
      state.skipSaveOnDestroy = false;
      toast('This chart could not be deleted.', { tone: 'error' });
    }
  }

  async function leaveEditor() {
    closeMenu();
    await flushSave();
    options.onExit?.();
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      if (document.body.classList.contains('has-modal')) return;
      if (state.preview) { closePreview(); return; }
      if (menu.classList.contains('is-open')) { closeMenu(); return; }
      if (backdrop.classList.contains('is-open')) { closeDrawer(); return; }
      if (state.selectedGuestId) { clearGuestSelection(); return; }
      if (state.selectedId) { clearSelection(); return; }
      return;
    }
    if (isTypingTarget(event.target)) return;

    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();

    if (mod && key === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
      return;
    }
    if (mod && key === 'y') { event.preventDefault(); redo(); return; }
    if (mod && key === 's') {
      event.preventDefault();
      flushSave().then(() => toast('Saved.')).catch(console.warn);
      return;
    }
    if (mod && key === 'd') {
      if (state.selectedId) { event.preventDefault(); duplicateSelected(); }
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (event.target.closest('#panel-guests, .sidebar, .inspector')) return;
      if (state.selectedId) { event.preventDefault(); deleteSelected(); }
      return;
    }
    if (state.selectedId && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) && !event.target.closest('.sidebar, .inspector')) {
      event.preventDefault();
      const step = event.shiftKey ? 24 : 4;
      const card = state.project.cards.find(c => c.id === state.selectedId);
      if (!card) return;
      if (state.project.layout.auto) {
        const { positions } = computeLayout(state.project);
        state.project.cards.forEach(item => {
          const pos = positions[item.id];
          if (pos) { item.x = pos.x; item.y = pos.y; }
        });
        state.project.layout.auto = false;
      }
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
      const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
      pushHistory(clone(state.project));
      card.x = clamp(Math.round(card.x + dx), 0, state.project.width - 40);
      card.y = clamp(Math.round(card.y + dy), 0, state.project.height - 40);
      state.project.updatedAt = Date.now();
      renderStage();
      syncPanels();
      setSaveState('saving');
      saveLater();
      return;
    }
    if (key === '0') { fitToScreen(); return; }
    if (key === '+' || key === '=') { setZoom(state.zoom * 1.15); return; }
    if (key === '-') { setZoom(state.zoom / 1.15); }
  }

  /* ---------- delegated events ---------- */

  // Sidebar: all design and table controls.
  listen(sidebar, 'input', (event) => {
    const input = event.target.closest('[data-path]');
    if (input) { onPathControl(input); return; }
    const bulk = event.target.closest('[data-bulk-guests]');
    if (bulk) { updateBulkAddState(); return; }
    const search = event.target.closest('[data-guest-search]');
    if (search) {
      state.guestSearch = search.value;
      applyGuestFilter();
      return;
    }
    const field = event.target.closest('[data-card-field="label"]');
    if (field) updateCardLabel(field.dataset.cardId, field.value);
  });

  listen(sidebar, 'change', (event) => {
    const input = event.target.closest('[data-path]');
    if (input && input.tagName === 'SELECT') onPathControl(input, true);
  });

  listen(sidebar, 'pointerdown', beginGuestPointer);
  listen(window, 'pointermove', moveGuestPointer);
  listen(window, 'pointerup', endGuestPointer);
  listen(window, 'pointercancel', endGuestPointer);

  listen(sidebar, 'focusout', (event) => {
    if (event.target.matches('[data-hex]')) syncFormValues(panelDesign);
  });

  listen(sidebar, 'click', async (event) => {
    const preset = event.target.closest('[data-preset]');
    if (preset) {
      apply(project => applyPreset(project, preset.dataset.preset), { history: true });
      renderDesignPanel();
      syncPanels();
      toast('Preset applied.');
      return;
    }

    const option = event.target.closest('[data-option-path]');
    if (option) {
      applyPath(option.dataset.optionPath, option.dataset.optionValue);
      updateOptionStates();
      return;
    }

    const guestAction = event.target.closest('[data-guest-action]');
    if (guestAction) {
      if (guestAction.dataset.guestAction === 'rename') openGuestRenameDialog(guestAction.dataset.guestId);
      if (guestAction.dataset.guestAction === 'remove') removeGuest(guestAction.dataset.guestId);
      return;
    }

    const guestChip = event.target.closest('.guest-chip');
    if (guestChip) {
      if (state.guestSuppressClick) {
        state.guestSuppressClick = false;
      } else {
        toggleGuestSelection(guestChip.dataset.guestId);
      }
      return;
    }

    const dropZone = event.target.closest('[data-guest-drop]');
    if (dropZone && state.selectedGuestId && !event.target.closest('button')) {
      const target = dropZone.dataset.dropTable;
      const tableId = target === 'unassigned' ? null : target;
      const index = state.project.guests.filter(guest =>
        guest.id !== state.selectedGuestId && (tableId === null ? !guest.tableId : guest.tableId === tableId)
      ).length;
      moveGuest(state.selectedGuestId, tableId, index);
      return;
    }

    const actionEl = event.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    const id = actionEl.dataset.id;

    switch (action) {
      case 'tidy':
        apply(project => {
          project.layout.auto = true;
          applyAutoPositions(project);
          return project;
        }, { history: true });
        toast('Tables tidied into the grid.');
        break;
      case 'fit-page': {
        const result = autoFitTables(state.project);
        replaceProject(result.project, { history: true, rebuild: false });
        if (result.fitted) toast('Tables fitted to the page.');
        else toast('Still too tall — try fewer tables or more columns.', { tone: 'error', duration: 5000 });
        break;
      }
      case 'add-table':
        addTable();
        break;
      case 'renumber':
        renumberTables();
        break;
      case 'toggle-table': {
        const tableId = actionEl.dataset.id;
        if (state.openTables.has(tableId)) state.openTables.delete(tableId);
        else state.openTables.add(tableId);
        const item = actionEl.closest('.table-item');
        const open = state.openTables.has(tableId);
        item?.classList.toggle('is-open', open);
        const body = $('.table-body', item || document);
        if (body) body.hidden = !open;
        actionEl.setAttribute('aria-expanded', String(open));
        break;
      }
      case 'table-up':
        moveTable(id, -1);
        break;
      case 'table-down':
        moveTable(id, 1);
        break;
      case 'table-delete':
        deleteTable(id);
        break;
      case 'print-table':
        printTableCard(id);
        break;
      case 'show-card':
        showCardOnStage(id);
        break;
      case 'upload-photo':
        photoInput.click();
        break;
      case 'remove-photo':
        apply(project => {
          project.theme.background.image = null;
          project.theme.background.type = 'paper';
          project.theme.preset = 'custom';
          return project;
        }, { history: true });
        renderDesignPanel();
        syncPanels();
        toast('Background photo removed.');
        break;
      case 'add-guests':
        addGuestsFromBulk();
        break;
      case 'toggle-guest-add':
        toggleGuestAdd();
        break;
      case 'deal-unassigned':
        dealUnassigned();
        break;
      case 'unassign-all':
        unassignAllGuests();
        break;
      case 'arrange-guests':
        showGuestsForTable(id);
        break;
      case 'clear-guest-selection':
        clearGuestSelection();
        break;
      default:
        break;
    }
  });

  // Table accordion and guest keyboard support
  listen(sidebar, 'keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-action="toggle-table"]')) {
      event.preventDefault();
      event.target.click();
      return;
    }
    if (event.key === 'Escape' && state.selectedGuestId) {
      clearGuestSelection();
      return;
    }
    const chip = event.target.closest('.guest-chip');
    if (chip && !event.target.closest('button') && (event.key === 'Delete' || event.key === 'Backspace')) {
      event.preventDefault();
      event.stopPropagation();
      removeGuest(chip.dataset.guestId);
      return;
    }
    if (chip && !event.target.closest('button') && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      toggleGuestSelection(chip.dataset.guestId);
      return;
    }
    const zone = event.target.closest('[data-guest-drop]');
    if (zone && (event.key === 'Delete' || event.key === 'Backspace')) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (zone && state.selectedGuestId && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      const target = zone.dataset.dropTable;
      const tableId = target === 'unassigned' ? null : target;
      const index = state.project.guests.filter(guest =>
        guest.id !== state.selectedGuestId && (tableId === null ? !guest.tableId : guest.tableId === tableId)
      ).length;
      moveGuest(state.selectedGuestId, tableId, index);
    }
  });

  // Inspector controls
  listen(inspector, 'input', (event) => {
    const field = event.target.closest('[data-inspector]');
    if (!field) return;
    const card = state.project.cards.find(c => c.id === state.selectedId);
    if (!card) return;
    const name = field.dataset.inspector;
    if (name === 'label') {
      updateCardLabel(card.id, field.value);
      const title = $('[data-inspector-title]', inspector);
      if (title) title.textContent = field.value || 'Untitled table';
      return;
    }
    if (name === 'x' || name === 'y') {
      if (field.value === '') return;
      setCardPosition(card.id, name, Number(field.value));
      return;
    }
    if (name === 'rotation') {
      apply(project => {
        const target = project.cards.find(c => c.id === card.id);
        if (target) target.rotation = Number(field.value);
        return project;
      }, { key: 'rotation:' + card.id });
      const out = $('[data-out-inspector="rotation"]', inspector);
      if (out) out.textContent = `${fmt(Number(field.value))}°`;
    }
  });

  listen(inspector, 'change', (event) => {
    if (event.target.matches('[data-inspector="x"], [data-inspector="y"]')) {
      syncInspector();
    }
  });

  listen(inspector, 'click', (event) => {
    const actionEl = event.target.closest('[data-inspector-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.inspectorAction;
    if (action === 'close') clearSelection();
    if (action === 'duplicate') duplicateSelected();
    if (action === 'delete') deleteSelected();
    if (action === 'arrange' && state.selectedId) showGuestsForTable(state.selectedId);
  });

  // Stage interactions
  listen(scaler, 'pointerdown', beginCardPointer);
  listen(window, 'pointermove', moveCardPointer);
  listen(window, 'pointerup', endCardPointer);
  listen(window, 'pointercancel', endCardPointer);
  listen(stage, 'pointerdown', (event) => {
    if (event.target.closest('.table-card') || event.target.closest('.zoom-pill')) return;
    clearSelection();
  });

  listen(stageWrap, 'click', (event) => {
    const actionEl = event.target.closest('.zoom-pill [data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    if (action === 'zoom-in') setZoom(state.zoom * 1.15);
    if (action === 'zoom-out') setZoom(state.zoom / 1.15);
    if (action === 'zoom-fit') fitToScreen();
  });

  listen(stage, 'wheel', (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.12 : 0.89;
    setZoom(state.zoom * factor);
  }, { passive: false });

  // Topbar
  listen(topbar, 'click', (event) => {
    const menuAction = event.target.closest('[data-menu-action]');
    if (menuAction) {
      const action = menuAction.dataset.menuAction;
      if (action === 'duplicate') duplicateProject();
      if (action === 'backup') backupProject();
      if (action === 'mirror-export') openExportModal();
      if (action === 'save') flushSave().then(() => toast('Saved.')).catch(console.warn);
      if (action === 'shortcuts') openShortcuts();
      if (action === 'guide') openGuide();
      if (action === 'delete') deleteCurrentProject();
      return;
    }

    const actionEl = event.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    if (action === 'back') leaveEditor();
    if (action === 'undo') undo();
    if (action === 'redo') redo();
    if (action === 'preview') openPreview();
    if (action === 'print') openPrintStudio();
    if (action === 'export') openExportModal();
    if (action === 'menu') toggleMenu();
    if (action === 'zoom-in') setZoom(state.zoom * 1.15);
    if (action === 'zoom-out') setZoom(state.zoom / 1.15);
    if (action === 'zoom-fit') fitToScreen();
  });

  listen(projectName, 'input', () => {
    const value = projectName.value;
    apply(project => { project.name = value; return project; }, { key: 'project-name', render: false });
    document.title = `${value || 'Untitled chart'} · Gilded`;
  });
  listen(projectName, 'change', () => {
    if (!projectName.value.trim()) {
      projectName.value = 'Untitled chart';
      apply(project => { project.name = 'Untitled chart'; return project; }, { render: false });
      document.title = 'Untitled chart · Gilded';
    }
    persist();
  });

  listen(document, 'click', (event) => {
    if (!event.target.closest('.menu-wrap')) closeMenu();
    if (event.target.closest('[data-mobile]')) {
      const kind = event.target.closest('[data-mobile]').dataset.mobile;
      if (kind === 'design' || kind === 'tables' || kind === 'guests') {
        if (sidebar.classList.contains('is-open') && state.activeTab === kind) closeSidebar();
        else openSidebar(kind);
      } else if (kind === 'card') {
        if (!state.selectedId) {
          toast('Select a table card on the chart first.');
        } else if (inspector.classList.contains('is-open')) {
          closeDrawer();
        } else {
          openInspectorDrawer();
        }
      }
    }
  });

  listen(backdrop, 'click', closeDrawer);

  listen(sidebar, 'click', (event) => {
    if (event.target.closest('.sidebar-tab')) {
      const tab = event.target.closest('.sidebar-tab').dataset.tab;
      setTab(tab);
    }
  });

  listen(document, 'keydown', onKeyDown);

  listen(window, 'pagehide', () => {
    if (!state.skipSaveOnDestroy) saveProject(clone(state.project)).catch(() => {});
  });

  photoInput.addEventListener('change', async () => {
    const file = photoInput.files?.[0];
    photoInput.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('Please choose an image file.', { tone: 'error' });
      return;
    }
    toast('Preparing your photo…', { duration: 1800 });
    try {
      const photo = await preparePhoto(file);
      apply(project => {
        project.theme.background.type = 'photo';
        project.theme.background.image = photo.dataUrl;
        project.theme.background.overlay = Math.max(0.22, project.theme.background.overlay || 0);
        if (!project.theme.background.color || project.theme.background.color === '#dfe3d9') {
          project.theme.background.color = '#f1e9db';
        }
        project.theme.preset = 'custom';
        return project;
      }, { history: true });
      renderDesignPanel();
      syncPanels();
      toast('Background photo added.');
    } catch (error) {
      console.error(error);
      toast('That image could not be prepared.', { tone: 'error' });
    }
  });

  const resizeObserver = new ResizeObserver(() => {
    measureFit();
    applyZoom(true);
  });
  resizeObserver.observe(stage);

  listen(window, 'resize', () => {
    updateMobileNav();
    if (!isDrawerInspector()) inspector.classList.remove('is-open');
    if (!isMobileSidebar()) sidebar.classList.remove('is-open');
    maybeCloseBackdrop();
  });

  /* ---------- init ---------- */

  renderDesignPanel();
  renderTablesPanel();
  renderStage();
  renderInspector();
  syncPanels();
  updateHistoryButtons();
  updateOptionStates();
  requestAnimationFrame(() => {
    measureFit();
    applyZoom(false);
    setSaveState('saved');
  });

  async function destroy() {
    if (state.destroyed) return;
    state.destroyed = true;
    saveLater.cancel();
    closePreview();
    closeMenu();
    try { resizeObserver.disconnect(); } catch { /* ignore */ }
    cleanups.forEach(cleanup => { try { cleanup(); } catch { /* ignore */ } });
    document.querySelectorAll('#modal-root .modal-backdrop').forEach(node => node.remove());
    document.body.classList.remove('has-modal');
    if (!state.skipSaveOnDestroy) {
      try { await saveProject(clone(state.project)); } catch (error) { console.warn(error); }
    }
    document.title = 'Gilded · Seating Chart Studio';
  }

  return { destroy };
}
