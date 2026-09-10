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

  var STRUGGLE_TARGET = 7; /* successive good ratings to graduate from «حفظ متعثر» */

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

  function plansAddDays(key, n) {
    /* UTC frame, matching plansDayKey's toISOString stamps. */
    var d = new Date(key + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + (n || 0));
    return d.toISOString().slice(0, 10);
  }

  /* Due date of the current (pointer) chunk: one chunk per day from creation.
     A chunk whose due date is before today counts as missed. */
  function plansChunkDue(p) {
    if (!p.created) return plansDayKey(0);
    return plansAddDays(p.created, p.pointer || 0);
  }

  /* Missed work across all plans: overdue daily chunks + due spaced reviews. */
  function plansDueSummary() {
    var today = plansDayKey(0);
    var out = { overdue: [], reviews: [] };
    plansLoad().forEach(function (p) {
      var chunks = p.chunks || [];
      var cur = chunks[p.pointer || 0];
      if (cur && !cur.done && (p.pointer || 0) < chunks.length) {
        var due = plansChunkDue(p);
        if (due < today) {
          out.overdue.push({ plan: p, chunk: cur, due: due, late: plansDaysBetween(due, today) });
        }
      }
      chunks.forEach(function (c, ci) {
        if (!c.done || !c.nextReview || c.nextReview === 'done') return;
        if (c.nextReview <= today) {
          out.reviews.push({ plan: p, ci: ci, chunk: c, late: plansDaysBetween(c.nextReview, today) });
        }
      });
    });
    var st = struggleLoad();
    (st && st.items || []).forEach(function (it, idx) {
      if (it.nextReview && it.nextReview <= today) {
        out.reviews.push({ struggle: true, ci: idx, chunk: it, late: plansDaysBetween(it.nextReview, today) });
      }
    });
    return out;
  }

  function plansRequestNotifications() {
    if (!('Notification' in window)) { showAppToast('التنبيهات غير مدعومة في هذا المتصفح'); return; }
    if (Notification.permission === 'granted') { showAppToast('التنبيهات مفعّلة — سننبّهك عند تفويت مهمة'); return; }
    try {
      Notification.requestPermission().then(function (perm) {
        showAppToast(perm === 'granted' ? 'تم تفعيل التنبيهات' : 'لم تُمنح صلاحية التنبيهات');
      }).catch(function () { showAppToast('تعذّر طلب صلاحية التنبيهات'); });
    } catch (e) {
      try {
        Notification.requestPermission(function (perm) {
          showAppToast(perm === 'granted' ? 'تم تفعيل التنبيهات' : 'لم تُمنح صلاحية التنبيهات');
        });
      } catch (e2) { showAppToast('تعذّر طلب صلاحية التنبيهات'); }
    }
  }

  /* ---- events ---- */
  /* extra (optional): {sections:[{surah,from,to}] canonical, fromPlan:memPlanId}
     from a plan-originated memorize session completed with the revision
     checkbox on — creates/extends the linked auto revision plan. */
  function plansNotifyMemorizeDone(extra) {
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
    if (extra && extra.fromPlan && extra.sections && extra.sections.length) {
      plansEnsureAutoRevise(extra.sections, extra.fromPlan);
    }
  }

  /* Absolute [start,end] hafs span of canonical sections. */
  function plansRangeAbs(sections) {
    var min = Infinity, max = -Infinity;
    sections.forEach(function (sec) {
      var a = plansHafsAbs(sec.surah, sec.from);
      var b = plansHafsAbs(sec.surah, sec.to);
      if (a < min) min = a;
      if (b > max) max = b;
    });
    return { start: min, end: max };
  }

  /* Create (or extend, when the new section is close: overlapping/adjacent to)
     the auto revision plan linked to a memorize plan. Chunk done/review state
     of identical ranges is preserved across the rebuild. */
  function plansEnsureAutoRevise(sections, memPlanId) {
    var all = plansLoad();
    var memPlan = null, i, p;
    for (i = 0; i < all.length; i++) {
      if (all[i].id === memPlanId) { memPlan = all[i]; break; }
    }
    var r = plansRangeAbs(sections);
    if (r.start === Infinity) return;
    var target = null, targetRange = null;
    for (i = 0; i < all.length; i++) {
      p = all[i];
      if (p.type !== 'revise' || !p.autoReviseFor || p.autoReviseFor !== memPlanId) continue;
      var pr = { start: plansHafsAbs(p.fromSurah, p.fromAyah), end: plansHafsAbs(p.toSurah, p.toAyah) };
      if (r.start <= pr.end + 1 && r.end >= pr.start - 1) { target = p; targetRange = pr; break; }
    }
    var unit = (target || memPlan || {}).unit || 'ayahs';
    var perDay = (target || memPlan || {}).perDay || 5;
    if (target) {
      var ns = Math.min(r.start, targetRange.start);
      var ne = Math.max(r.end, targetRange.end);
      if (ns === targetRange.start && ne === targetRange.end) return; /* already covered */
      var A = plansSurahOfAbs(ns), E = plansSurahOfAbs(ne);
      var oldByKey = {};
      (target.chunks || []).forEach(function (c) { oldByKey[c.from + '-' + c.to] = c; });
      var fresh = plansBuildChunks({ unit: unit, perDay: perDay, fromSurah: A.surah, fromAyah: A.ayah, toSurah: E.surah, toAyah: E.ayah });
      fresh.forEach(function (c) {
        var o = oldByKey[c.from + '-' + c.to];
        if (o && o.done) { c.done = o.done; c.reviewIdx = o.reviewIdx; c.nextReview = o.nextReview; }
      });
      target.fromSurah = A.surah; target.fromAyah = A.ayah;
      target.toSurah = E.surah; target.toAyah = E.ayah;
      target.chunks = fresh;
      target.pointer = 0;
      for (i = 0; i < fresh.length; i++) {
        if (!fresh[i].done) break;
        target.pointer = i + 1;
      }
      plansPersistPlan(target);
      showAppToast('حُدّثت خطة المراجعة التلقائية — ' + toAr(fresh.length) + ' يوماً');
      return;
    }
    if (all.length >= 8) { showAppToast('تعذّر إنشاء خطة المراجعة — الحد الأقصى ٨ خطط'); return; }
    var S = plansSurahOfAbs(r.start), T = plansSurahOfAbs(r.end);
    var plan = {
      id: newId('p'),
      type: 'revise',
      unit: unit,
      perDay: perDay,
      fromSurah: S.surah, fromAyah: S.ayah,
      toSurah: T.surah, toAyah: T.ayah,
      pointer: 0,
      created: plansDayKey(0),
      autoReviseFor: memPlanId,
      chunks: plansBuildChunks({ unit: unit, perDay: perDay, fromSurah: S.surah, fromAyah: S.ayah, toSurah: T.surah, toAyah: T.ayah })
    };
    all.push(plan);
    plansSave(all);
    showAppToast('أُنشئت خطة مراجعة تلقائية للمقطع المحفوظ — وفّقك الله');
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
    html += ' <button type="button" class="pill" id="plansNotifBtn" title="تفعيل تنبيهات المتصفح عند تفويت مهمة">🔔 التنبيهات</button>';
    html += '</div>';
    html += '<div id="plansAlert"></div>';
    html += '<div id="plansArea"></div>';
    appEl.innerHTML = html;
    renderPlansAlert();
    renderPlansArea();
    document.getElementById('plansAddBtn').addEventListener('click', function () { plansOpenForm(); });
    document.getElementById('plansNotifBtn').addEventListener('click', function () { plansRequestNotifications(); });
  }

  /* Missed-work banner at the top of the plans page. */
  function renderPlansAlert() {
    var el = document.getElementById('plansAlert');
    if (!el) return;
    var s = plansDueSummary();
    var n = s.overdue.length + s.reviews.length;
    if (!n) { el.innerHTML = ''; return; }
    var html = '<div class="plans-alert" role="alert">';
    html += '<strong>🔔 تنبيه: لديك ' + toAr(n) + ' مهمة متأخرة</strong>';
    html += '<span> (';
    var bits = [];
    if (s.overdue.length) bits.push(toAr(s.overdue.length) + ' مهمة يومية');
    if (s.reviews.length) bits.push(toAr(s.reviews.length) + ' مراجعة مستحقة');
    html += bits.join(' + ') + ') — تداركها قبل تراكمها، وفّقك الله';
    html += '</span></div>';
    el.innerHTML = html;
  }

  /* Dedicated card for the implicit «حفظ متعثر» plan (not counted in the 8). */
  function renderStruggleCard() {
    var st = struggleLoad();
    if (!st || !(st.items || []).length) return '';
    var today = plansDayKey(0);
    var html = '<div class="plan-card plan-struggle">';
    html += '<div class="plan-head">';
    html += '<span class="plan-type">⚠️ حفظ متعثر</span>';
    html += '<span class="plan-target">' + toAr(st.items.length) + ' مقطع</span>';
    html += '</div>';
    html += '<div class="plan-meta">يبقى المقطع هنا حتى تُتقنه ' + toAr(STRUGGLE_TARGET) + ' مرات متتالية</div>';
    st.items.forEach(function (it, idx) {
      var dueNow = !it.nextReview || it.nextReview <= today;
      var late = (it.nextReview && it.nextReview < today) ? plansDaysBetween(it.nextReview, today) : 0;
      html += '<div class="plan-review-row">';
      html += '<span class="plan-chunk-label">' + it.label + '</span>';
      html += '<span class="plan-streak">إتقان متتالٍ: ' + toAr(it.streak || 0) + ' / ' + toAr(STRUGGLE_TARGET) + '</span>';
      if (late > 0) html += '<span class="plan-review-late">متأخرة ' + toAr(late) + ' ي</span>';
      else if (!dueNow) html += '<span class="plan-review-wait">بعد ' + toAr(plansDaysBetween(today, it.nextReview)) + ' ي</span>';
      html += '<span class="plan-actions">';
      html += '<a class="pill" data-sgo="' + idx + '" href="#/memorize">راجع</a>';
      html += '<button type="button" class="pill" data-struggle-good="' + idx + '">أتقنت ✓</button>';
      html += '<button type="button" class="pill" data-struggle-bad="' + idx + '">تعثرت</button>';
      html += '</span></div>';
    });
    html += '</div>';
    return html;
  }

  function renderPlansArea() {
    var area = document.getElementById('plansArea');
    if (!area) return;
    var plans = plansLoad();
    var struggleHtml = renderStruggleCard();
    if (!plans.length && !struggleHtml) {
      area.innerHTML = '<div class="empty-state">لا خطط بعد — أنشئ خطة قراءة أو استماع أو مراجعة أو حفظ.</div>';
      return;
    }
    var html = struggleHtml;
    plans.forEach(function (p, i) {
      var T = PLAN_TYPES[p.type] || { label: p.type, icon: '' };
      var total = (p.chunks || []).length;
      var done = (p.chunks || []).filter(function (c) { return c.done; }).length;
      var pct = total ? Math.round(done / total * 100) : 0;
      var cur = (p.chunks || [])[p.pointer || 0];
      var finished = !cur || (p.pointer || 0) >= total;
      html += '<div class="plan-card" data-i="' + i + '">';
      html += '<div class="plan-head">';
      html += '<span class="plan-type">' + (T.icon || '') + ' ' + esc(T.label) + (p.autoReviseFor ? ' <span class="plan-auto">تلقائية</span>' : '') + '</span>';
      html += '<span class="plan-target">' + toAr(p.perDay) + ' ' + (p.unit === 'surahs' ? 'سورة/يوم' : 'آية/يوم') + '</span>';
      html += '</div>';
      html += '<div class="plan-progress"><div style="width:' + pct + '%"></div></div>';
      html += '<div class="plan-meta"><span>' + toAr(done) + ' / ' + toAr(total) + ' — ' + toAr(pct) + '%</span></div>';
      if (!finished && cur && !cur.done) {
        html += '<div class="plan-current">';
        html += '<span class="plan-chunk-label">' + cur.label + '</span>';
        var due = plansChunkDue(p);
        var lateDays = plansDaysBetween(due, plansDayKey(0));
        if (lateDays > 0) {
          html += '<span class="plan-late-badge">⏰ متأخرة ' + toAr(lateDays) + ' ي</span>';
        }
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
      var t = e.target.closest('button[data-done],button[data-del],button[data-review-good],button[data-review-bad],button[data-struggle-good],button[data-struggle-bad]');
      if (!t) return;
      if (t.dataset.struggleGood !== undefined) {
        struggleRate(+t.dataset.struggleGood, true);
        renderPlansAlert(); renderPlansArea(); return;
      }
      if (t.dataset.struggleBad !== undefined) {
        struggleRate(+t.dataset.struggleBad, false);
        renderPlansAlert(); renderPlansArea(); return;
      }
      var all = plansLoad();
      var i = +((t.closest('.plan-card') || {}).dataset || {}).i;
      var p = all[i];
      if (!p) return;
      if (t.dataset.done !== undefined) {
        var c = (p.chunks || [])[+t.dataset.done];
        if (c && !c.done) { plansScheduleReview(p, c); renderPlansAlert(); renderPlansArea(); }
      } else if (t.dataset.reviewGood !== undefined) {
        plansRateReview(i, +t.dataset.reviewGood, true);
        renderPlansAlert();
        renderPlansArea();
      } else if (t.dataset.reviewBad !== undefined) {
        plansRateReview(i, +t.dataset.reviewBad, false);
        renderPlansAlert();
        renderPlansArea();
      } else if (t.dataset.del !== undefined) {
        if (confirm('حذف هذه الخطة؟')) { all.splice(i, 1); plansSave(all); renderPlansAlert(); renderPlansArea(); }
      }
    };
    area.querySelectorAll('a[data-go]').forEach(function (a) {
      a.addEventListener('click', function () { plansOnGo(+a.dataset.go); });
    });
    area.querySelectorAll('a[data-sgo]').forEach(function (a) {
      a.addEventListener('click', function () {
        var st = struggleLoad();
        var it = st && st.items[+a.dataset.sgo];
        if (it) plansPrefillMemorize(it);
      });
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
          + '<span class="plan-actions">'
          + '<button type="button" class="pill" data-review-good="' + ci + '">أتقنت ✓</button>'
          + '<button type="button" class="pill" data-review-bad="' + ci + '">تعثرت</button>'
          + '</span>'
          + '</div>';
      }
    });
    el.innerHTML = rows ? '<div class="plan-review-title">مراجعات اليوم</div>' + rows : '';
  }

  function plansPersistPlan(plan) {
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
    return idx;
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
    plansPersistPlan(plan);
  }

  /* Complete a spaced review with a self-rating (good=true «أتقنت»).
     A bad rating advances the original schedule AND adds an extra revision
     of the section inside the implicit «حفظ متعثر» plan. */
  function plansRateReview(planIdx, ci, good) {
    var all = plansLoad();
    var p = all[planIdx];
    var c = p && (p.chunks || [])[ci];
    if (!c) return;
    plansCompleteReview(p, ci);
    if (!good) struggleAddChunk(c);
  }

  /* ---- «حفظ متعثر»: sections with bad self-ratings stay here until rated
     good STRUGGLE_TARGET successive times. Implicit single store, outside the
     8-plan limit, in canonical (hafs) numbering like everything else. */
  function struggleLoad() {
    try {
      var v = JSON.parse(localStorage.getItem(LS.struggle) || 'null');
      if (v && Array.isArray(v.items)) return v;
    } catch (e) {}
    return null;
  }

  function struggleSave(st) {
    try { localStorage.setItem(LS.struggle, JSON.stringify(st)); } catch (e) {}
  }

  function struggleEnsure() {
    var st = struggleLoad();
    if (!st) {
      st = { id: newId('st'), created: plansDayKey(0), items: [] };
      struggleSave(st);
    }
    return st;
  }

  /* Add a badly-rated section (dedupe by range; a repeat bad rating resets
     the good-streak and reschedules for tomorrow). */
  function struggleAddChunk(c) {
    var st = struggleEnsure();
    var found = null;
    for (var i = 0; i < st.items.length; i++) {
      if (st.items[i].from === c.from && st.items[i].to === c.to) { found = st.items[i]; break; }
    }
    if (found) {
      found.streak = 0;
      found.nextReview = plansDayKey(1);
      struggleSave(st);
      showAppToast('سُجِّل التعثر — بقي المقطع في «حفظ متعثر» وأُعيدت جدولته للغد');
      return;
    }
    st.items.push({
      from: c.from, to: c.to, label: c.label || (c.from + ' - ' + c.to),
      streak: 0, added: plansDayKey(0), lastRated: null,
      nextReview: plansDayKey(1)
    });
    struggleSave(st);
    showAppToast('أُضيف المقطع إلى «حفظ متعثر» — أتقنه ' + toAr(STRUGGLE_TARGET) + ' مرات متتالية ليخرج');
  }

  /* Rate one struggling revision: good increments the streak (graduation at
     STRUGGLE_TARGET removes the section), bad resets the streak to 0. */
  function struggleRate(itemIdx, good) {
    var st = struggleLoad();
    var it = st && st.items[itemIdx];
    if (!it) return;
    var today = plansDayKey(0);
    if (good) {
      it.streak = (it.streak || 0) + 1;
      it.lastRated = today;
      if (it.streak >= STRUGGLE_TARGET) {
        st.items.splice(itemIdx, 1);
        struggleSave(st);
        showAppToast('🎉 أتقنت المقطع ' + toAr(STRUGGLE_TARGET) + ' مرات متتالية — خرج من «حفظ متعثر»');
        return;
      }
      it.nextReview = plansDayKey(1);
      struggleSave(st);
      showAppToast('أحسنت — إتقان متتالٍ ' + toAr(it.streak) + ' / ' + toAr(STRUGGLE_TARGET));
    } else {
      it.streak = 0;
      it.lastRated = today;
      it.nextReview = plansDayKey(1);
      struggleSave(st);
      showAppToast('سُجِّل التعثر — أُعيدت جدولة المقطع للغد');
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
      plansPrefillMemorize(c, p.id, p.type);
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

  function plansPrefillMemorize(c, planId, planType) {
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
        auto: true,
        fromPlan: planId || null,
        planType: planType || null,
        reviseAuto: true
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
    maybeAutoplayReader: plansMaybeAutoplayReader,
    dueSummary: plansDueSummary,
    requestNotifications: plansRequestNotifications,
    ensureAutoRevise: plansEnsureAutoRevise,
    rateReview: plansRateReview,
    struggleRate: struggleRate,
    getStruggle: struggleLoad,
    struggleTarget: STRUGGLE_TARGET
  };
})();
