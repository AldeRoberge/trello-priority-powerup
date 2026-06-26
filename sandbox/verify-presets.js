// Baseline formula verification — run: cscript //nologo verify-presets.js
var WT = 1.2, WB = 0.8, WI = 0.95, WI_EASE = 1.15, GAMMA_EASE = 0.6, EASE_SCALE = 1.0;
var IMPACT_EXP = 0.85, DAMPEN_MAX = 0.55, DAMPEN_POWER = 1.5, DAMPEN_EASE_ATTENUATION = 0.85;
var EASE_MUL_DAMPEN_THRESHOLD = 0.5, EASE_MUL_LO = 0.75, EASE_MUL_HI = 1.25, HARD_PENALTY_FLOOR = 0.88;
var EASE_FLOOR = 2.5, EASE_BASE = 0.25, URGENCY_BOOST_MAX = 2.2, URGENCY_BOOST_MIN_U = 4;
var URGENCY_TO_TB = [{ T: 0, B: 0 }, { T: 1, B: 0 }, { T: 2, B: 1 }, { T: 3, B: 2 }, { T: 4, B: 3 }];
var TIERS = [
  { min: 8.6, label: 'Critique' }, { min: 7.2, label: 'Urgent' }, { min: 5.8, label: 'Prioritaire' },
  { min: 4.3, label: 'Important' }, { min: 2.9, label: 'Flexible' }, { min: 1.4, label: 'Secondaire' }, { min: 0, label: 'Optionnel' }
];
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function mergePressure(T, B) { return clamp(WT * T + WB * B, 0, 6); }
var URGENCY_PRESSURE_PRESETS = [];
for (var i = 0; i < URGENCY_TO_TB.length; i++) { URGENCY_PRESSURE_PRESETS.push(mergePressure(URGENCY_TO_TB[i].T, URGENCY_TO_TB[i].B)); }
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
  return { rawScore: core + easeTerm + urgencyBoost(U, I, dampen), dampen: dampen, easeMul: easeMul, hardFactor: hardFactor };
}
var SCALE = 10 / calcBaselineTermsRaw(4, 4, 5).rawScore;
function baselineScore(U, I, F) { return clamp(calcBaselineTermsRaw(U, I, F).rawScore * SCALE, 0, 10); }
function tierFor(p) { for (var k = 0; k < TIERS.length; k++) { if (p >= TIERS[k].min) return TIERS[k]; } return TIERS[TIERS.length - 1]; }

var bad = 0;

WScript.Echo('=== User complaint: max urgency, low impact, very hard ===');
var urgentLow = baselineScore(4, 0, 1);
var urgentLow1 = baselineScore(4, 1, 1);
WScript.Echo('U=4 I=0 F=1 -> ' + urgentLow.toFixed(2) + ' (' + tierFor(urgentLow).label + ')');
WScript.Echo('U=4 I=1 F=1 -> ' + urgentLow1.toFixed(2) + ' (' + tierFor(urgentLow1).label + ')');
if (urgentLow < 7.2) { bad++; WScript.Echo('FAIL: U=4 I=0 F=1 should be Urgent (>=7.2)'); } else { WScript.Echo('OK: max urgency low impact hard is Urgent'); }

WScript.Echo('');
WScript.Echo('=== User test cases ===');
var hard = baselineScore(2, 2.5, 1);
var easy = baselineScore(2, 2.8, 5);
WScript.Echo('Hard U=2 I=2.5 F=1 -> ' + hard.toFixed(2) + ' (' + tierFor(hard).label + ')');
WScript.Echo('Easy U=2 I=2.8 F=5 -> ' + easy.toFixed(2) + ' (' + tierFor(easy).label + ')');
if (easy <= hard) { bad++; WScript.Echo('FAIL: Easy should beat hard'); } else { WScript.Echo('OK: Easy beats hard'); }

var critHard = baselineScore(4, 4, 1);
WScript.Echo('Critique hard U=4 I=4 F=1 -> ' + critHard.toFixed(2) + ' (' + tierFor(critHard).label + ')');
if (critHard < 8.6) { bad++; WScript.Echo('FAIL: Critique hard should be >= 8.6'); } else { WScript.Echo('OK: Critique hard >= 8.6'); }

var critMax = baselineScore(4, 4, 5);
WScript.Echo('Max U=4 I=4 F=5 -> ' + critMax.toFixed(2));
if (Math.abs(critMax - 10) > 0.01) { bad++; WScript.Echo('FAIL: Max should be 10.0'); } else { WScript.Echo('OK: Max = 10.0'); }

var allMin = baselineScore(0, 0, 1);
WScript.Echo('All min U=0 I=0 F=1 -> ' + allMin.toFixed(2) + ' (' + tierFor(allMin).label + ')');
if (allMin >= 1.4) { bad++; WScript.Echo('FAIL: All min should be low'); } else { WScript.Echo('OK: All min low'); }

WScript.Echo('');
WScript.Echo('=== HEAT_SEGMENTS presets ===');
var PRESETS = [
  ['Optionnel', 0, 0, 2, 0.7], ['Secondaire', 1, 1, 2, 2.1], ['Flexible', 1, 2, 3, 3.6],
  ['Important', 2, 2, 3, 5.0], ['Prioritaire', 2, 3, 3, 6.5], ['Urgent', 3, 3, 2, 7.9], ['Critique', 4, 4, 5, 9.3]
];
for (var n = 0; n < PRESETS.length; n++) {
  var p = PRESETS[n];
  var score = baselineScore(p[1], p[2], p[3]);
  var tier = tierFor(score);
  var ok = tier.label === p[0];
  if (!ok) bad++;
  WScript.Echo(p[0] + ' target=' + p[4] + ' score=' + score.toFixed(2) + ' -> ' + tier.label + (ok ? ' OK' : ' BAD'));
}

WScript.Echo('');
WScript.Echo('rawMax=' + calcBaselineTermsRaw(4, 4, 5).rawScore.toFixed(4) + ' scale=' + SCALE.toFixed(4));
WScript.Quit(bad > 0 ? 1 : 0);
