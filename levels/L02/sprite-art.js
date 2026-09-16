// L02 sprite art — shared by spritegen.html (gallery) and in-page regeneration
export const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
export const g2 = (c) => c.getContext('2d');
export function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
export const grad = (g, y0, y1, c0, c1) => {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, c0); gr.addColorStop(1, c1);
  return gr;
};
export const glow = (g, color, blur, fn) => {
  g.save(); g.shadowColor = color; g.shadowBlur = blur; fn(); g.restore();
};

// ---- rear-view neon car ----------------------------------------------------
// canvas 224x160. kinds: player | fast | mid | slow
export function car(kind) {
  const c = mk(224, 160), g = g2(c);
  const P = {
    player: { c0: '#ff5ea8', c1: '#8b1a6b', edge: '#ff8fc4', tail: '#ff2447', glow: '#ff2d95', low: 0.44, spoiler: true, canopy: 0.24 },
    fast:   { c0: '#3ee6ff', c1: '#0a6f9e', edge: '#9ff2ff', tail: '#ff2447', glow: '#00d5ff', low: 0.40, spoiler: false, canopy: 0.22 },
    mid:    { c0: '#ffb020', c1: '#a35a08', edge: '#ffd98a', tail: '#e0341f', glow: '#ff9d2e', low: 0.46, spoiler: false, canopy: 0.28 },
    slow:   { c0: '#f5ead9', c1: '#0f766e', c1b: '#0b5b54', edge: '#ffffff', tail: '#ffb020', glow: '#ffd23f', low: 0.30, spoiler: false, canopy: 0.24, boxy: true },
  }[kind];

  const cx = 112, topY = 160 * P.low;
  const half = kind === 'player' ? 88 : (P.boxy ? 84 : 82);
  const bodyH = P.boxy ? 74 : (kind === 'player' ? 62 : 64);

  // tires
  g.fillStyle = '#0d0618';
  rr(g, cx - half - 6, topY + bodyH - 26, 30, 44, 12); g.fill();
  rr(g, cx + half - 24, topY + bodyH - 26, 30, 44, 12); g.fill();

  // body
  if (P.boxy) {
    g.fillStyle = grad(g, topY, topY + bodyH * 0.55, P.c0, '#e2d3bd');
    rr(g, cx - half, topY, half * 2, bodyH * 0.62, 10); g.fill();          // cream upper
    g.fillStyle = grad(g, topY + bodyH * 0.5, topY + bodyH, P.c1, P.c1b || P.c1);
    rr(g, cx - half, topY + bodyH * 0.52, half * 2, bodyH * 0.48, 8); g.fill(); // teal lower
  } else {
    g.fillStyle = grad(g, topY, topY + bodyH, P.c0, P.c1);
    g.beginPath();
    g.moveTo(cx - half, topY + bodyH);
    g.lineTo(cx - half + 6, topY + bodyH * 0.34);
    g.quadraticCurveTo(cx, topY + (kind === 'player' ? -6 : 0), cx + half - 6, topY + bodyH * 0.34);
    g.lineTo(cx + half, topY + bodyH);
    g.closePath(); g.fill();
    // top edge light
    g.strokeStyle = P.edge; g.globalAlpha = 0.9; g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(cx - half + 8, topY + bodyH * 0.36);
    g.quadraticCurveTo(cx, topY + 2, cx + half - 8, topY + bodyH * 0.36);
    g.stroke(); g.globalAlpha = 1;
  }

  // canopy glass
  const cw = half * 1.28, ch = bodyH * (P.boxy ? 0.5 : 0.52);
  g.fillStyle = '#12082b';
  rr(g, cx - cw / 2, topY - ch, cw, ch, 10); g.fill();
  g.strokeStyle = P.edge; g.globalAlpha = 0.55; g.lineWidth = 2;
  rr(g, cx - cw / 2, topY - ch, cw, ch, 10); g.stroke(); g.globalAlpha = 1;
  g.strokeStyle = '#7ee7ff'; g.globalAlpha = 0.5; g.lineWidth = 3;
  g.beginPath(); g.moveTo(cx - cw * 0.3, topY - ch + 6); g.lineTo(cx - cw * 0.08, topY - 8); g.stroke();
  g.globalAlpha = 1;

  // spoiler (player only)
  if (P.spoiler) {
    g.fillStyle = '#2a1245';
    g.fillRect(cx - half * 0.6, topY - ch - 16, 13, 20);
    g.fillRect(cx + half * 0.6 - 13, topY - ch - 16, 13, 20);
    g.fillStyle = grad(g, topY - ch - 28, topY - ch - 15, '#ff5ea8', '#8c1a68');
    rr(g, cx - half * 0.94, topY - ch - 28, half * 1.88, 13, 6); g.fill();
  }

  // tail lights (glowing)
  const tw = P.boxy ? 16 : 30, th = P.boxy ? 14 : 9;
  const ty = topY + bodyH * 0.42;
  glow(g, P.glow, 16, () => {
    g.fillStyle = P.tail;
    rr(g, cx - half + 10, ty, tw, th, 4); g.fill();
    rr(g, cx + half - 10 - tw, ty, tw, th, 4); g.fill();
  });
  if (!P.boxy) {
    glow(g, P.glow, 12, () => {
      g.strokeStyle = P.tail; g.lineWidth = 4; g.globalAlpha = 0.9;
      g.beginPath(); g.moveTo(cx - half + 12 + tw, ty + th / 2); g.lineTo(cx + half - 12 - tw, ty + th / 2); g.stroke();
      g.globalAlpha = 1;
    });
  }

  // bumper + details
  g.fillStyle = 'rgba(10,4,22,0.85)';
  rr(g, cx - half + 4, topY + bodyH - 16, half * 2 - 8, 14, 6); g.fill();
  if (P.boxy) { // van rear doors split
    g.strokeStyle = 'rgba(10,4,22,0.5)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(cx, ty - 6); g.lineTo(cx, topY + bodyH - 18); g.stroke();
  } else {
    g.fillStyle = '#3a3f47';
    g.beginPath(); g.arc(cx - 26, topY + bodyH - 9, 5, 0, 7); g.fill();
    g.beginPath(); g.arc(cx + 26, topY + bodyH - 9, 5, 0, 7); g.fill();
  }
  if (kind === 'mid') { // sedan chrome strip
    g.fillStyle = '#d8d8e2'; g.globalAlpha = 0.8;
    rr(g, cx - half + 8, ty + th + 6, half * 2 - 16, 3, 1.5); g.fill(); g.globalAlpha = 1;
  }
  return c;
}

// ---- palm silhouette with rim light ----------------------------------------
export function palm() {
  const c = mk(320, 420), g = g2(c);
  const baseX = 182, baseY = 408, crownX = 156, crownY = 152;
  // S-curved tapered trunk
  const steps = 26, pts = [];
  for (let i = 0; i <= steps; i++) {
    const t2 = i / steps;
    const x = (1 - t2) * (1 - t2) * baseX + 2 * (1 - t2) * t2 * 206 + t2 * t2 * crownX;
    const y = (1 - t2) * (1 - t2) * baseY + 2 * (1 - t2) * t2 * 300 + t2 * t2 * crownY;
    const w = 20 - 12 * t2;
    pts.push([x, y, w]);
  }
  g.fillStyle = '#221036';
  g.beginPath();
  g.moveTo(pts[0][0] - pts[0][2], pts[0][1]);
  for (const [x, y, w] of pts) g.lineTo(x - w, y);
  for (let i = pts.length - 1; i >= 0; i--) g.lineTo(pts[i][0] + pts[i][2], pts[i][1]);
  g.closePath(); g.fill();
  g.strokeStyle = 'rgba(255,45,149,0.22)'; g.lineWidth = 2;
  for (let i = 2; i < steps - 1; i += 2) {
    const [x, y, w] = pts[i];
    g.beginPath(); g.moveTo(x - w + 2, y); g.quadraticCurveTo(x, y + 3, x + w - 2, y); g.stroke();
  }
  // crown: one tapered blade, rotated around the crown point
  const blades = 9;
  for (let i = 0; i < blades; i++) {
    const ang = -Math.PI * (0.92 + i * (0.84 / (blades - 1))); // sweep left->right overhead
    const len = 120 + ((i * 37) % 5) * 9;
    g.save();
    g.translate(crownX, crownY);
    g.rotate(ang);
    g.fillStyle = i % 2 ? '#1c0d33' : '#17092b';
    g.beginPath();
    g.moveTo(0, -4);
    g.quadraticCurveTo(len * 0.45, -16, len, 6);            // top edge out to tip
    g.quadraticCurveTo(len * 0.62, 12 + (i % 3) * 4, 0, 6); // bottom edge back (droop)
    g.closePath(); g.fill();
    if (i % 2 === 0) {
      g.strokeStyle = 'rgba(255,45,149,0.5)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(4, -2);
      g.quadraticCurveTo(len * 0.5, -14, len - 4, 4);
      g.stroke();
    }
    g.restore();
  }
  // dead hanging fronds under the crown
  g.fillStyle = '#120722';
  for (const [dx, dy] of [[-30, 34], [2, 40], [30, 30]]) {
    g.beginPath();
    g.moveTo(crownX, crownY + 8);
    g.quadraticCurveTo(crownX + dx * 0.4, crownY + dy + 18, crownX + dx, crownY + dy + 26);
    g.quadraticCurveTo(crownX + dx * 0.42, crownY + dy + 4, crownX, crownY + 8);
    g.closePath(); g.fill();
  }
  // tiny coconuts under crown
  g.fillStyle = '#0e0518';
  g.beginPath(); g.arc(crownX - 10, crownY + 16, 4.5, 0, 7); g.fill();
  g.beginPath(); g.arc(crownX + 9, crownY + 19, 4, 0, 7); g.fill();
  return c;
}

// ---- chevron curve sign -----------------------------------------------------
export function sign(dir) { // dir: -1 left, +1 right
  const c = mk(176, 256), g = g2(c);
  const cx = 88;
  // posts
  g.fillStyle = grad(g, 100, 250, '#8b8fa3', '#3c3f52');
  rr(g, cx - 30, 116, 10, 132, 3); g.fill();
  rr(g, cx + 20, 116, 10, 132, 3); g.fill();
  // panel
  const py = 28, pw = 132, ph = 96;
  glow(g, '#ffd23f', 14, () => {
    g.fillStyle = '#ffd23f';
    rr(g, cx - pw / 2, py, pw, ph, 12); g.fill();
  });
  g.strokeStyle = '#241a04'; g.lineWidth = 5;
  rr(g, cx - pw / 2, py, pw, ph, 12); g.stroke();
  // chevrons
  g.strokeStyle = '#141414'; g.lineWidth = 15; g.lineCap = 'round'; g.lineJoin = 'round';
  for (const off of [-22, 22]) {
    g.beginPath();
    g.moveTo(cx + off - dir * 14, py + 26);
    g.lineTo(cx + off + dir * 14, py + ph / 2);
    g.lineTo(cx + off - dir * 14, py + ph - 26);
    g.stroke();
  }
  return c;
}
