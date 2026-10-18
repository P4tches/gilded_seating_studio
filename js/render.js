/* Renders a project to a self-contained artboard DOM node.
   The same output is used on the editor stage, in gallery thumbnails,
   in preview mode, and in PNG / PDF exports. */

import { computeLayout, estimateCardHeight, cardPaddingX, cardPaddingY, FONT_MAP } from './model.js';
import { frameSvg } from './frames.js';
import { esc } from './utils.js';

const measureCanvas = document.createElement('canvas');
const measureCtx = measureCanvas.getContext('2d');

function fontString(size, fontId, { italic = false, weight = 400 } = {}) {
  const family = FONT_MAP[fontId]?.stack || "'Jost', sans-serif";
  return `${italic ? 'italic ' : ''}${weight} ${size}px ${family}`;
}

/** Shrink a very long title just enough to fit inside the header width. */
export function fittedTitleSize(project) {
  const { header, typography, width } = project;
  const max = width * (header.maxWidth / 100);
  const lines = String(header.title || '').split(/\r?\n/);
  if (!measureCtx) return typography.titleSize;
  measureCtx.font = fontString(typography.titleSize, typography.titleFont, {
    italic: typography.titleItalic, weight: 400
  });
  let widest = 0;
  for (const line of lines) {
    widest = Math.max(widest, measureCtx.measureText(line || ' ').width);
  }
  if (widest <= max || widest === 0) return typography.titleSize;
  return Math.max(36, Math.floor(typography.titleSize * (max / widest) * 0.985));
}

export function artboardStyleVars(project) {
  const t = project.typography;
  const th = project.theme;
  const card = th.card;
  const titleSize = fittedTitleSize(project);
  return {
    '--bg-color': th.background.color || '#e8e2d5',
    '--photo-overlay': String(th.background.overlay ?? 0),
    '--ink': th.ink,
    '--accent': th.accent,
    '--card-bg': card.bg,
    '--card-border': card.border || 'transparent',
    '--card-border-w': `${Math.max(0, card.borderWidth || 0)}px`,
    '--card-radius': `${Math.max(0, card.radius || 0)}px`,
    '--card-shadow': card.shadow
      ? '0 16px 34px rgba(28, 21, 11, .20), 0 3px 7px rgba(28, 21, 11, .12)'
      : 'none',
    '--card-label': card.labelColor,
    '--card-guest': card.guestColor,
    '--pin-color': card.pinColor,
    '--pin-size': `${card.pinSize || 64}px`,
    '--title-font': FONT_MAP[t.titleFont]?.stack || FONT_MAP['great-vibes'].stack,
    '--title-size': `${titleSize}px`,
    '--title-style': t.titleItalic ? 'italic' : 'normal',
    '--title-lh': String(t.titleLineHeight || 1),
    '--title-spacing': `${t.titleSpacing || 0}em`,
    '--date-font': FONT_MAP[t.dateFont]?.stack || FONT_MAP.jost.stack,
    '--date-size': `${t.dateSize}px`,
    '--date-spacing': `${t.dateSpacing || 0}em`,
    '--date-weight': String(t.dateWeight || 500),
    '--label-font': FONT_MAP[t.labelFont]?.stack || FONT_MAP.parisienne.stack,
    '--label-size': `${t.labelSize}px`,
    '--label-style': t.labelItalic ? 'italic' : 'normal',
    '--label-spacing': `${t.labelSpacing || 0}em`,
    '--guest-font': FONT_MAP[t.guestFont]?.stack || FONT_MAP.montserrat.stack,
    '--guest-size': `${t.guestSize}px`,
    '--guest-spacing': `${t.guestSpacing || 0}em`,
    '--guest-line-height': String(t.guestLineHeight || 1.6),
    '--guest-weight': String(t.guestWeight || 500),
    '--guest-transform': t.guestUpper ? 'uppercase' : 'none',
    '--header-width': String(project.header.maxWidth || 86),
    '--rule-weight': `${Math.max(2, Math.round(project.width * 0.0016))}px`,
    '--date-gap': `${Math.round(project.width * 0.013)}px`,
    '--date-margin': `${Math.round(project.width * 0.011)}px`,
    '--select-ring': `${Math.max(2, project.width * 0.0022)}px`
  };
}

export function renderArtboard(project, { interactive = true } = {}) {
  const p = project;
  const art = document.createElement('div');
  art.className = 'artboard' + (interactive ? ' artboard--interactive' : '');
  art.dataset.bg = p.theme.background.type;
  art.style.width = `${p.width}px`;
  art.style.height = `${p.height}px`;
  for (const [key, value] of Object.entries(artboardStyleVars(p))) {
    art.style.setProperty(key, value);
  }

  // Background
  const bg = document.createElement('div');
  bg.className = `artboard-bg bg--${p.theme.background.type}`;
  if (p.theme.background.type === 'photo' && p.theme.background.image) {
    bg.style.backgroundImage = `url("${p.theme.background.image}")`;
  }
  art.appendChild(bg);

  const dim = document.createElement('div');
  dim.className = 'artboard-dim';
  art.appendChild(dim);

  const vignette = document.createElement('div');
  vignette.className = 'artboard-vignette';
  art.appendChild(vignette);

  // Header
  const header = document.createElement('header');
  header.className = 'chart-header';
  header.style.top = `${p.header.y}px`;
  const dateRow = p.header.showDate ? `
    <div class="chart-date-row${p.header.divider ? '' : ' no-rules'}">
      <span class="chart-rule"></span>
      <span class="chart-date">${esc(p.header.date)}</span>
      <span class="chart-rule"></span>
    </div>` : '';
  header.innerHTML = `<h1 class="chart-title">${esc(p.header.title)}</h1>${dateRow}`;
  art.appendChild(header);

  // Cards
  const { positions, cardWidth } = computeLayout(p);
  const cardLayer = document.createElement('div');
  cardLayer.className = 'cards-layer';
  const padX = cardPaddingX(cardWidth);
  const padY = cardPaddingY(cardWidth);

  for (const card of p.cards) {
    const pos = p.layout.auto ? positions[card.id] : {
      x: card.x,
      y: card.y,
      width: cardWidth,
      height: estimateCardHeight(card, p, cardWidth)
    };
    if (!pos) continue;
    const height = estimateCardHeight(card, p, cardWidth);
    const node = document.createElement('article');
    node.className = 'table-card';
    node.dataset.cardId = card.id;
    node.style.left = `${Math.round(pos.x)}px`;
    node.style.top = `${Math.round(pos.y)}px`;
    node.style.width = `${Math.round(cardWidth)}px`;
    node.style.height = `${height}px`;
    node.style.setProperty('--rot', `${Number(card.rotation) || 0}deg`);
    node.style.setProperty('--pad-x', `${padX}px`);
    node.style.setProperty('--pad-y', `${padY}px`);

    const pin = p.theme.card.pin && p.theme.card.pin !== 'none'
      ? `<span class="card-pin pin--${esc(p.theme.card.pin)}" aria-hidden="true"></span>`
      : '';
    const guests = card.guests.map(name => `<li>${esc(name)}</li>`).join('');
    node.innerHTML = `${pin}
      <h3 class="card-label">${esc(card.label)}</h3>
      <div class="card-rule"></div>
      <ul class="card-guests">${guests}</ul>`;
    node.setAttribute('aria-label', `${card.label}, ${card.guests.length} guests`);
    cardLayer.appendChild(node);
  }
  art.appendChild(cardLayer);

  // Frame (above the cards, like a real frame in front of the glass)
  if (p.theme.frame.style && p.theme.frame.style !== 'none') {
    const frame = document.createElement('div');
    frame.className = 'artboard-frame';
    frame.innerHTML = frameSvg(p.width, p.height, p.theme.frame.style, p.theme.frame.color);
    art.appendChild(frame);
  }

  return art;
}

/** Scale a full-size artboard to fit a wrapper, for gallery thumbnails. */
export function scaleArtboardToFit(artboard, wrapper, padding = 0) {
  const scale = Math.min(
    (wrapper.clientWidth - padding * 2) / artboard.offsetWidth,
    (wrapper.clientHeight - padding * 2) / artboard.offsetHeight
  );
  const s = Math.max(0.01, scale);
  artboard.style.transform = `scale(${s})`;
  artboard.style.transformOrigin = 'top left';
  const x = (wrapper.clientWidth - artboard.offsetWidth * s) / 2;
  const y = (wrapper.clientHeight - artboard.offsetHeight * s) / 2;
  artboard.style.marginLeft = `${x}px`;
  artboard.style.marginTop = `${y}px`;
  return s;
}
