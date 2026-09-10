(function () {
  'use strict';

  var B = window.QuranPlansBridge;
  if (!B) return;

  var esc = B.esc;
  var toAr = B.toAr;
  var surahByNumber = B.surahByNumber;
  var newId = B.newId;
  var showAppToast = B.showAppToast;
  var activeAyahOf = B.activeAyahOf;
  var numberingForSurah = B.numberingForSurah;
  var getAyahCount = B.getAyahCount;
  var canonAyah = B.canonAyah;
  var LS = B.LS;
  var appEl = B.appEl;

  var PLAN_TYPES = {
    read:    { label: 'قراءة',    icon: '📖' },
    listen:  { label: 'استماع',   icon: '🎧' },
    revise:  { label: 'مراجعة',   icon: '🔁' },
    memorize:{ label: 'حفظ',      icon: '🧠' }
  };

  var PLAN_REVIEW_STEPS = [1, 3, 7, 14, 30]; /* days after chunk completion */

  function plansLoad() {
    try {
      var v = JSON.parse(localStorage.getItem(LS.plans) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }

  function plansSave(plans) {
    localStorage.setItem(LS.plans, JSON.stringify(plans));
  }

  /* Hafs ayah count of a surah from the ACTIVE dataset + numbering (no hafs fetch). */
  function plansHafsCount(surah) {
    var t = numberingForSurah(surah);
    if (t) {
      var max = 0;
      for (var i = 0; i < t.length; i++) if (t[i][1] > max) max = t[i][1];
      return max;
    }
    return getAyahCount(surah);
  }

  /* Absolute hafs index of (surah, hafsAyah) across the mushaf. */
  function plansHafsAbs(surah, ayah) {
    var n = 0;
    for (var s = 1; s < surah; s++) n += plansHafsCount(s);
    return n + ayah;
  }

  function plansSurahOfAbs(abs) {
    for (var s = 1; s <= 114; s++) {
      var c = plansHafsCount(s);
      if (abs <= c) return { surah: s, ayah: abs };
      abs -= c;
    }
    return null;
  }

  /* Build canonical chunks: range [fromSurah:fromAyah, toSurah:toAyah] (hafs)
     partitioned into perDay pieces. unit: 'ayahs' (N ayahs/day) or 'surahs' (N surahs/day). */
  function plansBuildChunks(p) {
    var chunks = [];
    var i, a, e, A, B;
    if (p.unit === 'surahs') {
      for (i = p.fromSurah; i <= p.toSurah; i += p.perDay) {
        var end = Math.min(i + p.perDay - 1, p.toSurah);
        chunks.push({ from: i + ':1', to: end + ':' + plansHafsCount(end) });
      }
    } else {
      var absStart = plansHafsAbs(p.fromSurah, p.fromAyah);
      var absEnd = plansHafsAbs(p.toSurah, p.toAyah);
      for (a = absStart; a <= absEnd; a += p.perDay) {
        e = Math.min(a + p.perDay - 1, absEnd);
        A = plansSurahOfAbs(a);
        B = plansSurahOfAbs(e);
        if (!A || !B) break;
        chunks.push({ from: A.surah + ':' + A.ayah, to: B.surah + ':' + B.ayah });
      }
    }
    chunks.forEach(function (c) {
      var fs = c.from.split(':'), ts = c.to.split(':');
      var S = surahByNumber(+fs[0]);
      c.label = (+fs[0] === +ts[0])
        ? esc(S.nameAr) + ' — ' + toAr(fs[1]) + '-' + toAr(ts[1])
        : esc(S.nameAr) + ' ' + toAr(fs[1]) + ' → ' + esc(surahByNumber(+ts[0]).nameAr) + ' ' + toAr(ts[1]);
      c.ayahCount = plansChunkAyahCount(c);
    });
    return chunks;
  }

  /* Chunk endpoints converted to ACTIVE-riwaya ayahs: [{surah, from, to}] */
  function plansChunkActive(c) {
    var fs = c.from.split(':'), ts = c.to.split(':');
    var fromS = +fs[0], fromH = +fs[1], toS = +ts[0], toH = +ts[1];
    var out = [];
    for (var s = fromS; s <= toS; s++) {
      var f = (s === fromS) ? fromH : 1;
      var t = (s === toS) ? toH : plansHafsCount(s);
      if (f > t) continue;
      out.push({ surah: s, from: activeAyahOf(s, f), to: activeAyahOf(s, t) });
    }
    return out;
  }

  function plansChunkAyahCount(c) {
    var fs = c.from.split(':'), ts = c.to.split(':');
    if (+fs[0] === +ts[0]) return +ts[1] - +fs[1] + 1;
    var n = plansHafsCount(+fs[0]) - +fs[1] + 1 + (+ts[1]);
    for (var s = +fs[0] + 1; s < +ts[0]; s++) n += plansHafsCount(s);
    return n;
  }

  /* ---- spaced repetition ---- */
  function plansScheduleReview(plan, chunk) {
    chunk.done = plansDayKey(0);
    chunk.reviewIdx = 0;
    chunk.nextReview = plansDayKey(PLAN_REVIEW_STEPS[0]);
    plan.pointer = (plan.pointer || 0) + 1;
    var all = plansLoad();
    var idx = all.indexOf(plan);
    if (idx < 0) {
      /* plan object not from this load (e.g. memorize-completion path): match by id */
      for (var i = 0; i < all.length; i++) {
        if (all[i].id === plan.id) { idx = i; break; }
      }
    }
    if (idx >= 0) {
      all[idx] = plan;
      plansSave(all);
    }
  }

  function plansDayKey(offsetDays) {
    var d = new Date();
    d.setDate(d.getDate() + (offsetDays || 0));
    return d.toISOString().slice(0, 10);
  }

  function plansDaysBetween(k1, k2) {
    var a = new Date(k1 + 'T00:00:00'), b = new Date(k2 + 'T00:00:00');
    return Math.round((b - a) / 86400000);
  }

  /* ---- events ---- */
  function plansNotifyMemorizeDone() {
    var done = false;
    var all = plansLoad();
    all.forEach(function (p) {
      if ((p.type !== 'memorize' && p.type !== 'revise') || p.pointer >= (p.chunks || []).length) return;
      var c = p.chunks[p.pointer || 0];
      if (c && !c.done) {
        plansScheduleReview(p, c);
        done = true;
      }
    });
    if (done) showAppToast('أُنجز هدف حفظ اليوم — وفّقك الله');
  }

  function plansMaybeAutoplayReader(surah) {
    var flag = null;
    try { flag = sessionStorage.getItem('qaloon_plan_listen'); } catch (e) {}
    if (!flag) return;
    try { sessionStorage.removeItem('qaloon_plan_listen'); } catch (e) {}
    var parts = flag.split(':');
    if (+parts[0] !== surah) return;
    setTimeout(function () {
      try { rdrStartAudio(); } catch (e) {}
    }, 350);
  }

  /* ---- views ---- */
  function renderPlans() {
    document.title = 'الخطط — شاهد من القرآن';
    var html = '';
    html += '<div class="index-toolbar">';
    html += '<div class="nav-pills"><a class="pill" href="#/">الفهرس</a></div>';
    html += '<span class="index-stats">خطط القراءة والاستماع والمراجعة والحفظ</span>';
    html += '</div>';
    html += '<div class="plans-new">';
    html += '<button type="button" class="pill plans-add-btn" id="plansAddBtn">+ خطة جديدة</button>';
    html += '</div>';
    html += '<div id="plansArea"></div>';
    appEl.innerHTML = html;
    renderPlansArea();
    document.getElementById('plansAddBtn').addEventListener('click', function () { plansOpenForm(); });
  }

  function renderPlansArea() {
    var area = document.getElementById('plansArea');
    if (!area) return;
    var plans = plansLoad();
    if (!plans.length) {
      area.innerHTML = '<div class="empty-state">لا خطط بعد — أنشئ خطة قراءة أو استماع أو مراجعة أو حفظ.</div>';
      return;
    }
    var html = '';
    plans.forEach(function (p, i) {
      var T = PLAN_TYPES[p.type] || { label: p.type, icon: '' };
      var total = (p.chunks || []).length;
      var done = (p.chunks || []).filter(function (c) { return c.done; }).length;
      var pct = total ? Math.round(done / total * 100) : 0;
      var cur = (p.chunks || [])[p.pointer || 0];
      var finished = !cur || (p.pointer || 0) >= total;
      html += '<div class="plan-card" data-i="' + i + '">';
      html += '<div class="plan-head">';
      html += '<span class="plan-type">' + (T.icon || '') + ' ' + esc(T.label) + '</span>';
      html += '<span class="plan-target">' + toAr(p.perDay) + ' ' + (p.unit === 'surahs' ? 'سورة/يوم' : 'آية/يوم') + '</span>';
      html += '</div>';
      html += '<div class="plan-progress"><div style="width:' + pct + '%"></div></div>';
      html += '<div class="plan-meta"><span>' + toAr(done) + ' / ' + toAr(total) + ' — ' + toAr(pct) + '%</span></div>';
      if (!finished && cur && !cur.done) {
        html += '<div class="plan-current">';
        html += '<span class="plan-chunk-label">' + cur.label + '</span>';
        html += '<span class="plan-actions">';
        html += '<a class="pill" data-go="' + i + '" href="' + plansDeepLink(p, cur) + '">' + plansGoLabel(p) + '</a>';
        html += '<button type="button" class="pill" data-done="' + (p.pointer || 0) + '">أتممت</button>';
        html += '</span>';
        html += '</div>';
      } else {
        html += '<div class="plan-done-msg">✓ اكتملت الخطة</div>';
      }
      html += '<div class="plan-reviews" data-reviews="' + i + '"></div>';
      html += '<div class="plan-actions plan-foot-actions">';
      html += '<button type="button" class="pill" data-del="' + i + '">حذف الخطة</button>';
      html += '</div>';
      html += '</div>';
    });
    area.innerHTML = html;
    plans.forEach(function (p, i) { renderPlanReviews(p, i); });
    area.onclick = function (e) {
      var t = e.target.closest('button[data-done],button[data-del],button[data-review-done]');
      if (!t) return;
      var all = plansLoad();
      var i = +((t.closest('.plan-card') || {}).dataset || {}).i;
      var p = all[i];
      if (!p) return;
      if (t.dataset.done !== undefined) {
        var c = (p.chunks || [])[+t.dataset.done];
        if (c && !c.done) { plansScheduleReview(p, c); renderPlansArea(); }
      } else if (t.dataset.reviewDone !== undefined) {
        plansCompleteReview(p, +t.dataset.reviewDone);
        renderPlansArea();
      } else if (t.dataset.del !== undefined) {
        if (confirm('حذف هذه الخطة؟')) { all.splice(i, 1); plansSave(all); renderPlansArea(); }
      }
    };
    area.querySelectorAll('a[data-go]').forEach(function (a) {
      a.addEventListener('click', function () { plansOnGo(+a.dataset.go); });
    });
  }

  function renderPlanReviews(p, planIdx) {
    var el = document.querySelector('.plan-reviews[data-reviews="' + planIdx + '"]');
    if (!el) return;
    var today = plansDayKey(0);
    var rows = '';
    (p.chunks || []).forEach(function (c, ci) {
      if (!c.done || !c.nextReview || c.nextReview === 'done') return;
      if (c.nextReview <= today) {
        var late = plansDaysBetween(c.nextReview, today);
        rows += '<div class="plan-review-row">'
          + '<span class="plan-chunk-label">' + c.label + '</span>'
          + (late > 0 ? '<span class="plan-review-late">متأخرة ' + toAr(late) + ' ي</span>' : '')
          + '<button type="button" class="pill" data-review-done="' + ci + '">راجعت</button>'
          + '</div>';
      }
    });
    el.innerHTML = rows ? '<div class="plan-review-title">مراجعات اليوم</div>' + rows : '';
  }

  function plansCompleteReview(plan, ci) {
    var c = (plan.chunks || [])[ci];
    if (!c) return;
    c.reviewIdx = (c.reviewIdx || 0) + 1;
    if (c.reviewIdx >= PLAN_REVIEW_STEPS.length) {
      c.nextReview = 'done';
    } else {
      c.nextReview = plansDayKey(PLAN_REVIEW_STEPS[c.reviewIdx]);
    }
    var all = plansLoad();
    var idx = all.indexOf(plan);
    if (idx < 0) {
      for (var i = 0; i < all.length; i++) {
        if (all[i].id === plan.id) { idx = i; break; }
      }
    }
    if (idx >= 0) {
      all[idx] = plan;
      plansSave(all);
    }
  }

  function plansGoLabel(p) {
    if (p.type === 'listen') return 'استمع';
    if (p.type === 'memorize') return 'احفظ';
    if (p.type === 'revise') return 'راجع';
    return 'اقرأ';
  }

  /* Deep-link URL for a chunk. Memorize/revise go to the memorize page (session
     prefilled by plansOnGo); listen/read go to the reader at the
     chunk's first ACTIVE-riwaya ayah. */
  function plansDeepLink(p, c) {
    if (p.type === 'memorize' || p.type === 'revise') return '#/memorize';
    var segs = plansChunkActive(c);
    if (!segs.length) return '#/';
    var s = segs[0];
    return '#/surah/' + s.surah + '/' + s.from;
  }

  /* On deep-link click: listening sets the autoplay flag; memorize prefills the session. */
  function plansOnGo(i) {
    var all = plansLoad();
    var p = all[i];
    if (!p) return;
    var c = (p.chunks || [])[p.pointer || 0];
    if (!c) return;
    if (p.type === 'memorize' || p.type === 'revise') {
      plansPrefillMemorize(c);
    } else if (p.type === 'listen') {
      var segs = plansChunkActive(c);
      if (segs.length) {
        try { sessionStorage.setItem('qaloon_plan_listen', segs[0].surah + ':' + segs[0].from); } catch (e) {}
      }
    }
  }

  /* Prefill the memorize setup form via the existing canonical memSession format.
     Stores the FULL chunk (all surahs comprised) as canonical sections so the
     memorize page can show the whole range, not just the first surah. */
  function plansChunkCanonical(c) {
    var fs = c.from.split(':'), ts = c.to.split(':');
    var fromS = +fs[0], fromH = +fs[1], toS = +ts[0], toH = +ts[1];
    var out = [];
    for (var s = fromS; s <= toS; s++) {
      var f = (s === fromS) ? fromH : 1;
      var t = (s === toS) ? toH : plansHafsCount(s);
      if (f > t) continue;
      out.push({ surah: s, from: f, to: t });
    }
    return out;
  }

  function plansPrefillMemorize(c) {
    var canon = plansChunkCanonical(c);
    if (!canon.length) return;
    var first = canon[0];
    try {
      localStorage.setItem(LS.memSession, JSON.stringify({
        surah: first.surah,
        num: 'hafs',
        from: first.from,
        to: first.to,
        sections: canon,
        auto: true
      }));
    } catch (e) {}
  }

  /* ---- new-plan form ---- */
  function plansOpenForm() {
    if (document.getElementById('planFormOverlay')) return;
    var plans = plansLoad();
    if (plans.length >= 8) { showAppToast('الحد الأقصى ٨ خطط'); return; }
    var surahOptions = '';
    for (var i = 1; i <= 114; i++) {
      var s = surahByNumber(i);
      surahOptions += '<option value="' + i + '">' + toAr(i) + '. ' + esc(s.nameAr) + '</option>';
    }
    var toSurahOptions = surahOptions.replace('<option value="114"', '<option value="114" selected');
    var html = '';
    html += '<div class="plan-form-overlay" id="planFormOverlay">';
    html += '<div class="plan-form" role="dialog" aria-label="خطة جديدة">';
    html += '<h3>خطة جديدة</h3>';
    html += '<div class="plan-form-row">';
    html += '<label>النوع</label>';
    html += '<select id="planType" class="mem-select">';
    Object.keys(PLAN_TYPES).forEach(function (k) {
      html += '<option value="' + k + '">' + PLAN_TYPES[k].icon + ' ' + PLAN_TYPES[k].label + '</option>';
    });
    html += '</select>';
    html += '</div>';
    html += '<div class="plan-form-row">';
    html += '<label>التقسيم</label>';
    html += '<div class="plan-seg">';
    html += '<label class="plan-seg-opt"><input type="radio" name="planUnit" value="ayahs" checked> آيات/يوم</label>';
    html += '<label class="plan-seg-opt"><input type="radio" name="planUnit" value="surahs"> سور/يوم</label>';
    html += '</div>';
    html += '</div>';
    html += '<div class="plan-form-row">';
    html += '<label>المقدار يومياً</label>';
    html += '<input type="number" id="planPerDay" class="mem-input" min="1" max="200" value="5">';
    html += '</div>';
    html += '<div class="plan-form-row plan-range-row">';
    html += '<div><label>من سورة</label><select id="planFromSurah" class="mem-select">' + surahOptions + '</select></div>';
    html += '<div><label>من آية</label><input type="number" id="planFromAyah" class="mem-input" min="1" value="1"></div>';
    html += '</div>';
    html += '<div class="plan-form-row plan-range-row">';
    html += '<div><label>إلى سورة</label><select id="planToSurah" class="mem-select">' + toSurahOptions + '</select></div>';
    html += '<div><label>إلى آية</label><input type="number" id="planToAyah" class="mem-input" min="1" value="6"></div>';
    html += '</div>';
    html += '<div class="plan-form-actions">';
    html += '<button type="button" class="pill" id="planCancel">إلغاء</button>';
    html += '<button type="button" class="pill plan-save-btn" id="planSave">إنشاء الخطة</button>';
    html += '</div>';
    html += '</div>';
    html += '</div>';

    var wrap = document.createElement('div');
    wrap.innerHTML = html;
    var overlay = wrap.firstChild;
    document.body.appendChild(overlay);

    var fromSurah = document.getElementById('planFromSurah');
    var toSurah = document.getElementById('planToSurah');
    var fromAyah = document.getElementById('planFromAyah');
    var toAyah = document.getElementById('planToAyah');

    var syncAyahMax = function () {
      var f = +fromSurah.value, t = +toSurah.value;
      fromAyah.max = plansHafsCount(f);
      toAyah.max = plansHafsCount(t);
      fromAyah.value = Math.min(+fromAyah.value || 1, plansHafsCount(f));
      toAyah.value = Math.min(+toAyah.value || plansHafsCount(t), plansHafsCount(t));
    };
    fromSurah.addEventListener('change', syncAyahMax);
    toSurah.addEventListener('change', syncAyahMax);
    syncAyahMax();

    document.getElementById('planCancel').addEventListener('click', function () {
      overlay.remove();
    });

    document.getElementById('planSave').addEventListener('click', function () {
      var type = document.getElementById('planType').value;
      var unit = document.querySelector('input[name="planUnit"]:checked').value;
      var perDay = Math.max(1, parseInt(document.getElementById('planPerDay').value, 10) || 5);
      var fs = +fromSurah.value, ts = +toSurah.value;
      var fa = Math.max(1, parseInt(fromAyah.value, 10) || 1);
      var ta = Math.max(1, parseInt(toAyah.value, 10) || 1);
      fa = Math.min(fa, plansHafsCount(fs));
      ta = Math.min(ta, plansHafsCount(ts));
      if (fs > ts) { showAppToast('سورة البداية بعد سورة النهاية'); return; }
      if (fs === ts && fa > ta) { var tmp = fa; fa = ta; ta = tmp; }
      var plan = {
        id: newId('p'),
        type: type,
        unit: unit,
        perDay: perDay,
        fromSurah: fs, fromAyah: fa,
        toSurah: ts, toAyah: ta,
        pointer: 0,
        created: plansDayKey(0),
        chunks: plansBuildChunks({ unit: unit, perDay: perDay, fromSurah: fs, fromAyah: fa, toSurah: ts, toAyah: ta })
      };
      var all = plansLoad();
      all.push(plan);
      plansSave(all);
      overlay.remove();
      renderPlansArea();
      showAppToast('أُنشئت الخطة — ' + toAr(plan.chunks.length) + ' يوماً');
    });
  }

  window.QuranPlans = {
    render: renderPlans,
    notifyMemorizeDone: plansNotifyMemorizeDone,
    maybeAutoplayReader: plansMaybeAutoplayReader
  };
})();
