import { mk, g2, rr, grad, glow, car, palm, sign } from './sprite-art.js';

const SPRS = {
  player: car('player'),
  'car-fast': car('fast'),
  'car-mid': car('mid'),
  'car-slow': car('slow'),
  palm: palm(),
  'sign-left': sign(-1),
  'sign-right': sign(1),
};
window.__SPRS = {};
const gal = document.getElementById('gallery');
for (const [name, c] of Object.entries(SPRS)) {
  window.__SPRS[name] = c.toDataURL('image/png');
  const im = new Image(); im.src = window.__SPRS[name]; im.width = 112; im.title = name;
  gal.appendChild(im);
}
export function buildSprites() {
  const o = {};
  for (const [name, c] of Object.entries(SPRS)) o[name] = c.toDataURL('image/png');
  return o;
}
