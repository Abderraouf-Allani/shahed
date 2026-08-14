(function () {
  'use strict';

  var B = window.QuranLabBridge;
  if (!B) return;

  var esc = B.esc;
  var toAr = B.toAr;
  var relLabel = B.relLabel;
  var RELATIONSHIPS = B.RELATIONSHIPS;
  var state = B.state;
  var tagState = B.tagState;
  var LS = B.LS;
  var appEl = B.appEl;
  var positionTagMenu = B.positionTagMenu;

  var TRIANGLE_SVG = '<svg viewBox="0 0 10 8" width="10" height="8" aria-hidden="true"><path d="M1 1h8L5 7Z"/></svg>';

  var lab = loadLab();
  var labCatId = localStorage.getItem(LS.labCat) || null;
  var labLinking = false;
  var labLinkSource = null;
  var labDragging = null;
  var labDragMoved = 0;
  var labEdgePopup = null;

  function loadLab() {
    try { return JSON.parse(localStorage.getItem(LS.lab)) || {}; } catch (e) { return {}; }
  }

  function saveLab() {
    localStorage.setItem(LS.lab, JSON.stringify(lab));
  }

  function closeLabEdgePopup() {
    if (labEdgePopup) { labEdgePopup.remove(); labEdgePopup = null; }
  }

  function verseText(surah, ayah) {
    if (!state.quran || !state.quran[surah - 1]) return '';
    return state.quran[surah - 1].verses[ayah - 1] || '';
  }

  function labCatTags(catId) {
    return tagState.tags.filter(function (t) { return t.categoryId === catId; });
  }

  function labTagVerses(tagId) {
    var out = [];
    Object.keys(tagState.verses).forEach(function (key) {
      var ids = tagState.verses[key];
      if (ids && ids.indexOf(tagId) !== -1) {
        var p = key.split(':');
        out.push({ surah: +p[0], ayah: +p[1], key: key });
      }
    });
    out.sort(function (a, b) { return a.surah - b.surah || a.ayah - b.ayah; });
    return out;
  }

  function labLayoutMissing(catId, cfg, tags) {
    var maxX = 40, maxY = 40;
    Object.keys(cfg.nodes).forEach(function (id) {
      var n = cfg.nodes[id];
      maxX = Math.max(maxX, n.x);
      maxY = Math.max(maxY, n.y);
    });
    var cols = Math.max(2, Math.ceil(Math.sqrt(labCatTags(catId).length * 1.2)));
    tags.forEach(function (t, i) {
      cfg.nodes[t.id] = { x: maxX + 40 + (i % cols) * 340, y: 40 + Math.floor(i / cols) * 240, showAyahs: true };
    });
  }

  function labLayoutAll(catId) {
    var cfg = lab[catId];
    if (!cfg) return;
    var tags = labCatTags(catId);
    var cols = Math.max(2, Math.ceil(Math.sqrt(tags.length * 1.2)));
    tags.forEach(function (t, i) {
      if (cfg.nodes[t.id]) {
        cfg.nodes[t.id].x = 60 + (i % cols) * 340;
        cfg.nodes[t.id].y = 60 + Math.floor(i / cols) * 240;
      }
    });
  }

  function labSanitize(catId) {
    var cfg = lab[catId];
    if (!cfg) return cfg;
    var tagIds = {};
    labCatTags(catId).forEach(function (t) { tagIds[t.id] = true; });
    Object.keys(cfg.nodes).forEach(function (id) {
      if (!tagIds[id] || typeof cfg.nodes[id] !== 'object') delete cfg.nodes[id];
    });
    cfg.edges = (cfg.edges || []).filter(function (e) {
      return e && typeof e === 'object' && cfg.nodes[e.from] && cfg.nodes[e.to] && e.from !== e.to;
    });
    return cfg;
  }

  function labEnsure(catId) {
    if (!lab[catId]) lab[catId] = { nodes: {}, edges: [] };
    var cfg = lab[catId];
    var tagIds = {};
    labCatTags(catId).forEach(function (t) { tagIds[t.id] = true; });
    var missing = labCatTags(catId).filter(function (t) { return !cfg.nodes[t.id]; });
    if (missing.length) labLayoutMissing(catId, cfg, missing);
    return labSanitize(catId);
  }

  function labNodeCenter(el) {
    return { x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2 };
  }

  function labEdgeEndpoint(c1, c2, el) {
    var dx = c2.x - c1.x, dy = c2.y - c1.y;
    if (!dx && !dy) return c2;
    var t = 1 / (2 * Math.max(Math.abs(dx) / el.offsetWidth, Math.abs(dy) / el.offsetHeight));
    return { x: c2.x - dx * t, y: c2.y - dy * t };
  }

  function updateLabEdges() {
    var stage = document.getElementById('labStage');
    if (!stage) return;
    var svg = stage.querySelector('.lab-svg');
    if (!svg) return;
    var cfg = lab[labCatId] || { nodes: {}, edges: [] };
    var maxX = 80, maxY = 80;
    stage.querySelectorAll('.lab-node').forEach(function (el) {
      maxX = Math.max(maxX, el.offsetLeft + el.offsetWidth + 40);
      maxY = Math.max(maxY, el.offsetTop + el.offsetHeight + 40);
    });
    svg.setAttribute('width', maxX);
    svg.setAttribute('height', maxY);
    svg.setAttribute('viewBox', '0 0 ' + maxX + ' ' + maxY);
    stage.style.width = maxX + 'px';
    stage.style.height = maxY + 'px';

    var labels = stage.querySelectorAll('.lab-edge-label');
    cfg.edges.forEach(function (e, i) {
      var a = stage.querySelector('#lab-node-' + e.from);
      var b = stage.querySelector('#lab-node-' + e.to);
      var line = svg.querySelector('.lab-edge[data-edge="' + i + '"]');
      var hit = svg.querySelector('.lab-edge-hit[data-edge="' + i + '"]');
      var label = labels[i];
      if (!a || !b || !line) {
        if (line) { line.setAttribute('x1', 0); line.setAttribute('y1', 0); line.setAttribute('x2', 0); line.setAttribute('y2', 0); }
        if (hit) { hit.setAttribute('x1', 0); hit.setAttribute('y1', 0); hit.setAttribute('x2', 0); hit.setAttribute('y2', 0); }
        if (label) label.style.display = 'none';
        return;
      }
      var c1 = labNodeCenter(a), c2 = labNodeCenter(b);
      var tip = labEdgeEndpoint(c1, c2, b);
      line.setAttribute('x1', c1.x); line.setAttribute('y1', c1.y);
      line.setAttribute('x2', tip.x); line.setAttribute('y2', tip.y);
      hit.setAttribute('x1', c1.x); hit.setAttribute('y1', c1.y);
      hit.setAttribute('x2', c2.x); hit.setAttribute('y2', c2.y);
      if (label) {
        label.style.left = Math.round((c1.x + c2.x) / 2) + 'px';
        label.style.top = Math.round((c1.y + c2.y) / 2) + 'px';
        label.style.display = '';
      }
    });
  }

  function renderLabCanvas() {
    var stage = document.getElementById('labStage');
    if (!stage) return;
    if (!tagState.byCatId[labCatId]) labCatId = tagState.categories.length ? tagState.categories[0].id : null;
    if (!labCatId) { stage.innerHTML = '<div class="empty-state">لا توجد تصنيفات بعد.</div>'; return; }
    localStorage.setItem(LS.labCat, labCatId);

    var cfg = labEnsure(labCatId);
    var tags = labCatTags(labCatId);

    var nodesHtml = '';
    tags.forEach(function (t) {
      var n = cfg.nodes[t.id];
      if (!n) return;
      var verses = labTagVerses(t.id);
      var ayahsHtml = '';
      if (n.showAyahs) {
        verses.forEach(function (v) {
          var meta = state.ayahMeta[t.id] && state.ayahMeta[t.id][v.key];
          var note = meta && meta.note ? '<span class="lab-ayah-note">' + esc(meta.note) + '</span>' : '';
          ayahsHtml += '<button type="button" class="lab-ayah" data-surah="' + v.surah + '" data-ayah="' + v.ayah + '" title="انقر نقراً مزدوجاً لفتح الآية في القارئ">'
            + '<span class="lab-ayah-ref">' + toAr(v.surah) + ':' + toAr(v.ayah) + '</span>'
            + '<span class="lab-ayah-text">' + esc(verseText(v.surah, v.ayah)) + '</span>' + note + '</button>';
        });
        if (!verses.length) ayahsHtml = '<div class="lab-ayah-empty">لا توجد آيات موسومة بهذا الوسم</div>';
      }
      nodesHtml += '<div class="lab-node' + (n.showAyahs ? ' open' : '') + (labLinkSource === t.id ? ' link-source' : '') + '" id="lab-node-' + t.id + '" data-tagid="' + t.id + '"'
        + ' style="left:' + n.x + 'px; top:' + n.y + 'px; --tagc:' + t.color + '">'
        + '<div class="lab-node-head">'
        + '<span class="lab-node-dot"></span>'
        + '<span class="lab-node-name">' + esc(t.name) + '</span>'
        + '<span class="lab-node-count">' + toAr(verses.length) + '</span>'
        + '<button type="button" class="lab-node-toggle' + (n.showAyahs ? '' : ' off') + '" data-act="toggle" title="' + (n.showAyahs ? 'إخفاء الآيات' : 'إظهار الآيات') + '">' + TRIANGLE_SVG + '</button>'
        + '<button type="button" class="lab-node-remove" data-act="remove" title="إزالة من المخطط">✕</button>'
        + '</div>'
        + (n.showAyahs ? '<div class="lab-node-ayahs">' + ayahsHtml + '</div>' : '')
        + '</div>';
    });

    var edgesHtml = '';
    var labelsHtml = '';
    cfg.edges.forEach(function (e, i) {
      edgesHtml += '<line class="lab-edge-hit" data-edge="' + i + '" x1="0" y1="0" x2="0" y2="0"/>'
        + '<line class="lab-edge" data-edge="' + i + '" x1="0" y1="0" x2="0" y2="0" marker-end="url(#labArrow)"/>';
      labelsHtml += '<div class="lab-edge-label" data-edge="' + i + '" title="تعديل العلاقة">' + esc(relLabel(e.rel) || relLabel('related-to')) + '</div>';
    });

    var maxX = 80, maxY = 80;
    tags.forEach(function (t) {
      var n = cfg.nodes[t.id];
      if (n) { maxX = Math.max(maxX, n.x + 270); maxY = Math.max(maxY, n.y + 40); }
    });

    stage.innerHTML =
      '<svg class="lab-svg" width="' + maxX + '" height="' + maxY + '" viewBox="0 0 ' + maxX + ' ' + maxY + '">'
      + '<defs><marker id="labArrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="userSpaceOnUse">'
      + '<path d="M1,1 L11,6 L1,11 z" style="fill:var(--gold)"/></marker></defs>'
      + edgesHtml + '</svg>'
      + labelsHtml
      + nodesHtml;

    updateLabEdges();

    var stats = document.getElementById('labStats');
    if (stats) {
      stats.textContent = toAr(Object.keys(cfg.nodes).length) + ' وسم على المخطط — ' + toAr(cfg.edges.length) + ' علاقة';
    }
  }

  function openLabEdgeEditor(edge, anchor) {
    closeLabEdgePopup();
    var tA = tagState.byId[edge.from];
    var tB = tagState.byId[edge.to];
    if (!tA || !tB) return;
    var popup = document.createElement('div');
    popup.className = 'tag-menu lab-edge-popup';
    popup._anchor = anchor;

    var opts = RELATIONSHIPS.map(function (g) {
      return '<optgroup label="' + esc(g.name) + '">' + g.items.map(function (it) {
        return '<option value="' + it.id + '">' + esc(it.label) + '</option>';
      }).join('') + '</optgroup>';
    }).join('');

    popup.innerHTML =
      '<div class="lab-edge-title">العلاقة بين «' + esc(tA.name) + '» و «' + esc(tB.name) + '»</div>'
      + '<select class="lab-edge-rel">'
      + '<option value="related-to">— حدد نوع العلاقة —</option>' + opts
      + '</select>'
      + '<div class="lab-edge-actions">'
      + '<button type="button" class="lab-edge-save">حفظ</button>'
      + '<button type="button" class="lab-edge-del">حذف العلاقة</button>'
      + '<button type="button" class="lab-edge-close">إلغاء</button>'
      + '</div>';

    document.body.appendChild(popup);
    popup.querySelector('.lab-edge-rel').value = edge.rel || 'related-to';
    positionTagMenu(popup, anchor);
    labEdgePopup = popup;

    popup.querySelector('.lab-edge-save').addEventListener('click', function () {
      var val = popup.querySelector('.lab-edge-rel').value;
      var edges = lab[labCatId].edges;
      var i = edges.indexOf(edge);
      if (i !== -1) edges[i].rel = val;
      saveLab();
      closeLabEdgePopup();
      renderLabCanvas();
    });
    popup.querySelector('.lab-edge-del').addEventListener('click', function () {
      lab[labCatId].edges = lab[labCatId].edges.filter(function (e) { return e !== edge; });
      saveLab();
      closeLabEdgePopup();
      renderLabCanvas();
    });
    popup.querySelector('.lab-edge-close').addEventListener('click', closeLabEdgePopup);
  }

  function downloadLabFile() {
    var out = { app: 'quran-tag-lab', version: 1, categories: {} };
    Object.keys(lab).forEach(function (catId) {
      var c = tagState.byCatId[catId];
      var cfg = lab[catId];
      if (!c || !cfg) return;
      out.categories[catId] = { name: c.name, nodes: cfg.nodes || {}, edges: cfg.edges || [] };
    });
    var blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'quran-tag-lab.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function importLabFromFile() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = JSON.parse(reader.result);
          if (!data || data.app !== 'quran-tag-lab') throw new Error('not a lab file');
          var imported = 0;
          Object.keys(data.categories || {}).forEach(function (srcId) {
            var src = data.categories[srcId];
            var cat = tagState.byCatId[srcId]
              || tagState.categories.filter(function (c) { return c.name === src.name; })[0];
            if (!cat) return;
            lab[cat.id] = { nodes: src.nodes || {}, edges: src.edges || [] };
            labSanitize(cat.id);
            imported++;
          });
          saveLab();
          renderLabCanvas();
          if (!imported) alert('لم يتم العثور على تصنيفات مطابقة لاستيراد مخططاتها.');
          else alert('تم استيراد مخططات ' + toAr(imported) + ' تصنيف.');
        } catch (err) {
          alert('ملف غير صالح.');
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  function wireLabEvents() {
    var stage = document.getElementById('labStage');
    if (!stage) return;

    var relateBtn = document.getElementById('labRelate');
    var catSelect = document.getElementById('labCatSelect');
    var addAllBtn = document.getElementById('labAddAll');
    var layoutBtn = document.getElementById('labLayout');
    var resetBtn = document.getElementById('labReset');
    var exportBtn = document.getElementById('labExport');
    var importBtn = document.getElementById('labImport');

    if (catSelect) catSelect.addEventListener('change', function () {
      labCatId = this.value;
      localStorage.setItem(LS.labCat, labCatId);
      labLinking = false;
      labLinkSource = null;
      renderLabCanvas();
      if (relateBtn) relateBtn.classList.remove('on');
      stage.classList.remove('linking');
    });

    if (relateBtn) relateBtn.addEventListener('click', function () {
      labLinking = !labLinking;
      if (!labLinking) labLinkSource = null;
      relateBtn.classList.toggle('on', labLinking);
      stage.classList.toggle('linking', labLinking);
      renderLabCanvas();
    });

    if (addAllBtn) addAllBtn.addEventListener('click', function () {
      labEnsure(labCatId);
      saveLab();
      renderLabCanvas();
    });

    if (layoutBtn) layoutBtn.addEventListener('click', function () {
      labLayoutAll(labCatId);
      saveLab();
      renderLabCanvas();
    });

    if (resetBtn) resetBtn.addEventListener('click', function () {
      if (!confirm('إعادة ضبط مخطط هذا التصنيف؟ سيُعاد ترتيب جميع الوسوم وحذف العلاقات.')) return;
      lab[labCatId] = { nodes: {}, edges: [] };
      labEnsure(labCatId);
      labLayoutAll(labCatId);
      saveLab();
      renderLabCanvas();
    });

    if (exportBtn) exportBtn.addEventListener('click', downloadLabFile);
    if (importBtn) importBtn.addEventListener('click', importLabFromFile);

    stage.addEventListener('pointerdown', function (e) {
      var head = e.target.closest('.lab-node-head');
      if (!head || e.target.closest('button')) return;
      var node = head.closest('.lab-node');
      var tagId = node.dataset.tagid;
      labDragging = {
        tagId: tagId,
        dx: e.clientX - node.offsetLeft,
        dy: e.clientY - node.offsetTop,
        moved: 0,
        px: e.clientX,
        py: e.clientY,
        el: node
      };
      node.classList.add('dragging');
    });

    stage.addEventListener('dblclick', function (e) {
      var ayahBtn = e.target.closest('.lab-ayah');
      if (!ayahBtn) return;
      e.preventDefault();
      location.hash = '#/surah/' + ayahBtn.dataset.surah + '/' + ayahBtn.dataset.ayah;
    });

    stage.addEventListener('click', function (e) {
      var hitLine = e.target.closest('line.lab-edge-hit');
      if (hitLine) {
        var hi = +hitLine.dataset.edge;
        var hedge = lab[labCatId].edges[hi];
        if (hedge) {
          var hlbl = stage.querySelector('.lab-edge-label[data-edge="' + hi + '"]');
          openLabEdgeEditor(hedge, hlbl || hitLine);
        }
        return;
      }
      var btn = e.target.closest('.lab-node-toggle, .lab-node-remove');
      if (btn) {
        var node = btn.closest('.lab-node');
        var tagId = node.dataset.tagid;
        var cfg = lab[labCatId];
        if (btn.dataset.act === 'toggle') {
          cfg.nodes[tagId].showAyahs = !cfg.nodes[tagId].showAyahs;
        } else {
          delete cfg.nodes[tagId];
          cfg.edges = cfg.edges.filter(function (ed) { return ed.from !== tagId && ed.to !== tagId; });
        }
        saveLab();
        renderLabCanvas();
        return;
      }
      var label = e.target.closest('.lab-edge-label');
      if (label) {
        var ei = +label.dataset.edge;
        var edge = lab[labCatId].edges[ei];
        if (edge) openLabEdgeEditor(edge, label);
        return;
      }
      var labnode = e.target.closest('.lab-node');
      if (labnode && labLinking) {
        if (labDragMoved > 6) { labDragMoved = 0; return; }
        labDragMoved = 0;
        var tid = labnode.dataset.tagid;
        if (!labLinkSource) {
          labLinkSource = tid;
          renderLabCanvas();
        } else if (labLinkSource !== tid) {
          var from = labLinkSource;
          labLinkSource = null;
          var edges = lab[labCatId].edges.filter(function (ed) {
            return !((ed.from === from && ed.to === tid) || (ed.from === tid && ed.to === from));
          });
          var edge2 = { from: from, to: tid, rel: 'related-to' };
          edges.push(edge2);
          lab[labCatId].edges = edges;
          saveLab();
          renderLabCanvas();
          var lbl = stage.querySelector('.lab-edge-label[data-edge="' + (edges.length - 1) + '"]');
          openLabEdgeEditor(edge2, lbl || stage);
        }
      }
    });
  }

  document.addEventListener('pointermove', function (e) {
    if (!labDragging) return;
    var d = labDragging;
    d.moved = Math.max(d.moved, Math.abs(e.clientX - d.px), Math.abs(e.clientY - d.py));
    var x = Math.max(0, e.clientX - d.dx);
    var y = Math.max(0, e.clientY - d.dy);
    d.el.style.left = x + 'px';
    d.el.style.top = y + 'px';
    updateLabEdges();
  });

  document.addEventListener('pointerup', function (e) {
    if (!labDragging) return;
    var d = labDragging;
    labDragging = null;
    labDragMoved = d.moved;
    d.el.classList.remove('dragging');
    lab[labCatId].nodes[d.tagId].x = d.el.offsetLeft;
    lab[labCatId].nodes[d.tagId].y = d.el.offsetTop;
    saveLab();
  });

  function renderLab() {
    document.title = 'مختبر الوسوم — القرآن الكريم (قالون)';
    closeLabEdgePopup();
    if (!tagState.categories.length) {
      appEl.innerHTML = '<div class="index-toolbar"><div class="nav-pills"><a class="pill" href="#/">الفهرس</a></div></div>'
        + '<div class="empty-state">لا توجد تصنيفات بعد. أنشئ تصنيفاً ووسوماً من صفحة الوسوم أولاً.</div>';
      return;
    }
    if (!tagState.byCatId[labCatId]) labCatId = tagState.categories[0].id;

    var catOpts = tagState.categories.map(function (c) {
      return '<option value="' + c.id + '"' + (c.id === labCatId ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    }).join('');

    var html = '';
    html += '<div class="index-toolbar lab-toolbar">';
    html += '<div class="nav-pills"><a class="pill" href="#/">الفهرس</a><a class="pill" href="#/tags">الوسوم</a></div>';
    html += '<label class="lab-cat-wrap"><span class="lab-cat-label">التصنيف:</span>'
      + '<select id="labCatSelect" class="lab-cat-select">' + catOpts + '</select></label>';
    html += '<div class="lab-actions">'
      + '<button type="button" class="pill" id="labRelate">ربط الوسوم</button>'
      + '<button type="button" class="pill" id="labAddAll">إضافة كل الوسوم</button>'
      + '<button type="button" class="pill" id="labLayout">ترتيب تلقائي</button>'
      + '<button type="button" class="pill lab-danger" id="labReset">إعادة ضبط</button>'
      + '<button type="button" class="pill" id="labExport" title="تصدير مخططات المختبر إلى ملف JSON">تصدير</button>'
      + '<button type="button" class="pill" id="labImport" title="استيراد مخططات المختبر من ملف JSON">استيراد</button>'
      + '</div>';
    html += '<span class="index-stats" id="labStats"></span>';
    html += '</div>';
    html += '<div class="lab-hint">اسحب الوسوم لتحريكها. فعِّل «ربط الوسوم» ثم انقر وسمين لإنشاء علاقة بينهما، وانقر على ملصق العلاقة لتغيير نوعها أو حذفها. استخدم زر المثلث لإظهار/إخفاء آيات الوسم، وانقر نقراً مزدوجاً على أي آية لفتحها في القارئ.</div>';
    html += '<div class="lab-viewport"><div id="labStage" class="lab-stage"></div></div>';

    appEl.innerHTML = html;
    renderLabCanvas();
    wireLabEvents();
  }

  window.QuranLab = {
    render: renderLab,
    closeEdgePopup: closeLabEdgePopup,
    onDocClick: function (target) {
      if (labEdgePopup && !labEdgePopup.contains(target)) closeLabEdgePopup();
    },
    onDocScroll: function () {
      if (labEdgePopup && labEdgePopup._anchor) positionTagMenu(labEdgePopup, labEdgePopup._anchor);
    },
    onDocEscape: function () {
      closeLabEdgePopup();
    }
  };
})();
