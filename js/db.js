/* IndexedDB persistence with a localStorage fallback.
   Projects live entirely on this device. */

import { createProject } from './model.js';

const DB_NAME = 'gilded-studio';
const DB_VERSION = 1;
const LS_KEY = 'gilded-studio-projects-v1';
let dbPromise = null;
let useFallback = false;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('no-idb')); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('idb-error'));
    request.onblocked = () => reject(new Error('idb-blocked'));
  }).catch((error) => {
    console.warn('IndexedDB unavailable, using localStorage', error);
    useFallback = true;
    return null;
  });
  return dbPromise;
}

function lsRead() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}
function lsWrite(projects) {
  localStorage.setItem(LS_KEY, JSON.stringify(projects));
}

async function tx(storeName, mode, fn) {
  const db = await openDB();
  if (!db) throw new Error('no-idb');
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = fn(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onabort = () => reject(transaction.error || new Error('aborted'));
  });
}

async function withFallback(fn, fallbackFn) {
  try {
    if (useFallback) throw new Error('fallback');
    return await fn();
  } catch (error) {
    if (String(error).includes('QuotaExceeded')) throw error;
    useFallback = true;
    return fallbackFn();
  }
}

export async function listProjects() {
  return withFallback(
    async () => {
      const projects = await tx('projects', 'readonly', store => store.getAll());
      return (projects || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    },
    () => lsRead().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  );
}

export async function getProject(id) {
  return withFallback(
    () => tx('projects', 'readonly', store => store.get(id)),
    () => lsRead().find(p => p.id === id) || null
  );
}

export async function saveProject(project) {
  const copy = JSON.parse(JSON.stringify(project));
  try {
    if (!useFallback) {
      await tx('projects', 'readwrite', store => store.put(copy));
      return;
    }
  } catch (error) {
    console.warn('Saving with localStorage fallback', error);
    useFallback = true;
  }
  const projects = lsRead().filter(p => p.id !== project.id);
  projects.push(copy);
  lsWrite(projects);
}

export async function deleteProject(id) {
  try {
    if (!useFallback) {
      await tx('projects', 'readwrite', store => store.delete(id));
      return;
    }
  } catch (error) {
    useFallback = true;
  }
  lsWrite(lsRead().filter(p => p.id !== id));
}

export async function getMeta(key, fallback = null) {
  try {
    if (useFallback) return localStorage.getItem('gilded-meta-' + key) || fallback;
    const row = await tx('meta', 'readonly', store => store.get(key));
    return row ? row.value : fallback;
  } catch {
    return fallback;
  }
}

export async function setMeta(key, value) {
  try {
    if (useFallback) { localStorage.setItem('gilded-meta-' + key, String(value)); return; }
    await tx('meta', 'readwrite', store => store.put({ key, value }));
  } catch {
    try { localStorage.setItem('gilded-meta-' + key, String(value)); } catch { /* ignore */ }
  }
}

export async function ensureSeedProject() {
  const seeded = await getMeta('seeded', false);
  const projects = await listProjects();
  if (projects.length) {
    if (!seeded) await setMeta('seeded', true);
    return projects;
  }
  if (seeded === true || seeded === 'true') return [];
  const demo = createProject('gilded-demo', { name: 'Our Favorite People' });
  demo.id = 'demo-chart';
  await saveProject(demo);
  await setMeta('lastProjectId', demo.id);
  await setMeta('seeded', true);
  return [demo];
}

export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null;
  try { return await navigator.storage.estimate(); } catch { return null; }
}
