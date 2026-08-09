(function () {
  'use strict';

  var AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

  function toAr(n) {
    return String(n).replace(/[0-9]/g, function (d) { return AR_DIGITS[+d]; });
  }

  function toEnDigits(s) {
    return String(s).replace(/[٠-٩]/g, function (d) { return String(AR_DIGITS.indexOf(d)); });
  }

  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[\u064B-\u0652\u0670\u06D6-\u06ED\u0640\u0653\u0654\u0655]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/[ىئ]/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/\s+/g, ' ');
  }

  var LS = {
    theme: 'qaloon_theme',
    fontSize: 'qaloon_fontsize',
    last: 'qaloon_last',
    showTags: 'qaloon_show_tags',
    tags: 'qaloon_tags_v1'
  };

  var TAG_COLORS = ['#1e5a3c', '#a87b2f', '#8e3b46', '#2f5aa8', '#7a2fa8', '#a84a2f', '#2f8f8f', '#5c6bc0'];

  var state = {
    surahs: null,
    quran: null,
    fontPx: parseInt(localStorage.getItem(LS.fontSize), 10) || 32,
    query: '',
    tagQuery: '',
    selectedTagId: null,
    edit: null
  };

  /* ---------- tags store (localStorage) ---------- */

  var tagState = loadTags();
  var showTags = localStorage.getItem(LS.showTags) !== '0';
  var sessionTagFilter = null;

  function newId(prefix) {
    return prefix + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  }

  function defaultCategories() {
    var names = ['الله', 'الإنسان', 'الشيطان', 'الدنيا', 'الآخرة'];
    return names.map(function (name, i) {
      return { id: newId('c'), name: name, color: TAG_COLORS[i % TAG_COLORS.length] };
    });
  }

  function mergeSeedTag(seed) {
    if (!seed || !seed.tags || !seed.tags.length) return;
    var seedTagId = seed.tags[0].id;
    if (tagState.byId[seedTagId]) return;
    seed.categories.forEach(function (c) {
      if (!tagState.byCatId[c.id]) {
        tagState.categories.push(c);
        tagState.byCatId[c.id] = c;
      }
    });
    seed.tags.forEach(function (t) {
      if (!tagState.byId[t.id]) {
        tagState.tags.push(t);
        tagState.byId[t.id] = t;
      }
    });
    Object.keys(seed.verses || {}).forEach(function (key) {
      var ids = seed.verses[key] || [];
      var cur = tagState.verses[key] || [];
      ids.forEach(function (id) {
        if (cur.indexOf(id) === -1) cur.push(id);
      });
      if (cur.length) tagState.verses[key] = cur;
    });
    saveTags();
  }

  function loadTags() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(LS.tags)); } catch (e) { raw = null; }
    var categories = raw && Array.isArray(raw.categories) ? raw.categories : null;
    var tags = raw && Array.isArray(raw.tags) ? raw.tags : [];
    var verses = raw && raw.verses && typeof raw.verses === 'object' ? raw.verses : {};

    var legacyDefault = categories && categories.length === 1 && categories[0].name === 'عام';
    if (!categories || !categories.length || legacyDefault) {
      var defs = defaultCategories();
      if (legacyDefault) {
        var legacyId = categories[0].id;
        tags.forEach(function (t) { if (t.categoryId === legacyId) t.categoryId = defs[0].id; });
      } else {
        tags.forEach(function (t) { t.categoryId = defs[0].id; });
      }
      categories = defs;
      try {
        localStorage.setItem(LS.tags, JSON.stringify({ categories: categories, tags: tags, verses: verses }));
      } catch (e) {}
    } else {
      var catIds = {};
      categories.forEach(function (c) { catIds[c.id] = true; });
      var fallback = categories[0];
      tags.forEach(function (t) {
        if (!t.categoryId || !catIds[t.categoryId]) t.categoryId = fallback.id;
      });
    }

    var byId = {};
    tags.forEach(function (t) { byId[t.id] = t; });
    var byCatId = {};
    categories.forEach(function (c) { byCatId[c.id] = c; });
    return { tags: tags, byId: byId, categories: categories, byCatId: byCatId, verses: verses };
  }

  function saveTags() {
    localStorage.setItem(LS.tags, JSON.stringify({
      categories: tagState.categories,
      tags: tagState.tags,
      verses: tagState.verses
    }));
  }

  function getVerseTags(surah, ayah) {
    var ids = tagState.verses[surah + ':' + ayah] || [];
    return ids.map(function (id) { return tagState.byId[id]; }).filter(Boolean);
  }

  function filterVisibleTags(tags) {
    if (sessionTagFilter === null) return tags;
    return tags.filter(function (t) { return sessionTagFilter.indexOf(t.id) !== -1; });
  }

  function setShowTags(v) {
    showTags = v;
    localStorage.setItem(LS.showTags, v ? '1' : '0');
  }

  function toggleTagFilterMenu(btn) {
    if (tagFilterMenu) { closeTagFilterMenu(); return; }
    openTagFilterMenu(btn);
  }

  function toggleTagOnVerse(surah, ayah, tagId) {
    var key = surah + ':' + ayah;
    var ids = tagState.verses[key] || [];
    var i = ids.indexOf(tagId);
    if (i >= 0) { ids.splice(i, 1); } else { ids.push(tagId); }
    if (!ids.length) { delete tagState.verses[key]; } else { tagState.verses[key] = ids; }
    saveTags();
  }

  function removeTagFromVerse(surah, ayah, tagId) {
    var key = surah + ':' + ayah;
    var ids = tagState.verses[key] || [];
    var i = ids.indexOf(tagId);
    if (i >= 0) { ids.splice(i, 1); }
    if (!ids.length) { delete tagState.verses[key]; } else { tagState.verses[key] = ids; }
    saveTags();
  }

  function deleteTag(tagId) {
    delete tagState.byId[tagId];
    tagState.tags = tagState.tags.filter(function (t) { return t.id !== tagId; });
    Object.keys(tagState.verses).forEach(function (key) {
      tagState.verses[key] = (tagState.verses[key] || []).filter(function (id) { return id !== tagId; });
      if (!tagState.verses[key].length) delete tagState.verses[key];
    });
    if (state.selectedTagId === tagId) state.selectedTagId = null;
    saveTags();
  }

  function createCategory(name, color) {
    var cat = { id: newId('c'), name: name, color: color };
    tagState.categories.push(cat);
    tagState.byCatId[cat.id] = cat;
    saveTags();
    return cat;
  }

  function updateCategory(catId, patch) {
    var c = tagState.byCatId[catId];
    if (!c) return;
    if (patch.name !== undefined) c.name = patch.name;
    if (patch.color !== undefined) c.color = patch.color;
    saveTags();
  }

  function deleteCategory(catId) {
    tagState.categories = tagState.categories.filter(function (c) { return c.id !== catId; });
    delete tagState.byCatId[catId];
    if (!tagState.categories.length) {
      defaultCategories().forEach(function (d) {
        tagState.categories.push(d);
        tagState.byCatId[d.id] = d;
      });
    }
    var fallback = tagState.categories[0];
    tagState.tags.forEach(function (t) {
      if (t.categoryId === catId) t.categoryId = fallback.id;
    });
    saveTags();
  }

  function updateTag(tagId, patch) {
    var t = tagState.byId[tagId];
    if (!t) return;
    if (patch.name !== undefined) t.name = patch.name;
    if (patch.color !== undefined) t.color = patch.color;
    if (patch.categoryId !== undefined) t.categoryId = patch.categoryId;
    saveTags();
  }

  function tagCount(tagId) {
    var count = 0;
    Object.keys(tagState.verses).forEach(function (k) {
      if (tagState.verses[k].indexOf(tagId) !== -1) count++;
    });
    return count;
  }

  /* ---------- theme ---------- */

  var appEl = document.getElementById('app');
  var themeBtn = document.getElementById('themeToggle');

  function applyTheme(theme) {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(LS.theme, theme);
  }

  if (themeBtn) themeBtn.addEventListener('click', function () {
    var next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
    applyTheme(next);
  });

  applyTheme(localStorage.getItem(LS.theme) || 'light');

  /* ---------- helpers ---------- */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function surahByNumber(n) {
    return state.surahs[n - 1];
  }

  function persistLast(n) {
    localStorage.setItem(LS.last, n);
  }

  function tagChip(t) {
    return '<span class="tag-chip" style="--tagc:' + t.color + '">' + esc(t.name) + '</span>';
  }

  var TAG_ICON = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" stroke="none"/></svg>';

  /* ---------- routing ---------- */

  function parseHash() {
    var m = location.hash.match(/^#\/surah\/(\d{1,3})(?:\/(\d{1,3}))?/);
    if (m) return { surah: parseInt(m[1], 10), ayah: m[2] ? parseInt(m[2], 10) : null };
    if (/^#\/tags/.test(location.hash)) return { tags: true };
    return {};
  }

  window.addEventListener('hashchange', render);

  /* ---------- tag menu (popover) ---------- */

  var tagMenu = null;

  function openTagMenu(surah, ayah, anchor) {
    closeTagMenu();
    var currentIds = tagState.verses[surah + ':' + ayah] || [];
    var surahName = surahByNumber(surah).nameAr;

    var menu = document.createElement('div');
    menu.className = 'tag-menu';

    var rows = '';
    tagState.categories.forEach(function (c) {
      var catTags = tagState.tags.filter(function (t) { return t.categoryId === c.id; });
      if (!catTags.length) return;
      rows += '<div class="tag-menu-cat"><span class="cat-dot" style="background:' + c.color + '"></span>' + esc(c.name) + '</div>';
      catTags.forEach(function (t) {
        rows += tagMenuRow(t, currentIds);
      });
    });
    var uncat = tagState.tags.filter(function (t) { return !tagState.byCatId[t.categoryId]; });
    if (uncat.length) {
      rows += '<div class="tag-menu-cat"><span class="cat-dot" style="background:var(--text-muted)"></span>بدون تصنيف</div>';
      uncat.forEach(function (t) {
        rows += tagMenuRow(t, currentIds);
      });
    }
    if (!rows) rows = '<div class="tag-menu-empty">لا توجد وسوم بعد — أضف وسماً جديداً بالأسفل</div>';

    var catOpts = tagState.categories.map(function (c) {
      return '<option value="' + c.id + '">' + esc(c.name) + '</option>';
    }).join('');

    menu.innerHTML =
      '<div class="tag-menu-title">وسم الآية ' + toAr(ayah) + ' من ' + esc(surahName) + '</div>'
      + '<div class="tag-menu-search">'
      + '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.2" y2="16.2"/></svg>'
      + '<input type="search" class="tag-menu-filter-input" placeholder="ابحث عن وسم…" autocomplete="off">'
      + '</div>'
      + '<div class="tag-menu-list">' + rows + '</div>'
      + '<form class="tag-new">'
      + '<div class="tag-new-row"><input type="text" placeholder="وسم جديد…" maxlength="40" autocomplete="off">'
      + '<select class="tag-new-cat">' + catOpts + '</select></div>'
      + '<button type="submit">إضافة</button>'
      + '</form>'
      + '<button type="button" class="tag-menu-close">تم</button>';

    document.body.appendChild(menu);
    menu._anchor = anchor;

    positionTagMenu(menu, anchor);

    tagMenu = menu;

    menu.querySelector('.tag-menu-filter-input').addEventListener('input', function () {
      filterTagMenuRows(menu, this.value);
    });

    menu.querySelectorAll('.tag-menu-row input').forEach(function (cb) {
      cb.addEventListener('change', function () {
        toggleTagOnVerse(surah, ayah, cb.dataset.tagid);
        refreshVerseDecorations(surah, ayah);
      });
    });

    menu.querySelector('.tag-new').addEventListener('submit', function (e) {
      e.preventDefault();
      var input = menu.querySelector('.tag-new input');
      var name = input.value.trim();
      if (!name) return;
      var existing = tagState.tags.filter(function (t) { return norm(t.name) === norm(name); })[0];
      if (existing) {
        if (currentIds.indexOf(existing.id) === -1) toggleTagOnVerse(surah, ayah, existing.id);
        refreshVerseDecorations(surah, ayah);
        openTagMenu(surah, ayah, anchor);
        return;
      }
      var catSel = menu.querySelector('.tag-new-cat');
      var tag = {
        id: newId('t'),
        name: name,
        color: TAG_COLORS[tagState.tags.length % TAG_COLORS.length],
        categoryId: catSel.value
      };
      tagState.tags.push(tag);
      tagState.byId[tag.id] = tag;
      toggleTagOnVerse(surah, ayah, tag.id);
      saveTags();
      refreshVerseDecorations(surah, ayah);
      openTagMenu(surah, ayah, anchor);
    });

    menu.querySelector('.tag-menu-close').addEventListener('click', closeTagMenu);
    menu.querySelector('.tag-menu-filter-input').focus();
  }

  function filterTagMenuRows(menu, query) {
    var q = norm(query);
    var list = menu.querySelector('.tag-menu-list');
    var visibleRows = 0;
    list.querySelectorAll('.tag-menu-row').forEach(function (el) {
      var name = el.querySelector('.tag-chip').textContent;
      var show = !q || norm(name).indexOf(q) !== -1;
      el.style.display = show ? '' : 'none';
      if (show) visibleRows++;
    });
    list.querySelectorAll('.tag-menu-cat').forEach(function (cat) {
      var any = false;
      var next = cat.nextElementSibling;
      while (next && !next.classList.contains('tag-menu-cat')) {
        if (next.style.display !== 'none') any = true;
        next = next.nextElementSibling;
      }
      cat.style.display = any ? '' : 'none';
    });
    var empty = list.querySelector('.tag-menu-empty');
    if (empty) empty.style.display = visibleRows ? 'none' : '';
  }

  function tagMenuRow(t, currentIds) {
    var on = currentIds.indexOf(t.id) !== -1;
    return '<label class="tag-menu-row">'
      + '<input type="checkbox" data-tagid="' + t.id + '"' + (on ? ' checked' : '') + '>'
      + tagChip(t)
      + '</label>';
  }

  function closeTagMenu() {
    if (tagMenu) { tagMenu.remove(); tagMenu = null; }
  }

  function positionTagMenu(menu, anchor) {
    if (!anchor || !anchor.isConnected) return;
    var rect = anchor.getBoundingClientRect();
    var vw = document.documentElement.clientWidth;
    var mh = menu.offsetHeight;
    var mw = menu.offsetWidth;
    var top = Math.round(rect.bottom + window.scrollY + 8);
    var maxTop = window.scrollY + window.innerHeight - mh - 8;
    if (top > maxTop) top = Math.max(window.scrollY + 8, Math.round(rect.top + window.scrollY - mh - 8));
    var left = Math.min(Math.round(rect.left + window.scrollX), Math.max(6, vw - mw - 8));
    menu.style.top = top + 'px';
    menu.style.left = Math.max(6, left) + 'px';
  }

  document.addEventListener('click', function (e) {
    if (tagMenu && !tagMenu.contains(e.target) && !e.target.closest('.tag-btn')) closeTagMenu();
  }, true);

  window.addEventListener('scroll', function () {
    if (tagMenu && tagMenu._anchor) positionTagMenu(tagMenu, tagMenu._anchor);
    if (tagFilterMenu && tagFilterMenu._anchor) positionTagMenu(tagFilterMenu, tagFilterMenu._anchor);
  }, true);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeTagMenu(); closeTagFilterMenu(); }
  });

  /* ---------- session tag filter menu ---------- */

  var tagFilterMenu = null;

  function openTagFilterMenu(anchor) {
    closeTagFilterMenu();
    var menu = document.createElement('div');
    menu.className = 'tag-menu tag-filter-menu';
    menu._anchor = anchor;

    var active = sessionTagFilter || [];
    var rows = '';
    tagState.categories.forEach(function (c) {
      var catTags = tagState.tags.filter(function (t) { return t.categoryId === c.id; });
      if (!catTags.length) return;
      var visible = 0;
      catTags.forEach(function (t) {
        if (!sessionTagFilter || active.indexOf(t.id) !== -1) visible++;
      });
      var catCls = visible === catTags.length ? ' checked' : (visible > 0 ? ' checked data-indet' : '');
      rows += '<div class="tag-menu-cat-group">'
        + '<div class="tag-menu-cat">'
        + '<label class="tag-menu-cat-check"><input type="checkbox" data-catid="' + c.id + '"' + catCls + '></label>'
        + '<span class="cat-arrow">&#9662;</span>'
        + '<span class="cat-dot" style="background:' + c.color + '"></span>'
        + esc(c.name)
        + '</div>'
        + '<div class="tag-menu-cat-body">';
      catTags.forEach(function (t) {
        var on = !sessionTagFilter || active.indexOf(t.id) !== -1;
        rows += '<label class="tag-menu-row">'
          + '<input type="checkbox" data-tagid="' + t.id + '"' + (on ? ' checked' : '') + '>'
          + tagChip(t)
          + '</label>';
      });
      rows += '</div></div>';
    });
    if (!rows) rows = '<div class="tag-menu-empty">لا توجد وسوم بعد</div>';

    menu.innerHTML =
      '<div class="tag-menu-title">عرض الوسوم في هذه الجلسة</div>'
      + '<div class="tag-menu-list">' + rows + '</div>'
      + '<button type="button" class="tag-menu-close">تم</button>';

    document.body.appendChild(menu);
    positionTagMenu(menu, anchor);
    tagFilterMenu = menu;

    menu.querySelectorAll('input[data-indet]').forEach(function (cb) { cb.indeterminate = true; });

    menu.querySelectorAll('.tag-menu-cat').forEach(function (cat) {
      cat.addEventListener('click', function (e) {
        if (e.target.closest('input')) return;
        cat.closest('.tag-menu-cat-group').classList.toggle('collapsed');
      });
    });

    menu.querySelectorAll('input[data-catid]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        applyCategoryFilter(menu, cb);
      });
    });
    menu.querySelectorAll('input[data-tagid]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        updateSessionTagFilter(menu);
        syncCategoryStates(menu);
        refreshAllVerseDecorations();
      });
    });
    menu.querySelector('.tag-menu-close').addEventListener('click', closeTagFilterMenu);
  }

  function applyCategoryFilter(menu, catCb) {
    var ids = tagState.tags.filter(function (t) { return t.categoryId === catCb.dataset.catid; })
      .map(function (t) { return t.id; });
    menu.querySelectorAll('input[data-tagid]').forEach(function (cb) {
      if (ids.indexOf(cb.dataset.tagid) !== -1) {
        cb.checked = catCb.checked;
        cb.indeterminate = false;
      }
    });
    updateSessionTagFilter(menu);
    syncCategoryStates(menu);
    refreshAllVerseDecorations();
  }

  function syncCategoryStates(menu) {
    menu.querySelectorAll('input[data-catid]').forEach(function (catCb) {
      var ids = tagState.tags.filter(function (t) { return t.categoryId === catCb.dataset.catid; })
        .map(function (t) { return t.id; });
      var on = 0;
      menu.querySelectorAll('input[data-tagid]').forEach(function (cb) {
        if (ids.indexOf(cb.dataset.tagid) !== -1 && cb.checked) on++;
      });
      catCb.checked = on > 0;
      catCb.indeterminate = on > 0 && on < ids.length;
    });
  }

  function updateSessionTagFilter(menu) {
    var boxes = menu.querySelectorAll('input[data-tagid]');
    var checked = [];
    boxes.forEach(function (cb) { if (cb.checked) checked.push(cb.dataset.tagid); });
    sessionTagFilter = checked.length === boxes.length ? null : checked;
  }

  function closeTagFilterMenu() {
    if (tagFilterMenu) { tagFilterMenu.remove(); tagFilterMenu = null; }
  }

  document.addEventListener('click', function (e) {
    if (tagFilterMenu && !tagFilterMenu.contains(e.target) && !e.target.closest('#tagFilterToggle')) closeTagFilterMenu();
  }, true);

  /* ---------- verse decorations ---------- */

  function refreshVerseDecorations(surah, ayah) {
    var el = document.getElementById('ayah-' + surah + '-' + ayah);
    if (!el) return;
    var tags = filterVisibleTags(getVerseTags(surah, ayah));
    var chipsEl = el.querySelector('.verse-chips');
    if (showTags && tags.length) {
      if (!chipsEl) {
        chipsEl = document.createElement('span');
        chipsEl.className = 'verse-chips';
        var numEl = el.querySelector('.ayah-num');
        if (numEl) {
          el.insertBefore(chipsEl, numEl);
        } else {
          el.appendChild(chipsEl);
        }
      }
      chipsEl.innerHTML = tags.map(tagChip).join('');
    } else if (chipsEl) {
      chipsEl.remove();
    }
  }

  function refreshAllVerseDecorations() {
    var els = appEl.querySelectorAll('.verse[data-ayah]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      refreshVerseDecorations(+el.dataset.surah, +el.dataset.ayah);
    }
  }

  function renderVerse(q, surah, ayah, text) {
    var tags = filterVisibleTags(getVerseTags(surah, ayah));
    var chips = showTags && tags.length ? '<span class="verse-chips">' + tags.map(tagChip).join('') + '</span>' : '';
    return '<span class="verse" id="ayah-' + surah + '-' + ayah + '" data-surah="' + surah + '" data-ayah="' + ayah + '">'
      + '<span class="verse-text">' + esc(text) + '</span>'
      + '<button type="button" class="tag-btn" data-surah="' + surah + '" data-ayah="' + ayah + '" title="وسم هذه الآية" aria-label="وسم هذه الآية">' + TAG_ICON + '</button>'
      + chips
      + '<span class="ayah-num">' + toAr(ayah) + '</span>'
      + '</span> ';
  }

  /* ---------- index view ---------- */

  function renderIndex() {
    document.title = 'القرآن الكريم — رواية قالون عن نافع';
    var last = parseInt(localStorage.getItem(LS.last), 10);
    var lastSurah = last && surahByNumber(last);

    var html = '';
    html += '<div class="index-toolbar">';
    html += '<div class="search-box">';
    html += '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.2" y2="16.2"/></svg>';
    html += '<input type="search" id="surahSearch" placeholder="ابحث عن سورة بالاسم أو الرقم…" value="' + esc(state.query) + '">';
    html += '</div>';
    html += '<span class="index-stats" id="indexStats"></span>';
    html += '</div>';

    if (lastSurah) {
      html += '<a class="continue-banner" href="#/surah/' + last + '">';
      html += '<strong>متابعة القراءة:</strong> ' + esc(lastSurah.nameAr) + ' — <em>' + esc(lastSurah.nameEn) + '</em>';
      html += '</a>';
    }

    html += '<div class="surah-grid" id="surahGrid"></div>';
    appEl.innerHTML = html;

    var input = document.getElementById('surahSearch');
    input.addEventListener('input', function () {
      state.query = input.value;
      updateGrid();
    });
    updateGrid();
  }

  function filterSurahs(q) {
    var nq = norm(q).trim();
    if (!nq) return state.surahs.slice();
    var num = parseInt(toEnDigits(nq), 10);
    return state.surahs.filter(function (s) {
      if (s.number === num) return true;
      var hay = norm(s.nameAr) + ' ' + s.nameEn.toLowerCase() + ' ' + s.meaning.toLowerCase();
      return hay.indexOf(nq) !== -1;
    });
  }

  function updateGrid() {
    var grid = document.getElementById('surahGrid');
    var stats = document.getElementById('indexStats');
    if (!grid) return;
    var list = filterSurahs(state.query);
    var totalVerses = list.reduce(function (a, s) { return a + s.ayahCount; }, 0);

    if (stats) {
      stats.textContent = toAr(list.length) + ' سورة' + (state.query ? ' — ' + toAr(totalVerses) + ' آية' : ' — ' + toAr(6214) + ' آية');
    }

    if (!list.length) {
      grid.innerHTML = '<div class="empty-state">لا توجد نتائج مطابقة</div>';
      return;
    }

    var html = '';
    list.forEach(function (s) {
      html += '<a class="surah-card" href="#/surah/' + s.number + '">';
      html += '<span class="surah-num">' + toAr(s.number) + '</span>';
      html += '<span class="surah-info">';
      html += '<span class="surah-name">' + esc(s.nameAr) + '</span>';
      html += '<span class="surah-sub" dir="ltr">' + esc(s.nameEn) + ' · ' + esc(s.meaning) + '</span>';
      html += '<span class="surah-meta">';
      html += '<span class="tag type-' + esc(s.type) + '">' + (s.type === 'Meccan' ? 'مكية' : 'مدنية') + '</span>';
      html += '<span class="tag">' + toAr(s.ayahCount) + ' آية</span>';
      html += '</span></span></a>';
    });
    grid.innerHTML = html;
  }

  /* ---------- reader view ---------- */

  function renderReader(n, targetAyah) {
    var s = surahByNumber(n);
    if (!s) { renderIndex(); return; }

    var q = state.quran[n - 1];
    persistLast(n);
    document.title = s.nameAr + ' — القرآن الكريم (قالون)';

    var total = state.surahs.length;
    var prev = n > 1 ? surahByNumber(n - 1) : null;
    var next = n < total ? surahByNumber(n + 1) : null;

    var html = '';

    html += '<div class="reader-head">';
    html += '<div class="reader-progress"><div style="width:' + Math.round((n / total) * 100) + '%"></div></div>';
    html += '<h1 class="reader-title">' + esc(s.nameAr) + '</h1>';
    html += '<div class="reader-sub" dir="ltr">' + esc(s.nameEn) + ' — ' + esc(s.meaning) + '</div>';
    html += '<div class="reader-meta">';
    html += '<span class="tag type-' + esc(s.type) + '">' + (s.type === 'Meccan' ? 'سورة مكية' : 'سورة مدنية') + '</span>';
    html += '<span class="tag">' + toAr(s.ayahCount) + ' آية</span>';
    html += '<span class="tag">السورة ' + toAr(n) + ' من ' + toAr(total) + '</span>';
    html += '</div>';
    html += '</div>';

    html += '<div class="reader-toolbar">';
    html += '<div class="nav-pills">';
    html += '<a class="pill" href="#/"><span>الفهرس</span></a>';
    html += '<a class="pill" href="#/tags"><span>الوسوم</span></a>';
    html += '<button class="pill" id="shareBtn" type="button"><span>نسخ الآيات</span></button>';
    html += '</div>';
    html += '<div class="font-size-ctl">';
    html += '<button type="button" id="fsMinus" aria-label="تصغير الخط">−</button>';
    html += '<span class="font-size-val" id="fsVal">' + state.fontPx + 'px</span>';
    html += '<button type="button" id="fsPlus" aria-label="تكبير الخط">+</button>';
    html += '</div>';
    html += '</div>';

    html += '<div class="reader-options">';
    html += '<button type="button" class="pill" id="tagsToggle">' + (showTags ? 'إخفاء الوسوم' : 'إظهار الوسوم') + '</button>';
    if (showTags) html += '<button type="button" class="pill" id="tagFilterToggle">تصفية الوسوم</button>';
    html += '</div>';

    if (q.bismillah) {
      html += '<div class="bismillah">' + esc(q.bismillah) + '</div>';
    }

    html += '<div class="mushaf-text" id="mushaf">';
    q.verses.forEach(function (v, i) {
      html += renderVerse(q, n, i + 1, v);
    });
    html += '</div>';

    html += '<div class="surah-divider">۞</div>';

    html += '<div class="reader-nav">';
    if (prev) {
      html += '<div class="nav-block prev"><a href="#/surah/' + (n - 1) + '">';
      html += '<span class="nav-label">السورة السابقة</span>';
      html += '<span class="nav-name">' + esc(prev.nameAr) + '</span></a></div>';
    }
    if (next) {
      html += '<div class="nav-block next"><a href="#/surah/' + (n + 1) + '">';
      html += '<span class="nav-label">السورة التالية</span>';
      html += '<span class="nav-name">' + esc(next.nameAr) + '</span></a></div>';
    }
    html += '</div>';

    appEl.innerHTML = html;

    applyFontSize();

    document.getElementById('fsMinus').addEventListener('click', function () { changeFontSize(-2); });
    document.getElementById('fsPlus').addEventListener('click', function () { changeFontSize(2); });
    document.getElementById('tagsToggle').addEventListener('click', function () {
      setShowTags(!showTags);
      document.getElementById('tagsToggle').textContent = showTags ? 'إخفاء الوسوم' : 'إظهار الوسوم';
      var filterBtn = document.getElementById('tagFilterToggle');
      if (showTags) {
        if (!filterBtn) {
          filterBtn = document.createElement('button');
          filterBtn.type = 'button';
          filterBtn.className = 'pill';
          filterBtn.id = 'tagFilterToggle';
          filterBtn.textContent = 'تصفية الوسوم';
          filterBtn.addEventListener('click', function () { toggleTagFilterMenu(this); });
          document.getElementById('tagsToggle').insertAdjacentElement('afterend', filterBtn);
        }
      } else {
        closeTagFilterMenu();
        if (filterBtn) filterBtn.remove();
      }
      refreshAllVerseDecorations();
    });

    var filterToggleBtn = document.getElementById('tagFilterToggle');
    if (filterToggleBtn) filterToggleBtn.addEventListener('click', function () {
      toggleTagFilterMenu(this);
    });

    document.getElementById('mushaf').addEventListener('click', function (e) {
      var btn = e.target.closest('.tag-btn');
      if (btn) openTagMenu(+btn.dataset.surah, +btn.dataset.ayah, btn);
    });

    document.getElementById('shareBtn').addEventListener('click', function () {
      var txt = q.verses.map(function (v, i) { return v + ' ' + toAr(i + 1); }).join(' ');
      copyText('سُورَةُ ' + s.nameAr + '\n' + txt);
    });

    if (targetAyah && targetAyah >= 1 && targetAyah <= q.verses.length) {
      var el = document.getElementById('ayah-' + n + '-' + targetAyah);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.classList.add('flash');
        setTimeout(function () { el.classList.remove('flash'); }, 2200);
      }
    } else {
      window.scrollTo(0, 0);
    }
  }

  /* ---------- tags view ---------- */

  function renderTags() {
    document.title = 'الوسوم — القرآن الكريم (قالون)';

    var html = '';
    html += '<div class="index-toolbar">';
    html += '<div class="nav-pills"><a class="pill" href="#/">الفهرس</a></div>';
    html += '<div class="search-box">';
    html += '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.2" y2="16.2"/></svg>';
    html += '<input type="search" id="tagSearch" placeholder="ابحث عن وسم…" value="' + esc(state.tagQuery) + '">';
    html += '</div>';
    html += '<span class="index-stats" id="tagStats"></span>';
    html += '</div>';
    html += '<div id="tagArea"></div>';

    appEl.innerHTML = html;

    document.getElementById('tagSearch').addEventListener('input', function () {
      state.tagQuery = this.value;
      renderTagArea();
    });

    document.getElementById('tagArea').addEventListener('click', handleTagAreaClick);

    renderTagArea();
  }

  var dragTagId = null;
  var dragScrollDir = 0;
  var dragScrollRaf = null;

  function dragAutoScrollTick() {
    if (dragScrollDir !== 0 && dragTagId) {
      window.scrollBy(0, dragScrollDir * 26);
      dragScrollRaf = requestAnimationFrame(dragAutoScrollTick);
    } else {
      dragScrollRaf = null;
    }
  }

  function stopDragAutoScroll() {
    dragScrollDir = 0;
    if (dragScrollRaf) { cancelAnimationFrame(dragScrollRaf); dragScrollRaf = null; }
  }

  function updateDragAutoScroll(clientY) {
    if (!dragTagId) { stopDragAutoScroll(); return; }
    var edge = 70;
    var dir = 0;
    if (clientY < edge) dir = -1;
    else if (clientY > window.innerHeight - edge) dir = 1;
    if (dir === dragScrollDir) return;
    dragScrollDir = dir;
    if (dir !== 0) {
      if (!dragScrollRaf) dragScrollRaf = requestAnimationFrame(dragAutoScrollTick);
    } else {
      stopDragAutoScroll();
    }
  }

  function handleTagDragStart(e) {
    var chip = e.target.closest('.tag-chip-btn');
    if (!chip || e.target.closest('.tag-edit') || e.target.closest('.tag-delete')) return;
    dragTagId = chip.dataset.tagid;
    chip.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragTagId);
  }

  function handleTagDragOver(e) {
    updateDragAutoScroll(e.clientY);
    var block = e.target.closest('.cat-block');
    if (!block || !dragTagId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    block.classList.add('drag-over');
  }

  function handleTagDragLeave(e) {
    var block = e.target.closest('.cat-block');
    if (block && !block.contains(e.relatedTarget)) block.classList.remove('drag-over');
  }

  function handleTagDrop(e) {
    e.preventDefault();
    stopDragAutoScroll();
    var block = e.target.closest('.cat-block');
    if (!block || !dragTagId) return;
    var targetCatId = block.dataset.catid || '';
    var t = tagState.byId[dragTagId];
    if (t && t.categoryId !== targetCatId) updateTag(dragTagId, { categoryId: targetCatId });
    dragTagId = null;
    renderTagArea();
  }

  function handleTagDragEnd(e) {
    stopDragAutoScroll();
    var chip = e.target.closest('.tag-chip-btn');
    if (chip) chip.classList.remove('dragging');
    appEl.querySelectorAll('.cat-block.drag-over').forEach(function (el) { el.classList.remove('drag-over'); });
    dragTagId = null;
  }

  document.addEventListener('dragstart', handleTagDragStart);
  document.addEventListener('dragover', handleTagDragOver);
  document.addEventListener('dragleave', handleTagDragLeave);
  document.addEventListener('drop', handleTagDrop);
  document.addEventListener('dragend', handleTagDragEnd);

  function colorSwatches(current) {
    return TAG_COLORS.map(function (c) {
      return '<button type="button" class="swatch' + (c === current ? ' on' : '') + '" data-color="' + c + '" style="background:' + c + '" title="لون"></button>';
    }).join('');
  }

  function renderEditPanel() {
    var e = state.edit;
    if (!e) return '';

    if (e.type === 'newcat' || e.type === 'cat') {
      var cat = e.type === 'cat' ? tagState.byCatId[e.id] : null;
      var name = cat ? cat.name : '';
      var color = cat ? cat.color : TAG_COLORS[0];
      return '<div class="edit-panel">'
        + '<div class="edit-title">' + (cat ? 'تعديل التصنيف' : 'تصنيف جديد') + '</div>'
        + '<div class="edit-row"><input type="text" id="editName" class="edit-name" value="' + esc(name) + '" placeholder="اسم التصنيف" maxlength="40">'
        + '<div class="edit-colors">' + colorSwatches(color) + '</div></div>'
        + '<div class="edit-actions">'
        + '<button type="button" class="edit-save" data-type="' + e.type + '" data-id="' + (cat ? cat.id : '') + '">حفظ</button>'
        + '<button type="button" class="edit-cancel">إلغاء</button>'
        + '</div></div>';
    }

    var tag = tagState.byId[e.id];
    if (!tag) return '';
    var opts = tagState.categories.map(function (c) {
      return '<option value="' + c.id + '"' + (c.id === tag.categoryId ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    }).join('');
    return '<div class="edit-panel">'
      + '<div class="edit-title">تعديل الوسم</div>'
      + '<div class="edit-row"><input type="text" id="editName" class="edit-name" value="' + esc(tag.name) + '" maxlength="40">'
      + '<select id="editCat" class="edit-cat">' + opts + '</select></div>'
      + '<div class="edit-colors">' + colorSwatches(tag.color) + '</div>'
      + '<div class="edit-actions">'
      + '<button type="button" class="edit-save" data-type="tag" data-id="' + tag.id + '">حفظ</button>'
      + '<button type="button" class="edit-cancel">إلغاء</button>'
      + '</div></div>';
  }

  function renderTagChipBtn(t) {
    var sel = state.selectedTagId === t.id ? ' selected' : '';
    return '<span class="tag-chip-btn' + sel + '" draggable="true" data-tagid="' + t.id + '">'
      + tagChip(t) + ' <b>' + toAr(tagCount(t.id)) + '</b>'
      + '<button type="button" class="tag-edit" data-tagid="' + t.id + '" title="تعديل الوسم">✎</button>'
      + '<button type="button" class="tag-delete" data-tagid="' + t.id + '" title="حذف الوسم">✕</button>'
      + '</span>';
  }

  function renderTagArea() {
    var area = document.getElementById('tagArea');
    if (!area) return;

    var nq = norm(state.tagQuery);
    var matches = function (t) { return !nq || norm(t.name).indexOf(nq) !== -1; };

    var matchingAll = tagState.tags.filter(matches);
    if (nq && matchingAll.length === 1) state.selectedTagId = matchingAll[0].id;

    var taggedCount = Object.keys(tagState.verses).length;
    var stats = document.getElementById('tagStats');
    if (stats) {
      stats.textContent = toAr(tagState.categories.length) + ' تصنيف — ' + toAr(tagState.tags.length) + ' وسم'
        + (taggedCount ? ' — ' + toAr(taggedCount) + ' آية موسومة' : '');
    }

    var html = '';

    if (state.edit) html += renderEditPanel();

    html += '<div class="cat-toolbar"><button type="button" class="cat-add">+ تصنيف جديد</button></div>';

    if (!tagState.tags.length) {
      html += '<div class="empty-state">لا توجد وسوم بعد.<br>افتح أي سورة واضغط على أيقونة الوسم بجانب أي آية لإضافتها.</div>';
      area.innerHTML = html;
      return;
    }

    var showSections = false;
    html += '<div class="cat-blocks">';

    tagState.categories.forEach(function (c) {
      var catTags = tagState.tags.filter(function (t) { return t.categoryId === c.id && matches(t); });
      if (nq && !catTags.length) return;
      showSections = true;
      html += '<div class="cat-block" data-catid="' + c.id + '">';
      html += '<div class="cat-head">';
      html += '<span class="cat-dot" style="background:' + c.color + '"></span>';
      html += '<span class="cat-name">' + esc(c.name) + '</span>';
      html += '<b class="cat-count">' + toAr(catTags.length) + '</b>';
      html += '<button type="button" class="cat-edit" data-catid="' + c.id + '" title="تعديل التصنيف">✎</button>';
      html += '<button type="button" class="cat-del" data-catid="' + c.id + '" title="حذف التصنيف">✕</button>';
      html += '</div>';
      html += '<div class="cat-tags">' + catTags.map(renderTagChipBtn).join('') + '</div>';
      html += '</div>';
    });

    var uncat = tagState.tags.filter(function (t) { return !tagState.byCatId[t.categoryId] && matches(t); });
    if (uncat.length || (!nq && tagState.tags.some(function (t) { return !tagState.byCatId[t.categoryId]; }))) {
      showSections = true;
      html += '<div class="cat-block" data-catid="">';
      html += '<div class="cat-head"><span class="cat-dot" style="background:var(--text-muted)"></span><span class="cat-name">بدون تصنيف</span><b class="cat-count">' + toAr(uncat.length) + '</b></div>';
      html += '<div class="cat-tags">' + uncat.map(renderTagChipBtn).join('') + '</div>';
      html += '</div>';
    }

    html += '</div>';

    if (!showSections) html += '<div class="empty-state">لا توجد وسوم مطابقة لبحثك</div>';

    var selTag = state.selectedTagId ? tagState.byId[state.selectedTagId] : null;

    if (selTag) {
      var ayahs = listAyahsForTag(selTag.id);
      html += '<h2 class="section-title">آيات موسومة بـ «' + esc(selTag.name) + '» — ' + toAr(ayahs.length) + '</h2>';
      html += '<div class="tayah-list">';
      if (ayahs.length) {
        ayahs.forEach(function (a) {
          html += renderAyahCard(a);
        });
      } else {
        html += '<div class="empty-state">لا توجد آيات تحت هذا الوسم</div>';
      }
      html += '</div>';
    } else {
      html += '<div class="hint-box">اختر وسماً من القائمة أعلاه لعرض آياته، أو ابحث عن وسم بالاسم.</div>';
    }

    area.innerHTML = html;
  }

  function handleTagAreaClick(e) {
    var swatch = e.target.closest('.swatch');
    if (swatch) {
      var panel = swatch.closest('.edit-panel');
      panel.querySelectorAll('.swatch').forEach(function (s) { s.classList.toggle('on', s === swatch); });
      return;
    }

    var editSave = e.target.closest('.edit-save');
    if (editSave) {
      var panel = editSave.closest('.edit-panel');
      var name = panel.querySelector('.edit-name').value.trim();
      var colorEl = panel.querySelector('.swatch.on');
      var color = colorEl ? colorEl.dataset.color : TAG_COLORS[0];
      var type = editSave.dataset.type;
      var id = editSave.dataset.id;
      if (type === 'newcat') {
        if (name) { createCategory(name, color); state.selectedTagId = null; }
      } else if (type === 'cat') {
        if (name) updateCategory(id, { name: name, color: color });
      } else if (type === 'tag') {
        var catId = panel.querySelector('.edit-cat').value;
        if (name) updateTag(id, { name: name, color: color, categoryId: catId });
      }
      state.edit = null;
      renderTagArea();
      return;
    }

    var editCancel = e.target.closest('.edit-cancel');
    if (editCancel) {
      state.edit = null;
      renderTagArea();
      return;
    }

    var catAdd = e.target.closest('.cat-add');
    if (catAdd) {
      state.edit = { type: 'newcat' };
      renderTagArea();
      return;
    }

    var catEdit = e.target.closest('.cat-edit');
    if (catEdit) {
      state.edit = { type: 'cat', id: catEdit.dataset.catid };
      renderTagArea();
      return;
    }

    var catDel = e.target.closest('.cat-del');
    if (catDel) {
      var c = tagState.byCatId[catDel.dataset.catid];
      if (c && confirm('حذف التصنيف «' + c.name + '»؟ ستُنقل وسومه إلى أول تصنيف.')) {
        deleteCategory(c.id);
        renderTagArea();
      }
      return;
    }

    var tagEdit = e.target.closest('.tag-edit');
    if (tagEdit) {
      state.edit = { type: 'tag', id: tagEdit.dataset.tagid };
      renderTagArea();
      return;
    }

    var del = e.target.closest('.tag-delete');
    if (del) {
      var t = tagState.byId[del.dataset.tagid];
      if (t && confirm('حذف الوسم «' + t.name + '» من جميع الآيات؟')) {
        deleteTag(t.id);
        renderTagArea();
      }
      return;
    }

    var chipBtn = e.target.closest('.tag-chip-btn');
    if (chipBtn) {
      var id = chipBtn.dataset.tagid;
      state.selectedTagId = state.selectedTagId === id ? null : id;
      renderTagArea();
      return;
    }

    var rem = e.target.closest('.tayah-remove');
    if (rem) {
      removeTagFromVerse(+rem.dataset.surah, +rem.dataset.ayah, rem.dataset.tagid);
      renderTagArea();
    }
  }

  function listAyahsForTag(tagId) {
    var out = [];
    Object.keys(tagState.verses).forEach(function (key) {
      if (tagState.verses[key].indexOf(tagId) !== -1) {
        var parts = key.split(':');
        var surah = +parts[0];
        var ayah = +parts[1];
        var q = state.quran && state.quran[surah - 1];
        if (!q || !q.verses[ayah - 1]) return;
        out.push({ surah: surah, ayah: ayah, text: q.verses[ayah - 1] });
      }
    });
    out.sort(function (a, b) { return a.surah - b.surah || a.ayah - b.ayah; });
    return out;
  }

  function renderAyahCard(a) {
    var surah = surahByNumber(a.surah);
    var tags = getVerseTags(a.surah, a.ayah);
    return '<div class="tayah-card">'
      + '<a class="tayah-link" href="#/surah/' + a.surah + '/' + a.ayah + '">'
      + '<div class="tayah-meta">سورة ' + esc(surah.nameAr) + ' — الآية ' + toAr(a.ayah) + ' <span dir="ltr">· ' + esc(surah.nameEn) + '</span></div>'
      + '<div class="tayah-text">' + esc(a.text) + ' <span class="ayah-num">' + toAr(a.ayah) + '</span></div>'
      + '</a>'
      + (tags.length ? '<div class="tayah-chips">' + tags.map(tagChip).join('') + '</div>' : '')
      + '<button type="button" class="tayah-remove" data-surah="' + a.surah + '" data-ayah="' + a.ayah + '" data-tagid="' + (tags.length ? tags[0].id : '') + '" title="إزالة هذا الوسم">✕</button>'
      + '</div>';
  }

  /* ---------- copy ---------- */

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { flashShare('تم النسخ ✓'); }, function () { fallbackCopy(text); });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); flashShare('تم النسخ ✓'); } catch (e) {}
    document.body.removeChild(ta);
  }

  function flashShare(msg) {
    var btn = document.getElementById('shareBtn');
    if (!btn) return;
    var span = btn.querySelector('span');
    var old = span.textContent;
    span.textContent = msg;
    btn.disabled = true;
    setTimeout(function () { span.textContent = old; btn.disabled = false; }, 1600);
  }

  /* ---------- font size ---------- */

  function applyFontSize() {
    var mushaf = appEl.querySelector('.mushaf-text');
    if (mushaf) mushaf.style.setProperty('--fs', state.fontPx + 'px');
    var val = document.getElementById('fsVal');
    if (val) val.textContent = state.fontPx + 'px';
  }

  function changeFontSize(delta) {
    state.fontPx = Math.min(46, Math.max(16, state.fontPx + delta));
    localStorage.setItem(LS.fontSize, state.fontPx);
    applyFontSize();
  }

  /* ---------- keyboard nav ---------- */

  document.addEventListener('keydown', function (e) {
    if (tagMenu) return;
    if (/input|textarea/i.test(e.target.tagName)) return;
    var route = parseHash();
    if (!route.surah) return;
    if (e.key === 'ArrowLeft') {
      if (route.surah < state.surahs.length) location.hash = '#/surah/' + (route.surah + 1);
    } else if (e.key === 'ArrowRight') {
      if (route.surah > 1) location.hash = '#/surah/' + (route.surah - 1);
    }
  });

  /* ---------- init ---------- */

  function render() {
    closeTagMenu();
    var route = parseHash();
    if (route.tags && state.quran) {
      renderTags();
    } else if (route.surah && state.surahs && surahByNumber(route.surah)) {
      renderReader(route.surah, route.ayah);
    } else {
      renderIndex();
    }
  }

  function loadData() {
    return Promise.all([
      fetch('data/surahs.json').then(function (r) { return r.json(); }),
      fetch('data/quran.json').then(function (r) { return r.json(); }),
      fetch('data/dawaa.json').then(function (r) { return r.json(); }),
      fetch('data/jam3.json').then(function (r) { return r.json(); })
    ]).then(function (res) {
      state.surahs = res[0];
      state.quran = res[1];
      mergeSeedTag(res[2]);
      mergeSeedTag(res[3]);
    });
  }

  loadData().then(render).catch(function (err) {
    appEl.innerHTML = '<div class="empty-state">تعذّر تحميل البيانات: ' + esc(err.message) + '</div>';
  });
})();
