// Neon Vice Cover Studio — the cover renderer.
// drawCover paints one GTA-style multi-panel poster on any 2D canvas:
// photo panels with crop/zoom/pan, a sunset or neon colour grade, bold
// Anton title lettering with a Pacifico subtitle, grain and a vignette.

export const SIZES = {
  square: { label: "Square · 1080 × 1080", width: 1080, height: 1080 },
  portrait: { label: "Story · 1080 × 1350", width: 1080, height: 1350 },
  wide: { label: "Wide · 1920 × 1080", width: 1920, height: 1080 },
};

export const LAYOUTS = {
  hero: "Hero + 3",
  grid: "Four grid",
  triptych: "Triptych",
  bleed: "Full bleed",
};

export const GRADES = {
  sunset: "Vice Sunset",
  neon: "Neon Night",
  gold: "Palm Gold",
  dusk: "Ocean Dusk",
  noir: "Noir",
};

const GRADE_FILTERS = {
  sunset: "saturate(1.28) contrast(1.06) sepia(0.14)",
  neon: "saturate(1.45) contrast(1.14) hue-rotate(-10deg)",
  gold: "sepia(0.34) saturate(1.32) contrast(1.05)",
  dusk: "saturate(1.12) brightness(0.92) contrast(1.10)",
  noir: "grayscale(1) contrast(1.28) brightness(1.06)",
};

// [top colour, bottom colour, blend mode, alpha] of the grade wash per photo.
const GRADE_WASHES = {
  sunset: ["#ff7a2f", "#ff2e88", "soft-light", 0.55],
  neon: ["#2ee6c8", "#ff2e88", "overlay", 0.42],
  gold: ["#ffd76b", "#ff8a2f", "soft-light", 0.55],
  dusk: ["#3d6bff", "#7a2eff", "soft-light", 0.5],
  noir: ["#ffffff", "#000000", "overlay", 0.18],
};

export function panelCount(layout) {
  return layout === "bleed" ? 1 : layout === "triptych" ? 3 : 4;
}

// Panel rectangles as fractions of the cover, in layout order.
export function layoutPanels(layout) {
  if (layout === "bleed") return [{ x: 0, y: 0, w: 1, h: 1 }];
  if (layout === "grid") {
    return [
      { x: 0, y: 0, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { x: 0, y: 0.5, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    ];
  }
  if (layout === "triptych") {
    const third = 1 / 3;
    return [0, 1, 2].map((i) => ({ x: i * third, y: 0, w: third, h: 1 }));
  }
  // hero: one tall panel left, three stacked right.
  return [
    { x: 0, y: 0, w: 0.62, h: 1 },
    { x: 0.62, y: 0, w: 0.38, h: 1 / 3 },
    { x: 0.62, y: 1 / 3, w: 0.38, h: 1 / 3 },
    { x: 0.62, y: 2 / 3, w: 0.38, h: 1 / 3 },
  ];
}

function drawPhotoCover(ctx, image, rect, zoom, panX, panY) {
  const iw = image.naturalWidth || image.width;
  const ih = image.naturalHeight || image.height;
  const scale = Math.max(rect.w / iw, rect.h / ih) * zoom;
  const dw = iw * scale;
  const dh = ih * scale;
  const slackX = Math.max(0, (dw - rect.w) / 2);
  const slackY = Math.max(0, (dh - rect.h) / 2);
  const px = Math.max(-slackX, Math.min(slackX, panX));
  const py = Math.max(-slackY, Math.min(slackY, panY));
  ctx.drawImage(image, rect.x + (rect.w - dw) / 2 + px, rect.y + (rect.h - dh) / 2 + py, dw, dh);
}

function paintGradeWash(ctx, rect, grade) {
  const [top, bottom, mode, alpha] = GRADE_WASHES[grade] || GRADE_WASHES.sunset;
  const wash = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
  wash.addColorStop(0, top);
  wash.addColorStop(1, bottom);
  ctx.save();
  ctx.globalCompositeOperation = mode;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = wash;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

let grainTile = null;
function getGrainTile() {
  if (grainTile) return grainTile;
  const tile = document.createElement("canvas");
  tile.width = 128;
  tile.height = 128;
  const tctx = tile.getContext("2d");
  const data = tctx.createImageData(128, 128);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = 118 + Math.floor(Math.random() * 40);
    data.data[i] = v;
    data.data[i + 1] = v;
    data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  tctx.putImageData(data, 0, 0);
  grainTile = tile;
  return grainTile;
}

function fitTitleFont(ctx, text, maxWidth, startSize) {
  let size = startSize;
  ctx.font = `${size}px Anton, "Arial Black", sans-serif`;
  while (size > 24 && ctx.measureText(text).width > maxWidth) {
    size = Math.floor(size * 0.94);
    ctx.font = `${size}px Anton, "Arial Black", sans-serif`;
  }
  return size;
}

function drawTitleBlock(ctx, cover, width, height) {
  const title = (cover.title || "").trim().toUpperCase();
  const subtitle = (cover.subtitle || "").trim();
  if (!title && !subtitle) return;
  const bandH = height * 0.21;
  const bandY = height - bandH;
  // A shorter scrim: it must keep the lettering legible without drowning
  // the bottom panels in darkness.
  const scrim = ctx.createLinearGradient(0, bandY - bandH * 0.45, 0, height);
  scrim.addColorStop(0, "rgba(12,4,24,0)");
  scrim.addColorStop(0.5, "rgba(12,4,24,0.55)");
  scrim.addColorStop(1, "rgba(12,4,24,0.86)");
  ctx.fillStyle = scrim;
  ctx.fillRect(0, bandY - bandH * 0.45, width, height - (bandY - bandH * 0.45));

  const pad = width * 0.045;
  const textW = width - pad * 2;
  let cursorY = height - pad * 0.55;
  if (subtitle) {
    const subSize = Math.max(20, Math.round(width * 0.032));
    ctx.font = `${subSize}px Pacifico, cursive`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#ffe9f4";
    ctx.shadowColor = "rgba(0,0,0,0.75)";
    ctx.shadowBlur = subSize * 0.25;
    ctx.shadowOffsetY = subSize * 0.06;
    ctx.fillText(subtitle, pad, cursorY);
    ctx.shadowColor = "transparent";
    cursorY -= subSize * 1.15;
  }
  if (title) {
    const startSize = Math.round(width * 0.115);
    const size = fitTitleFont(ctx, title, textW, startSize);
    try {
      ctx.letterSpacing = `${Math.round(size * 0.02)}px`;
    } catch {
      // letterSpacing is optional; older engines ignore it.
    }
    ctx.font = `${size}px Anton, "Arial Black", sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    const shine = ctx.createLinearGradient(0, cursorY - size, 0, cursorY + size * 0.12);
    shine.addColorStop(0, "#fff8d8");
    shine.addColorStop(0.45, "#ffc46b");
    shine.addColorStop(1, "#ff5e7a");
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(16,5,28,0.92)";
    ctx.lineWidth = Math.max(3, size / 14);
    ctx.strokeText(title, pad, cursorY);
    ctx.fillStyle = shine;
    ctx.fillText(title, pad, cursorY);
    try {
      ctx.letterSpacing = "0px";
    } catch {
      // reset is best-effort.
    }
  }
}

// Paints the whole cover. `cover` is { title, subtitle, layout, grade,
// panels: [{ image, zoom, panX, panY }] } with panel images as HTMLImageElement.
export function drawCover(ctx, cover, width, height) {
  const gap = Math.max(2, Math.round(width * 0.006));
  // White gutters, GTA poster style.
  ctx.save();
  ctx.fillStyle = "#f7f2ea";
  ctx.fillRect(0, 0, width, height);
  const rects = layoutPanels(cover.layout);
  for (let i = 0; i < rects.length; i += 1) {
    const f = rects[i];
    const rect = {
      x: Math.round(f.x * width + (f.x > 0 ? gap / 2 : 0)),
      y: Math.round(f.y * height + (f.y > 0 ? gap / 2 : 0)),
      w: Math.round(f.w * width - (f.x > 0 ? gap / 2 : 0) - (f.x + f.w < 1 ? gap / 2 : 0)),
      h: Math.round(f.h * height - (f.y > 0 ? gap / 2 : 0) - (f.y + f.h < 1 ? gap / 2 : 0)),
    };
    const panel = cover.panels[i];
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    if (panel && panel.image) {
      ctx.filter = GRADE_FILTERS[cover.grade] || GRADE_FILTERS.sunset;
      // panX/panY are fractions of the panel rect, so preview and export agree.
      drawPhotoCover(ctx, panel.image, rect, panel.zoom || 1, (panel.panX || 0) * rect.w, (panel.panY || 0) * rect.h);
      ctx.filter = "none";
      paintGradeWash(ctx, rect, cover.grade);
    } else {
      const empty = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
      empty.addColorStop(0, "#3a1c5e");
      empty.addColorStop(1, "#160a2e");
      ctx.fillStyle = empty;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = `${Math.round(rect.w * 0.07)}px Anton, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("ADD PHOTO", rect.x + rect.w / 2, rect.y + rect.h / 2);
    }
    ctx.restore();
  }
  drawTitleBlock(ctx, cover, width, height);
  // Vignette.
  const vig = ctx.createRadialGradient(
    width / 2, height / 2, Math.min(width, height) * 0.42,
    width / 2, height / 2, Math.max(width, height) * 0.75,
  );
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(8,2,16,0.34)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, width, height);
  // Grain.
  const tile = getGrainTile();
  const pattern = ctx.createPattern(tile, "repeat");
  if (pattern) {
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.globalCompositeOperation = "overlay";
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
  // Thin white frame.
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = Math.max(2, Math.round(width * 0.004));
  ctx.strokeRect(
    ctx.lineWidth, ctx.lineWidth,
    width - ctx.lineWidth * 2, height - ctx.lineWidth * 2,
  );
  ctx.restore();
}
