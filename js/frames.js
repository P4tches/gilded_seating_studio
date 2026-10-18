/* Decorative frame SVGs, shared by the screen and the PNG/PDF exporter. */

let seq = 0;

function shade(hex, amount) {
  const clean = String(hex || '#c9a35c').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean.padEnd(6, '0');
  const num = parseInt(full.slice(0, 6), 16);
  let r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
  const target = amount < 0 ? 0 : 255;
  const t = Math.abs(amount);
  r = Math.round(r + (target - r) * t);
  g = Math.round(g + (target - g) * t);
  b = Math.round(b + (target - b) * t);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function archPath(W, H, inset, ry, roundedBottom = 0) {
  const r = (W - inset * 2) / 2;
  const spring = inset + ry;
  const bottom = H - inset;
  if (!roundedBottom) {
    return `M ${inset} ${bottom} L ${inset} ${spring} A ${r} ${ry} 0 0 1 ${W - inset} ${spring} L ${W - inset} ${bottom} Z`;
  }
  const c = Math.min(roundedBottom, r);
  return [
    `M ${inset + c} ${bottom}`,
    `L ${inset} ${bottom}`,
    `L ${inset} ${spring}`,
    `A ${r} ${ry} 0 0 1 ${W - inset} ${spring}`,
    `L ${W - inset} ${bottom - c}`,
    `Q ${W - inset} ${bottom} ${W - inset - c} ${bottom}`,
    `L ${inset + c} ${bottom} Z`
  ].join(' ');
}

function crest(W, color) {
  const s = W / 2000;
  const g = `cg-${++seq}`;
  return `
  <g transform="translate(${W / 2} ${20 * s}) scale(${s})">
    <defs>
      <linearGradient id="${g}" x1="0" y1="0" x2="0.9" y2="1">
        <stop offset="0" stop-color="${shade(color, 0.62)}"/>
        <stop offset=".3" stop-color="${color}"/>
        <stop offset=".55" stop-color="${shade(color, 0.45)}"/>
        <stop offset=".8" stop-color="${color}"/>
        <stop offset="1" stop-color="${shade(color, -0.28)}"/>
      </linearGradient>
    </defs>
    <g fill="none" stroke="url(#${g})" stroke-width="7" stroke-linecap="round" opacity=".92">
      <path d="M-30 118 C -84 148, -150 140, -186 100 C -212 71, -199 42, -172 47 C -150 51, -148 78, -168 84"/>
      <path d="M30 118 C 84 148, 150 140, 186 100 C 212 71, 199 42, 172 47 C 150 51, 148 78, 168 84"/>
      <path d="M-120 150 C -190 174, -272 160, -330 112" stroke-width="5" opacity=".8"/>
      <path d="M120 150 C 190 174, 272 160, 330 112" stroke-width="5" opacity=".8"/>
    </g>
    <g fill="url(#${g})">
      <path d="M0 8 C -18 48, -21 101, 0 142 C 21 101, 18 48, 0 8 Z"/>
      <path d="M-8 36 C -34 62, -36 105, -14 138 C 4 110, 4 70, -8 36 Z" opacity=".92" transform="rotate(-26 0 30)"/>
      <path d="M8 36 C 34 62, 36 105, 14 138 C -4 110, -4 70, 8 36 Z" opacity=".92" transform="rotate(26 0 30)"/>
      <path d="M-10 62 C -44 78, -52 116, -32 146 C -8 126, 0 92, -10 62 Z" opacity=".76" transform="rotate(-51 0 54)"/>
      <path d="M10 62 C 44 78, 52 116, 32 146 C 8 126, 0 92, 10 62 Z" opacity=".76" transform="rotate(51 0 54)"/>
      <circle cx="0" cy="152" r="9"/>
    </g>
    <path d="M0 40 C -10 70, -11 106, 0 132 C 11 106, 10 70, 0 40 Z" fill="${shade(color, 0.55)}" opacity=".38"/>
    <circle cx="0" cy="24" r="7" fill="${shade(color, 0.68)}"/>
  </g>`;
}

function cornerFlourish(x, y, flipX, color) {
  const g = `cf-${++seq}`;
  return `
  <g transform="translate(${x} ${y}) scale(${flipX} 1)">
    <defs>
      <linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${shade(color, 0.5)}"/>
        <stop offset=".55" stop-color="${color}"/>
        <stop offset="1" stop-color="${shade(color, -0.22)}"/>
      </linearGradient>
    </defs>
    <g fill="none" stroke="url(#${g})" stroke-width="6" stroke-linecap="round" opacity=".92">
      <path d="M0 0 C 38 -8, 74 7, 77 36 C 79 57, 58 68, 45 54 C 34 42, 44 26, 58 32"/>
      <path d="M4 -2 C 30 -18, 66 -18, 96 0" stroke-width="4" opacity=".7"/>
    </g>
  </g>`;
}

function lineCorner(x, y, sx, sy, color) {
  const g = `lc-${++seq}`;
  return `
  <g transform="translate(${x} ${y}) scale(${sx} ${sy})">
    <defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${shade(color, 0.55)}"/><stop offset="1" stop-color="${color}"/>
    </linearGradient></defs>
    <path d="M0 30 L0 0 L30 0" fill="none" stroke="url(#${g})" stroke-width="7"/>
    <path d="M14 14 L23 23 M14 23 L23 14" stroke="url(#${g})" stroke-width="3" opacity=".7"/>
  </g>`;
}

export function frameSvg(W, H, style, color = '#c9a35c') {
  if (!style || style === 'none') return '';
  const gid = `frame-${++seq}`;
  const common = (inner) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="none" role="presentation">
      <defs>
        <linearGradient id="${gid}" x1="0" y1="0" x2=".85" y2="1">
          <stop offset="0" stop-color="${shade(color, 0.42)}"/>
          <stop offset=".24" stop-color="${color}"/>
          <stop offset=".48" stop-color="${shade(color, 0.58)}"/>
          <stop offset=".7" stop-color="${color}"/>
          <stop offset=".88" stop-color="${shade(color, -0.12)}"/>
          <stop offset="1" stop-color="${shade(color, 0.32)}"/>
        </linearGradient>
      </defs>
      ${inner}
    </svg>`;

  if (style === 'baroque') {
    const inset = 46;
    const ry = W * 0.38;
    const innerInset = inset + 32;
    const innerRy = ry - 4;
    return common(`
      <path d="${archPath(W, H, inset, ry, 26)}" fill="none" stroke="url(#${gid})" stroke-width="32"/>
      <path d="${archPath(W, H, innerInset, innerRy, 20)}" fill="none" stroke="${shade(color, 0.55)}" stroke-width="6" opacity=".62"/>
      <path d="${archPath(W, H, inset + 17, ry - 1, 23)}" fill="none" stroke="${shade(color, -0.3)}" stroke-width="2.5" opacity=".45"/>
      <path d="${archPath(W, H, 18, ry + 20, 22)}" fill="none" stroke="${shade(color, 0.28)}" stroke-width="2.2" opacity=".4"/>
      ${crest(W, color)}
      ${cornerFlourish(innerInset + 30, H - innerInset - 26, 1, color)}
      ${cornerFlourish(W - innerInset - 30, H - innerInset - 26, -1, color)}
      <circle cx="${W / 2}" cy="${H - inset - 9}" r="5" fill="${shade(color, 0.55)}" opacity=".85"/>
    `);
  }

  if (style === 'arch') {
    const inset = 54;
    const ry = W * 0.34;
    return common(`
      <path d="${archPath(W, H, inset, ry, 18)}" fill="none" stroke="url(#${gid})" stroke-width="11"/>
      <path d="${archPath(W, H, inset + 18, ry - 2, 12)}" fill="none" stroke="${shade(color, 0.5)}" stroke-width="2.5" opacity=".55"/>
      <circle cx="${W / 2}" cy="${inset + 14}" r="8" fill="${shade(color, 0.35)}"/>
      <path d="M ${W / 2 - 26} ${inset + 42} Q ${W / 2} ${inset + 28} ${W / 2 + 26} ${inset + 42}" fill="none" stroke="${shade(color, 0.4)}" stroke-width="4" opacity=".7"/>
    `);
  }

  // 'line'
  const inset = 38;
  const r = 10;
  return common(`
    <rect x="${inset}" y="${inset}" width="${W - inset * 2}" height="${H - inset * 2}" rx="${r}" fill="none" stroke="url(#${gid})" stroke-width="9"/>
    <rect x="${inset + 16}" y="${inset + 16}" width="${W - (inset + 16) * 2}" height="${H - (inset + 16) * 2}" rx="${Math.max(2, r - 4)}" fill="none" stroke="${shade(color, 0.45)}" stroke-width="2.4" opacity=".55"/>
    ${lineCorner(inset + 52, inset + 52, 1, 1, color)}
    ${lineCorner(W - inset - 52, inset + 52, -1, 1, color)}
    ${lineCorner(inset + 52, H - inset - 52, 1, -1, color)}
    ${lineCorner(W - inset - 52, H - inset - 52, -1, -1, color)}
    <circle cx="${W / 2}" cy="${inset + 1}" r="5.5" fill="${shade(color, 0.5)}"/>
    <circle cx="${W / 2}" cy="${H - inset - 1}" r="5.5" fill="${shade(color, 0.5)}"/>
  `);
}

export { shade };
