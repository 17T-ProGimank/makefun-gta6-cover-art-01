// Neon Vice Cover Studio — editor wiring.
// Uses the global `Cover` from src/cover.js:
//   Cover.LAYOUTS, Cover.GRADES, Cover.panelCount(layout),
//   Cover.render(canvas, photo, opts), Cover.exportPNG(photo, opts, w, h).
(function () {
  "use strict";

  var canvas = document.getElementById("coverCanvas");
  var photoInput = document.getElementById("photoInput");
  var titleInput = document.getElementById("titleInput");
  var subtitleInput = document.getElementById("subtitleInput");
  var layoutRow = document.getElementById("layoutRow");
  var gradeRow = document.getElementById("gradeRow");
  var zoomRange = document.getElementById("zoomRange");
  var zoomValue = document.getElementById("zoomValue");
  var exportBtn = document.getElementById("exportBtn");
  var exportSize = document.getElementById("exportSize");
  var samplesEl = document.getElementById("samples");
  var fillAllBtn = document.getElementById("fillAllBtn");
  var centreBtn = document.getElementById("centreBtn");

  var state = {
    photo: null,
    title: "NEON SHORE",
    subtitle: "VICE CITY \u2022 2026",
    layout: "hero",
    grade: "vice-sunset",
    panels: []
  };

  function freshPanels() {
    var n = (typeof Cover !== "undefined" && Cover.panelCount)
      ? Cover.panelCount(state.layout)
      : 4;
    var arr = [];
    for (var i = 0; i < n; i++) arr.push({ zoom: 1, dx: 0, dy: 0 });
    return arr;
  }

  function opts() {
    return {
      title: state.title,
      subtitle: state.subtitle,
      layout: state.layout,
      grade: state.grade,
      panels: state.panels.map(function (p) {
        return { zoom: p.zoom, dx: p.dx, dy: p.dy };
      })
    };
  }

  function render() {
    if (typeof Cover === "undefined" || !Cover.render) return;
    if (!state.photo) return;
    Cover.render(canvas, state.photo, opts());
  }

  function syncButtons() {
    var i, btns;
    btns = layoutRow.querySelectorAll("[data-layout]");
    for (i = 0; i < btns.length; i++) {
      btns[i].classList.toggle("active", btns[i].getAttribute("data-layout") === state.layout);
    }
    btns = gradeRow.querySelectorAll("[data-grade]");
    for (i = 0; i < btns.length; i++) {
      btns[i].classList.toggle("active", btns[i].getAttribute("data-grade") === state.grade);
    }
    btns = samplesEl.querySelectorAll("[data-sample]");
    for (i = 0; i < btns.length; i++) {
      btns[i].classList.toggle("active", false);
    }
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error("could not load " + src)); };
      img.src = src;
    });
  }

  function usePhoto(img) {
    state.photo = img;
    render();
  }

  function loadSample(name) {
    loadImage("samples/" + name + ".jpg").then(usePhoto, function (err) {
      console.error(err);
    });
  }

  // --- text inputs ---
  titleInput.addEventListener("input", function () {
    state.title = titleInput.value;
    render();
  });
  subtitleInput.addEventListener("input", function () {
    state.subtitle = subtitleInput.value;
    render();
  });

  // --- photo upload ---
  photoInput.addEventListener("change", function () {
    var file = photoInput.files && photoInput.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      loadImage(reader.result).then(usePhoto, function (err) {
        console.error(err);
      });
    };
    reader.readAsDataURL(file);
  });

  // --- samples ---
  samplesEl.addEventListener("click", function (ev) {
    var btn = ev.target.closest("[data-sample]");
    if (!btn) return;
    loadSample(btn.getAttribute("data-sample"));
  });

  // --- layout ---
  layoutRow.addEventListener("click", function (ev) {
    var btn = ev.target.closest("[data-layout]");
    if (!btn) return;
    state.layout = btn.getAttribute("data-layout");
    state.panels = freshPanels();
    syncButtons();
    render();
  });

  // --- grade ---
  gradeRow.addEventListener("click", function (ev) {
    var btn = ev.target.closest("[data-grade]");
    if (!btn) return;
    state.grade = btn.getAttribute("data-grade");
    syncButtons();
    render();
  });

  // --- zoom (applies to every panel) ---
  function applyZoom() {
    var z = parseFloat(zoomRange.value);
    zoomValue.textContent = z.toFixed(2) + "\u00d7";
    for (var i = 0; i < state.panels.length; i++) state.panels[i].zoom = z;
    render();
  }
  zoomRange.addEventListener("input", applyZoom);

  // --- fill all / centre ---
  fillAllBtn.addEventListener("click", function () {
    state.panels = freshPanels();
    zoomRange.value = "1";
    applyZoom();
  });
  centreBtn.addEventListener("click", function () {
    for (var i = 0; i < state.panels.length; i++) {
      state.panels[i].dx = 0;
      state.panels[i].dy = 0;
    }
    render();
  });

  // --- drag to pan (dx/dy as fractions of the canvas size) ---
  var dragging = false;
  var lastX = 0;
  var lastY = 0;
  canvas.addEventListener("pointerdown", function (ev) {
    dragging = true;
    lastX = ev.clientX;
    lastY = ev.clientY;
    canvas.setPointerCapture(ev.pointerId);
  });
  canvas.addEventListener("pointermove", function (ev) {
    if (!dragging) return;
    var rect = canvas.getBoundingClientRect();
    var dx = (ev.clientX - lastX) / rect.width;
    var dy = (ev.clientY - lastY) / rect.height;
    lastX = ev.clientX;
    lastY = ev.clientY;
    for (var i = 0; i < state.panels.length; i++) {
      state.panels[i].dx = Math.max(-0.5, Math.min(0.5, state.panels[i].dx + dx));
      state.panels[i].dy = Math.max(-0.5, Math.min(0.5, state.panels[i].dy + dy));
    }
    render();
  });
  function endDrag() { dragging = false; }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  // --- export ---
  exportBtn.addEventListener("click", function () {
    if (typeof Cover === "undefined" || !Cover.exportPNG || !state.photo) return;
    var parts = (exportSize.value || "1080x1080").split("x");
    var w = parseInt(parts[0], 10);
    var h = parseInt(parts[1], 10);
    exportBtn.disabled = true;
    Cover.exportPNG(state.photo, opts(), w, h).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "neon-vice-cover-" + w + "x" + h + ".png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }).catch(function (err) {
      console.error(err);
    }).finally(function () {
      exportBtn.disabled = false;
    });
  });

  // --- init ---
  titleInput.value = state.title;
  subtitleInput.value = state.subtitle;
  state.panels = freshPanels();
  syncButtons();
  loadSample("pier");
})();
