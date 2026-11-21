// Neon Vice Cover Studio — rendering engine.
// Turns a photo + caption into GTA 6-style multi-panel poster art on a canvas.
// Global `Cover`: layouts, grades, render() for the live preview, exportPNG()
// for the shareable PNG. Fully offline: fonts are vendored under app/fonts/.

(function () {
  'use strict';

  var LAYOUTS = ['hero', 'grid', 'triptych', 'bleed'];

  var GRADES = {
    'vice-sunset': {
      label: 'Vice Sunset',
      tint: 'rgba(255, 94, 58, 0.20)',
      tintTop: 'rgba(255, 176, 66, 0.16)',
      titleGrad: ['#ffd23f', '#ff5e3a'],
      vignette: 0.42,
    },
    'neon-night': {
      label: 'Neon Night',
      tint: 'rgba(124, 58, 237, 0.24)',
      tintTop: 'rgba(0, 229, 255, 0.14)',
      titleGrad: ['#00e5ff', '#ff2e88'],
      vignette: 0.5,
    },
    'palm-gold': {
      label: 'Palm Gold',
      tint: 'rgba(255, 183, 0, 0.22)',
      tintTop: 'rgba(255, 120, 0, 0.12)',
      titleGrad: ['#fff3b0', '#ff9f1c'],
      vignette: 0.38,
    },
    'ocean-dusk': {
      label: 'Ocean Dusk',
      tint: 'rgba(0, 119, 182, 0.26)',
      tintTop: 'rgba(255, 94, 120, 0.14)',
      titleGrad: ['#90e0ef', '#ff5d8f'],
      vignette: 0.46,
    },
    noir: {
      label: 'Noir',
      tint: 'rgba(10, 10, 18, 0.30)',
      tintTop: 'rgba(200, 200, 210, 0.06)',
      titleGrad: ['#ffffff', '#c9c9d4'],
      vignette: 0.55,
    },
  };

  function panelCount(layout) {
    if (layout === 'triptych') return 3;
    if (layout === 'bleed') return 1;
    return 4; // hero and grid both use four panels
  }

  // Panel rectangles for a layout, in canvas pixels. g is the white gutter.
  function panelRects(layout, w, h) {
    var g = Math.max(4, Math.round(Math.min(w, h) * 0.012));
    var rects = [];
    var i;
    if (layout === 'bleed') {
      rects.push({ x: 0, y: 0, w: w, h: h });
    } else if (layout === 'grid') {
      var cw = (w - g) / 2;
      var ch = (h - g) / 2;
      rects.push({ x: 0, y: 0, w: cw, h: ch });
      rects.push({ x: cw + g, y: 0, w: cw, h: ch });
      rects.push({ x: 0, y: ch + g, w: cw, h: ch });
      rects.push({ x: cw + g, y: ch + g, w: cw, h: ch });
    } else if (layout === 'triptych') {
      var tw = (w - 2 * g) / 3;
      for (i = 0; i < 3; i++) {
        rects.push({ x: i * (tw + g), y: 0, w: tw, h: h });
      }
    } else {
      // hero: one big panel left, three stacked on the right
      var bigW = Math.round(w * 0.66);
      var smallW = w - bigW - g;
      var sh = (h - 2 * g) / 3;
      rects.push({ x: 0, y: 0, w: bigW, h: h });
      for (i = 0; i < 3; i++) {
        rects.push({ x: bigW + g, y: i * (sh + g), w: smallW, h: sh });
      }
    }
    return rects;
  }

  // Deterministic pseudo-random generator (mulberry32, fixed seed) so the
  // film grain is identical on every render and every export.
  function seededRandom(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var grainTile = null;
  var grainTileSize = 0;
  function getGrainTile(size) {
    if (grainTile && grainTileSize === size) return grainTile;
    var tile = document.createElement('canvas');
    tile.width = size;
    tile.height = size;
    var tctx = tile.getContext('2d');
    var img = tctx.createImageData(size, size);
    var rnd = seededRandom(20261120);
    var i;
    for (i = 0; i < img.data.length; i += 4) {
      var v = Math.floor(rnd() * 255);
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    tctx.putImageData(img, 0, 0);
    grainTile = tile;
    grainTileSize = size;
    return tile;
  }

  // Draw the photo into a rect, cover-fit, with per-panel zoom and pan.
  // panel = { zoom, dx, dy }: zoom >= 1, dx/dy are fractions of the rect.
  function drawPhotoCover(ctx, photo, rect, panel) {
    var zoom = panel && panel.zoom ? panel.zoom : 1;
    var dx = panel && panel.dx ? panel.dx : 0;
    var dy = panel && panel.dy ? panel.dy : 0;
    var pw = photo.naturalWidth || photo.width;
    var ph = photo.naturalHeight || photo.height;
    var scale = Math.max(rect.w / pw, rect.h / ph) * zoom;
    var dw = pw * scale;
    var dh = ph * scale;
    var x = rect.x + (rect.w - dw) / 2 + dx * rect.w;
    var y = rect.y + (rect.h - dh) / 2 + dy * rect.h;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    ctx.drawImage(photo, x, y, dw, dh);
    ctx.restore();
  }

  function drawPlaceholder(ctx, rect, grade) {
    var grad = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
    grad.addColorStop(0, '#2b1055');
    grad.addColorStop(0.55, '#7597de');
    grad.addColorStop(1, '#ff7e5f');
    ctx.fillStyle = grad;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = Math.round(rect.h * 0.09) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ADD A PHOTO', rect.x + rect.w / 2, rect.y + rect.h / 2);
  }

  function drawGrade(ctx, rect, grade) {
    var tint = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
    tint.addColorStop(0, grade.tintTop);
    tint.addColorStop(1, grade.tint);
    ctx.fillStyle = tint;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }

  function drawVignette(ctx, rect, strength) {
    var cx = rect.x + rect.w / 2;
    var cy = rect.y + rect.h / 2;
    var r = Math.max(rect.w, rect.h) * 0.75;
    var v = ctx.createRadialGradient(cx, cy, r * 0.35, cx, cy, r);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,' + strength + ')');
    ctx.fillStyle = v;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }

  function drawGrain(ctx, w, h) {
    var tile = getGrainTile(128);
    var pattern = ctx.createPattern(tile, 'repeat');
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // Bold poster lettering: gradient Anton title with a dark outline, Pacifico
  // subtitle riding above it, both with a soft drop shadow.
  function drawLettering(ctx, w, h, title, subtitle, grade) {
    var pad = Math.round(w * 0.045);
    var titleSize = Math.round(w * 0.085);
    var subSize = Math.round(w * 0.038);
    var baseY = h - pad;
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = Math.round(w * 0.012);
    ctx.shadowOffsetY = Math.round(w * 0.004);
    var grad = ctx.createLinearGradient(0, baseY - titleSize, 0, baseY);
    grad.addColorStop(0, grade.titleGrad[0]);
    grad.addColorStop(1, grade.titleGrad[1]);
    ctx.font = titleSize + 'px Anton, "Arial Narrow", sans-serif';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, Math.round(titleSize * 0.09));
    ctx.strokeStyle = 'rgba(10, 5, 20, 0.85)';
    var text = (title || 'NEON SHORE').toUpperCase();
    ctx.strokeText(text, pad, baseY);
    ctx.fillStyle = grad;
    ctx.fillText(text, pad, baseY);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.font = subSize + 'px Pacifico, cursive';
    ctx.lineWidth = Math.max(2, Math.round(subSize * 0.08));
    ctx.strokeStyle = 'rgba(10, 5, 20, 0.7)';
    var sub = subtitle || 'VICE CITY \u2022 2026';
    var subY = baseY - titleSize - Math.round(subSize * 0.35);
    ctx.strokeText(sub, pad, subY);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(sub, pad, subY);
    ctx.restore();
  }

  var fontsRequested = false;
  function ensureFonts() {
    if (fontsRequested || typeof document === 'undefined' || !document.fonts) {
      return;
    }
    fontsRequested = true;
    try {
      document.fonts.load('100px Anton');
      document.fonts.load('40px Pacifico');
    } catch (e) {
      // Fonts fall back to system faces; the cover still renders.
    }
  }

  function renderInto(ctx, w, h, photo, opts) {
    var grade = GRADES[opts.grade] || GRADES['vice-sunset'];
    var layout = LAYOUTS.indexOf(opts.layout) === -1 ? 'hero' : opts.layout;
    var rects = panelRects(layout, w, h);
    var panels = opts.panels || [];
    var i;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    for (i = 0; i < rects.length; i++) {
      var rect = rects[i];
      var panel = panels[i] || { zoom: 1, dx: 0, dy: 0 };
      ctx.save();
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, rect.w, rect.h);
      ctx.clip();
      if (photo) {
        drawPhotoCover(ctx, photo, rect, panel);
      } else {
        drawPlaceholder(ctx, rect, grade);
      }
      drawGrade(ctx, rect, grade);
      drawVignette(ctx, rect, grade.vignette);
      ctx.restore();
    }
    drawGrain(ctx, w, h);
    drawLettering(ctx, w, h, opts.title, opts.subtitle, grade);
    // Thin white frame around the whole poster.
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(3, Math.round(Math.min(w, h) * 0.008));
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
  }

  function render(canvas, photo, opts) {
    ensureFonts();
    var ctx = canvas.getContext('2d');
    renderInto(ctx, canvas.width, canvas.height, photo, opts || {});
    // The first preview can paint before the vendored fonts finish loading
    // (fallback type for a frame). Repaint once fonts are ready so the live
    // preview always shows the real Anton/Pacifico lettering.
    // NOTE: the repaint flag must stay set after the first repaint. Resetting
    // it inside the .then() callback re-attaches a new .then() on every
    // render, and document.fonts.ready stays resolved, so the page would
    // spin in an endless microtask loop and freeze the renderer.
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready && !render._fontRepaint) {
      render._fontRepaint = true;
      document.fonts.ready.then(function () {
        render(canvas, photo, opts || {});
      });
    }
  }

  function exportPNG(photo, opts, w, h) {
    ensureFonts();
    var ready = Promise.resolve();
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
      ready = Promise.all([
        document.fonts.load('100px Anton'),
        document.fonts.load('40px Pacifico'),
      ]).catch(function () {});
    }
    return ready.then(function () {
      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');
      renderInto(ctx, w, h, photo, opts || {});
      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob);
          else reject(new Error('PNG export failed'));
        }, 'image/png');
      });
    });
  }

  window.Cover = {
    LAYOUTS: LAYOUTS,
    GRADES: GRADES,
    panelCount: panelCount,
    panelRects: panelRects,
    render: render,
    exportPNG: exportPNG,
  };
})();
