// Neon Vice Cover Studio — editor UI, photo handling, export and shot scenes.
// The cover itself is painted by drawCover in cover.js; this file wires the
// controls, keeps the state, and renders the live preview and the PNG export.

import { SIZES, LAYOUTS, GRADES, panelCount, layoutPanels, drawCover } from "./cover.js";

const SAMPLE_PHOTOS = [
  { src: "./samples/boulevard.jpg", name: "Boulevard" },
  { src: "./samples/pier.jpg", name: "Pier" },
  { src: "./samples/sunset-palms.jpg", name: "Sunset palms" },
  { src: "./samples/neon-street.jpg", name: "Neon street" },
];

const PRESETS = {
  hero: { layout: "hero", grade: "sunset", title: "NEON SHORE", subtitle: "a sunset heist on the neon coast" },
  grid: { layout: "grid", grade: "neon", title: "NIGHT SHIFT", subtitle: "the city never sleeps" },
  triptych: { layout: "triptych", grade: "gold", title: "PALM GOLD", subtitle: "golden hour, every hour" },
  bleed: { layout: "bleed", grade: "dusk", title: "OCEAN DUSK", subtitle: "where the sky meets the sea" },
};

const state = {
  title: "NEON SHORE",
  subtitle: "a sunset heist on the neon coast",
  layout: "hero",
  grade: "sunset",
  size: "square",
  photos: [],
  panels: [],
  selected: 0,
};

const stage = document.getElementById("stage");
const stageCtx = stage.getContext("2d");
const statusEl = document.getElementById("status");
const shotStatusEl = document.getElementById("shot-status");
const params = new URLSearchParams(location.search);
const shot = params.get("shot") || "";

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`could not load ${src}`));
    image.src = src;
  });
}

function blankPanels() {
  return Array.from({ length: panelCount(state.layout) }, () => ({
    photoIndex: null,
    zoom: 1,
    panX: 0,
    panY: 0,
  }));
}

function syncPanelsToLayout() {
  const wanted = panelCount(state.layout);
  while (state.panels.length < wanted) {
    state.panels.push({ photoIndex: null, zoom: 1, panX: 0, panY: 0 });
  }
  state.panels.length = wanted;
  if (state.selected >= wanted) state.selected = 0;
}

function coverState() {
  return {
    title: state.title,
    subtitle: state.subtitle,
    layout: state.layout,
    grade: state.grade,
    panels: state.panels.map((panel) => ({
      image: panel.photoIndex === null ? null : state.photos[panel.photoIndex]?.image ?? null,
      zoom: panel.zoom,
      panX: panel.panX,
      panY: panel.panY,
    })),
  };
}

function previewDimensions() {
  const size = SIZES[state.size];
  const longSide = shot === "cover" ? Math.max(size.width, size.height) : 720;
  const scale = longSide / Math.max(size.width, size.height);
  return { width: Math.round(size.width * scale), height: Math.round(size.height * scale) };
}

function renderPreview() {
  const dims = previewDimensions();
  if (stage.width !== dims.width || stage.height !== dims.height) {
    stage.width = dims.width;
    stage.height = dims.height;
  }
  drawCover(stageCtx, coverState(), dims.width, dims.height);
}

function fitStageToWindow() {
  const dims = previewDimensions();
  const scale = Math.min(window.innerWidth / dims.width, window.innerHeight / dims.height);
  stage.style.width = `${Math.floor(dims.width * scale)}px`;
  stage.style.height = `${Math.floor(dims.height * scale)}px`;
}

function renderThumbs() {
  const strip = document.getElementById("thumbs");
  strip.innerHTML = "";
  state.photos.forEach((photo, index) => {
    const thumb = document.createElement("img");
    thumb.src = photo.image.src;
    thumb.alt = photo.name;
    thumb.title = photo.name;
    thumb.className = state.panels.some((panel) => panel.photoIndex === index) ? "is-used" : "";
    thumb.addEventListener("click", () => {
      assignPhotoToSelected(index);
    });
    strip.appendChild(thumb);
  });
}

function assignPhotoToSelected(photoIndex) {
  const panel = state.panels[state.selected];
  if (!panel) return;
  panel.photoIndex = photoIndex;
  panel.zoom = 1;
  panel.panX = 0;
  panel.panY = 0;
  renderThumbs();
  renderPreview();
}

function refreshChoiceButtons(groupId, value) {
  document.querySelectorAll(`#${groupId} .choice`).forEach((button) => {
    button.classList.toggle("is-active", button.dataset[groupId === "layouts" ? "layout" : groupId === "grades" ? "grade" : "size"] === value);
  });
}

function setLayout(layout) {
  if (!LAYOUTS[layout]) return;
  state.layout = layout;
  syncPanelsToLayout();
  refreshChoiceButtons("layouts", layout);
  renderPreview();
}

function setGrade(grade) {
  if (!GRADES[grade]) return;
  state.grade = grade;
  refreshChoiceButtons("grades", grade);
  renderPreview();
}

function setSize(size) {
  if (!SIZES[size]) return;
  state.size = size;
  refreshChoiceButtons("sizes", size);
  renderPreview();
  if (shot === "cover") fitStageToWindow();
}

async function exportCover() {
  const size = SIZES[state.size];
  const offscreen = document.createElement("canvas");
  offscreen.width = size.width;
  offscreen.height = size.height;
  drawCover(offscreen.getContext("2d"), coverState(), size.width, size.height);
  const blob = await new Promise((resolve) => offscreen.toBlob(resolve, "image/png"));
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `neon-vice-cover-${state.size}.png`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return { width: size.width, height: size.height, bytes: blob.size };
}

function panelAtPoint(clientX, clientY) {
  const box = stage.getBoundingClientRect();
  const x = (clientX - box.left) / box.width;
  const y = (clientY - box.top) / box.height;
  const rects = layoutPanels(state.layout);
  for (let i = 0; i < rects.length; i += 1) {
    const f = rects[i];
    if (x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h) return i;
  }
  return -1;
}

function bindControls() {
  document.getElementById("upload").addEventListener("change", async (event) => {
    const files = [...event.target.files];
    for (const file of files) {
      try {
        const image = await loadImage(URL.createObjectURL(file));
        state.photos.push({ image, name: file.name });
      } catch {
        // Skip unreadable files; the rest still load.
      }
    }
    if (state.photos.length > 0) {
      const firstEmpty = state.panels.findIndex((panel) => panel.photoIndex === null);
      if (firstEmpty !== -1) state.panels[firstEmpty].photoIndex = state.photos.length - 1;
    }
    renderThumbs();
    renderPreview();
    event.target.value = "";
  });

  document.getElementById("layouts").addEventListener("click", (event) => {
    const button = event.target.closest("[data-layout]");
    if (button) setLayout(button.dataset.layout);
  });
  document.getElementById("grades").addEventListener("click", (event) => {
    const button = event.target.closest("[data-grade]");
    if (button) setGrade(button.dataset.grade);
  });
  document.getElementById("sizes").addEventListener("click", (event) => {
    const button = event.target.closest("[data-size]");
    if (button) setSize(button.dataset.size);
  });

  document.getElementById("title").addEventListener("input", (event) => {
    state.title = event.target.value;
    renderPreview();
  });
  document.getElementById("subtitle").addEventListener("input", (event) => {
    state.subtitle = event.target.value;
    renderPreview();
  });
  document.getElementById("zoom").addEventListener("input", (event) => {
    const panel = state.panels[state.selected];
    if (panel) {
      panel.zoom = Number(event.target.value);
      renderPreview();
    }
  });
  document.getElementById("fill").addEventListener("click", () => {
    const panel = state.panels[state.selected];
    if (!panel || panel.photoIndex === null) return;
    for (const other of state.panels) {
      other.photoIndex = panel.photoIndex;
      other.zoom = 1;
      other.panX = 0;
      other.panY = 0;
    }
    renderThumbs();
    renderPreview();
  });
  document.getElementById("reset-pan").addEventListener("click", () => {
    const panel = state.panels[state.selected];
    if (!panel) return;
    panel.zoom = 1;
    panel.panX = 0;
    panel.panY = 0;
    document.getElementById("zoom").value = "1";
    renderPreview();
  });
  document.getElementById("export").addEventListener("click", async () => {
    statusEl.textContent = "Exporting…";
    try {
      const result = await exportCover();
      statusEl.textContent = `Exported ${result.width} × ${result.height} PNG, ${(result.bytes / 1024).toFixed(0)} KiB.`;
    } catch {
      statusEl.textContent = "Export failed in this browser.";
    }
  });

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  stage.addEventListener("pointerdown", (event) => {
    const index = panelAtPoint(event.clientX, event.clientY);
    if (index === -1) return;
    state.selected = index;
    const panel = state.panels[index];
    document.getElementById("zoom").value = String(panel.zoom);
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    stage.setPointerCapture(event.pointerId);
    renderPreview();
  });
  stage.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const panel = state.panels[state.selected];
    if (!panel || panel.photoIndex === null) return;
    const box = stage.getBoundingClientRect();
    const rects = layoutPanels(state.layout);
    const f = rects[state.selected];
    panel.panX += (event.clientX - lastX) / (box.width * f.w);
    panel.panY += (event.clientY - lastY) / (box.height * f.h);
    lastX = event.clientX;
    lastY = event.clientY;
    renderPreview();
  });
  stage.addEventListener("pointerup", () => {
    dragging = false;
  });
}

function applyShotParams() {
  const title = params.get("title") || params.get("caption");
  if (title) {
    state.title = title;
    document.getElementById("title").value = title;
  }
  const subtitle = params.get("subtitle");
  if (subtitle) {
    state.subtitle = subtitle;
    document.getElementById("subtitle").value = subtitle;
  }
  const layout = params.get("layout");
  if (layout && LAYOUTS[layout]) {
    state.layout = layout;
    syncPanelsToLayout();
    refreshChoiceButtons("layouts", layout);
  }
  const grade = params.get("grade");
  if (grade && GRADES[grade]) {
    state.grade = grade;
    refreshChoiceButtons("grades", grade);
  }
  const size = params.get("size");
  if (size && SIZES[size]) {
    state.size = size;
    refreshChoiceButtons("sizes", size);
  }
  const photo = params.get("photo");
  if (photo) {
    const index = state.photos.findIndex(
      (entry) => entry.name.toLowerCase().replace(/[^a-z]/g, "") === photo.toLowerCase().replace(/[^a-z]/g, ""),
    );
    const chosen = index === -1 ? 0 : index;
    for (const panel of state.panels) panel.photoIndex = chosen;
  } else {
    for (const panel of state.panels) panel.photoIndex = 0;
  }
  const preset = params.get("preset");
  if (preset && PRESETS[preset]) {
    const found = PRESETS[preset];
    state.layout = found.layout;
    state.grade = found.grade;
    state.title = found.title;
    state.subtitle = found.subtitle;
    document.getElementById("title").value = found.title;
    document.getElementById("subtitle").value = found.subtitle;
    syncPanelsToLayout();
    refreshChoiceButtons("layouts", found.layout);
    refreshChoiceButtons("grades", found.grade);
  }
  if (shot === "cover") {
    document.body.classList.add("shot-cover");
    document.title = `${state.title} — cover`;
  }
}

async function waitForFonts() {
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('100px Anton'),
        document.fonts.load('40px Pacifico'),
        document.fonts.ready,
      ]),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
  } catch {
    // A missing font falls back to the system stack; the cover still draws.
  }
}

async function init() {
  state.panels = blankPanels();
  bindControls();
  for (const sample of SAMPLE_PHOTOS) {
    try {
      const image = await loadImage(sample.src);
      state.photos.push({ image, name: sample.name });
    } catch {
      // A missing sample never blocks the app.
    }
  }
  applyShotParams();
  renderThumbs();
  await waitForFonts();
  renderPreview();
  if (shot === "cover") fitStageToWindow();
  if (shot === "export") {
    try {
      const result = await exportCover();
      const line = `Export OK: ${result.width}x${result.height} PNG, ${result.bytes} bytes`;
      shotStatusEl.textContent = line;
      document.title = line;
    } catch {
      shotStatusEl.textContent = "Export FAILED";
      document.title = "Export FAILED";
    }
  }
}

init();
