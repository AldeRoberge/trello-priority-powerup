function priorityParseHex(hex) {
  var h = String(hex).replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16)
  };
}
function srgbToLinear(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}
function rgbToOklab(rgb) {
  var r = srgbToLinear(rgb.r);
  var g = srgbToLinear(rgb.g);
  var b = srgbToLinear(rgb.b);
  var l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  var m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  var s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  l = Math.cbrt(l);
  m = Math.cbrt(m);
  s = Math.cbrt(s);
  return {
    L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  };
}
function oklabToRgb(lab) {
  var l = lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  var m = lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  var s = lab.L - 0.0894841775 * lab.a - 1.2914855480 * lab.b;
  l = l * l * l;
  m = m * m * m;
  s = s * s * s;
  var r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  var g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  var b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  return {
    r: Math.round(Math.max(0, Math.min(255, linearToSrgb(r) * 255))),
    g: Math.round(Math.max(0, Math.min(255, linearToSrgb(g) * 255))),
    b: Math.round(Math.max(0, Math.min(255, linearToSrgb(b) * 255)))
  };
}
function lerpOklab(a, b, t) {
  return {
    L: a.L + (b.L - a.L) * t,
    a: a.a + (b.a - a.a) * t,
    b: a.b + (b.b - a.b) * t
  };
}
function hex(rgb) {
  function byte(n) {
    var s = Math.max(0, Math.min(255, Math.round(n))).toString(16);
    return s.length < 2 ? '0' + s : s;
  }
  return '#' + byte(rgb.r) + byte(rgb.g) + byte(rgb.b);
}
function colorAt(stops, tierI) {
  var stopT = ((6 - tierI) / 6) * (stops.length - 1);
  var labs = stops.map(function (h) {
    return rgbToOklab(priorityParseHex(h));
  });
  var lo = Math.floor(stopT);
  var hi = Math.min(lo + 1, labs.length - 1);
  var t = stopT - lo;
  var rgb = oklabToRgb(lerpOklab(labs[lo], labs[hi], t));
  var fill = {
    r: rgb.r + (255 - rgb.r) * 0.88,
    g: rgb.g + (255 - rgb.g) * 0.88,
    b: rgb.b + (255 - rgb.b) * 0.88
  };
  return { stopT: stopT, seg: hex(rgb), fill: hex(fill), rgb: rgb };
}
var fire = ['#E8EAED', '#F5E49A', '#FF9F1A', '#0079BF', '#EB5A46'];
var blue = ['#E6F1FB', '#B5D4F4', '#85B7EB', '#378ADD', '#0C447C'];
var labels = ['Critique', 'Urgente', 'Prioritaire', 'Importante', 'Flexible', 'Secondaire', 'Optionnelle'];
console.log('FIRE:');
labels.forEach(function (l, i) {
  console.log(i, l, colorAt(fire, i));
});
console.log('BLUE:');
labels.forEach(function (l, i) {
  console.log(i, l, colorAt(blue, i));
});
