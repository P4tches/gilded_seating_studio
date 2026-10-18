/* Small shared helpers: DOM, files, UI feedback. */

import { icon } from './icons.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

export const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function debounce(fn, wait = 200) {
  let timer;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  wrapped.flush = (...args) => { clearTimeout(timer); fn(...args); };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

export function rafThrottle(fn) {
  let frame = null;
  let lastArgs;
  const run = () => { frame = null; fn(...lastArgs); };
  return (...args) => {
    lastArgs = args;
    if (!frame) frame = requestAnimationFrame(run);
  };
}

export const isTypingTarget = (target) => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
};

export function hexToRgba(hex, alpha = 1) {
  const clean = String(hex || '#000').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean.padEnd(6, '0');
  const num = parseInt(full.slice(0, 6), 16);
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
}

export function formatBytes(bytes) {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

/* ---------- toasts ---------- */

let toastTimer = null;
export function toast(message, { tone = 'default', duration = 3200, action = null } = {}) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  root.innerHTML = '';
  const node = el(`<div class="toast toast--${tone}" role="status">
    <span class="toast-dot">${tone === 'error' ? '!' : '✓'}</span>
    <span class="toast-msg">${esc(message)}</span>
    ${action ? `<button class="toast-action" type="button">${esc(action.label)}</button>` : ''}
  </div>`);
  if (action) node.querySelector('.toast-action').addEventListener('click', () => {
    action.onClick();
    hide();
  });
  root.appendChild(node);
  requestAnimationFrame(() => node.classList.add('is-in'));
  clearTimeout(toastTimer);
  const hide = () => {
    node.classList.remove('is-in');
    setTimeout(() => node.remove(), 220);
  };
  toastTimer = setTimeout(hide, duration);
  return hide;
}

/* ---------- modals ---------- */

const modalStack = [];
let modalRoot = null;

export function openModal({ title, subtitle = '', body = '', footer = '', size = 'md', className = '', onClose = null, closeOnBackdrop = true }) {
  if (!modalRoot) modalRoot = document.getElementById('modal-root');
  const root = el(`<div class="modal-backdrop" role="presentation">
    <div class="modal modal--${size} ${className}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <header class="modal-head">
        <div>
          <h2>${esc(title)}</h2>
          ${subtitle ? `<p>${esc(subtitle)}</p>` : ''}
        </div>
        <button class="icon-btn modal-close" type="button" aria-label="Close">${icon('x', 18)}</button>
      </header>
      <div class="modal-body">${body}</div>
      ${footer ? `<footer class="modal-foot">${footer}</footer>` : ''}
    </div>
  </div>`);
  modalRoot.appendChild(root);
  document.body.classList.add('has-modal');
  requestAnimationFrame(() => root.classList.add('is-in'));

  const api = {
    root,
    body: root.querySelector('.modal-body'),
    close() {
      if (!root.isConnected) return;
      root.classList.remove('is-in');
      setTimeout(() => {
        root.remove();
        modalStack.splice(modalStack.indexOf(api), 1);
        if (!modalStack.length) document.body.classList.remove('has-modal');
      }, 180);
      onClose?.();
    }
  };
  modalStack.push(api);
  root.querySelector('.modal-close').addEventListener('click', api.close);
  if (closeOnBackdrop) {
    root.addEventListener('pointerdown', (event) => {
      if (event.target === root) api.close();
    });
  }
  setTimeout(() => {
    const focusable = root.querySelector('input, textarea, button:not(.modal-close), select');
    focusable?.focus({ preventScroll: true });
  }, 80);
  return api;
}

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const top = modalStack[modalStack.length - 1];
  if (top) { event.preventDefault(); top.close(); }
}, true);

export function confirmDialog({ title, message, confirmLabel = 'Delete', tone = 'danger' }) {
  return new Promise((resolve) => {
    let settled = false;
    const modal = openModal({
      title,
      body: `<p class="confirm-copy">${esc(message)}</p>`,
      footer: `<button class="btn btn-ghost" data-action="cancel" type="button">Cancel</button>
        <button class="btn ${tone === 'danger' ? 'btn-danger' : 'btn-gold'}" data-action="ok" type="button">${esc(confirmLabel)}</button>`,
      size: 'sm',
      onClose: () => { if (!settled) { settled = true; resolve(false); } }
    });
    modal.root.querySelector('[data-action="cancel"]').addEventListener('click', modal.close);
    modal.root.querySelector('[data-action="ok"]').addEventListener('click', () => {
      settled = true; resolve(true); modal.close();
    });
  });
}

/* ---------- files ---------- */

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadText(text, filename, type = 'application/json') {
  downloadBlob(new Blob([text], { type }), filename);
}

export function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Resize a background photo so projects stay light enough for IndexedDB. */
export async function preparePhoto(file, maxDim = 2400) {
  const dataUrl = await readFileAsDataURL(file);
  const img = new Image();
  img.src = dataUrl;
  await img.decode().catch(() => {});
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  if (scale >= 1 && file.size < 900_000) {
    return { dataUrl, width: img.naturalWidth, height: img.naturalHeight };
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f1eadc';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.88),
    width: canvas.width,
    height: canvas.height
  };
}

export function slugify(value) {
  return String(value || 'seating-chart')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'seating-chart';
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches
  || window.navigator.standalone === true;

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export async function waitForFonts() {
  if (!document.fonts) return;
  try { await document.fonts.ready; } catch { /* ignore */ }
  const families = [
    "400 20px 'Great Vibes'", "400 20px 'Parisienne'", "400 20px 'Pinyon Script'",
    "400 20px 'Cormorant Garamond'", "italic 400 20px 'Cormorant Garamond'",
    "400 20px 'Playfair Display'", "italic 400 20px 'Playfair Display'",
    "400 20px 'Montserrat'", "400 20px 'Jost'"
  ];
  try { await Promise.all(families.map(f => document.fonts.load(f, 'Ag'))); } catch { /* ignore */ }
}
