// Debug surface scores — cscript //nologo _debug-surface.js
var WT = 1.2, WB = 0.8, WI = 0.95, WI_EASE = 1.15, GAMMA_EASE = 0.6, EASE_SCALE = 1.0;
var IMPACT_EXP = 0.85, DAMPEN_MAX = 0.55, DAMPEN_POWER = 1.5, DAMPEN_EASE_ATTENUATION = 0.85;
var EASE_MUL_DAMPEN_THRESHOLD = 0.5, EASE_MUL_LO = 0.75, EASE_MUL_HI = 1.25, HARD_PENALTY_FLOOR = 0.88;
var EASE_FLOOR = 2.5, EASE_BASE = 0.25, URGENCY_BOOST_MAX = 2.2, URGENCY_BOOST_MIN_U = 4;
var URGENCY_TO_TB = [{ T: 0, B: 0 }, { T: 1, B: 0 }, { T: 2, B: 1 }, { T: 3, B: 2 }, { T: 4, B: 3 }];
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
var URGENCY_PRESSURE_PRESETS = [];
for (var i = 0; i < URGENCY_TO_TB.length; i++) { URGENCY_PRESSURE_PRESETS.push(clamp(WT * URGENCY_TO_TB[i].T + WB * URGENCY_TO_TB[i].B, 0, 6)); }
function urgencyLevelToPressure(level) {
  var u = clamp(level, 0, 4), lo = Math.floor(u), hi = Math.min(lo + 1, 4), t = u - lo;
  return lerp(URGENCY_PRESSURE_PRESETS[lo], URGENCY_PRESSURE_PRESETS[hi], t);
}
function curveImpact(I) { return Math.pow(I / 4, IMPACT_EXP) * 4; }
function dampenCurve(U, I) { return Math.pow((U / 4) * (I / 4), DAMPEN_POWER) * DAMPEN_MAX; }
function effectiveEaseF(U, I, F) { return (U >= 3 && I >= 3) ? Math.max(F, EASE_FLOOR) : F; }
function urgencyBoost(U, I, dampen) {
  if (U < URGENCY_BOOST_MIN_U) return 0;
  return URGENCY_BOOST_MAX * Math.pow(U / 4, 2) * (1 - dampen) * Math.max(0, 1 - I / 4);
}
function calcBaselineTermsRaw(U, I, F) {
  var pressure = urgencyLevelToPressure(U);
  var impactCore = WI * curveImpact(I);
  var effectiveF = effectiveEaseF(U, I, F);
  var dampen = dampenCurve(U, I);
  var easeBoost = Math.pow(effectiveF / 5, GAMMA_EASE);
  var easeWeight = WI_EASE * (1 - dampen * DAMPEN_EASE_ATTENUATION);
  var easeTerm = easeWeight * (I / 4 + EASE_BASE) * easeBoost * EASE_SCALE;
  var hardFactor = 1;
  if (F <= 2 && dampen < EASE_MUL_DAMPEN_THRESHOLD) {
    hardFactor = lerp(HARD_PENALTY_FLOOR, 1, (F - 1));
    if (U >= 3) {
      var urgShield = 1 - Math.pow(U / 4, 2) * (1 - dampen);
      hardFactor = lerp(hardFactor, 1, urgShield);
    }
    impactCore = impactCore * hardFactor;
  }
  var core = pressure + impactCore;
  var easeMul = 1;
  if (dampen < EASE_MUL_DAMPEN_THRESHOLD) {
    easeMul = lerp(EASE_MUL_LO, EASE_MUL_HI, (F - 1) / 4);
    if (U >= 3) core = pressure + impactCore * easeMul;
    else core = core * easeMul;
  }
  var rawScore = core + easeTerm + urgencyBoost(U, I, dampen);
  return rawScore;
}
var BASELINE_RAW_MAX = calcBaselineTermsRaw(4, 4, 5);
var BASELINE_SCORE_SCALE = 10 / BASELINE_RAW_MAX;
function bs(U, I, F) { return clamp(calcBaselineTermsRaw(U, I, F) * BASELINE_SCORE_SCALE, 0, 10); }

var F = 3;
WScript.Echo('=== U band 3-4 at each I (F=3) ===');
for (var I = 0; I <= 4; I++) {
  var min = 10, max = 0;
  for (var u = 3; u <= 4; u += 0.01) {
    var s = bs(u, I, F);
    if (s < min) min = s;
    if (s > max) max = s;
  }
  WScript.Echo('I=' + I + ' score [' + min.toFixed(2) + ', ' + max.toFixed(2) + ']');
}

WScript.Echo('');
WScript.Echo('=== I band 3-4 at each U (F=3) ===');
for (var U = 0; U <= 4; U++) {
  min = 10; max = 0;
  for (var i2 = 3; i2 <= 4; i2 += 0.01) {
    s = bs(U, i2, F);
    if (s < min) min = s;
    if (s > max) max = s;
  }
  WScript.Echo('U=' + U + ' score [' + min.toFixed(2) + ', ' + max.toFixed(2) + ']');
}

WScript.Echo('');
WScript.Echo('=== Score jump at U=3.99 vs U=4.01, I=0 ===');
WScript.Echo('U=3.99 I=0: ' + bs(3.99, 0, F).toFixed(3));
WScript.Echo('U=4.00 I=0: ' + bs(4.00, 0, F).toFixed(3));
WScript.Echo('U=4.01 I=0: ' + bs(4.01, 0, F).toFixed(3));

WScript.Echo('');
WScript.Echo('=== Canvas cols u>=3 at I=4 (top row), w=248 ===');
var w = 248;
for (var col = 183; col <= 247; col += 4) {
  var u = (col / (w - 1)) * 4;
  s = bs(u, 4, F);
  WScript.Echo('col=' + col + ' u=' + u.toFixed(3) + ' score=' + s.toFixed(2));
}

WScript.Echo('');
WScript.Echo('=== Pure red (score>=8.6) area fraction in U[3,4) ===');
var h = 198, redCount = 0, total = 0;
for (var row = 0; row < h; row++) {
  var iVal = (1 - row / (h - 1)) * 4;
  for (col = 0; col < w; col++) {
    u = (col / (w - 1)) * 4;
    if (u >= 3 && u < 4) {
      total++;
      if (bs(u, iVal, F) >= 8.6) redCount++;
    }
  }
}
WScript.Echo('red px in U[3,4): ' + redCount + '/' + total + ' (' + (100*redCount/total).toFixed(1) + '%)');

WScript.Echo('');
WScript.Echo('=== Discontinuities at U=3 (F=3) ===');
for (I = 0; I <= 4; I++) {
  WScript.Echo('I=' + I + ' U=2.99:' + bs(2.99, I, F).toFixed(3) + ' U=3.00:' + bs(3.00, I, F).toFixed(3) + ' U=3.01:' + bs(3.01, I, F).toFixed(3));
}

WScript.Echo('');
WScript.Echo('=== Discontinuities at I=3, U>=3 (F=1) ===');
for (U = 3; U <= 4; U++) {
  WScript.Echo('U=' + U + ' I=2.99:' + bs(U, 2.99, 1).toFixed(3) + ' I=3.00:' + bs(U, 3.00, 1).toFixed(3) + ' I=3.01:' + bs(U, 3.01, 1).toFixed(3));
}

WScript.Echo('');
WScript.Echo('=== scoreToRgb flat red band: scores 8.6-10 at U[3,4), varying I ===');
for (I = 0; I <= 4; I += 0.5) {
  s = bs(3.5, I, F);
  WScript.Echo('U=3.5 I=' + I.toFixed(1) + ' score=' + s.toFixed(2));
}
