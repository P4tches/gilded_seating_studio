/* Gilded — app bootstrap, gallery and routing. */

import {
  ensureSeedProject, listProjects, getProject, saveProject, deleteProject
} from './db.js';
import {
  createProject, normalizeProject, projectStats, formatUpdated,
  fontStack, uid, clone
} from './model.js';
import { PRESETS, TEMPLATES } from './presets.js';
import { renderArtboard } from './render.js';
import { mountEditor } from './editor.js';
import { projectToJson } from './export.js';
import { icon, LOGO_SVG } from './icons.js';
import {
  $, $$, esc, toast, openModal, confirmDialog, downloadText, slugify,
  readFileAsText, waitForFonts, isStandalone
} from './utils.js';

const appRoot = document.getElementById('app');
let currentEditor = null;
let galleryObservers = [];
let deferredPrompt = null;

/* ---------- install ---------- */

function initInstall() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    toast('Gilded is installed. Find it on your home screen.', { tone: 'default' });
  });
}

function installHelp() {
  openModal({
    title: 'Keep Gilded close',
    subtitle: 'Install the studio on this device — it works offline once opened.',
    body: `<ul class="info-list">
      <li>${icon('install', 18)}<span><strong>Chrome, Edge or Android:</strong> open the browser menu (⋮) and choose “Install Gilded” or “Add to Home screen”.</span></li>
      <li>${icon('sparkles', 18)}<span><strong>iPhone or iPad:</strong> tap the Share button in Safari, then “Add to Home Screen”.</span></li>
      <li>${icon('download', 18)}<span><strong>Desktop Safari:</strong> choose File → “Add to Dock”.</span></li>
      <li>${icon('check', 18)}<span>Your charts are stored on this device only. Nothing is uploaded anywhere.</span></li>
    </ul>`,
    footer: `<button class="btn btn-gold" data-close type="button">Got it</button>`,
    size: 'md'
  });
  requestAnimationFrame(() => {
    $$('.modal-backdrop [data-close]').at(-1)?.addEventListener('click', () => {
      $$('.modal-backdrop').at(-1)?.querySelector('.modal-close')?.click();
    });
  });
}

async function promptInstall() {
  if (!deferredPrompt) { installHelp(); return; }
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice.catch(() => ({ outcome: 'dismissed' }));
  deferredPrompt = null;
  if (outcome === 'accepted') toast('Installing Gilded…');
}

/* ---------- service worker ---------- */

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('./sw.js').then((registration) => {
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          toast('A new version of Gilded is ready.', {
            duration: 12000,
            action: { label: 'Reload', onClick: () => location.reload() }
          });
        }
      });
    });
  }).catch((error) => console.warn('Service worker registration failed', error));
}

/* ---------- routing ---------- */

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  if (raw.startsWith('edit/')) {
    return { view: 'editor', id: decodeURIComponent(raw.slice(5).split(/[?&]/)[0]) };
  }
  return { view: 'gallery' };
}

function go(path) {
  if (location.hash === path) route();
  else location.hash = path;
}

async function route() {
  const target = parseRoute();
  if (currentEditor) {
    const destroy = currentEditor.destroy;
    currentEditor = null;
    try { await destroy(); } catch (error) { console.warn(error); }
  }
  cleanupGallery();

  if (target.view === 'editor') {
    const project = await getProject(target.id);
    if (!project) {
      toast('That seating chart could not be found.', { tone: 'error' });
      go('#/');
      return;
    }
    const root = document.createElement('div');
    root.className = 'editor-root';
    appRoot.replaceChildren(root);
    currentEditor = mountEditor(root, project, {
      onExit: () => go('#/'),
      onOpenProject: (id) => go('#/edit/' + encodeURIComponent(id)),
      onDelete: () => go('#/')
    });
  } else {
    await renderGallery();
  }
}

/* ---------- gallery ---------- */

function cleanupGallery() {
  galleryObservers.forEach(observer => observer.disconnect());
  galleryObservers = [];
}

function galleryCard(project, index) {
  const stats = projectStats(project);
  return `<article class="project-card" data-project-id="${esc(project.id)}" tabindex="0" role="button" aria-label="Open ${esc(project.name)}" style="animation-delay:${Math.min(index * 45, 260)}ms">
    <div class="project-thumb">
      <div class="thumb-stage" data-thumb-id="${esc(project.id)}"></div>
      <div class="project-actions">
        <button class="icon-btn" type="button" data-project-action="duplicate" aria-label="Duplicate chart" title="Duplicate">${icon('copy', 15)}</button>
        <button class="icon-btn" type="button" data-project-action="backup" aria-label="Download chart file" title="Download backup">${icon('download', 15)}</button>
        <button class="icon-btn" type="button" data-project-action="delete" aria-label="Delete chart" title="Delete">${icon('trash', 15)}</button>
      </div>
      ${project.id === 'demo-chart' ? '<span class="project-badge">Sample</span>' : ''}
    </div>
    <div class="project-info">
      <div style="min-width:0">
        <span class="project-name-text">${esc(project.name)}</span>
        <span class="project-stats">${stats.tables} tables · ${stats.guests} guests${stats.unassigned ? ` · ${stats.unassigned} unassigned` : ''} · ${esc(formatUpdated(project.updatedAt))}</span>
      </div>
      <span class="project-open">${icon('arrow-up-right', 16)}</span>
    </div>
  </article>`;
}

function galleryTemplate(projects) {
  const installButton = !isStandalone()
    ? `<button class="btn btn-ghost" type="button" data-action="install">${icon('install', 17)}<span class="btn-label">Install</span></button>`
    : '';
  const fileWarning = location.protocol === 'file:'
    ? `<div class="file-warning">${icon('settings', 17)} To install the app and unlock offline mode, serve this folder over HTTP. See the README for a one-line command.</div>`
    : '';
  const offline = !navigator.onLine
    ? `<div class="offline-banner">${icon('check', 17)} You're offline. Everything still works — your charts are saved on this device.</div>`
    : '';

  return `<div class="gallery">
    <header class="gallery-top">
      <a class="brand" href="#/" aria-label="Gilded home">
        ${LOGO_SVG}
        <span class="brand-copy"><span class="brand-word">Gilded</span><span class="brand-sub">Seating chart studio</span></span>
      </a>
      <div class="gallery-top-right">
        <button class="btn btn-ghost" type="button" data-action="import">${icon('file', 17)}<span class="btn-label">Import</span></button>
        ${installButton}
        <button class="btn btn-gold" type="button" data-action="new">${icon('plus', 17)}<span class="btn-label">New chart</span></button>
      </div>
    </header>

    <main class="gallery-main">
      ${fileWarning}
      ${offline}
      <section class="hero">
        <div class="hero-copy">
          <div class="hero-eyebrow">For weddings &amp; gatherings</div>
          <h1>Make the mirror<br><em>worth staring at.</em></h1>
          <p>Design the mirror moment, then print the real thing: a card for every table and a name card for every guest. Arrange your people once and Gilded lays out the PDFs.</p>
        </div>
        <div class="hero-actions">
          <button class="btn btn-gold" type="button" data-action="new">${icon('plus', 17)} New seating chart</button>
          <button class="btn btn-dark" type="button" data-action="guide">${icon('sparkles', 17)} How it works</button>
        </div>
      </section>

      <div class="gallery-section-head">
        <h2 class="gallery-section-title">Your charts</h2>
        <span class="gallery-section-note">${icon('check', 13)} Saved privately on this device</span>
      </div>

      <div class="project-grid" id="project-grid">
        ${projects.map(galleryCard).join('')}
        <button class="new-card" type="button" data-action="new">
          <span class="new-card-plus">${icon('plus', 22)}</span>
          <span>Start a new chart</span>
          <small>Six beautiful presets</small>
        </button>
      </div>
      ${projects.length === 0 ? `<div class="gallery-empty"><h3>Your first chart starts here.</h3><p>Choose a preset, add your tables, and make something mirror-worthy.</p><button class="btn btn-gold" type="button" data-action="new">Create a seating chart</button></div>` : ''}
    </main>

    <footer class="gallery-footer">
      <div class="gallery-footer-inner">
        <span>${icon('check', 13)} Works offline · PDFs print in the browser</span>
        <span class="dot-sep"></span>
        <span>Your data never leaves this browser</span>
        <span class="dot-sep"></span>
        <span>Table cards · name cards · the mirror mockup</span>
      </div>
    </footer>
    <input type="file" id="import-input" accept=".json,application/json" hidden>
  </div>`;
}

async function renderGallery() {
  const projects = await listProjects();
  appRoot.innerHTML = galleryTemplate(projects);
  wireGallery(projects);
  renderGalleryThumbs(projects);
}

function renderGalleryThumbs(projects) {
  cleanupGallery();
  const run = () => {
    for (const project of projects) {
      const stage = document.querySelector(`[data-thumb-id="${cssEscape(project.id)}"]`);
      if (!stage) continue;
      const art = renderArtboard(project, { interactive: false });
      stage.replaceChildren(art);
      const fit = () => {
        // Keep the artboard a fixed-size scene and scale it into the card.
        const box = stage.getBoundingClientRect();
        if (!box.width || !box.height) return;
        const scale = Math.min(box.width / project.width, box.height / project.height);
        art.style.transform = `scale(${scale})`;
        art.style.transformOrigin = 'top left';
        art.style.left = `${(box.width - project.width * scale) / 2}px`;
        art.style.top = `${(box.height - project.height * scale) / 2}px`;
      };
      fit();
      const observer = new ResizeObserver(fit);
      observer.observe(stage);
      galleryObservers.push(observer);
    }
  };
  requestAnimationFrame(() => requestAnimationFrame(run));
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replace(/["\\]/g, '\\$&');
}

function wireGallery(projects) {
  const byId = new Map(projects.map(project => [project.id, project]));

  $$('[data-action="new"]').forEach(button => button.addEventListener('click', openNewChart));
  $$('[data-action="install"]').forEach(button => button.addEventListener('click', promptInstall));
  $$('[data-action="guide"]').forEach(button => button.addEventListener('click', openGuide));

  const importInput = $('#import-input');
  $('[data-action="import"]')?.addEventListener('click', () => importInput?.click());
  importInput?.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const parsed = JSON.parse(text);
      const project = normalizeProject(parsed.project || parsed);
      project.id = uid();
      project.name = (project.name || 'Imported chart').replace(/\s+/g, ' ').trim() || 'Imported chart';
      if (byId.has(project.id)) project.id = uid();
      project.updatedAt = Date.now();
      await saveProject(project);
      toast('Chart imported.');
      go('#/edit/' + encodeURIComponent(project.id));
    } catch (error) {
      console.error(error);
      toast('That file could not be imported as a Gilded chart.', { tone: 'error' });
    } finally {
      importInput.value = '';
    }
  });

  document.querySelectorAll('.project-card').forEach(card => {
    const id = card.dataset.projectId;
    const open = () => go('#/edit/' + encodeURIComponent(id));
    card.addEventListener('click', (event) => {
      if (event.target.closest('[data-project-action]')) return;
      open();
    });
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        if (event.target.closest('[data-project-action]')) return;
        event.preventDefault();
        open();
      }
    });

    card.addEventListener('click', async (event) => {
      const action = event.target.closest('[data-project-action]')?.dataset.projectAction;
      if (!action) return;
      event.stopPropagation();
      const project = byId.get(id);
      if (!project) return;
      if (action === 'duplicate') {
        const copy = clone(project);
        copy.id = uid();
        copy.name = `${project.name} copy`.slice(0, 100);
        copy.createdAt = Date.now();
        copy.updatedAt = Date.now();
        await saveProject(copy);
        toast('Chart duplicated.');
        await renderGallery();
      }
      if (action === 'backup') {
        downloadText(projectToJson(project), `${slugify(project.name)}.gilded.json`);
        toast('Backup downloaded.');
      }
      if (action === 'delete') {
        const ok = await confirmDialog({
          title: 'Delete this chart?',
          message: `“${project.name}” will be removed from this device. This cannot be undone.`,
          confirmLabel: 'Delete chart'
        });
        if (!ok) return;
        await deleteProject(project.id);
        toast('Chart deleted.');
        await renderGallery();
      }
    });
  });
}

/* ---------- new chart ---------- */

function presetThumbStyle(template) {
  const preset = PRESETS[template.preset] || PRESETS.gilded;
  const bg = preset.theme.background;
  const background = bg.type === 'mirror'
    ? 'radial-gradient(70% 55% at 50% 20%, rgba(255,255,255,.5), transparent 62%), linear-gradient(150deg,#d6ddd2,#b8c4b7 55%,#e8e0ce)'
    : bg.type === 'photo'
      ? '#d9d2c4'
      : bg.color;
  return `background:${background};color:${preset.theme.ink};font-family:${fontStack(preset.typography.titleFont)};`;
}

function openNewChart() {
  let selected = 'gilded-demo';
  let nameDirty = false;
  const body = `<p class="section-desc">Every design is editable. Pick a starting point, then make it yours.</p>
    <div class="template-grid">
      ${TEMPLATES.map(template => `<button class="template-card${template.id === selected ? ' is-active' : ''}" type="button" data-template="${template.id}">
        <span class="template-check">${icon('check', 11, 2.4)}</span>
        <div class="template-thumb" style="${presetThumbStyle(template)}">${template.id === 'blank' ? icon('plus', 25) : 'Aa'}</div>
        <b>${esc(template.name)}</b>
        <small>${esc(template.description)}</small>
      </button>`).join('')}
    </div>
    <div class="new-name-row">
      <label class="field">
        <span class="field-label">Name this chart <span class="field-value">You can rename it later</span></span>
        <input class="input" id="new-chart-name" maxlength="90" value="${esc(TEMPLATES[0].projectName)}" autocomplete="off">
      </label>
    </div>`;

  const modal = openModal({
    title: 'Start a seating chart',
    subtitle: 'Choose a look now — every colour, font and table can change later.',
    body,
    footer: `<button class="btn btn-ghost" type="button" data-cancel>Cancel</button>
      <button class="btn btn-gold" type="button" data-create>${icon('plus', 16)} Create chart</button>`,
    size: 'lg'
  });

  const nameInput = modal.root.querySelector('#new-chart-name');
  const createButton = modal.root.querySelector('[data-create]');

  nameInput.addEventListener('input', () => { nameDirty = true; });
  modal.root.querySelectorAll('[data-template]').forEach(button => {
    button.addEventListener('click', () => {
      selected = button.dataset.template;
      modal.root.querySelectorAll('[data-template]').forEach(item => {
        item.classList.toggle('is-active', item.dataset.template === selected);
      });
      if (!nameDirty) {
        const template = TEMPLATES.find(t => t.id === selected);
        if (template) nameInput.value = template.projectName;
      }
    });
  });

  modal.root.querySelector('[data-cancel]').addEventListener('click', modal.close);
  createButton.addEventListener('click', async () => {
    const template = TEMPLATES.find(t => t.id === selected) || TEMPLATES[0];
    const name = nameInput.value.trim() || template.projectName;
    createButton.disabled = true;
    createButton.innerHTML = `<span class="spinner"></span> Creating…`;
    try {
      const project = createProject(template.id, { name });
      project.updatedAt = Date.now();
      await saveProject(project);
      modal.close();
      go('#/edit/' + encodeURIComponent(project.id));
    } catch (error) {
      console.error(error);
      toast('The chart could not be created.', { tone: 'error' });
      createButton.disabled = false;
      createButton.innerHTML = `${icon('plus', 16)} Create chart`;
    }
  });
}

/* ---------- guide ---------- */

function openGuide() {
  openModal({
    title: 'From blank page to mirror',
    subtitle: 'A seating chart in four small steps.',
    size: 'md',
    body: `<ul class="info-list">
      <li>${icon('palette', 18)}<span><strong>Choose a look.</strong> Start from a preset, then adjust the paper, frame, fonts and colours in the Design panel.</span></li>
      <li>${icon('users', 18)}<span><strong>Enter your people once.</strong> Paste the whole guest list into the Guests tab, then drag names into tables. Tap a name and tap a table if you prefer. Reorder within a table by dragging.</span></li>
      <li>${icon('move', 18)}<span><strong>Arrange the cards.</strong> Let auto-layout grid them, or drag any card to place it by hand. Arrow keys nudge the selected card.</span></li>
      <li>${icon('printer', 18)}<span><strong>Print the real thing.</strong> Use Print for paper-sized table cards and name cards — with crop marks and fold lines. The mirror mockup can still be exported as a PNG or poster PDF from the ··· menu.</span></li>
    </ul>
    <div class="export-note" style="margin-top:16px">${icon('check', 16)} <span>Everything happens in your browser. Your guest names are never uploaded.</span></div>`,
    footer: `<button class="btn btn-gold" type="button" data-close>Let's design</button>`
  });
  requestAnimationFrame(() => {
    const modal = $$('.modal-backdrop').at(-1);
    modal?.querySelector('[data-close]')?.addEventListener('click', () => modal.querySelector('.modal-close')?.click());
  });
}

/* ---------- online/offline ---------- */

function wireConnectivity() {
  window.addEventListener('offline', () => {
    toast("You're offline. Your charts still work — everything is stored on this device.", { duration: 5000 });
    if (parseRoute().view === 'gallery') renderGallery().catch(console.warn);
  });
  window.addEventListener('online', () => {
    if (parseRoute().view === 'gallery') renderGallery().catch(console.warn);
  });
}

/* ---------- boot ---------- */

async function boot() {
  try {
    initInstall();
    registerServiceWorker();
    wireConnectivity();
    await Promise.all([ensureSeedProject(), waitForFonts()]);
    window.addEventListener('hashchange', () => {
      route().catch((error) => {
        console.error(error);
        toast('Something went wrong while opening that page.', { tone: 'error' });
      });
    });
    await route();
    if (location.protocol === 'file:') {
      setTimeout(() => toast('For offline install, serve this folder over HTTP — see the README.', { duration: 7000 }), 900);
    }
  } catch (error) {
    console.error(error);
    appRoot.innerHTML = `<div class="boot"><div class="boot-brand"><span>Gilded</span></div>
      <p>Something went wrong opening the studio</p>
      <button class="btn btn-gold" onclick="location.reload()">Try again</button></div>`;
  }
}

boot();
