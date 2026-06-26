// Debug surface scores between ticks 3-4
import fs from 'fs';
import vm from 'vm';

const code = fs.readFileSync(new URL('./priority-shared.js', import.meta.url), 'utf8');
const sandbox = { console, Math, Object, Array, String, Number, document: { createElement: () => ({}) } };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInContext(code, sandbox);
const { calcBaseline, baselineScore } = sandbox.PriorityUI;

const F = 3;
const SCORE_COLOR_STOPS = [
  { s: 0, r: 155, g: 152, b: 144 },
  { s: 1.4, r: 90, g: 159, b: 212 },
  { s: 2.9, r: 59, g: 169, b: 156 },
  { s: 4.3, r: 110, g: 173, b: 58 },
  { s: 5.8, r: 186, g: 117, b: 23 },
  { s: 7.2, r: 216, g: 90, b: 48 },
  { s: 8.6, r: 226, g: 75, b: 74 },
  { s: 10, r: 226, g: 75, b: 74 }
];

function scoreToRgb(score) {
  score = Math.max(0, Math.min(10, score));
  let hi = SCORE_COLOR_STOPS.length - 1;
  for (let k = 0; k < SCORE_COLOR_STOPS.length - 1; k++) {
    if (score <= SCORE_COLOR_STOPS[k + 1].s) { hi = k + 1; break; }
  }
  const lo = hi - 1;
  const a = SCORE_COLOR_STOPS[lo], b = SCORE_COLOR_STOPS[hi];
  const span = b.s - a.s;
  const t = span > 1e-9 ? (score - a.s) / span : 0;
  return { r: Math.round(a.r + (b.r - a.r) * t), g: Math.round(a.g + (b.g - a.g) * t), b: Math.round(a.b + (b.b - a.b) * t) };
}

function bs(U, I) {
  return calcBaseline({ urgency: U, impact: I, ease: F }).score;
}

// Scan U 2.5-4.5 at I=0..4
console.log('=== Score jumps along U at I=0 ===');
let prev = bs(2.5, 0);
for (let u = 2.5; u <= 4.5; u += 0.05) {
  const s = bs(u, 0);
  if (Math.abs(s - prev) > 0.3) console.log(`  U=${u.toFixed(2)} score ${prev.toFixed(2)} -> ${s.toFixed(2)}`);
  prev = s;
}

console.log('\n=== U band 3-4: min/max score per I ===');
for (let I = 0; I <= 4; I++) {
  let min = 10, max = 0;
  for (let u = 3; u <= 4; u += 0.02) {
    const s = bs(u, I);
    min = Math.min(min, s); max = Math.max(max, s);
  }
  const rgbMin = scoreToRgb(min), rgbMax = scoreToRgb(max);
  console.log(`I=${I}: score [${min.toFixed(2)}, ${max.toFixed(2)}] rgb range (${rgbMin.r},${rgbMin.g},${rgbMin.b}) - (${rgbMax.r},${rgbMax.g},${rgbMax.b})`);
}

console.log('\n=== I band 3-4: min/max score per U ===');
for (let U = 0; U <= 4; U++) {
  let min = 10, max = 0;
  for (let i = 3; i <= 4; i += 0.02) {
    const s = bs(U, i);
    min = Math.min(min, s); max = Math.max(max, s);
  }
  console.log(`U=${U}: score [${min.toFixed(2)}, ${max.toFixed(2)}]`);
}

// Simulate canvas columns at w=248
const w = 248, h = 198;
console.log('\n=== Canvas column colors at I=0 (row=0), cols near U=3..4 ===');
const row = 0, i = 4;
for (let col = 180; col < w; col++) {
  const u = (col / (w - 1)) * 4;
  const s = bs(u, i);
  const rgb = scoreToRgb(s);
  if (col % 5 === 0 || col >= 184 && col <= 190)
    console.log(`col=${col} u=${u.toFixed(3)} score=${s.toFixed(2)} rgb=${rgb.r},${rgb.g},${rgb.b}`);
}

// Check if cols 186-247 are all same red at various I rows
console.log('\n=== Uniform red columns check ===');
for (let row = 0; row < h; row += 33) {
  const iVal = (1 - row / (h - 1)) * 4;
  const cols = [];
  for (let col = 0; col < w; col++) {
    const u = (col / (w - 1)) * 4;
    if (u >= 3 && u < 4) {
      const rgb = scoreToRgb(bs(u, iVal));
      if (rgb.r === 226 && rgb.g === 75 && rgb.b === 74) cols.push(col);
    }
  }
  console.log(`row=${row} I=${iVal.toFixed(2)}: ${cols.length} pure-red px in U[3,4) of ${Math.round(w/4)} expected`);
}
