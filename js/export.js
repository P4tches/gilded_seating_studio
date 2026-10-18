/* ============================================================
   EXPORT — no libraries.
   1. Render the artboard DOM.
   2. Wrap it in an SVG with the artboard CSS + base64 fonts.
   3. Draw the SVG into a canvas at print resolution.
   4. PNG download, PDF (JPEG-in-PDF writer) or print.
   ============================================================ */

import { renderArtboard } from './render.js';
import { waitForFonts, downloadBlob, dataUrlToBytes, slugify, bytesToBase64 } from './utils.js';

const fontDataCache = new Map();
const stylesheetCache = new Map();
let fontCSSPromise = null;

export const PAGE_SIZES = [
  {
    id: 'design', label: 'Match the design', hint: '2000 × 3000 px at 150 dpi',
    size: (project) => [project.width / 150 * 72, project.height / 150 * 72]
  },
  { id: '24x36', label: '24 × 36 in', hint: 'US poster', size: () => [1728, 2592] },
  { id: '18x24', label: '18 × 24 in', hint: 'US print', size: () => [1296, 1728] },
  { id: 'a1', label: 'A1', hint: '594 × 841 mm', size: () => [1683.78, 2383.94] },
  { id: 'a2', label: 'A2', hint: '420 × 594 mm', size: () => [1190.55, 1683.78] }
];

export const PNG_WIDTHS = [
  { value: 2000, label: 'Screen', hint: '2000 px' },
  { value: 3000, label: 'Print', hint: '3000 px' },
  { value: 4000, label: 'High', hint: '4000 px' },
  { value: 6000, label: 'Maximum', hint: '6000 px' }
];

async function fetchText(path) {
  const res = await fetch(path, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`Could not load ${path}`);
  return res.text();
}

async function fontCSS() {
  if (!fontCSSPromise) {
    fontCSSPromise = (async () => {
      const source = await fetchText('./css/fonts.css');
      let embedded = source;
      const urls = [...source.matchAll(/url\('([^']+\.woff2)'\)/g)].map(m => m[1]);
      for (const relative of [...new Set(urls)]) {
        const file = relative.replace('../', '');
        let data = fontDataCache.get(file);
        if (!data) {
          const res = await fetch('./' + file, { cache: 'force-cache' });
          if (!res.ok) throw new Error('Could not load font ' + file);
          const buffer = new Uint8Array(await res.arrayBuffer());
          data = 'data:font/woff2;base64,' + bytesToBase64(buffer);
          fontDataCache.set(file, data);
        }
        embedded = embedded.split(`url('${relative}')`).join(`url('${data}')`);
      }
      return embedded;
    })().catch((error) => { fontCSSPromise = null; throw error; });
  }
  return fontCSSPromise;
}

async function stylesheetCSS(path) {
  if (!stylesheetCache.has(path)) {
    const promise = Promise.all([fetchText(path), fontCSS()])
      .then(([base, fonts]) => base + '\n' + fonts)
      .catch((error) => { stylesheetCache.delete(path); throw error; });
    stylesheetCache.set(path, promise);
  }
  return stylesheetCache.get(path);
}

const exportCSS = () => stylesheetCSS('./css/artboard.css');

function preloadImage(src) {
  return new Promise((resolve) => {
    if (!src) { resolve(); return; }
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
  });
}

async function buildSvg(project) {
  await waitForFonts();
  const css = await exportCSS();

  const holder = document.createElement('div');
  holder.setAttribute('aria-hidden', 'true');
  holder.style.cssText = 'position:fixed;left:-100000px;top:0;width:1px;height:1px;overflow:hidden;pointer-events:none;';
  const art = renderArtboard(project, { interactive: false });
  holder.appendChild(art);
  document.body.appendChild(holder);

  try {
    const photo = project.theme.background.type === 'photo' ? project.theme.background.image : null;
    await preloadImage(photo);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const markup = new XMLSerializer().serializeToString(art);
    const style = `<style xmlns="http://www.w3.org/1999/xhtml">${css}</style>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${project.width}" height="${project.height}" viewBox="0 0 ${project.width} ${project.height}">
      <foreignObject x="0" y="0" width="${project.width}" height="${project.height}">
        <div xmlns="http://www.w3.org/1999/xhtml" style="width:${project.width}px;height:${project.height}px;">${style}${markup}</div>
      </foreignObject>
    </svg>`;
    return svg;
  } finally {
    holder.remove();
  }
}

function svgToImage(svg) {
  return new Promise((resolve, reject) => {
    // A data URL (rather than a blob URL) keeps the canvas untainted in
    // Chromium when the SVG contains a foreignObject.
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    const img = new Image();
    img.decoding = 'sync';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The chart could not be rasterised by this browser.'));
    img.src = url;
  });
}

function svgStringForNode(node, cssWidth, cssHeight, css) {
  const markup = new XMLSerializer().serializeToString(node);
  const style = `<style xmlns="http://www.w3.org/1999/xhtml">${css}</style>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${cssWidth}" height="${cssHeight}" viewBox="0 0 ${cssWidth} ${cssHeight}">
    <foreignObject x="0" y="0" width="${cssWidth}" height="${cssHeight}">
      <div xmlns="http://www.w3.org/1999/xhtml" style="width:${cssWidth}px;height:${cssHeight}px;">${style}${markup}</div>
    </foreignObject>
  </svg>`;
}

/**
 * Rasterise any print-ready DOM node. Physical layout is expressed in CSS
 * pixels at 96 dpi; targetWidth raises it to the requested print DPI.
 */
export async function renderElementToCanvas(element, { cssWidth, cssHeight, targetWidth, stylesheet = './css/print.css' }) {
  await waitForFonts();
  const css = await stylesheetCSS(stylesheet);

  const holder = document.createElement('div');
  holder.setAttribute('aria-hidden', 'true');
  holder.style.cssText = 'position:fixed;left:-100000px;top:0;width:1px;height:1px;overflow:hidden;pointer-events:none;';
  holder.appendChild(element);
  document.body.appendChild(holder);

  try {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const svg = svgStringForNode(element, cssWidth, cssHeight, css);
    const img = await svgToImage(svg);
    const scale = targetWidth / cssWidth;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(cssWidth * scale));
    canvas.height = Math.max(1, Math.round(cssHeight * scale));
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    holder.remove();
  }
}

export async function projectToCanvas(project, targetWidth = 4000) {
  const svg = await buildSvg(project);
  const img = await svgToImage(svg);
  const scale = targetWidth / project.width;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(project.width * scale));
  canvas.height = Math.max(1, Math.round(project.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasToBlob(canvas, type = 'image/png', quality = 0.94) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create image file.')), type, quality);
  });
}

export async function exportPng(project, { width = 4000 } = {}) {
  const canvas = await projectToCanvas(project, width);
  const blob = await canvasToBlob(canvas, 'image/png');
  downloadBlob(blob, `${slugify(project.name)}-seating-chart.png`);
  return { width: canvas.width, height: canvas.height, bytes: blob.size };
}

/* ---------- minimal PDF writer (one JPEG page) ---------- */

function makePdf(jpegBytes, imageWidth, imageHeight, pageWidth, pageHeight, title = '') {
  const enc = new TextEncoder();
  const parts = [];
  let length = 0;
  const offsets = [0];

  const push = (data) => {
    const bytes = typeof data === 'string' ? enc.encode(data) : data;
    parts.push(bytes);
    length += bytes.length;
  };
  const beginObject = (num) => { offsets[num] = length; push(`${num} 0 obj\n`); };
  const endObject = () => push('endobj\n');

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  beginObject(1);
  push('<< /Type /Catalog /Pages 2 0 R >>\n');
  endObject();

  beginObject(2);
  push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n');
  endObject();

  const safeTitle = String(title || '').replace(/[()\\]/g, ' ');
  beginObject(3);
  push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\n`);
  endObject();

  beginObject(4);
  push(`<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`);
  push(jpegBytes);
  push('\nendstream\n');
  endObject();

  const fit = Math.min(pageWidth / imageWidth, pageHeight / imageHeight);
  const drawWidth = imageWidth * fit;
  const drawHeight = imageHeight * fit;
  const x = (pageWidth - drawWidth) / 2;
  const y = (pageHeight - drawHeight) / 2;
  const content = `q\n1 1 1 rg\n0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)} re f\nQ\nq\n${drawWidth.toFixed(3)} 0 0 ${drawHeight.toFixed(3)} ${x.toFixed(3)} ${y.toFixed(3)} cm\n/Im0 Do\nQ`;
  beginObject(5);
  push(`<< /Length ${enc.encode(content).length} >>\nstream\n${content}\nendstream\n`);
  endObject();

  beginObject(6);
  push(`<< /Producer (Gilded Seating Studio) /Title (${safeTitle}) >>\n`);
  endObject();

  const xrefOffset = length;
  let xref = `xref\n0 7\n0000000000 65535 f \n`;
  for (let i = 1; i <= 6; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  push(xref);
  push(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) { out.set(part, cursor); cursor += part.length; }
  return out;
}

export async function exportPdf(project, { width = 4000, pageId = 'design' } = {}) {
  const canvas = await projectToCanvas(project, width);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.93);
  const jpeg = dataUrlToBytes(dataUrl);
  const page = PAGE_SIZES.find(p => p.id === pageId) || PAGE_SIZES[0];
  const [pw, ph] = page.size(project);
  const pdf = makePdf(jpeg, canvas.width, canvas.height, pw, ph, project.name);
  const blob = new Blob([pdf], { type: 'application/pdf' });
  downloadBlob(blob, `${slugify(project.name)}-seating-chart.pdf`);
  return { bytes: blob.size, page: page.label };
}

/* ---------- print ---------- */

export async function printProject(project, { pageId = 'design', width = 3500 } = {}) {
  const win = window.open('', '_blank');
  if (!win) throw new Error('Your browser blocked the print window. Allow pop-ups and try again.');
  win.document.write('<!doctype html><title>Preparing print…</title><body style="font-family:sans-serif;padding:40px;color:#444">Preparing your chart for print…</body>');
  win.document.close();
  try {
    const canvas = await projectToCanvas(project, width);
    const dataUrl = canvas.toDataURL('image/png');
    const page = PAGE_SIZES.find(p => p.id === pageId) || PAGE_SIZES[0];
    const [pw, ph] = page.size(project);
    const wIn = (pw / 72).toFixed(2);
    const hIn = (ph / 72).toFixed(2);
    win.document.open();
    win.document.write(`<!doctype html><html><head><title>${escapeHtml(project.name)}</title>
      <style>
        @page { size: ${wIn}in ${hIn}in; margin: 0; }
        html, body { margin: 0; padding: 0; background: #fff; }
        .sheet { width: ${wIn}in; height: ${hIn}in; display: flex; align-items: center; justify-content: center; }
        img { width: 100%; height: 100%; object-fit: contain; display: block; }
        @media screen { body { background: #222; display: flex; align-items: center; justify-content: center; min-height: 100vh; } .sheet { box-shadow: 0 20px 80px rgba(0,0,0,.5); background: #fff; } }
      </style></head><body><div class="sheet"><img id="chart" src="${dataUrl}" alt="${escapeHtml(project.name)}"></div>
      <script>
        const img = document.getElementById('chart');
        const go = () => { setTimeout(() => { window.focus(); window.print(); }, 250); };
        if (img.complete) go(); else img.addEventListener('load', go);
      <\/script></body></html>`);
    win.document.close();
    return { page: page.label };
  } catch (error) {
    win.close();
    throw error;
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Build a multi-page PDF, one full-bleed JPEG image per page.
 * pages: [{ jpeg, imageWidth, imageHeight, pageWidth, pageHeight }] (page sizes in points)
 */
export function makePdfPages(pages, title = '') {
  if (!pages.length) throw new Error('There are no pages to write.');
  const enc = new TextEncoder();
  const parts = [];
  let length = 0;
  const maxId = pages.length * 3 + 3;
  const offsets = new Array(maxId + 1).fill(0);

  const push = (data) => {
    const bytes = typeof data === 'string' ? enc.encode(data) : data;
    parts.push(bytes);
    length += bytes.length;
  };
  const beginObject = (id) => { offsets[id] = length; push(`${id} 0 obj\n`); };
  const endObject = () => push('endobj\n');

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  const pageIds = pages.map((_, i) => 3 + i * 3);
  beginObject(1);
  push('<< /Type /Catalog /Pages 2 0 R >>\n');
  endObject();

  beginObject(2);
  push(`<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>\n`);
  endObject();

  pages.forEach((page, i) => {
    const pageId = 3 + i * 3;
    const imageId = pageId + 1;
    const contentId = pageId + 2;
    const pw = Number(page.pageWidth);
    const ph = Number(page.pageHeight);

    beginObject(pageId);
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw.toFixed(2)} ${ph.toFixed(2)}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\n`);
    endObject();

    beginObject(imageId);
    push(`<< /Type /XObject /Subtype /Image /Width ${page.imageWidth} /Height ${page.imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`);
    push(page.jpeg);
    push('\nendstream\n');
    endObject();

    const content = `q\n${pw.toFixed(2)} 0 0 ${ph.toFixed(2)} 0 0 cm\n/Im0 Do\nQ`;
    beginObject(contentId);
    push(`<< /Length ${enc.encode(content).length} >>\nstream\n${content}\nendstream\n`);
    endObject();
  });

  const infoId = maxId;
  beginObject(infoId);
  push(`<< /Producer (Gilded Seating Studio) /Title (${String(title || '').replace(/[()\\]/g, ' ')}) >>\n`);
  endObject();

  const xrefOffset = length;
  let xref = `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= maxId; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  push(xref);
  push(`trailer\n<< /Size ${maxId + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) { out.set(part, cursor); cursor += part.length; }
  return out;
}

/** Bundle a project as a portable JSON file. */
export function projectToJson(project) {
  return JSON.stringify({ app: 'gilded-seating-studio', version: 1, project }, null, 2);
}
