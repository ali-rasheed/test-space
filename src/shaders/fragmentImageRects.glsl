/**
 * Image-to-colored-rects (v2): sample an image per grid cell and draw each cell
 * as a rounded rectangle filled with that color. Like ASCII art but with colored rects.
 * Rect system (halfSize, cornerRadius, SDF) pulled from original fragment.glsl.
 *
 * Quantization (when u_quantizeSteps >= 2): optional gamma in/out, per-cell dither,
 * and mode — RGB (per-channel levels) vs HSV (posterized hue/sat/value).
 *
 * Rect color: u_rectColorSource 0 = brand palette (shade from luma/warp/weft), 1 = image RGB,
 * 2 = pattern-only (warp vs weft → two palette shades), 3 = tile art (per-cell weave draft from ramp).
 * Tile art: luma band → u_tileArtRamp slot → PATTERNS atlas; sub-cell warp/weft fill (flat or rounded rects).
 * Optional u_tileArtDensity: per mini-cell luma + hash mask (sparse→dense field) on top of weave + brand/tint colors.
 * Optional uniform 8×8 mini-cell grid (u_tileArtUniformGrid): weave lookup still uses each pattern's tileW/H.
 *
 * Stitch-in (optional): ramp u_stitchRevealProgress from 0→1 so stitches appear from a blank (BG-only) frame.
 * Mode 1 = isotropic FBM cell order; mode 2 = dye-bleed streaks (optional draft coupling to warp/weft).
 */
precision mediump float;

uniform vec2 u_resolution;
uniform float u_gridSize;
uniform sampler2D u_imageSampler;
uniform float u_palette;
uniform float u_bgShade;
uniform float u_bgUseCustom; // 0 = palette shade; 1 = u_bgCustomColor
uniform vec3 u_bgCustomColor;
uniform float u_rectColorSource; // 0 brand, 1 image, 2 warp/weft pattern colors, 3 tile art
uniform float u_quantizeSteps; // 0–1 = off, 2+ = levels per band
uniform float u_quantizeMode;  // 0 = RGB, 1 = HSV
uniform float u_quantizeGamma; // >= ~0.05; 1 = linear; applied before/after banding
uniform float u_quantizeDither;// 0–1: jitter magnitude vs one level (cell-stable hash)
uniform float u_rectShade;     // palette shade for rect when brand mode (0–3)
uniform float u_shadeFrom;    // 0=color, 1=warp, 2=weft, 3=warp+weft (brand mode: what drives palette shade)
uniform sampler2D u_patternSampler;
uniform float u_patternIndex;
uniform float u_tileW;
uniform float u_tileH;
uniform float u_patternTexHeight;
uniform float u_rectRadius;   // corner radius in cell space (0 = sharp, ~0.18 = default)
uniform float u_rectAspect;   // rect width/height in cell space (e.g. 0.85 = 34/40)
uniform float u_rectRatio;    // scale of rect within cell (1 = full cell, <1 = inset)
uniform float u_patternWarpShade;  // palette shade 0–4 for warp cells (rectColorSource == 2)
uniform float u_patternWeftShade;
uniform float u_lumaSizeMix;     // 0 = ignore luma; 1 = full mapping (see lumaSizeFloor)
uniform float u_lumaSizeInvert;  // 0 = dark small / bright large; 1 = opposite
uniform float u_lumaSizeFloor;   // min scale multiplier at the “small” end (0.05–1)
// Cell geometry: 0 = always weave (rounded rects); 1 = plain full cell unless image luma ≤ u_stitchLumaMax
uniform float u_cellGeometryMode;
uniform float u_stitchLumaMax;    // darkness gate: weave stitch only when lum ≤ this (0=black … 1=white)
uniform float u_nonStitchShowsBg; // 1 = bright non-stitched cells use background instead of plain tile fill
uniform float u_contentPadding;   // 0–0.45: fraction of canvas width/height per edge; band is BG only (halftone back ink)

// Stitch-in reveal: 0 = off; 1 = noise (FBM); 2 = bleed (anisotropic FBM + mix).
uniform float u_stitchRevealMode;
uniform float u_stitchRevealProgress; // 0..1 global ramp
uniform float u_stitchRevealSeed;
uniform float u_stitchRevealScale;
uniform float u_stitchRevealNoiseScale;
uniform float u_stitchRevealSoftness;
uniform float u_stitchRevealBleedAnisotropy;
uniform float u_stitchRevealBleedRotation;
uniform float u_stitchRevealBleedCrossFiber;
uniform float u_stitchRevealBleedDraftCoupled;

// All colorways: u_useAllColorways + u_colorwayNoiseMode — 0 = hash, 1 = smooth Perlin+FBM, 2 = dye bleed.
uniform float u_useAllColorways;
uniform float u_colorwaySeed;
uniform float u_colorwayNoiseScale;
uniform float u_colorwayNoiseMode;
uniform float u_colorwayNoiseOctaves;
uniform float u_colorwayNoisePersistence;
uniform float u_colorwayNoiseLacunarity;
uniform float u_colorwayNoiseBias;
uniform float u_colorwayNoiseX;
uniform float u_colorwayBleedAnisotropy;
uniform float u_colorwayBleedRotation;
uniform float u_colorwayBleedCrossFiber;
uniform float u_colorwayBleedDraftCoupled;
uniform vec4 u_colorwayInclude0123;
uniform float u_colorwayInclude4;

// Tile art (rectColorSource == 3): eight-slot luma ramp, optional empty field threshold.
uniform float u_tileArtLevels;      // 2–8 bands
uniform float u_tileArtThreshold;   // bright cells → background only when lum > threshold
uniform float u_tileArtDither;      // 0–1 band jitter
uniform float u_tileArtColorMode;   // 0 mono, 1 brand, 2 tint
uniform float u_tileArtGeom;        // 0 flat sub-cell fill, 1 rounded mini stitches
uniform float u_tileArtUniformGrid; // 0 = pattern tileW/H grid, 1 = fixed 8×8 mini cells
uniform float u_tileArtDensity;     // 0 = full mini-cell carpet in occupied macros; 1 = per mini-cell luma+hash mask
uniform float u_tileArtRamp0;
uniform float u_tileArtRamp1;
uniform float u_tileArtRamp2;
uniform float u_tileArtRamp3;
uniform float u_tileArtRamp4;
uniform float u_tileArtRamp5;
uniform float u_tileArtRamp6;
uniform float u_tileArtRamp7;
uniform sampler2D u_patternMeta;    // 1×N: R=tileW, G=tileH per pattern index
uniform float u_patternMetaWidth;

// --- WEAVE PATTERN LOOKUP (from v1 fragment.glsl) ---
// row, col = cell position; returns 0 = warp, 1 = weft for rect orientation.
float getPatternFromTextureIdx(float row, float col, float patternIdx, float tileW, float tileH) {
  float r = mod(row, tileH);
  float c = mod(col, tileW);
  float stripY = patternIdx * 10.0;
  float texX = (c + 0.5) / 10.0;
  float texY = (stripY + r + 0.5) / u_patternTexHeight;
  return texture2D(u_patternSampler, vec2(texX, texY)).r;
}

float getPatternFromTexture(float row, float col) {
  return getPatternFromTextureIdx(row, col, u_patternIndex, u_tileW, u_tileH);
}

vec2 getPatternTileSize(float patternIdx) {
  float u = (floor(patternIdx) + 0.5) / max(u_patternMetaWidth, 1.0);
  vec4 m = texture2D(u_patternMeta, vec2(u, 0.5));
  return vec2(m.r * 8.0, m.g * 10.0);
}

float tileArtRampSlot(float band) {
  if (band < 0.5) return u_tileArtRamp0;
  if (band < 1.5) return u_tileArtRamp1;
  if (band < 2.5) return u_tileArtRamp2;
  if (band < 3.5) return u_tileArtRamp3;
  if (band < 4.5) return u_tileArtRamp4;
  if (band < 5.5) return u_tileArtRamp5;
  if (band < 6.5) return u_tileArtRamp6;
  return u_tileArtRamp7;
}

// --- ENS COLOR PICK (from original fragment.glsl) ---
// Palette 0–4 = Citrine, Garnet, Lapis, Peridot, Quartz (Quartz = ENS Core quartz/900,500,100,400). Shade 0–4 = 950, 500, 100, 400, Transparent.
vec4 getPaletteColor(float palette, float shade) {
  int p = int(mod(floor(palette + 0.01), 5.0));
  int s = int(mod(floor(shade + 0.01), 5.0));
  if (s == 4) return vec4(0.0, 0.0, 0.0, 0.0);  // Transparent
  if (p == 0) { // Citrine
    if (s == 0) return vec4(0.247, 0.114, 0.035, 1.0);   // 950
    if (s == 1) return vec4(0.596, 0.302, 0.106, 1.0);   // 500 #984D1B
    if (s == 2) return vec4(0.973, 0.969, 0.886, 1.0);   // 100
    return vec4(0.855, 0.725, 0.525, 1.0);               // 400
  }
  if (p == 1) { // Garnet
    if (s == 0) return vec4(0.322, 0.024, 0.141, 1.0);   // 950
    if (s == 1) return vec4(0.941, 0.216, 0.576, 1.0);   // 500
    if (s == 2) return vec4(0.984, 0.922, 0.941, 1.0);   // 100
    return vec4(0.988, 0.706, 0.812, 1.0);               // 400
  }
  if (p == 2) { // Lapis
    if (s == 0) return vec4(0.008, 0.161, 0.231, 1.0);   // 950
    if (s == 1) return vec4(0.0, 0.502, 0.737, 1.0);    // 500
    if (s == 2) return vec4(0.902, 0.953, 0.973, 1.0);   // 100
    return vec4(0.455, 0.725, 0.875, 1.0);               // 400
  }
  if (p == 3) { // Peridot
    if (s == 0) return vec4(0.012, 0.188, 0.063, 1.0);   // 950
    if (s == 1) return vec4(0.0, 0.486, 0.137, 1.0);    // 500
    if (s == 2) return vec4(0.843, 0.914, 0.890, 1.0);   // 100
    return vec4(0.4549, 0.6745, 0.4902, 1.0);             // 300 #74AC7D (slot = UI “400”)
  }
  // Quartz
  if (s == 0) return vec4(0.098039, 0.098039, 0.098039, 1.0);   // 900
  if (s == 1) return vec4(0.34902, 0.341176, 0.333333, 1.0);   // 500
  if (s == 2) return vec4(0.933333, 0.929412, 0.929412, 1.0);   // 100
  return vec4(0.45098, 0.45098, 0.45098, 1.0);                  // 400
}

float colorwayHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec2 colorwayHash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float colorwayPerlin01(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 g00 = colorwayHash22(i + vec2(0.0, 0.0)) * 2.0 - 1.0;
  vec2 g10 = colorwayHash22(i + vec2(1.0, 0.0)) * 2.0 - 1.0;
  vec2 g01 = colorwayHash22(i + vec2(0.0, 1.0)) * 2.0 - 1.0;
  vec2 g11 = colorwayHash22(i + vec2(1.0, 1.0)) * 2.0 - 1.0;
  float n00 = dot(g00, f - vec2(0.0, 0.0));
  float n10 = dot(g10, f - vec2(1.0, 0.0));
  float n01 = dot(g01, f - vec2(0.0, 1.0));
  float n11 = dot(g11, f - vec2(1.0, 1.0));
  float nx = mix(n00, n10, u.x);
  float ny = mix(n01, n11, u.x);
  float n = mix(nx, ny, u.y);
  return clamp(n * 0.65 + 0.5, 0.0, 1.0);
}

float colorwayFbm(vec2 p, float offsetX) {
  float per = clamp(u_colorwayNoisePersistence, 0.15, 0.95);
  float lac = clamp(u_colorwayNoiseLacunarity, 1.05, 4.0);
  float oct = clamp(floor(u_colorwayNoiseOctaves + 0.01), 1.0, 4.0);
  float sum = 0.0;
  float amp = 0.5;
  float norm = 0.0;
  float freq = 1.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float w = step(fi + 0.5, oct);
    sum += w * amp * colorwayPerlin01(p * freq + vec2(offsetX * freq, 0.0));
    norm += w * amp;
    amp *= per;
    freq *= lac;
  }
  return sum / max(norm, 1e-4);
}

float colorwayIncludeCount() {
  return u_colorwayInclude0123.x + u_colorwayInclude0123.y + u_colorwayInclude0123.z + u_colorwayInclude0123.w + u_colorwayInclude4;
}

float colorwayPickFromU(float u01) {
  float n = colorwayIncludeCount();
  if (n < 0.5) return u_palette;
  float kk = floor(clamp(u01, 0.0, 1.0 - 1e-5) * n);
  if (u_colorwayInclude0123.x > 0.5) { if (kk < 0.5) return 0.0; kk -= 1.0; }
  if (u_colorwayInclude0123.y > 0.5) { if (kk < 0.5) return 1.0; kk -= 1.0; }
  if (u_colorwayInclude0123.z > 0.5) { if (kk < 0.5) return 2.0; kk -= 1.0; }
  if (u_colorwayInclude0123.w > 0.5) { if (kk < 0.5) return 3.0; kk -= 1.0; }
  if (u_colorwayInclude4 > 0.5) { if (kk < 0.5) return 4.0; }
  return u_palette;
}

float colorwayQuantize(float tRaw) {
  float b = max(0.08, min(4.0, u_colorwayNoiseBias));
  float t = pow(clamp(tRaw, 0.0, 1.0), b);
  return colorwayPickFromU(t);
}

float mosaicCellPalette(vec2 cellID, float isWeft) {
  if (u_useAllColorways < 0.5) return u_palette;
  float scale = max(0.001, u_colorwayNoiseScale);
  vec2 seedOff = vec2(u_colorwaySeed * 0.103511, u_colorwaySeed * 0.097369);
  float xMicro = u_colorwayNoiseX * 0.04;
  float mode = u_colorwayNoiseMode;
  if (mode < 0.5) {
    return colorwayPickFromU(colorwayHash(cellID * scale + vec2(u_colorwaySeed + xMicro, 0.0)));
  }
  if (mode < 1.5) {
    vec2 p = cellID.xy * scale + seedOff;
    return colorwayQuantize(colorwayFbm(p, xMicro));
  }
  float ani = max(0.35, min(12.0, u_colorwayBleedAnisotropy));
  float ang = u_colorwayBleedRotation * 6.28318530718;
  float co = cos(ang);
  float si = sin(ang);
  vec2 rc = vec2(co * cellID.x - si * cellID.y, si * cellID.x + co * cellID.y);
  vec2 pRot = vec2(rc.x * ani, rc.y / ani) * scale + seedOff;
  float tStrip = colorwayFbm(pRot, xMicro);
  vec2 pH = vec2(cellID.x * ani, cellID.y / ani) * scale + seedOff;
  vec2 pV = vec2(cellID.x / ani, cellID.y * ani) * scale + seedOff;
  float tH = colorwayFbm(pH, xMicro);
  float tV = colorwayFbm(pV, xMicro);
  float tMix = mix(tH, tV, isWeft);
  float tDraft = u_colorwayBleedDraftCoupled > 0.5 ? tMix : tStrip;
  vec2 pIso = cellID.xy * scale + seedOff + vec2(17.13, 23.71);
  float tIso = colorwayFbm(pIso, xMicro);
  float xf = clamp(u_colorwayBleedCrossFiber, 0.0, 1.0);
  float tBleed = mix(tDraft, tIso, xf);
  return colorwayQuantize(tBleed);
}

// --- ROUNDED RECTANGLE SDF (from original fragment.glsl) ---
// Negative = inside, zero = edge, positive = outside.
// halfSize = half extents; radius = corner radius (~6/40 from Figma).
float roundedRect(vec2 p, vec2 halfSize, float radius) {
  vec2 d = abs(p) - halfSize + radius;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - radius;
}

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return c.z * mix(vec3(1.0), rgb, c.y);
}

// Band scalar 0..1 to `steps` levels (inclusive endpoints).
float quantizeScalar(float x, float n) {
  return floor(x * n + 0.5) / n;
}

vec3 quantizeRgb(vec3 c, float steps, float dither, vec2 cellID) {
  float n = max(steps - 1.0, 1.0);
  vec3 jit = vec3(0.0);
  if (dither > 0.001) {
    float h = fract(sin(dot(cellID, vec2(12.9898, 78.233))) * 43758.5453);
    jit = (vec3(h, fract(h * 37.721), fract(h * 91.318)) - 0.5) * 2.0 * dither / n;
  }
  vec3 cq = clamp(c + jit, 0.0, 1.0);
  return vec3(
    quantizeScalar(cq.r, n),
    quantizeScalar(cq.g, n),
    quantizeScalar(cq.b, n)
  );
}

vec3 quantizeHsv(vec3 c, float steps, float dither, vec2 cellID) {
  float n = max(steps - 1.0, 1.0);
  float jitAmt = 0.0;
  if (dither > 0.001) {
    float h = fract(sin(dot(cellID + vec2(13.1, 9.7), vec2(12.9898, 78.233))) * 43758.5453);
    jitAmt = (h - 0.5) * 2.0 * dither / n;
  }
  vec3 hsv = rgb2hsv(clamp(c, 0.0, 1.0));
  float hn = fract(hsv.x + jitAmt * 0.15);
  float hq = quantizeScalar(hn, n);
  float sq = quantizeScalar(clamp(hsv.y + jitAmt, 0.0, 1.0), n);
  float vq = quantizeScalar(clamp(hsv.z + jitAmt, 0.0, 1.0), n);
  return hsv2rgb(vec3(hq, sq, vq));
}

vec3 quantizeImage(vec3 sampled, float steps, float mode, float gamma, float dither, vec2 cellID) {
  if (steps < 2.0) return sampled;
  float g = clamp(gamma, 0.08, 4.0);
  vec3 lifted = pow(max(sampled, vec3(1.0e-5)), vec3(1.0 / g));
  vec3 banded = (mode > 0.5)
    ? quantizeHsv(lifted, steps, dither, cellID)
    : quantizeRgb(lifted, steps, dither, cellID);
  return pow(max(banded, vec3(1.0e-5)), vec3(g));
}

// --- Stitch-in: gradient noise + FBM (aligned with weave colorway helpers in fragment.glsl) ---
vec2 mosaicHash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float mosaicPerlin01(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 g00 = mosaicHash22(i + vec2(0.0, 0.0)) * 2.0 - 1.0;
  vec2 g10 = mosaicHash22(i + vec2(1.0, 0.0)) * 2.0 - 1.0;
  vec2 g01 = mosaicHash22(i + vec2(0.0, 1.0)) * 2.0 - 1.0;
  vec2 g11 = mosaicHash22(i + vec2(1.0, 1.0)) * 2.0 - 1.0;
  float n00 = dot(g00, f - vec2(0.0, 0.0));
  float n10 = dot(g10, f - vec2(1.0, 0.0));
  float n01 = dot(g01, f - vec2(0.0, 1.0));
  float n11 = dot(g11, f - vec2(1.0, 1.0));
  float nx = mix(n00, n10, u.x);
  float ny = mix(n01, n11, u.x);
  float n = mix(nx, ny, u.y);
  return clamp(n * 0.65 + 0.5, 0.0, 1.0);
}

float mosaicFbm(vec2 p) {
  float per = 0.5;
  float lac = 2.0;
  float sum = 0.0;
  float amp = 0.5;
  float norm = 0.0;
  float freq = 1.0;
  for (int i = 0; i < 3; i++) {
    sum += amp * mosaicPerlin01(p * freq);
    norm += amp;
    amp *= per;
    freq *= lac;
  }
  return sum / max(norm, 1e-4);
}

float stitchRevealOrderNoise(vec2 cellID) {
  float scale = max(0.001, u_stitchRevealScale);
  float nfreq = max(0.05, u_stitchRevealNoiseScale);
  vec2 seedOff = vec2(u_stitchRevealSeed * 0.103511, u_stitchRevealSeed * 0.097369);
  vec2 p = cellID.xy * scale + seedOff;
  return mosaicFbm(p * nfreq);
}

float stitchRevealOrderBleed(vec2 cellID, float isWeft) {
  float scale = max(0.001, u_stitchRevealScale);
  float nfreq = max(0.05, u_stitchRevealNoiseScale);
  vec2 seedOff = vec2(u_stitchRevealSeed * 0.103511, u_stitchRevealSeed * 0.097369);
  float ani = max(0.35, min(12.0, u_stitchRevealBleedAnisotropy));
  float ang = u_stitchRevealBleedRotation * 6.28318530718;
  float co = cos(ang);
  float si = sin(ang);
  vec2 rc = vec2(co * cellID.x - si * cellID.y, si * cellID.x + co * cellID.y);
  vec2 pRot = vec2(rc.x * ani, rc.y / ani) * scale + seedOff;
  float tStrip = mosaicFbm(pRot * nfreq);
  vec2 pH = vec2(cellID.x * ani, cellID.y / ani) * scale + seedOff;
  vec2 pV = vec2(cellID.x / ani, cellID.y * ani) * scale + seedOff;
  float tH = mosaicFbm(pH * nfreq);
  float tV = mosaicFbm(pV * nfreq);
  float tMix = mix(tH, tV, isWeft);
  float tDraft = u_stitchRevealBleedDraftCoupled > 0.5 ? tMix : tStrip;
  vec2 pIso = cellID.xy * scale + seedOff + vec2(17.13, 23.71);
  float tIso = mosaicFbm(pIso * nfreq);
  float xf = clamp(u_stitchRevealBleedCrossFiber, 0.0, 1.0);
  return mix(tDraft, tIso, xf);
}

vec4 mosaicBackgroundColor() {
  return u_bgUseCustom > 0.5
    ? vec4(clamp(u_bgCustomColor, 0.0, 1.0), 1.0)
    : getPaletteColor(u_palette, u_bgShade);
}

void main() {
  // --- CONTENT PADDING: outer band uses background only (no image / mosaic) ---
  vec2 uvNorm = gl_FragCoord.xy / u_resolution;
  float pad = clamp(u_contentPadding, 0.0, 0.45);
  float inner = max(1.0 - 2.0 * pad, 0.01);
  if (pad > 0.0001 && (uvNorm.x < pad || uvNorm.x > 1.0 - pad || uvNorm.y < pad || uvNorm.y > 1.0 - pad)) {
    gl_FragColor = mosaicBackgroundColor();
    return;
  }
  vec2 contentNorm = pad > 0.0001 ? (uvNorm - pad) / inner : uvNorm;

  // --- GRID SETUP (same as original) ---
  float aspect = u_resolution.x / u_resolution.y;
  vec2 uv = vec2(contentNorm.x * aspect, contentNorm.y);

  float gridSize = clamp(u_gridSize, 2.0, 256.0);
  vec2 gridUV = uv * gridSize;
  vec2 cellUV = fract(gridUV);
  vec2 cellID = floor(gridUV);

  // Sample image at cell center. Grid: gridSize cells along vertical (y), gridSize*aspect along horizontal (x).
  // Flip texture Y so image matches screen (WebGL tex origin is bottom-left; image upload is often top-down).
  float texX = (cellID.x + 0.5) / (gridSize * aspect);
  float texY = 1.0 - (cellID.y + 0.5) / gridSize;
  vec3 sampled = texture2D(u_imageSampler, vec2(texX, texY)).rgb;
  vec3 quantized = quantizeImage(sampled, u_quantizeSteps, u_quantizeMode, u_quantizeGamma, u_quantizeDither, cellID);

  // --- RECT COLOR: image vs brand vs binary weave (two palette shades) ---
  vec4 rectVec;
  float isWeft = getPatternFromTexture(cellID.y, cellID.x);
  float cellPalette = mosaicCellPalette(cellID, isWeft);
  if (u_rectColorSource > 1.5) {
    // Pattern colors only: warp vs weft → two shades (independent of image hue).
    float shadePick = isWeft > 0.5 ? u_patternWeftShade : u_patternWarpShade;
    rectVec = getPaletteColor(cellPalette, shadePick);
  } else if (u_rectColorSource > 0.5) {
    rectVec = vec4(quantized, 1.0);
  } else {
    float shade;
    float numCellsY = gridSize;
    float numCellsX = gridSize * aspect;
    float warpT = cellID.y / max(numCellsY - 1.0, 1.0);
    float weftT = cellID.x / max(numCellsX - 1.0, 1.0);
    if (u_shadeFrom < 0.5) {
      float lum = dot(quantized, vec3(0.2126, 0.7152, 0.0722));
      shade = clamp(floor(lum * 5.0), 0.0, 4.0);
    } else if (u_shadeFrom < 1.5) {
      shade = clamp(floor(warpT * 5.0), 0.0, 4.0);
    } else if (u_shadeFrom < 2.5) {
      shade = clamp(floor(weftT * 5.0), 0.0, 4.0);
    } else {
      float t = (warpT + weftT) * 0.5;
      shade = clamp(floor(t * 5.0), 0.0, 4.0);
    }
    rectVec = getPaletteColor(cellPalette, shade);
  }

  // --- ROUNDED RECT: orient by weave (same as v1). Size from luminance × u_rectRatio. ---
  // Warp = portrait (halfX, halfY), weft = landscape (halfY, halfX).
  vec2 p = cellUV - 0.5;
  float lumRaw = dot(sampled, vec3(0.2126, 0.7152, 0.0722));
  float lumT = u_lumaSizeInvert > 0.5 ? (1.0 - lumRaw) : lumRaw;
  float floorClamped = clamp(u_lumaSizeFloor, 0.05, 1.0);
  float sizeMul = mix(1.0, mix(floorClamped, 1.0, lumT), clamp(u_lumaSizeMix, 0.0, 1.0));
  float ratio = clamp(u_rectRatio * sizeMul, 0.02, 1.0);
  float aspectClamped = clamp(u_rectAspect, 0.2, 2.0);
  float halfY = 0.5 * ratio;
  float halfX = halfY * aspectClamped;
  float cornerRadius = clamp(u_rectRadius, 0.0, 0.5);
  vec2 halfSize = isWeft > 0.5 ? vec2(halfY, halfX) : vec2(halfX, halfY);
  float d = roundedRect(p, halfSize, cornerRadius);
  // Keep edge AA roughly one pixel in cell-space across grid resolutions.
  float edge = gridSize / min(u_resolution.x, u_resolution.y);
  float cellStitch = 1.0 - smoothstep(-edge, edge, d);
  // Darkness gate: bright cells → full tile (plain); dark enough → weave geometry.
  float useStitchGeom = u_cellGeometryMode < 0.5 ? 1.0 : (1.0 - step(u_stitchLumaMax + 0.0001, lumRaw));
  float nonStitchFill = u_nonStitchShowsBg > 0.5 ? 0.0 : 1.0;
  float cell = mix(nonStitchFill, cellStitch, useStitchGeom);

  float revealMul = 1.0;
  if (u_stitchRevealMode > 0.5) {
    float orderT = u_stitchRevealMode < 1.5
      ? stitchRevealOrderNoise(cellID)
      : stitchRevealOrderBleed(cellID, isWeft);
    float soft = max(0.001, u_stitchRevealSoftness);
    revealMul = smoothstep(orderT - soft, orderT + soft, u_stitchRevealProgress);
  }
  cell *= revealMul;

  // --- COLORING (same as original: palette + bg shade for background). Supports transparent. ---
  vec4 bgVec = mosaicBackgroundColor();

  vec4 outColor;
  if (u_rectColorSource > 2.5) {
    // --- TILE ART: per-cell weave draft from luma ramp; full-cell two-tone interlacement ---
    float lum = dot(quantized, vec3(0.2126, 0.7152, 0.0722));
    float levels = clamp(u_tileArtLevels, 2.0, 8.0);
    float t = lum * (levels - 1.0);
    if (u_tileArtDither > 0.001 && u_tileArtDensity < 0.5) {
      float hBand = fract(sin(dot(cellID, vec2(12.9898, 78.233))) * 43758.5453);
      t += (hBand - 0.5) * u_tileArtDither;
    }
    float band = clamp(floor(t + 0.5), 0.0, levels - 1.0);
    float patternIdx = tileArtRampSlot(band);
    vec2 patSize = getPatternTileSize(patternIdx);
    float tileW = max(patSize.x, 1.0);
    float tileH = max(patSize.y, 1.0);
    const float TILE_ART_UNIFORM_W = 8.0;
    const float TILE_ART_UNIFORM_H = 8.0;
    float uniformOn = step(0.5, u_tileArtUniformGrid);
    float geomW = mix(tileW, TILE_ART_UNIFORM_W, uniformOn);
    float geomH = mix(tileH, TILE_ART_UNIFORM_H, uniformOn);
    float gCol = floor(cellUV.x * geomW);
    float gRow = floor(cellUV.y * geomH);
    float patCol;
    float patRow;
    if (u_tileArtUniformGrid > 0.5) {
      patCol = floor(((gCol + 0.5) / geomW) * tileW);
      patRow = floor(((gRow + 0.5) / geomH) * tileH);
    } else {
      patCol = floor(cellUV.x * tileW);
      patRow = floor(cellUV.y * tileH);
    }
    float isWeftTile = getPatternFromTextureIdx(patRow, patCol, patternIdx, tileW, tileH);
    float occupied = 1.0 - step(u_tileArtThreshold + 0.0001, lumRaw);
    float revealMulTile = 1.0;
    if (u_stitchRevealMode > 0.5) {
      float orderT = u_stitchRevealMode < 1.5
        ? stitchRevealOrderNoise(cellID)
        : stitchRevealOrderBleed(cellID, isWeftTile);
      float soft = max(0.001, u_stitchRevealSoftness);
      revealMulTile = smoothstep(orderT - soft, orderT + soft, u_stitchRevealProgress);
    }
    occupied *= revealMulTile;
    float cellPaletteTile = mosaicCellPalette(cellID, isWeftTile);
    vec4 warpCol = getPaletteColor(cellPaletteTile, u_patternWarpShade);
    vec4 weftCol = getPaletteColor(cellPaletteTile, u_patternWeftShade);
    vec4 stitchCol;
    if (u_tileArtColorMode < 1.5) {
      stitchCol = isWeftTile > 0.5 ? weftCol : warpCol;
    } else {
      vec4 imgCol = vec4(quantized, 1.0);
      stitchCol = isWeftTile > 0.5 ? imgCol : mix(bgVec, imgCol, 0.35);
    }
    vec4 tileVec;
    if (u_tileArtGeom < 0.5) {
      tileVec = stitchCol;
    } else {
      vec2 subUV = fract(vec2(cellUV.x * geomW, cellUV.y * geomH));
      vec2 pSub = subUV - 0.5;
      float ratioTile = clamp(u_rectRatio, 0.02, 1.0);
      float aspectTile = clamp(u_rectAspect, 0.2, 2.0);
      // Half extents in sub-cell space (must stay <= ~0.5 or SDF fills the whole sub-cell and looks flat).
      float halfYTile = 0.5 * ratioTile;
      float halfXTile = halfYTile * aspectTile;
      vec2 halfSizeTile = isWeftTile > 0.5 ? vec2(halfYTile, halfXTile) : vec2(halfXTile, halfYTile);
      float cornerTile = clamp(u_rectRadius, 0.0, 0.5);
      float dSub = roundedRect(pSub, halfSizeTile, cornerTile);
      float subEdge = (gridSize * max(geomW, geomH)) / min(u_resolution.x, u_resolution.y);
      float stitchMask = 1.0 - smoothstep(-subEdge, subEdge, dSub);
      tileVec = mix(bgVec, stitchCol, stitchMask);
    }
    if (tileVec.a < 0.001) tileVec = vec4(bgVec.rgb, 1.0);
    float densityMask = 1.0;
    if (u_tileArtDensity > 0.5) {
      float texXSub = (cellID.x + (gCol + 0.5) / geomW) / (gridSize * aspect);
      float texYSub = 1.0 - (cellID.y + (gRow + 0.5) / geomH) / gridSize;
      vec3 sampledSub = texture2D(u_imageSampler, vec2(texXSub, texYSub)).rgb;
      vec2 subCellKey = cellID + vec2(gCol, gRow) * 0.03125;
      vec3 quantSub = quantizeImage(sampledSub, u_quantizeSteps, u_quantizeMode, u_quantizeGamma, u_quantizeDither, subCellKey);
      float lumSub = dot(quantSub, vec3(0.2126, 0.7152, 0.0722));
      float density = clamp(1.0 - lumSub, 0.0, 1.0);
      float h = fract(sin(dot(subCellKey, vec2(12.9898, 78.233))) * 43758.5453);
      if (u_tileArtDither > 0.001) {
        density = clamp(density + (h - 0.5) * u_tileArtDither, 0.0, 1.0);
      }
      densityMask = step(h, density);
    }
    float stitchVisible = occupied * mix(1.0, densityMask, step(0.5, u_tileArtDensity));
    outColor = mix(bgVec, tileVec, stitchVisible);
  } else {
    vec4 inRectVec = rectVec.a > 0.001 ? rectVec : vec4(bgVec.rgb, 1.0);
    outColor = mix(bgVec, inRectVec, cell);
  }
  gl_FragColor = outColor;
}
