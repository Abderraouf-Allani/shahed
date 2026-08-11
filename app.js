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

  var FORMAT_VERSION = 2;
  var FORMAT_TAG = 'quran-tag/v' + FORMAT_VERSION;
  var FORMAT_PREFIX = 'quran-tag/v';

  var state = {
    surahs: null,
    quran: null,
    fontPx: parseInt(localStorage.getItem(LS.fontSize), 10) || 32,
    query: '',
    ayahQuery: '',
    surahQuery: '',
    tagQuery: '',
    selectedTagId: null,
    edit: null,
    ayahMeta: {}
  };

  var normVersesCache = null;

  function normAyahText(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[\u064B-\u0652\u0670\u06D6-\u06ED\u0640\u0653\u0654\u0655]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ؤ/g, 'و')
      .replace(/[\u0621\u0626]/g, '')
      .replace(/[ى\u06D2]/g, 'ي')
      .replace(/\s+/g, ' ');
  }

  function normAllVerses() {
    if (!normVersesCache) {
      normVersesCache = state.quran.map(function (ch) {
        return ch.verses.map(normAyahText);
      });
    }
    return normVersesCache;
  }

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
    Object.keys(seed.ayahMeta || {}).forEach(function (tagId) {
      if (!state.ayahMeta[tagId]) state.ayahMeta[tagId] = {};
      Object.keys(seed.ayahMeta[tagId]).forEach(function (vkey) {
        state.ayahMeta[tagId][vkey] = seed.ayahMeta[tagId][vkey];
      });
    });
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
    var ayahMeta = raw && raw.ayahMeta && typeof raw.ayahMeta === 'object' ? raw.ayahMeta : {};
    state.ayahMeta = ayahMeta;

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
        localStorage.setItem(LS.tags, JSON.stringify({ categories: categories, tags: tags, verses: verses, ayahMeta: ayahMeta }));
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
      verses: tagState.verses,
      ayahMeta: state.ayahMeta
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
    if (state.ayahMeta[tagId] && state.ayahMeta[tagId][key]) {
      delete state.ayahMeta[tagId][key];
      if (!Object.keys(state.ayahMeta[tagId]).length) delete state.ayahMeta[tagId];
    }
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
    delete state.ayahMeta[tagId];
    saveTags();
  }

  function createCategory(name, color) {
    var cat = { id: newId('c'), name: name, color: color };
    tagState.categories.push(cat);
    tagState.byCatId[cat.id] = cat;
    saveTags();
    return cat;
  }

  function createTag(name, color, categoryId, description, metatag) {
    var tag = {
      id: newId('t'),
      name: name,
      color: color || TAG_COLORS[tagState.tags.length % TAG_COLORS.length],
      categoryId: categoryId || (tagState.categories[0] ? tagState.categories[0].id : '')
    };
    if (description) tag.description = description;
    if (metatag !== undefined) tag.metatag = metatag;
    tagState.tags.push(tag);
    tagState.byId[tag.id] = tag;
    saveTags();
    return tag;
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
    if (patch.description !== undefined) t.description = patch.description;
    if (patch.metatag !== undefined) t.metatag = patch.metatag;
    saveTags();
  }

  function tagCount(tagId) {
    var count = 0;
    Object.keys(tagState.verses).forEach(function (k) {
      if (tagState.verses[k].indexOf(tagId) !== -1) count++;
    });
    return count;
  }

  /* ---------- export / import ---------- */

  function exportTagsData() {
    var ayahMetaOut = {};
    Object.keys(state.ayahMeta).forEach(function (tagId) {
      if (!tagState.byId[tagId]) return;
      var m = state.ayahMeta[tagId];
      if (m && Object.keys(m).length) ayahMetaOut[tagId] = m;
    });
    return {
      format: FORMAT_TAG,
      version: FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      categories: tagState.categories.map(function (c) {
        return { id: c.id, name: c.name, color: c.color };
      }),
      tags: tagState.tags.map(function (t) {
        var o = { id: t.id, name: t.name, color: t.color, categoryId: t.categoryId };
        if (t.description) o.description = t.description;
        if (t.metatag !== undefined) o.metatag = t.metatag;
        return o;
      }),
      associations: tagState.verses,
      ayahMeta: ayahMetaOut
    };
  }

  function downloadTagsFile() {
    var data = exportTagsData();
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'quran-tag-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function uniqueTagName(base) {
    var n = 2;
    var name = base;
    while (tagState.tags.some(function (u) { return norm(u.name) === norm(name); })) {
      name = base + ' (' + toAr(n) + ')';
      n++;
    }
    return name;
  }

  function importTagsData(raw, report) {
    var data;
    try { data = JSON.parse(raw); } catch (e) { report(false, 'الملف غير صالح — ليس JSON صحيحاً.'); return; }
    if (!data || typeof data !== 'object' || !Array.isArray(data.tags)) {
      report(false, 'الملف لا يحتوي على بيانات وسوم صالحة.');
      return;
    }

    if (typeof data.format === 'string' && data.format && data.format.indexOf('quran-tag') !== 0) {
      report(false, 'هذا الملف ليس ملف تصدير وسوم لهذا التطبيق.');
      return;
    }
    var fileVersion = null;
    if (typeof data.format === 'string' && data.format.indexOf(FORMAT_PREFIX) === 0) {
      fileVersion = parseInt(data.format.slice(FORMAT_PREFIX.length), 10);
    }
    if ((fileVersion === null || isNaN(fileVersion)) && typeof data.version === 'number') {
      fileVersion = data.version;
    }
    if (fileVersion !== null && !isNaN(fileVersion) && fileVersion !== FORMAT_VERSION) {
      report(false, 'تعذّر الاستيراد: إصدار التنسيق في الملف (v' + fileVersion + ') لا يطابق إصدار التطبيق (v' + FORMAT_VERSION + '). يرجى تحديث التطبيق أو تصدير ملف جديد.');
      return;
    }

    var categories = Array.isArray(data.categories) ? data.categories : [];
    var tags = data.tags;
    var assoc = data.associations && typeof data.associations === 'object'
      ? data.associations
      : (data.verses && typeof data.verses === 'object' ? data.verses : {});
    var metaIn = data.ayahMeta && typeof data.ayahMeta === 'object' ? data.ayahMeta : {};

    var catMap = {};
    var mergedCats = 0;
    var createdCats = 0;
    categories.forEach(function (c) {
      if (!c || typeof c.name !== 'string' || !c.name.trim()) return;
      var existing = tagState.categories.filter(function (u) { return norm(u.name) === norm(c.name); })[0];
      if (existing) {
        catMap[c.id] = existing.id;
        mergedCats++;
      } else {
        var cat = createCategory(c.name.trim(), c.color || TAG_COLORS[tagState.categories.length % TAG_COLORS.length]);
        catMap[c.id] = cat.id;
        createdCats++;
      }
    });

    var tagMap = {};
    var createdTags = 0;
    var renamedTags = 0;
    tags.forEach(function (t) {
      if (!t || typeof t.name !== 'string' || !t.name.trim()) return;
      var name = t.name.trim();
      if (tagState.tags.some(function (u) { return norm(u.name) === norm(name); })) {
        name = uniqueTagName(name);
        renamedTags++;
      }
      var catId = (t.categoryId && catMap[t.categoryId])
        ? catMap[t.categoryId]
        : (tagState.categories[0] ? tagState.categories[0].id : '');
      var tag = createTag(name, t.color || TAG_COLORS[tagState.tags.length % TAG_COLORS.length], catId, t.description || '', t.metatag);
      tagMap[t.id] = tag.id;
      createdTags++;
    });

    var assocKeys = 0;
    var addedAssoc = 0;
    Object.keys(assoc).forEach(function (key) {
      var parts = key.split(':');
      if (parts.length !== 2 || !(+parts[0]) || !(+parts[1])) return;
      var ids = (assoc[key] || []).map(function (id) { return tagMap[id]; }).filter(Boolean);
      if (!ids.length) return;
      var cur = tagState.verses[key] || [];
      ids.forEach(function (id) {
        if (cur.indexOf(id) === -1) { cur.push(id); addedAssoc++; }
      });
      if (cur.length) tagState.verses[key] = cur;
      assocKeys++;
    });

    var metaKeys = 0;
    Object.keys(metaIn).forEach(function (tagId) {
      var newTagId = tagMap[tagId];
      if (!newTagId) return;
      var byVerse = metaIn[tagId] || {};
      if (!state.ayahMeta[newTagId]) state.ayahMeta[newTagId] = {};
      Object.keys(byVerse).forEach(function (vkey) {
        state.ayahMeta[newTagId][vkey] = byVerse[vkey];
        metaKeys++;
      });
    });

    saveTags();

    var msg = 'تم استيراد ' + toAr(createdTags) + ' وسماً و' + toAr(createdCats) + ' تصنيفاً، مع ' + toAr(assocKeys) + ' آية موسومة (' + toAr(addedAssoc) + ' رابطة).';
    if (metaKeys) msg += '\nاستُعيدت بيانات ' + toAr(metaKeys) + ' رابطة من وسم.';
    if (mergedCats) msg += '\nدُمجت ' + toAr(mergedCats) + ' تصنيف بنفس اسم تصنيف موجود.';
    if (renamedTags) msg += '\nأُعيد تسمية ' + toAr(renamedTags) + ' وسماً مطابقاً لاسم وسم موجود.';
    report(true, msg);
  }

  function importTagsFromFile() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (file) {
        var reader = new FileReader();
        reader.onload = function () {
          importTagsData(String(reader.result), function (ok, msg) {
            alert(msg);
            renderTagArea();
          });
        };
        reader.readAsText(file);
      }
      input.remove();
    });
    input.click();
  }

  /* ---------- document upload (PDF/DOCX) ---------- */

  var DOC_MIN_MATCH = 26;

  var docAyahIndex = null;
  var docProgressEl = null;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('تعذّر تحميل مكتبة ' + src)); };
      document.head.appendChild(s);
    });
  }


  var AR_PR_FORMS = {0xFB50:0x621,0xFB51:0x621,0xFB52:0x627,0xFB53:0x627,0xFB54:0x627,0xFB55:0x627,0xFE70:0x640,0xFE71:0x640,0xFE73:0x640,0xFE81:0x622,0xFE82:0x622,0xFE83:0x623,0xFE84:0x623,0xFE85:0x624,0xFE86:0x624,0xFE87:0x625,0xFE88:0x625,0xFE89:0x626,0xFE8A:0x626,0xFE8B:0x626,0xFE8C:0x626,0xFE8D:0x627,0xFE8E:0x627,0xFE8F:0x628,0xFE90:0x628,0xFE91:0x628,0xFE92:0x628,0xFE93:0x629,0xFE94:0x629,0xFE95:0x62A,0xFE96:0x62A,0xFE97:0x62A,0xFE98:0x62A,0xFE99:0x62B,0xFE9A:0x62B,0xFE9B:0x62B,0xFE9C:0x62B,0xFE9D:0x62C,0xFE9E:0x62C,0xFE9F:0x62C,0xFEA0:0x62C,0xFEA1:0x62D,0xFEA2:0x62D,0xFEA3:0x62D,0xFEA4:0x62D,0xFEA5:0x62E,0xFEA6:0x62E,0xFEA7:0x62E,0xFEA8:0x62E,0xFEA9:0x62F,0xFEAA:0x62F,0xFEAB:0x630,0xFEAC:0x630,0xFEAD:0x631,0xFEAE:0x631,0xFEAF:0x632,0xFEB0:0x632,0xFEB1:0x633,0xFEB2:0x633,0xFEB3:0x633,0xFEB4:0x633,0xFEB5:0x634,0xFEB6:0x634,0xFEB7:0x634,0xFEB8:0x634,0xFEB9:0x635,0xFEBA:0x635,0xFEBB:0x635,0xFEBC:0x635,0xFEBD:0x636,0xFEBE:0x636,0xFEBF:0x636,0xFEC0:0x636,0xFEC1:0x637,0xFEC2:0x637,0xFEC3:0x637,0xFEC4:0x637,0xFEC5:0x638,0xFEC6:0x638,0xFEC7:0x638,0xFEC8:0x638,0xFEC9:0x639,0xFECA:0x639,0xFECB:0x639,0xFECC:0x639,0xFECD:0x63A,0xFECE:0x63A,0xFECF:0x63A,0xFED0:0x63A,0xFED1:0x641,0xFED2:0x641,0xFED3:0x641,0xFED4:0x641,0xFED5:0x642,0xFED6:0x642,0xFED7:0x642,0xFED8:0x642,0xFED9:0x643,0xFEDA:0x643,0xFEDB:0x643,0xFEDC:0x643,0xFEDD:0x644,0xFEDE:0x644,0xFEDF:0x644,0xFEE0:0x644,0xFEE1:0x645,0xFEE2:0x645,0xFEE3:0x645,0xFEE4:0x645,0xFEE5:0x646,0xFEE6:0x646,0xFEE7:0x646,0xFEE8:0x646,0xFEE9:0x647,0xFEEA:0x647,0xFEEB:0x647,0xFEEC:0x647,0xFEED:0x648,0xFEEE:0x648,0xFEEF:0x649,0xFEF0:0x649,0xFEF1:0x64A,0xFEF2:0x64A,0xFEF3:0x64A,0xFEF4:0x64A};

  function normDocText(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[\uFE70-\uFEFF\uFB50-\uFDFF]/g, function (ch) {
        if (ch === '\uFDF2') return '\u0627\u0644\u0644\u0647';
        if (ch >= '\uFEF5' && ch <= '\uFEFC') return '\u0644\u0627';
        if (ch === '\uFDF0') return '\u0635\u0644\u0649';
        if (ch === '\uFDF1') return '\u0642\u0644\u0649';
        if (ch === '\uFDFA' || ch === '\uFDFB') return '';
        return AR_PR_FORMS[ch.charCodeAt(0)] ? String.fromCharCode(AR_PR_FORMS[ch.charCodeAt(0)]) : '';
      })
      .replace(/[\u064B-\u0652\u06D6-\u06ED\u0640\u0653\u0654\u0655]/g, '')
      .replace(/\u0670/g, 'ا')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ؤ/g, 'و')
      .replace(/[\u0621\u0626]/g, '')
      .replace(/[ى\u06D2]/g, 'ي')
      .replace(/الرحمن/g, 'الرحمان')
      .replace(/[^\u0621-\u064A\u06D2\u06CC ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function buildDocAyahIndex() {
    if (docAyahIndex) return docAyahIndex;
    docAyahIndex = [];
    state.quran.forEach(function (ch) {
      ch.verses.forEach(function (v, ai) {
        var n = normDocText(v);
        if (n) docAyahIndex.push({ key: ch.chapter + ':' + (ai + 1), text: n, words: n.split(' ') });
      });
    });
    return docAyahIndex;
  }

  function isArabicLetter(ch) {
    return ch && ch !== ' ' && /[\u0621-\u064A\u06D2\u06CC]/.test(ch);
  }

  function hasBoundaryIndex(doc, t) {
    var i = doc.indexOf(t);
    while (i !== -1) {
      var before = i === 0 ? ' ' : doc.charAt(i - 1);
      var after = i + t.length >= doc.length ? ' ' : doc.charAt(i + t.length);
      if (!isArabicLetter(before) && !isArabicLetter(after)) return i;
      i = doc.indexOf(t, i + 1);
    }
    return -1;
  }

  var DOC_MIN_WORDS = 6;

  function buildDocPosIndex(docWords) {
    var index = {};
    docWords.forEach(function (w, p) {
      (index[w] || (index[w] = [])).push(p);
    });
    return index;
  }

  function wordRunCandidates(docWords, posIndex, item, minWords) {
    var T = item.words;
    var m = T.length;
    if (m < minWords) return null;
    var best = null;
    var seen = {};
    var D = docWords;
    var Dlen = D.length;
    for (var i = 0; i < m - 1; i++) {
      var positions = posIndex[T[i]];
      if (!positions) continue;
      for (var pi = 0; pi < positions.length; pi++) {
        var p = positions[pi];
        if (p + 1 >= Dlen || D[p + 1] !== T[i + 1]) continue;
        var seedKey = i + '|' + p;
        if (seen[seedKey]) continue;
        seen[seedKey] = true;
        var res = expandRun(D, T, i, p);
        if (!best || res.exact > best.exact || (res.exact === best.exact && res.run > best.run)) best = res;
      }
    }
    if (!best) return null;
    if (best.exact < minWords) return null;
    var slack = 1 + Math.floor(best.run / 8);
    if (best.run - best.exact > slack) return null;
    if (best.exact === m) return { key: item.key, start: best.start, end: best.end, exact: best.exact, run: best.run, frac: 1 };
    return { key: item.key, start: best.start, end: best.end, exact: best.exact, run: best.run, frac: best.exact / m };
  }

  function expandRun(D, T, seedI, seedP) {
    var i = seedI;
    var p = seedP;
    while (i > 0 && p > 0 && T[i - 1] === D[p - 1]) { i--; p--; }
    var j = i;
    var q = p;
    var exact = 0;
    var mism = 0;
    while (j < T.length && q < D.length) {
      if (T[j] === D[q]) { exact++; mism = 0; }
      else { mism++; }
      if (mism > 2) break;
      j++;
      q++;
    }
    return { exact: exact, run: j - i, start: p, end: q };
  }

  function indexDocumentAyahs(text, onDone) {
    var forward = normDocText(text);
    if (!forward) { onDone({ matched: [], spans: [], orientation: 1 }); return; }
    var rev = forward.split(' ').reverse().join(' ');
    if (rev === forward) { indexOrientation(forward, 1, onDone); return; }
    var revCount = countTier1(rev);
    var fwdCount = countTier1(forward);
    if (revCount > fwdCount) indexOrientation(rev, -1, onDone);
    else indexOrientation(forward, 1, onDone);
  }

  function countTier1(docN) {
    var idx = buildDocAyahIndex();
    var c = 0;
    for (var i = 0; i < idx.length; i++) {
      var tN = idx[i].text;
      if (tN && hasBoundaryIndex(docN, tN) !== -1) c++;
    }
    return c;
  }

  function indexOrientation(docN, orientation, onDone) {
    var docWords = docN.split(' ');
    var spacePrefix = [0];
    for (var sc = 0; sc < docN.length; sc++) {
      spacePrefix[sc + 1] = spacePrefix[sc] + (docN.charAt(sc) === ' ' ? 1 : 0);
    }
    function charPosToWord(pos) {
      return pos >= docN.length ? docWords.length : spacePrefix[pos];
    }
    var posIndex = buildDocPosIndex(docWords);
    var idx = buildDocAyahIndex();
    var matched = [];
    var spans = [];
    var t1Ranges = [];
    var candidates = [];
    var CHUNK = 150;

    function overlaps(ranges, start, end) {
      for (var k = 0; k < ranges.length; k++) {
        if (start < ranges[k][1] && end > ranges[k][0]) return true;
      }
      return false;
    }

    var i = 0;
    function pass1() {
      var end = Math.min(i + CHUNK, idx.length);
      for (; i < end; i++) {
        var tN = idx[i].text;
        if (!tN) continue;
        var bi = hasBoundaryIndex(docN, tN);
        if (bi === -1) continue;
        var s = charPosToWord(bi);
        var e = charPosToWord(bi + tN.length);
        t1Ranges.push([s, e]);
        matched.push(idx[i].key);
        spans.push({ key: idx[i].key, start: s, end: e });
      }
      if (i < idx.length) {
        showDocProgress('يجري مطابقة الآيات… (' + toAr(matched.length) + ' آية حتى الآن)', i / idx.length);
        setTimeout(pass1, 0);
      } else {
        i = 0;
        pass2();
      }
    }

    function pass2() {
      var end = Math.min(i + CHUNK, idx.length);
      for (; i < end; i++) {
        var item = idx[i];
        if (matched.indexOf(item.key) !== -1) continue;
        var cand = wordRunCandidates(docWords, posIndex, item, DOC_MIN_WORDS);
        if (!cand) continue;
        if (overlaps(t1Ranges, cand.start, cand.end)) continue;
        candidates.push(cand);
      }
      if (i < idx.length) {
        showDocProgress('يجري مطابقة الآيات… (' + toAr(matched.length) + ' آية حتى الآن)', i / idx.length);
        setTimeout(pass2, 0);
      } else {
        candidates.sort(function (x, y) {
          if (y.exact !== x.exact) return y.exact - x.exact;
          if (y.run !== x.run) return y.run - x.run;
          return y.frac - x.frac;
        });
        var accepted2 = [];
        candidates.forEach(function (cand) {
          if (overlaps(accepted2, cand.start, cand.end)) return;
          accepted2.push([cand.start, cand.end]);
          matched.push(cand.key);
          spans.push({ key: cand.key, start: cand.start, end: cand.end });
        });
        onDone({ matched: matched, spans: spans, orientation: orientation });
      }
    }

    pass1();
  }

  var CHAPTER_WORDS = ['الفصل', 'الباب', 'القسم', 'الجزء', 'المبحث', 'المطلب', 'المقدمة', 'الخاتمة', 'التمهيد', 'التوطئة', 'الملحق', 'المرحلة', 'الوحدة', 'الدرس'];
  var ORDINAL_ONLY = /^(الاول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر)$/;

  function paraText(p) {
    if (p && typeof p === 'object') return p.text || '';
    return p || '';
  }

  function isOrdinalOnly(text) {
    return ORDINAL_ONLY.test(normDocText(text).trim());
  }

  function isChapterHeading(line) {
    var t = normDocText(line).replace(/\s+/g, ' ').trim();
    if (!t || t.length > 60) return false;
    for (var i = 0; i < CHAPTER_WORDS.length; i++) {
      if (t.indexOf(CHAPTER_WORDS[i]) === 0) return true;
    }
    return false;
  }

  function cleanChapter(heading) {
    var t = String(heading || '').replace(/[\\\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) return '';
    t = t.replace(/^[0-9\u0660-\u0669\u06F0-\u06F9]+\s*[\-–—:.،]\s*/g, ' ').replace(/\s+/g, ' ').trim();
    t = t.replace(/\s*[0-9\u0660-\u0669\u06F0-\u06F9]+\s*$/g, '').trim();
    if (t.length > 50) t = t.slice(0, 50);
    return t;
  }

  function detectChapter(paras, i) {
    var line = paraText(paras[i]);
    if (!isChapterHeading(line)) return null;
    var h = cleanChapter(line);
    if (!h) return null;
    var contentWords = 0;
    for (var j = i + 1; j < paras.length && j <= i + 4; j++) {
      contentWords += normDocText(paraText(paras[j])).split(' ').filter(Boolean).length;
      if (contentWords >= 8) return h;
    }
    return null;
  }

  function buildChapters(paras) {
    var groups = [];
    var cur = null;
    function close() {
      if (cur && cur.text.trim()) groups.push(cur);
      cur = null;
    }
    paras.forEach(function (p, i) {
      var text = paraText(p);
      var page = p && p.page ? p.page : null;
      var h = detectChapter(paras, i);
      if (h) {
        if (cur && cur.text.trim()) close();
        if (!cur) cur = { name: null, text: '', paras: [], page: page };
        if (!cur.name) { cur.name = h; cur._headPara = i; }
        if (page && !cur.page) cur.page = page;
      } else if (isOrdinalOnly(text) && cur && cur.name && !cur.text.trim() && cur._headPara === i - 1) {
        cur.name = (cur.name + ' ' + cleanChapter(text)).trim();
      } else {
        if (!cur) cur = { name: null, text: '', paras: [], page: page };
        cur.text += ' ' + text;
        cur.paras.push(text);
        if (page && !cur.page) cur.page = page;
      }
    });
    close();
    if (!groups.length) {
      groups.push({ name: null, text: paras.map(paraText).join(' '), paras: paras.map(paraText), page: null });
    }
    return groups.filter(function (g) {
      return normDocText(g.text).split(' ').filter(Boolean).length >= DOC_MIN_WORDS;
    });
  }

  var ayahNormCache = {};

  function ayahNorm(key) {
    if (ayahNormCache[key] !== undefined) return ayahNormCache[key];
    var parts = key.split(':');
    var ch = state.quran[+parts[0] - 1];
    var v = ch && ch.verses[+parts[1] - 1];
    ayahNormCache[key] = v ? normDocText(v) : '';
    return ayahNormCache[key];
  }

  function overlapWords(pn, n) {
    var pw = pn.split(' ');
    var nw = n.split(' ');
    var i = 0;
    var score = 0;
    for (var j = 0; j < pw.length && i < nw.length; j++) {
      if (nw[i] === pw[j]) { score++; i++; }
    }
    return score;
  }

  function trimParagraph(p) {
    var t = String(p || '').replace(/\s+/g, ' ').trim();
    if (t.length > 300) t = t.slice(0, 300) + '…';
    return t;
  }

  function paragraphIndexAt(pnList, pos) {
    var acc = 0;
    for (var i = 0; i < pnList.length; i++) {
      acc += pnList[i].split(' ').filter(Boolean).length;
      if (pos < acc) return i;
    }
    return pnList.length ? pnList.length - 1 : -1;
  }

  function wordRange(doc, i, t) {
    var before = doc.slice(0, i);
    var s = before ? before.split(' ').filter(Boolean).length : 0;
    return { s: s, e: s + t.split(' ').filter(Boolean).length };
  }

  function contextWindow(chParas, p0, p1) {
    var out = [];
    for (var k = p0; k <= p1 && k < chParas.length; k++) out.push(chParas[k]);
    return trimParagraph(out.join(' '));
  }

  function findParagraphForAyah(chParas, pnList, rpList, key) {
    var n = ayahNorm(key);
    if (!n) return null;
    var nWords = n.split(' ').filter(Boolean).length;
    if (!nWords) return null;
    var chNorm = pnList.join(' ');
    var revAll = rpList.join(' ');
    var pos = hasBoundaryIndex(chNorm, n);
    var src = pos !== -1 ? chNorm : null;
    if (src === null) {
      pos = hasBoundaryIndex(revAll, n);
      if (pos !== -1) src = revAll;
    }
    if (src !== null) {
      var r = wordRange(src, pos, n);
      var p0 = paragraphIndexAt(pnList, r.s);
      var p1 = paragraphIndexAt(pnList, r.e - 1);
      return contextWindow(chParas, p0, p1);
    }
    var nRev = n.split(' ').reverse().join(' ');
    var best = null;
    var bestScore = 0;
    var bestW = 0;
    var MAXW = 5;
    for (var w = 1; w <= MAXW && w <= pnList.length; w++) {
      for (var j = 0; j + w <= pnList.length; j++) {
        var joined = pnList.slice(j, j + w).join(' ');
        var score = Math.max(overlapWords(joined, n), overlapWords(joined, nRev));
        if (score > bestScore) { bestScore = score; best = j; bestW = w; }
      }
    }
    var need = Math.max(6, Math.floor(nWords / 2));
    if (best !== null && bestScore >= need) return contextWindow(chParas, best, best + bestW - 1);
    return null;
  }

  function indexDocumentParagraphs(paras, onProgress, onDone) {
    var groups = buildChapters(paras);
    var matchedKeys = [];
    var metaOf = {};
    var seen = {};
    var gi = 0;
    function step() {
      if (gi >= groups.length) {
        onDone({ matched: matchedKeys, meta: metaOf, chapters: groups.length });
        return;
      }
      var g = groups[gi];
      if (onProgress) onProgress(gi + 1, groups.length, g.name);
      setTimeout(function () {
        indexDocumentAyahs(g.text, function (res) {
          var pnList = g.paras.map(normDocText);
          var rpList = pnList.map(function (p) { return p.split(' ').reverse().join(' '); });
          res.matched.forEach(function (key) {
            if (seen[key]) return;
            seen[key] = true;
            matchedKeys.push(key);
            var m = {};
            if (g.name) m.chapter = g.name;
            if (g.page) m.page = g.page;
            var ctx = findParagraphForAyah(g.paras, pnList, rpList, key);
            if (ctx) m.paragraph = ctx;
            if (m.chapter || m.page || m.paragraph) metaOf[key] = m;
          });
          gi++;
          step();
        });
      }, 0);
    }
    step();
  }

  function extractPdfText(buffer, onProgress) {
    var pdfjs = window.pdfjsLib;
    pdfjs.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
    return pdfjs.getDocument({ data: buffer }).promise.then(function (pdf) {
      var paragraphs = [];
      var max = Math.min(pdf.numPages, 500);
      var chain = Promise.resolve();
      for (var p = 1; p <= max; p++) {
        (function (pg) {
          chain = chain.then(function () {
            if (onProgress) onProgress(pg, max);
            return pdf.getPage(pg).then(function (page) {
              return page.getTextContent().then(function (tc) {
                var line = '';
                tc.items.forEach(function (it) {
                  var s = it.str || '';
                  if (it.hasEOL) {
                    if (line.trim()) paragraphs.push({ page: pg, text: line.trim() });
                    line = s;
                  } else {
                    line += (line && s ? ' ' : '') + s;
                  }
                });
                if (line.trim()) paragraphs.push({ page: pg, text: line.trim() });
              });
            });
          });
        })(p);
      }
      return chain.then(function () { return { paragraphs: paragraphs, pages: pdf.numPages }; });
    });
  }

  function extractDocxText(buffer) {
    var u8 = new Uint8Array(buffer);
    var files;
    try { files = window.fflate.unzipSync(u8); } catch (e) {
      return Promise.reject(new Error('فشل فك ضغط ملف DOCX.'));
    }
    var xmlArr = files['word/document.xml'];
    if (!xmlArr) return Promise.reject(new Error('ملف DOCX غير صالح — لا يحتوي على نص.'));
    var xml = new TextDecoder().decode(xmlArr);
    var paragraphs = [];
    xml.split(/<\/w:p>|<\/w:tr>/).forEach(function (seg) {
      var text = seg
        .replace(/<w:tab\b[^>]*\/>/g, ' ')
        .replace(/<w:br\b[^>]*\/>/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
      if (text) paragraphs.push({ text: text });
    });
    return Promise.resolve({ paragraphs: paragraphs, pages: 0 });
  }

  function showDocProgress(msg, frac) {
    if (!docProgressEl) {
      docProgressEl = document.createElement('div');
      docProgressEl.className = 'doc-progress';
      docProgressEl.innerHTML = '<div class="doc-progress-box">'
        + '<div class="doc-progress-spinner"></div>'
        + '<div class="doc-progress-msg"></div>'
        + '<div class="doc-progress-bar"><div class="doc-progress-fill"></div></div>'
        + '</div>';
      document.body.appendChild(docProgressEl);
    }
    docProgressEl.querySelector('.doc-progress-msg').textContent = msg;
    var fill = docProgressEl.querySelector('.doc-progress-fill');
    if (typeof frac === 'number') fill.style.width = Math.round(frac * 100) + '%';
  }

  function hideDocProgress() {
    if (docProgressEl) { docProgressEl.remove(); docProgressEl = null; }
  }

  function ensureBooksCategory() {
    var cat = tagState.categories.filter(function (c) { return norm(c.name) === 'كتب'; })[0];
    if (cat) return cat;
    cat = { id: 'c-dawaa', name: 'كتب', color: '#1e5a3c' };
    if (!tagState.byCatId[cat.id]) {
      tagState.categories.push(cat);
      tagState.byCatId[cat.id] = cat;
    }
    return cat;
  }

  function pickTagColor() {
    var usage = {};
    TAG_COLORS.forEach(function (c) { usage[c] = 0; });
    tagState.tags.forEach(function (t) { if (usage[t.color] !== undefined) usage[t.color]++; });
    var best = TAG_COLORS[0];
    var bestN = Infinity;
    TAG_COLORS.forEach(function (c) {
      if (usage[c] < bestN) { bestN = usage[c]; best = c; }
    });
    return best;
  }

  function finishDocumentIndex(fileName, result) {
    hideDocProgress();
    var matched = result && result.matched ? result.matched : [];
    var metaOf = (result && result.meta) || {};
    if (!matched.length) {
      alert('لم يُعثر على آيات كريمة في المستند «' + fileName + '». تأكد أن الملف يحتوي على نص قابل للقراءة.');
      return;
    }
    var bookName = fileName.replace(/\.(pdf|docx)$/i, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!bookName) bookName = 'مستند';
    var cat = ensureBooksCategory();
    var tag = {
      id: newId('t'),
      name: uniqueTagName(bookName),
      categoryId: cat.id,
      color: pickTagColor(),
      description: 'الآيات المستشهد بها في «' + bookName + '» — استُخرجت من المستند المرفوع.'
    };
    tagState.tags.push(tag);
    tagState.byId[tag.id] = tag;
    matched.forEach(function (key) {
      var cur = tagState.verses[key] || [];
      if (cur.indexOf(tag.id) === -1) cur.push(tag.id);
      tagState.verses[key] = cur;
      var m = metaOf[key];
      if (m && (m.chapter || m.page || m.paragraph)) {
        if (!state.ayahMeta[tag.id]) state.ayahMeta[tag.id] = {};
        state.ayahMeta[tag.id][key] = m;
      }
    });
    saveTags();
    var chaptersMsg = result.chapters > 1
      ? ' موزعة على ' + toAr(result.chapters) + ' فصول.'
      : '';
    alert('تم إنشاء وسم «' + tag.name + '» في تصنيف «' + cat.name + '» وربطه بـ ' + toAr(matched.length) + ' آية' + chaptersMsg);
    renderTagArea();
  }

  function processDocument(file) {
    var isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
    var isDocx = /\.docx$/i.test(file.name) || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (!isPdf && !isDocx) {
      alert('الرجاء اختيار ملف PDF أو DOCX.');
      return;
    }
    showDocProgress('جاري تحميل المكتبات…', 0);
    var ready = Promise.resolve();
    if (isPdf && !window.pdfjsLib) ready = loadScript('lib/pdf.min.js');
    if (isDocx && !window.fflate) ready = loadScript('lib/fflate.min.js');
    ready.then(function () {
      var reader = new FileReader();
      reader.onload = function () {
        var buf = reader.result;
        var textPromise = isPdf
          ? extractPdfText(buf, function (p, m) {
            showDocProgress('يجري استخراج النص من الصفحة ' + toAr(p) + ' من ' + toAr(m) + '…', p / m);
          })
          : extractDocxText(buf);
        textPromise.then(function (out) {
          var paras = out && out.paragraphs ? out.paragraphs : [];
          var hasText = paras.some(function (p) { return paraText(p).trim(); });
          if (!paras.length || !hasText) {
            hideDocProgress();
            alert('لم يُستخرج أي نص من المستند. تأكد أن الملف نصي وليس صوراً ممسوحة ضوئياً.');
            return;
          }
          showDocProgress('جاري فحص فصول المستند…', 0);
          indexDocumentParagraphs(paras, function (ci, cn, name) {
            showDocProgress(
              'جاري مطابقة آيات الفصل ' + toAr(ci) + ' من ' + toAr(cn) + (name ? ' — ' + name : '') + '…',
              ci / cn
            );
          }, function (result) {
            finishDocumentIndex(file.name, result);
          });
        }).catch(function (err) {
          hideDocProgress();
          alert('تعذّر معالجة المستند: ' + err.message);
        });
      };
      reader.readAsArrayBuffer(file);
    }).catch(function (err) {
      hideDocProgress();
      alert('تعذّر تحميل المكتبات: ' + err.message);
    });
  }

  function importDocumentFromFile() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (file) processDocument(file);
      input.remove();
    });
    input.click();
  }

  /* ---------- licenses ---------- */

  var licensesModal = null;

  function closeLicensesModal() {
    if (licensesModal) { licensesModal.remove(); licensesModal = null; }
    document.removeEventListener('keydown', onLicensesKeydown);
  }

  function onLicensesKeydown(e) {
    if (e.key === 'Escape') closeLicensesModal();
  }

  function licensesSection(title, rowsHtml) {
    return '<div class="licenses-section"><h3>' + esc(title) + '</h3><ul>'
      + rowsHtml + '</ul></div>';
  }

  function openLicensesModal() {
    closeLicensesModal();
    var modal = document.createElement('div');
    modal.className = 'licenses-modal';

    var quranRows =
      '<li>النص القرآني كاملاً (٦٢١٤ آية) برواية <strong>قالون عن نافع</strong> منشور من <strong>مجمع الملك فهد لطباعة المصحف الشريف</strong> — منصة «تقنيات خدمة القرآن الكريم»:'
      + ' <a href="https://qurancomplex.gov.sa/en/techquran/dev/" target="_blank" rel="noopener">qurancomplex.gov.sa — صفحة المطورين</a>'
      + ' (ملف البيانات الرسمي: <code>QaloonData</code>).'
      + '</li>'
      + '<li>تعذر الاتصال بموقع المجمع أثناء الإعداد، فجُلب النص من نسخة مطابقة منشورة على GitHub:'
      + ' <a href="https://github.com/thetruetruth/quran-data-kfgqpc" target="_blank" rel="noopener">thetruetruth/quran-data-kfgqpc</a>.</li>';

    var libRows =
      '<li>pdf.js <code>3.32.2</code> — رخصة Apache-2.0 — <a href="https://github.com/mozilla/pdf.js" target="_blank" rel="noopener">github.com/mozilla/pdf.js</a></li>'
      + '<li>fflate <code>0.8.x</code> — رخصة MIT — <a href="https://github.com/101arrowz/fflate" target="_blank" rel="noopener">github.com/101arrowz/fflate</a></li>'
      + '<li>خط «قالون» الحاسوبي — <strong>مجمع الملك فهد لطباعة المصحف الشريف</strong> — <a href="https://fonts.qurancomplex.gov.sa/ten-readings" target="_blank" rel="noopener">fonts.qurancomplex.gov.sa</a></li>';

    var toolRows =
      '<li>Node.js <code>v22.23.2</code> — سكربتات بناء ومعالجة البيانات</li>'
      + '<li>Python <code>3.9.6</code> — سكربتات معالجة البيانات والخطوط</li>'
      + '<li>Google Chrome <code>151.0.7922.77</code> — اختبار تطبيق الويب (PWA) وتوليد الأيقونات</li>'
      + '<li>Git — إدارة الإصدارات</li>'
      + '<li>opencode — أداة تطوير برمجي بالذكاء الاصطناعي — <a href="https://opencode.ai" target="_blank" rel="noopener">opencode.ai</a></li>'
      + '<li>النموذج اللغوي المستخدم في هذه الجلسة: <code>big-pickle</code> (opencode/big-pickle)</li>';

    modal.innerHTML =
      '<div class="licenses-overlay"></div>'
      + '<div class="licenses-panel" role="dialog" aria-modal="true" aria-label="التراخيص والمصادر">'
      +   '<div class="licenses-head">'
      +     '<span class="licenses-title">التراخيص والمصادر</span>'
      +     '<button type="button" class="licenses-close" aria-label="إغلاق">✕</button>'
      +   '</div>'
      +   '<div class="licenses-body">'
      +     licensesSection('النص القرآني', quranRows)
      +     licensesSection('المكتبات', libRows)
      +     licensesSection('أدوات البناء', toolRows)
      +   '</div>'
      + '</div>';

    document.body.appendChild(modal);
    licensesModal = modal;
    document.addEventListener('keydown', onLicensesKeydown);
    modal.querySelector('.licenses-close').addEventListener('click', closeLicensesModal);
    modal.querySelector('.licenses-overlay').addEventListener('click', closeLicensesModal);
  }

  var licenseBtn = document.getElementById('licenseLink');
  if (licenseBtn) licenseBtn.addEventListener('click', openLicensesModal);

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

  function fmtDuration(sec) {
    sec = Math.max(0, Math.round(sec));
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    var out = h ? toAr(h) + ':' + toAr(pad(m)) + ':' + toAr(pad(s)) : toAr(m) + ':' + toAr(pad(s));
    return 'المدة: ' + out;
  }

  function surahByNumber(n) {
    return state.surahs[n - 1];
  }

  function persistLast(n) {
    localStorage.setItem(LS.last, n);
  }

  function tagChip(t) {
    var catName = t.categoryId && tagState.byCatId[t.categoryId]
      ? tagState.byCatId[t.categoryId].name : 'بدون تصنيف';
    return '<span class="tag-chip" style="--tagc:' + t.color + '" data-cat="' + esc(catName) + '">' + esc(t.name) + '</span>';
  }

  function verseTagChip(t, surah, ayah) {
    var catName = t.categoryId && tagState.byCatId[t.categoryId]
      ? tagState.byCatId[t.categoryId].name : 'بدون تصنيف';
    var hasCtx = !!(state.ayahMeta[t.id] && state.ayahMeta[t.id][surah + ':' + ayah]);
    return '<button type="button" class="tag-chip verse-tag-chip' + (hasCtx ? ' has-context' : '') + '"'
      + ' style="--tagc:' + t.color + '" data-tagid="' + t.id + '" data-ayah="' + surah + ':' + ayah + '"'
      + ' data-cat="' + esc(catName) + '" title="' + (hasCtx ? 'اضغط لعرض سياق الاستشهاد' : 'اضغط لعرض تفاصيل الوسم') + '">'
      + esc(t.name) + '</button>';
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

    var byName = function (a, b) { return norm(a.name).localeCompare(norm(b.name), 'ar'); };

    var rows = '';
    tagState.categories.slice().sort(byName).forEach(function (c) {
      var catTags = tagState.tags.filter(function (t) { return t.categoryId === c.id; }).sort(byName);
      if (!catTags.length) return;
      rows += '<div class="tag-menu-cat-group">'
        + '<div class="tag-menu-cat">'
        + '<span class="cat-arrow">&#9662;</span>'
        + '<span class="cat-dot" style="background:' + c.color + '"></span>'
        + esc(c.name)
        + '</div>'
        + '<div class="tag-menu-cat-body">';
      catTags.forEach(function (t) {
        rows += tagMenuRow(t, currentIds);
      });
      rows += '</div></div>';
    });
    var uncat = tagState.tags.filter(function (t) { return !tagState.byCatId[t.categoryId]; }).sort(byName);
    if (uncat.length) {
      rows += '<div class="tag-menu-cat-group">'
        + '<div class="tag-menu-cat">'
        + '<span class="cat-arrow">&#9662;</span>'
        + '<span class="cat-dot" style="background:var(--text-muted)"></span>'
        + 'بدون تصنيف'
        + '</div>'
        + '<div class="tag-menu-cat-body">';
      uncat.forEach(function (t) {
        rows += tagMenuRow(t, currentIds);
      });
      rows += '</div></div>';
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
      + '<div class="tag-menu-actions">'
      + '<button type="button" class="tag-menu-close">تم</button>'
      + '</div>';

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

    menu.querySelectorAll('.tag-menu-cat').forEach(function (cat) {
      cat.addEventListener('click', function (e) {
        if (e.target.closest('input')) return;
        cat.closest('.tag-menu-cat-group').classList.toggle('collapsed');
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
      var tag = createTag(name, null, catSel.value);
      toggleTagOnVerse(surah, ayah, tag.id);
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
    list.querySelectorAll('.tag-menu-cat-group').forEach(function (group) {
      var any = false;
      group.querySelectorAll('.tag-menu-row').forEach(function (row) {
        if (row.style.display !== 'none') any = true;
      });
      group.style.display = any ? '' : 'none';
      if (q && any) group.classList.remove('collapsed');
    });
    var empty = list.querySelector('.tag-menu-empty');
    if (empty) empty.style.display = visibleRows ? 'none' : '';
  }

  function tagMenuRowBody(t) {
    var desc = t.description ? '<div class="tag-desc">' + esc(t.description) + '</div>' : '';
    return '<span class="tag-menu-row-body">' + tagChip(t) + desc + '</span>';
  }

  function tagMenuRow(t, currentIds) {
    var on = currentIds.indexOf(t.id) !== -1;
    return '<label class="tag-menu-row">'
      + '<input type="checkbox" data-tagid="' + t.id + '"' + (on ? ' checked' : '') + '>'
      + tagMenuRowBody(t)
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
    if (tagContextPopup && !tagContextPopup.contains(e.target)) closeTagContextPopup();
  }, true);

  window.addEventListener('scroll', function () {
    if (tagMenu && tagMenu._anchor) positionTagMenu(tagMenu, tagMenu._anchor);
    if (tagFilterMenu && tagFilterMenu._anchor) positionTagMenu(tagFilterMenu, tagFilterMenu._anchor);
    if (tagContextPopup && tagContextPopup._anchor) positionTagMenu(tagContextPopup, tagContextPopup._anchor);
  }, true);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeTagMenu(); closeTagFilterMenu(); closeTagContextPopup(); }
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
          + tagMenuRowBody(t)
          + '</label>';
      });
      rows += '</div></div>';
    });
    if (!rows) rows = '<div class="tag-menu-empty">لا توجد وسوم بعد</div>';

    menu.innerHTML =
      '<div class="tag-menu-title">عرض الوسوم في هذه الجلسة</div>'
      + '<div class="tag-menu-list">' + rows + '</div>'
      + '<div class="tag-menu-actions">'
      + '<button type="button" class="tag-menu-none">إلغاء تحديد الكل</button>'
      + '<button type="button" class="tag-menu-close">تم</button>'
      + '</div>';

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
    menu.querySelector('.tag-menu-none').addEventListener('click', function () {
      menu.querySelectorAll('input[data-tagid]').forEach(function (cb) {
        cb.checked = false;
        cb.indeterminate = false;
      });
      updateSessionTagFilter(menu);
      syncCategoryStates(menu);
      refreshAllVerseDecorations();
    });
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
    closeTagContextPopup();
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
      chipsEl.innerHTML = tags.map(function (t) { return verseTagChip(t, surah, ayah); }).join('');
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

  var tagContextPopup = null;

  function closeTagContextPopup() {
    if (tagContextPopup) { tagContextPopup.remove(); tagContextPopup = null; }
    appEl.querySelectorAll('.verse-tag-chip.expanded').forEach(function (c) {
      c.classList.remove('expanded');
    });
  }

  function openVerseTagContext(chip) {
    closeTagContextPopup();
    var verse = chip.dataset.ayah;
    var tagId = chip.dataset.tagid;
    var meta = state.ayahMeta[tagId] && state.ayahMeta[tagId][verse];
    var t = tagState.byId[tagId];
    if (!t) return;
    var parts = verse.split(':');
    var surahName = surahByNumber(+parts[0]).nameAr;
    var catName = t.categoryId && tagState.byCatId[t.categoryId] ? tagState.byCatId[t.categoryId].name : '';

    var popup = document.createElement('div');
    popup.className = 'tag-menu tag-context-popup';
    popup.style.setProperty('--tagc', t.color);
    popup._anchor = chip;

    var head = '<div class="tag-context-popup-tags">'
      + '<span class="tag-chip" style="--tagc:' + t.color + '">' + esc(t.name) + '</span>'
      + (catName ? '<span class="tag-context-popup-cat">' + esc(catName) + '</span>' : '')
      + '</div>';
    var assoc = '<div class="tag-context-popup-assoc">استُشهد في الآية ' + toAr(+parts[1]) + ' من سورة ' + esc(surahName)
      + (meta && meta.chapter ? '<span class="tag-context-popup-chapter">' + esc(meta.chapter) + '</span>' : '')
      + (meta && meta.page ? '<span class="tag-context-popup-page">صفحة ' + toAr(meta.page) + '</span>' : '')
      + '</div>';
    var para = meta && meta.paragraph
      ? '<div class="tag-context-popup-para">' + esc(meta.paragraph) + '</div>'
      : '';
    var video = meta && meta.url
      ? '<div class="tag-context-popup-video"><a href="' + esc(meta.url) + '" target="_blank" rel="noopener">'
        + (meta.videoTitle ? esc(meta.videoTitle) : 'مشاهدة الشرح على يوتيوب') + ' ↗</a>'
        + (meta.duration ? '<span class="tag-context-popup-duration">' + fmtDuration(meta.duration) + '</span>' : '')
        + '</div>'
      : '';
    var empty = !para && !video
      ? '<div class="tag-context-popup-empty">لا يتوفر سياق مستخرج لهذه الآية في كتاب «' + esc(t.name) + '»</div>'
      : '';
    var close = '<button type="button" class="tag-context-popup-close">تم</button>';

    popup.innerHTML = head + assoc + video + para + empty + close;
    document.body.appendChild(popup);
    positionTagMenu(popup, chip);
    popup.querySelector('.tag-context-popup-close').addEventListener('click', closeTagContextPopup);
    tagContextPopup = popup;
    chip.classList.add('expanded');
  }

  function applySurahAyahFilter() {
    var nq = normAyahText(state.surahQuery).trim();
    var els = appEl.querySelectorAll('.verse[data-ayah]');
    var nv = state.quran ? normAllVerses() : null;
    var shown = 0;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var surah = +el.dataset.surah;
      var ayah = +el.dataset.ayah;
      var hit = !nq || (nv && nv[surah - 1] && nv[surah - 1][ayah - 1].indexOf(nq) !== -1);
      el.classList.toggle('verse-hidden', !hit);
      if (hit) shown++;
    }
    var countEl = document.getElementById('surahSearchCount');
    if (countEl) countEl.textContent = nq ? toAr(shown) + ' من ' + toAr(els.length) : '';
  }

  function renderVerse(q, surah, ayah, text) {
    var tags = filterVisibleTags(getVerseTags(surah, ayah));
    var chips = showTags && tags.length ? '<span class="verse-chips">' + tags.map(function (t) { return verseTagChip(t, surah, ayah); }).join('') + '</span>' : '';
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

    html += '<div class="ayah-search-wrap">';
    html += '<div class="index-toolbar">';
    html += '<div class="search-box">';
    html += '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.2" y2="16.2"/></svg>';
    html += '<input type="search" id="ayahSearch" placeholder="ابحث في آيات القرآن…" value="' + esc(state.ayahQuery) + '">';
    html += '</div>';
    html += '<span class="index-stats" id="ayahStats"></span>';
    html += '</div>';
    html += '<div id="ayahResults" class="ayah-results-popup"></div>';
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

    var ayahInput = document.getElementById('ayahSearch');
    ayahInput.addEventListener('input', function () {
      state.ayahQuery = ayahInput.value;
      renderAyahResults();
    });

    document.getElementById('ayahResults').addEventListener('click', function (e) {
      if (e.target.closest('.ayah-results-close')) {
        state.ayahQuery = '';
        ayahInput.value = '';
        renderAyahResults();
        ayahInput.focus();
      }
      var chip = e.target.closest('.verse-tag-chip');
      if (chip) openVerseTagContext(chip);
    });

    renderAyahResults();
  }

  function searchAyahs(q) {
    var nq = normAyahText(q).trim();
    if (!nq || !state.quran) return [];
    var nv = normAllVerses();
    var out = [];
    state.quran.forEach(function (ch, si) {
      ch.verses.forEach(function (text, vi) {
        if (nv[si][vi].indexOf(nq) !== -1) {
          out.push({ surah: si + 1, ayah: vi + 1, text: text });
        }
      });
    });
    return out;
  }

  function renderAyahResults() {
    var box = document.getElementById('ayahResults');
    var stats = document.getElementById('ayahStats');
    if (!box) return;
    var nq = normAyahText(state.ayahQuery).trim();
    if (!nq) {
      box.innerHTML = '';
      if (stats) stats.textContent = '';
      return;
    }
    var list = searchAyahs(state.ayahQuery);
    if (stats) stats.textContent = toAr(list.length) + ' آية';
    var html = '';
    html += '<div class="ayah-results-head">'
      + '<span>نتائج البحث في الآيات — ' + toAr(list.length) + '</span>'
      + '<button type="button" class="ayah-results-close" title="إغلاق" aria-label="إغلاق">✕</button>'
      + '</div>';
    if (list.length) {
      html += '<div class="ayah-results-body"><div class="tayah-list">';
      var shown = list.length > 200 ? 200 : list.length;
      for (var i = 0; i < shown; i++) {
        html += renderAyahCard(list[i]);
      }
      html += '</div></div>';
      if (list.length > 200) {
        html += '<div class="hint-box">يوجد ' + toAr(list.length - 200) + ' نتيجة أخرى. قم بتضييق البحث.</div>';
      }
    } else {
      html += '<div class="empty-state">لا توجد آيات مطابقة لبحثك</div>';
    }
    box.innerHTML = html;
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
    html += '<div class="search-box surah-search">';
    html += '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.2" y2="16.2"/></svg>';
    html += '<input type="search" id="surahAyahSearch" placeholder="ابحث في الآيات…" value="' + esc(state.surahQuery) + '">';
    html += '<span class="surah-search-count" id="surahSearchCount"></span>';
    html += '</div>';
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
      var chip = e.target.closest('.verse-tag-chip');
      if (chip) openVerseTagContext(chip);
    });

    var ayahSearch = document.getElementById('surahAyahSearch');
    if (ayahSearch) {
      ayahSearch.addEventListener('input', function () {
        state.surahQuery = ayahSearch.value;
        applySurahAyahFilter();
      });
    }
    applySurahAyahFilter();

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
    html += '<div class="tags-io">'
      + '<button type="button" class="io-btn" data-io="doc" title="رفع مستند (PDF أو DOCX) واستخراج الآيات منه كوسم جديد في تصنيف الكتب">رفع مستند</button>'
      + '<button type="button" class="io-btn" data-io="import" title="استيراد وسوم وتصنيفات من ملف">استيراد</button>'
      + '<button type="button" class="io-btn" data-io="export" title="تصدير الوسوم والتصنيفات والآيات الموسومة إلى ملف">تصدير</button>'
      + '</div>';
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

    var ioWrap = appEl.querySelector('.tags-io');
    if (ioWrap) ioWrap.addEventListener('click', function (e) {
      var btn = e.target.closest('.io-btn');
      if (!btn) return;
      if (btn.dataset.io === 'export') downloadTagsFile();
      else if (btn.dataset.io === 'doc') importDocumentFromFile();
      else importTagsFromFile();
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
      + '<textarea class="edit-desc" placeholder="وصف الوسم (اختياري)…" maxlength="200" rows="2">' + esc(tag.description || '') + '</textarea>'
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
      html += '<div class="empty-state">لا توجد وسوم بعد.<br>افتح أي سورة واضغط على أيقونة الوسم بجانب أي آية لإضافتها، أو أضف وسماً جديداً داخل أي تصنيف أدناه.</div>';
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
      html += '<button type="button" class="cat-tag-add" data-catid="' + c.id + '" title="إضافة وسم">+</button>';
      html += '<button type="button" class="cat-edit" data-catid="' + c.id + '" title="تعديل التصنيف">✎</button>';
      html += '<button type="button" class="cat-del" data-catid="' + c.id + '" title="حذف التصنيف">✕</button>';
      html += '</div>';
      html += '<div class="cat-tags">' + catTags.map(renderTagChipBtn).join('') + '</div>';
      if (state.edit && state.edit.type === 'newtag' && state.edit.catId === c.id) {
        html += '<div class="tag-new-inline">'
          + '<input type="text" class="edit-name tag-new-name" placeholder="اسم الوسم الجديد…" maxlength="40">'
          + '<div class="edit-colors">' + colorSwatches(TAG_COLORS[0]) + '</div>'
          + '<textarea class="edit-desc" placeholder="وصف الوسم (اختياري)…" maxlength="200" rows="2"></textarea>'
          + '<div class="edit-actions">'
          + '<button type="button" class="edit-save" data-type="newtag" data-catid="' + c.id + '">إضافة</button>'
          + '<button type="button" class="edit-cancel">إلغاء</button>'
          + '</div></div>';
      }
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

    if (state.edit && state.edit.type === 'newtag') {
      var newName = area.querySelector('.tag-new-inline .edit-name');
      if (newName) newName.focus();
    }
  }

  function handleTagAreaClick(e) {
    var swatch = e.target.closest('.swatch');
    if (swatch) {
      var panel = swatch.closest('.edit-panel, .tag-new-inline');
      panel.querySelectorAll('.swatch').forEach(function (s) { s.classList.toggle('on', s === swatch); });
      return;
    }

      var editSave = e.target.closest('.edit-save');
      if (editSave) {
        var panel = editSave.closest('.edit-panel, .tag-new-inline');
        var name = panel.querySelector('.edit-name').value.trim();
        var colorEl = panel.querySelector('.swatch.on');
        var color = colorEl ? colorEl.dataset.color : TAG_COLORS[0];
        var descEl = panel.querySelector('.edit-desc');
        var desc = descEl ? descEl.value.trim() : '';
        var type = editSave.dataset.type;
        var id = editSave.dataset.id;
        if (type === 'newcat') {
          if (name) { createCategory(name, color); state.selectedTagId = null; }
        } else if (type === 'cat') {
          if (name) updateCategory(id, { name: name, color: color });
        } else if (type === 'newtag') {
          if (name) { createTag(name, color, editSave.dataset.catid, desc); state.selectedTagId = null; }
        } else if (type === 'tag') {
          var catId = panel.querySelector('.edit-cat').value;
          if (name) updateTag(id, { name: name, color: color, categoryId: catId, description: desc });
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

    var catTagAdd = e.target.closest('.cat-tag-add');
    if (catTagAdd) {
      state.edit = { type: 'newtag', catId: catTagAdd.dataset.catid };
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

    var ctxChip = e.target.closest('.verse-tag-chip');
    if (ctxChip) {
      openVerseTagContext(ctxChip);
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
      + (tags.length ? '<div class="tayah-chips">' + tags.map(function (t) { return verseTagChip(t, a.surah, a.ayah); }).join('') + '</div>' : '')
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
    var loaded = 0;
    var total = 2 + BOOK_SEEDS.length;
    var count = function (v) {
      loaded++;
      if (window.__quranLoader) window.__quranLoader.progress(loaded / total);
      return v;
    };
    var core = Promise.all([
      fetch('data/surahs.json').then(function (r) { return r.json(); }).then(count),
      fetch('data/quran.json').then(function (r) { return r.json(); }).then(count)
    ]);
    var seeds = Promise.all(BOOK_SEEDS.map(function (src) {
      return fetch(src).then(function (r) { return r.json(); }).then(function (seed) {
        mergeSeedTag(seed);
      }).catch(function () {}).then(count);
    }));
    return Promise.all([core, seeds]).then(function (res) {
      state.surahs = res[0][0];
      state.quran = res[0][1];
    });
  }

  var BOOK_SEEDS = [
    'data/dawaa.json',
    'data/jam3.json',
    'data/iman.json',
    'data/asarar.json',
    'data/adib.json',
    'data/dirasat.json'
  ];

  loadData().then(render).then(function () {
    if (window.__quranLoader) window.__quranLoader.done();
  }).catch(function (err) {
    appEl.innerHTML = '<div class="empty-state">تعذّر تحميل البيانات: ' + esc(err.message) + '</div>';
    if (window.__quranLoader) window.__quranLoader.done();
  });
})();
