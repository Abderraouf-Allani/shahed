(function () {
  'use strict';

  var B = window.QuranPlansBridge;
  if (!B) return;

  var esc = B.esc;
  var surahByNumber = B.surahByNumber;
  var newId = B.newId;
  var showAppToast = B.showAppToast;
  var activeAyahEndOf = B.activeAyahEndOf;
  var countNoun = B.countNoun;
  var dayNoun = B.dayNoun;
  var startReaderAt = B.startReaderAt;
  var numberingForSurah = B.numberingForSurah;
  var getAyahCount = B.getAyahCount;
  var ayahOfNum = B.ayahOfNum;
  var ayahEndOfNum = B.ayahEndOfNum;
  var canonFromOfNum = B.canonFromOfNum;
  var canonToOfNum = B.canonToOfNum;
  var currentRiwaya = B.currentRiwaya;
  var enterRiwaya = B.enterRiwaya;
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

  /* Western digits (0-9) for missed-day notifications — not ٠-٩. */
  function toWest(n) { return String(n); }

  function plansLoad() {
    try {
      var v = JSON.parse(localStorage.getItem(LS.plans) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }

  function plansSave(plans) {
    localStorage.setItem(LS.plans, JSON.stringify(plans));
  }

  /* Riwaya a plan is numbered in: 'hafs' (canonical; the default for legacy
     plans) or 'qaloon' (plans created while the app was in qaloon mode). */
  function plansNum(p) { return (p && p.num === 'qaloon') ? 'qaloon' : 'hafs'; }

  /* Ayah count of a surah in a given riwaya's numbering. */
  function plansCountOfNum(surah, num) {
    if (num === 'qaloon') {
      var t = numberingForSurah(surah);
      if (t) return t.length;
    }
    return plansHafsCount(surah);
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

  /* Canonical hizb-division boundaries (Hafs/Medina, from data/ahzab.json):
     240 rub' START keys, plus 480 thumn' START keys (eighths of a hizb).
     Juz'=8 rub', hizb=4, half=2, thumn=½ rub'. Plans partition in these
     quanta exactly like ayahs; rendering converts to the active riwaya. */
  var plansAhzabCache = null;
  var plansAhzabPromise = null;

  function plansEnsureAhzab() {
    if (plansAhzabCache) return Promise.resolve(plansAhzabCache);
    if (!plansAhzabPromise) {
      plansAhzabPromise = fetch('data/ahzab.json').then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (d) {
        if (!d || !Array.isArray(d.rub) || d.rub.length !== 240 || !Array.isArray(d.thumn) || d.thumn.length !== 480) throw new Error('bad ahzab');
        plansAhzabCache = d;
        return plansAhzabCache;
      }).catch(function (err) { plansAhzabPromise = null; throw err; });
    }
    return plansAhzabPromise;
  }

  var PLAN_AHZAB_SPAN = { thumn: 1, rub: 1, half: 2, hizb: 4, juz: 8 };

  /* Quanta of `unit` as canonical hafs abs spans [{start, end}]. */
  function plansAhzabQuanta(unit) {
    var rub = plansAhzabCache.rub || plansAhzabCache;
    var total = plansHafsAbs(114, plansHafsCount(114));
    var out = [];
    if (unit === 'thumn') {
      var thumn = plansAhzabCache.thumn || rub;
      var n = thumn.length;
      for (var t = 0; t < n; t++) {
        var ts = plansHafsAbs(thumn[t][0], thumn[t][1]);
        var te = (t + 1 < n) ? plansHafsAbs(thumn[t + 1][0], thumn[t + 1][1]) - 1 : total;
        out.push({ start: ts, end: te });
      }
      return out;
    }
    var per = PLAN_AHZAB_SPAN[unit] || 1;
    for (var k = 0; k < 240; k += per) {
      var start = plansHafsAbs(rub[k][0], rub[k][1]);
      var end = (k + per < 240) ? plansHafsAbs(rub[k + per][0], rub[k + per][1]) - 1 : total;
      out.push({ start: start, end: end });
    }
    return out;
  }

  var PLAN_UNIT_LABELS = {
    ayahs:  { one: 'آية/يوم', two: 'آيتان/يوم', few: 'آيات/يوم' },
    thumn:  { one: 'ثمن/يوم', two: 'ثمنان/يوم', few: 'أثمان/يوم' },
    rub:    { one: 'ربع/يوم', two: 'ربعان/يوم', few: 'أرباع/يوم' },
    half:   { one: 'نصف/يوم', two: 'نصفان/يوم', few: 'أنصاف/يوم' },
    hizb:   { one: 'حزب/يوم', two: 'حزبان/يوم', few: 'أحزاب/يوم' },
    juz:    { one: 'جزء/يوم', two: 'جزآن/يوم', few: 'أجزاء/يوم' },
    surahs: { one: 'سورة/يوم', two: 'سورتان/يوم', few: 'سور/يوم' }
  };

  function plansUnitLabel(unit, perDay) {
    var L = PLAN_UNIT_LABELS[unit] || PLAN_UNIT_LABELS.ayahs;
    return countNoun(perDay, toWest, L.one, L.two, L.few);
  }

  /* Build canonical chunks: range [fromSurah:fromAyah, toSurah:toAyah] (hafs)
     partitioned into perDay pieces. unit: 'ayahs', 'surahs', or an ahzab
     quantum ('thumn'/'rub'/'half'/'hizb'/'juz', grouped and clipped to the range). */
  function plansBuildChunks(p) {
    var chunks = [];
    var i, a, e, A, B;
    var num = plansNum(p);
    if (PLAN_AHZAB_SPAN[p.unit]) {
      if (!plansAhzabCache) throw new Error('ahzab-missing');
      var absStart = plansHafsAbs(p.fromSurah, p.fromAyah);
      var absEnd = plansHafsAbs(p.toSurah, p.toAyah);
      var quanta = plansAhzabQuanta(p.unit);
      var qi = 0;
      while (qi < quanta.length && quanta[qi].end < absStart) qi++;
      for (; qi < quanta.length; qi += p.perDay) {
        var lastQ = Math.min(qi + p.perDay - 1, quanta.length - 1);
        var qs = Math.max(quanta[qi].start, absStart);
        var qe = Math.min(quanta[lastQ].end, absEnd);
        if (qs > qe) break;
        A = plansSurahOfAbs(qs);
        B = plansSurahOfAbs(qe);
        if (!A || !B) break;
        chunks.push({ from: A.surah + ':' + A.ayah, to: B.surah + ':' + B.ayah });
        if (qe >= absEnd) break;
      }
    } else if (p.unit === 'surahs') {
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
        ? esc(S.nameAr) + ' — ' + toWest(ayahOfNum(+fs[0], +fs[1], num)) + '-' + toWest(ayahEndOfNum(+ts[0], +ts[1], num))
        : esc(S.nameAr) + ' ' + toWest(ayahOfNum(+fs[0], +fs[1], num)) + ' → ' + esc(surahByNumber(+ts[0]).nameAr) + ' ' + toWest(ayahEndOfNum(+ts[0], +ts[1], num));
      c.ayahCount = plansChunkAyahCount(c);
    });
    return chunks;
  }

  /* Chunk endpoints converted to a target riwaya's ayahs: [{surah, from, to}].
     Pass the plan's pinned riwaya (plansNum(p)); defaults to hafs/canonical. */
  function plansChunkActive(c, num) {
    var fs = c.from.split(':'), ts = c.to.split(':');
    var fromS = +fs[0], fromH = +fs[1], toS = +ts[0], toH = +ts[1];
    var out = [];
    for (var s = fromS; s <= toS; s++) {
      var f = (s === fromS) ? fromH : 1;
      var t = (s === toS) ? toH : plansHafsCount(s);
      if (f > t) continue;
      out.push({ surah: s, from: ayahOfNum(s, f, num), to: ayahEndOfNum(s, t, num) });
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
    plansPersistPlan(plan);
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

  /* Shift a plan's timeline so its current (pointer) chunk becomes due today,
     used when the plan fell more than 2 days behind. Keeps the same per-day
     cadence going forward; completed chunks and review schedules are untouched. */
  function plansReschedule(i) {
    var all = plansLoad();
    var p = all[i];
    if (!p || !p.created) return;
    p.created = plansAddDays(plansDayKey(0), -(p.pointer || 0));
    plansSave(all);
    showAppToast('أُعيدت جدولة الخطة — المقطع الحالي مستحق اليوم، وفّقك الله');
  }

  /* Start a new iteration of a finished plan: same type/unit/pace/range/
     riwaya, fresh chunks and review ladder, created today. Auto-revise
     linkage is dropped — the copy is a standalone plan. */
  function plansRepeatPlan(planIdx) {
    var all = plansLoad();
    var p = all[planIdx];
    if (!p) return;
    if (all.length >= 8) { showAppToast('الحد الأقصى ٨ خطط'); return; }
    var mkRepeat = function () {
      var num = plansNum(p);
      var plan = {
        id: newId('p'),
        type: p.type,
        unit: p.unit,
        perDay: p.perDay,
        num: num,
        fromSurah: p.fromSurah, fromAyah: p.fromAyah,
        toSurah: p.toSurah, toAyah: p.toAyah,
        pointer: 0,
        created: plansDayKey(0),
        chunks: plansBuildChunks({ unit: p.unit, perDay: p.perDay, num: num, fromSurah: p.fromSurah, fromAyah: p.fromAyah, toSurah: p.toSurah, toAyah: p.toAyah })
      };
      var fresh = plansLoad();
      fresh.push(plan);
      plansSave(fresh);
      renderPlansAlert();
      renderPlansArea();
      showAppToast('بدأت جولة جديدة من الخطة — وفّقك الله');
    };
    if (PLAN_AHZAB_SPAN[p.unit]) {
      plansEnsureAhzab().then(mkRepeat).catch(function () {
        showAppToast('تعذّر تحميل حدود الأرباع — تحقق من الاتصال وحاول مجدداً');
      });
    } else {
      mkRepeat();
    }
  }

  /* Spread a plan's currently-due spaced reviews one per day starting
     tomorrow, oldest first — for when the «مراجعات اليوم» pile grows too
     big. Future-scheduled reviews are untouched; the review ladder
     (reviewIdx) is preserved, only nextReview dates move. */
  function plansSpreadReviews(planIdx) {
    var all = plansLoad();
    var p = all[planIdx];
    if (!p) return;
    var today = plansDayKey(0);
    var due = [];
    (p.chunks || []).forEach(function (c) {
      if (c.done && c.nextReview && c.nextReview !== 'done' && c.nextReview <= today) due.push(c);
    });
    if (!due.length) return;
    due.sort(function (a, b) { return a.nextReview < b.nextReview ? -1 : (a.nextReview > b.nextReview ? 1 : 0); });
    due.forEach(function (c, k) {
      c.nextReview = plansAddDays(today, k + 1);
    });
    plansPersistPlan(p);
    showAppToast('وُزّعت ' + countNoun(due.length, toWest, 'مراجعة مستحقة', 'مراجعتان مستحقتان', 'مراجعات مستحقة') + ' على الأيام القادمة — واحدة يومياً بدءاً من الغد، وفّقك الله');
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
      plansEnsureAutoRevise(extra.sections, extra.fromPlan, extra.num);
    }
  }

  /* Manual "mark plan done" from the memorize controls: checks off the chunk
     of a SPECIFIC plan (the one whose id landed in memSession.fromPlan), same
     bookkeeping as the plans-page «أتممت» pill. Returns true when it checked
     something off. */
  function plansMarkPlanChunkDone(planId) {
    if (!planId) return false;
    var all = plansLoad();
    for (var i = 0; i < all.length; i++) {
      var p = all[i];
      if (p.id !== planId) continue;
      if (p.type !== 'memorize' && p.type !== 'revise') return false;
      if (p.pointer >= (p.chunks || []).length) return false;
      var c = p.chunks[p.pointer || 0];
      if (!c || c.done) return false;
      plansScheduleReview(p, c);
      return true;
    }
    return false;
  }

  /* Rate the chunk a plan-originated memorize session is carrying (good=true
     «أتقنت» / false «تعثرت»), mirroring the plans-page review-row rating:
     a not-yet-done chunk is checked off (schedule next review, and a bad
     rating also re-adds the section to «حفظ متعثر»); an already-done chunk
     advances through its spaced-review steps (bad → struggle too). The chunk
     is identified by the canonical key carried in the session, falling back
     to the plan's pointer chunk. Returns true when it rated something. */
  function plansRatePlanChunk(planId, key, good) {
    if (!planId) return false;
    var all = plansLoad();
    for (var i = 0; i < all.length; i++) {
      var p = all[i];
      if (p.id !== planId) continue;
      if (p.type !== 'memorize' && p.type !== 'revise') return false;
      if (p.pointer >= (p.chunks || []).length) return false;
      var ci = -1;
      if (key) {
        for (var j = 0; j < (p.chunks || []).length; j++) {
          if ((p.chunks[j].from + '|' + p.chunks[j].to) === key) { ci = j; break; }
        }
      }
      if (ci < 0) ci = p.pointer || 0;
      var c = p.chunks && p.chunks[ci];
      if (!c) return false;
      if (c.done) {
        plansRateReview(i, ci, good);
      } else {
        plansScheduleReview(p, c);
        if (!good) struggleAddChunk(c);
      }
      return true;
    }
    return false;
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
  function plansEnsureAutoRevise(sections, memPlanId, num) {
    var all = plansLoad();
    var memPlan = null, i, p;
    for (i = 0; i < all.length; i++) {
      if (all[i].id === memPlanId) { memPlan = all[i]; break; }
    }
    num = num || (memPlan && plansNum(memPlan)) || 'hafs';
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
    if (PLAN_AHZAB_SPAN[unit] && !plansAhzabCache) {
      plansEnsureAhzab().then(function () {
        plansEnsureAutoRevise(sections, memPlanId, num);
      }).catch(function () {
        showAppToast('تعذّر تحميل حدود الأرباع — أُجّلت خطة المراجعة');
      });
      return;
    }
    if (target) {
      var ns = Math.min(r.start, targetRange.start);
      var ne = Math.max(r.end, targetRange.end);
      if (ns === targetRange.start && ne === targetRange.end) return; /* already covered */
      var A = plansSurahOfAbs(ns), E = plansSurahOfAbs(ne);
      var oldByKey = {};
      (target.chunks || []).forEach(function (c) { oldByKey[c.from + '-' + c.to] = c; });
      var fresh = plansBuildChunks({ unit: unit, perDay: perDay, num: num, fromSurah: A.surah, fromAyah: A.ayah, toSurah: E.surah, toAyah: E.ayah });
      fresh.forEach(function (c) {
        var o = oldByKey[c.from + '-' + c.to];
        if (o && o.done) { c.done = o.done; c.reviewIdx = o.reviewIdx; c.nextReview = o.nextReview; }
      });
      target.fromSurah = A.surah; target.fromAyah = A.ayah;
      target.toSurah = E.surah; target.toAyah = E.ayah;
      target.num = num;
      target.chunks = fresh;
      target.pointer = 0;
      for (i = 0; i < fresh.length; i++) {
        if (!fresh[i].done) break;
        target.pointer = i + 1;
      }
      plansPersistPlan(target);
      showAppToast('حُدّثت خطة المراجعة التلقائية — ' + dayNoun(fresh.length, toWest));
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
      num: num,
      chunks: plansBuildChunks({ unit: unit, perDay: perDay, num: num, fromSurah: S.surah, fromAyah: S.ayah, toSurah: T.surah, toAyah: T.ayah })
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
    if (+parts[0] !== surah || !startReaderAt) return;
    var from = +parts[1] || 1;
    setTimeout(function () {
      try { startReaderAt(from); } catch (e) {}
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
    plansEnsureAhzab().catch(function () {});
    renderPlansAlert();
    renderPlansArea();
    document.getElementById('plansAddBtn').addEventListener('click', function () { plansOpenForm(); });
    document.getElementById('plansNotifBtn').addEventListener('click', function () { plansRequestNotifications(); });
  }

  /* Missed-work banner at the top of the plans page. */
  function renderPlansAlert() {
    try { if (B.refreshDueBadge) B.refreshDueBadge(); } catch (e) {}
    var el = document.getElementById('plansAlert');
    if (!el) return;
    var s = plansDueSummary();
    var n = s.overdue.length + s.reviews.length;
    if (!n) { el.innerHTML = ''; return; }
    var html = '<div class="plans-alert" role="alert">';
    html += '<strong>🔔 تنبيه: ' + countNoun(n, toWest, 'لديك مهمة متأخرة', 'لديك مهمتان متأخرتان', 'لديك مهام متأخرة') + '</strong>';
    html += '<span> (';
    var bits = [];
    if (s.overdue.length) bits.push(countNoun(s.overdue.length, toWest, 'مهمة يومية', 'مهمتان يوميتان', 'مهام يومية'));
    if (s.reviews.length) bits.push(countNoun(s.reviews.length, toWest, 'مراجعة مستحقة', 'مراجعتان مستحقتان', 'مراجعات مستحقة'));
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
    html += '<span class="plan-target">' + countNoun(st.items.length, toWest, 'مقطع', 'مقطعان', 'مقاطع') + '</span>';
    html += '</div>';
    html += '<div class="plan-meta">يبقى المقطع هنا حتى تُتقنه ' + countNoun(STRUGGLE_TARGET, toWest, 'مرة متتالية', 'مرتين متتاليتين', 'مرات متتالية') + '</div>';
    st.items.forEach(function (it, idx) {
      var dueNow = !it.nextReview || it.nextReview <= today;
      var late = (it.nextReview && it.nextReview < today) ? plansDaysBetween(it.nextReview, today) : 0;
      html += '<div class="plan-review-row">';
      html += '<span class="plan-review-info"><span class="plan-chunk-label">' + it.label + '</span>';
      html += '<span class="plan-streak">إتقان متتالٍ: ' + toWest(it.streak || 0) + ' / ' + toWest(STRUGGLE_TARGET) + '</span>';
      if (late > 0) html += '<span class="plan-review-late">' + dayNoun(late, toWest, 'متأخرة ') + '</span>';
      else if (!dueNow) html += '<span class="plan-review-wait">' + dayNoun(plansDaysBetween(today, it.nextReview), toWest, 'بعد ') + '</span>';
      html += '</span>';
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
      html += '<span class="plan-type">' + (T.icon || '') + ' ' + esc(T.label) + (p.autoReviseFor ? ' <span class="plan-auto">تلقائية</span>' : '') + (plansNum(p) === 'qaloon' ? ' <span class="plan-riwaya">قالون</span>' : '') + '</span>';
      html += '<span class="plan-target">' + plansUnitLabel(p.unit, p.perDay) + '</span>';
      html += '</div>';
      html += '<div class="plan-progress"><div style="width:' + pct + '%"></div></div>';
      html += '<div class="plan-meta"><span>' + toWest(done) + ' / ' + toWest(total) + ' — ' + toWest(pct) + '%</span></div>';
      if (!finished && cur && !cur.done) {
        html += '<div class="plan-current">';
        html += '<span class="plan-chunk-label">' + cur.label + '</span>';
        var due = plansChunkDue(p);
        var lateDays = plansDaysBetween(due, plansDayKey(0));
        if (lateDays > 0) {
          html += '<span class="plan-late-badge">⏰ ' + dayNoun(lateDays, toWest, 'متأخرة ') + '</span>';
        }
        html += '<span class="plan-actions">';
        html += '<a class="pill" data-go="' + i + '" href="' + plansDeepLink(p, cur) + '">' + plansGoLabel(p) + '</a>';
        html += '<button type="button" class="pill" data-done="' + (p.pointer || 0) + '">أتممت</button>';
        html += '</span>';
        if (lateDays > 2) {
          /* Deeply overdue: offer to shift the whole plan timeline so the
             current chunk becomes due today. */
          html += '<div class="plan-resched"><span class="plan-resched-msg">تأخرت ' + dayNoun(lateDays, toWest, '') + ' — هل تعيد جدولة الخطة لتبدأ من اليوم؟</span>'
            + '<button type="button" class="pill plan-resched-btn" data-resched="' + i + '">أعد جدولتها</button></div>';
        }
        html += '</div>';
      } else {
        html += '<div class="plan-done-msg">✓ اكتملت الخطة</div>';
        /* Finished plans offer a fresh iteration: same type/pace/range,
           new chunk and review state, created today. */
        html += '<div class="plan-repeat"><span class="plan-repeat-msg">أحسنت! هل تبدأ جولة جديدة من نفس الخطة؟</span>'
          + '<button type="button" class="pill plan-repeat-btn" data-repeat="' + i + '">ابدأ جولة جديدة</button></div>';
      }
      html += '<div class="plan-reviews" data-reviews="' + i + '"></div>';
      html += '<div class="plan-actions plan-foot-actions">';
      html += '<button type="button" class="pill plan-del-btn" data-del="' + i + '">حذف الخطة</button>';
      html += '</div>';
      html += '</div>';
    });
    area.innerHTML = html;
    plans.forEach(function (p, i) { renderPlanReviews(p, i); });
    area.onclick = function (e) {
      var t = e.target.closest('button[data-done],button[data-del],button[data-resched],button[data-rev-spread],button[data-repeat],button[data-review-good],button[data-review-bad],button[data-review-plain],button[data-struggle-good],button[data-struggle-bad]');
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
      } else if (t.dataset.reviewPlain !== undefined) {
        plansCompleteReview(p, +t.dataset.reviewPlain);
        renderPlansAlert();
        renderPlansArea();
      } else if (t.dataset.del !== undefined) {
        if (confirm('حذف هذه الخطة؟')) { all.splice(i, 1); plansSave(all); renderPlansAlert(); renderPlansArea(); }
      } else if (t.dataset.resched !== undefined) {
        plansReschedule(+t.dataset.resched);
        renderPlansAlert(); renderPlansArea();
      } else if (t.dataset.revSpread !== undefined) {
        plansSpreadReviews(i);
        renderPlansAlert(); renderPlansArea();
      } else if (t.dataset.repeat !== undefined) {
        plansRepeatPlan(i);
      }
    };
    area.querySelectorAll('a[data-go]').forEach(function (a) {
      a.addEventListener('click', function (e) { plansOnGo(+a.dataset.go, e); });
    });
    area.querySelectorAll('a[data-sgo]').forEach(function (a) {
      a.addEventListener('click', function () {
        var st = struggleLoad();
        var it = st && st.items[+a.dataset.sgo];
        if (it) plansPrefillMemorize(it);
      });
    });
    area.querySelectorAll('a[data-rgo]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var card = a.closest('.plan-card');
        var all = plansLoad();
        var p = all && all[+card.dataset.i];
        if (!p) return;
        plansExecute(p, (p.chunks || [])[+a.dataset.rgo], e);
      });
    });
  }

  /* Quality self-rating (good/bad) applies to memorize/revise reviews only.
     Read/listen reviews complete with a single neutral button: no rating,
     and never a struggle-plan entry. */
  function renderPlanReviews(p, planIdx) {
    var el = document.querySelector('.plan-reviews[data-reviews="' + planIdx + '"]');
    if (!el) return;
    var today = plansDayKey(0);
    var rated = (p.type === 'memorize' || p.type === 'revise');
    var rows = '', dueCount = 0;
    (p.chunks || []).forEach(function (c, ci) {
      if (!c.done || !c.nextReview || c.nextReview === 'done') return;
      if (c.nextReview <= today) {
        dueCount++;
        var late = plansDaysBetween(c.nextReview, today);
        rows += '<div class="plan-review-row">'
          + '<span class="plan-review-info"><span class="plan-chunk-label">' + c.label + '</span>'
          + (late > 0 ? '<span class="plan-review-late">' + dayNoun(late, toWest, 'متأخرة ') + '</span>' : '')
          + '</span>'
          + '<a class="pill plan-review-go" href="' + plansDeepLink(p, c) + '" data-rgo="' + ci + '">' + plansGoLabel(p) + '</a>'
          + '<span class="plan-actions">'
          + (rated
            ? '<button type="button" class="pill" data-review-good="' + ci + '">أتقنت ✓</button>'
              + '<button type="button" class="pill" data-review-bad="' + ci + '">تعثرت</button>'
            : '<button type="button" class="pill" data-review-plain="' + ci + '">راجعت</button>')
          + '</span>'
          + '</div>';
      }
    });
    el.innerHTML = rows
      ? '<div class="plan-review-title">مراجعات اليوم</div>' + rows
        + '<button type="button" class="pill plan-spread-btn" data-rev-spread>أعد جدولة المراجعات (' + toWest(dueCount) + ') — واحدة يومياً بدءاً من الغد</button>'
      : '';
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
    showAppToast('أُضيف المقطع إلى «حفظ متعثر» — أتقنه ' + countNoun(STRUGGLE_TARGET, toWest, 'مرة متتالية', 'مرتين متتاليتين', 'مرات متتالية') + ' ليخرج');
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
        showAppToast('🎉 أتقنت المقطع ' + countNoun(STRUGGLE_TARGET, toWest, 'مرة متتالية', 'مرتين متتاليتين', 'مرات متتالية') + ' — خرج من «حفظ متعثر»');
        return;
      }
      it.nextReview = plansDayKey(1);
      struggleSave(st);
      showAppToast('أحسنت — إتقان متتالٍ ' + toWest(it.streak) + ' / ' + toWest(STRUGGLE_TARGET));
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
    var segs = plansChunkActive(c, plansNum(p));
    if (!segs.length) return '#/';
    var s = segs[0];
    return '#/surah/' + s.surah + '/' + s.from;
  }

  /* Prepare the plan state so the deep-link target works: listening sets the
     autoplay flag, memorize/revise prefill the session. Shared by the plan-level
     go pill and the per-review-row chunk action. */
  function plansPrepareChunk(p, c) {
    if (!c) return;
    if (p.type === 'memorize' || p.type === 'revise') {
      plansPrefillMemorize(c, p.id, p.type, plansNum(p));
    } else if (p.type === 'listen') {
      var segs = plansChunkActive(c, plansNum(p));
      if (segs.length) {
        try { sessionStorage.setItem('qaloon_plan_listen', segs[0].surah + ':' + segs[0].from); } catch (e) {}
      }
    }
  }

  /* Engage a plan chunk end-to-end: prepare the target (session prefill /
     listening flag), switch the app to the plan's pinned riwaya, then navigate
     to the deep-link so the reader/memorize page renders in that riwaya. */
  function plansExecute(p, c, ev) {
    if (!p || !c) return;
    if (ev && ev.preventDefault) ev.preventDefault();
    plansPrepareChunk(p, c);
    var link = plansDeepLink(p, c);
    enterRiwaya(plansNum(p)).then(function () {
      location.hash = link;
    }).catch(function () {
      showAppToast('تعذّر تحميل مصحف رواية حفص — أُبقيت الخطة برواية قالون');
    });
  }

  function plansOnGo(i, ev) {
    var all = plansLoad();
    var p = all[i];
    if (!p) return;
    plansExecute(p, (p.chunks || [])[p.pointer || 0], ev);
  }

  /* Reader shortcut: "mark this plan chunk done" fired from the read/listen
     plan-end ayah menu in the surah page (same action as the plans-page
     «أتممت» pill). The chunk is the one whose end ayah (in the ACTIVE
     riwaya) corresponds to the given surah:ayah. Returns true when a plan
     was actually checked off. */
  function plansMarkChunkDoneFromReader(surah, ayah) {
    var all = plansLoad();
    var marked = false;
    all.forEach(function (p) {
      if (p.type !== 'read' && p.type !== 'listen') return;
      var c = (p.chunks || [])[p.pointer || 0];
      if (!c || c.done || !c.to) return;
      var parts = String(c.to).split(':');
      if (+parts[0] !== surah) return;
      if (activeAyahEndOf(surah, +parts[1]) !== ayah) return;
      plansScheduleReview(p, c);
      marked = true;
    });
    return marked;
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

  function plansPrefillMemorize(c, planId, planType, num) {
    var canon = plansChunkCanonical(c);
    if (!canon.length) return;
    var first = canon[0];
    /* pinned records which riwaya the session should DISPLAY in; the
       canonical num:'hafs' marker still holds because sections are stored
       in canonical (hafs) numbering. */
    var pinned = num || currentRiwaya();
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
        pinned: pinned,
        memKey: (c.from + '|' + c.to)
      }));
    } catch (e) {}
  }

  /* ---- new-plan form ---- */
  function plansOpenForm() {
    if (document.getElementById('planFormOverlay')) return;
    var plans = plansLoad();
    if (plans.length >= 8) { showAppToast('الحد الأقصى ٨ خطط'); return; }
    /* The new plan is numbered in the current app riwaya (auto-captured). */
    var formNum = currentRiwaya();
    var surahOptions = '';
    for (var i = 1; i <= 114; i++) {
      var s = surahByNumber(i);
      surahOptions += '<option value="' + i + '">' + toWest(i) + '. ' + esc(s.nameAr) + '</option>';
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
    html += '<label class="plan-seg-opt"><input type="radio" name="planUnit" value="thumn"> ثمن/يوم</label>';
    html += '<label class="plan-seg-opt"><input type="radio" name="planUnit" value="rub"> ربع/يوم</label>';
    html += '<label class="plan-seg-opt"><input type="radio" name="planUnit" value="half"> نصف/يوم</label>';
    html += '<label class="plan-seg-opt"><input type="radio" name="planUnit" value="hizb"> حزب/يوم</label>';
    html += '<label class="plan-seg-opt"><input type="radio" name="planUnit" value="juz"> جزء/يوم</label>';
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
      fromAyah.max = plansCountOfNum(f, formNum);
      toAyah.max = plansCountOfNum(t, formNum);
      fromAyah.value = Math.min(+fromAyah.value || 1, plansCountOfNum(f, formNum));
      toAyah.value = Math.min(+toAyah.value || plansCountOfNum(t, formNum), plansCountOfNum(t, formNum));
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
      fa = Math.min(fa, plansCountOfNum(fs, formNum));
      ta = Math.min(ta, plansCountOfNum(ts, formNum));
      if (fs > ts) { showAppToast('سورة البداية بعد سورة النهاية'); return; }
      if (fs === ts && fa > ta) { var tmp = fa; fa = ta; ta = tmp; }
      /* Store the range in canonical (hafs) keys; convert the typed (plan-riwaya)
         boundaries to canonical so chunk keys/reviews stay riwaya-stable. */
      var faCanon = canonFromOfNum(fs, fa, formNum);
      var taCanon = canonToOfNum(ts, ta, formNum);
      var mkPlan = function () {
        var plan = {
          id: newId('p'),
          type: type,
          unit: unit,
          perDay: perDay,
          num: formNum,
          fromSurah: fs, fromAyah: faCanon,
          toSurah: ts, toAyah: taCanon,
          pointer: 0,
          created: plansDayKey(0),
          chunks: plansBuildChunks({ unit: unit, perDay: perDay, num: formNum, fromSurah: fs, fromAyah: faCanon, toSurah: ts, toAyah: taCanon })
        };
        var all = plansLoad();
        all.push(plan);
        plansSave(all);
        overlay.remove();
        renderPlansAlert();
        renderPlansArea();
        showAppToast('أُنشئت الخطة — ' + dayNoun(plan.chunks.length, toWest));
      };
      if (PLAN_AHZAB_SPAN[unit]) {
        plansEnsureAhzab().then(mkPlan).catch(function () {
          showAppToast('تعذّر تحميل حدود الأرباع — تحقق من الاتصال وحاول مجدداً');
        });
      } else {
        mkPlan();
      }
    });
  }

  window.QuranPlans = {
    render: renderPlans,
    notifyMemorizeDone: plansNotifyMemorizeDone,
    maybeAutoplayReader: plansMaybeAutoplayReader,
    dueSummary: plansDueSummary,
    requestNotifications: plansRequestNotifications,
    ensureAutoRevise: plansEnsureAutoRevise,
    ensureAhzab: plansEnsureAhzab,
    unitLabel: plansUnitLabel,
    buildChunks: plansBuildChunks,
    rateReview: plansRateReview,
    markChunkDoneFromReader: plansMarkChunkDoneFromReader,
    markPlanChunkDone: plansMarkPlanChunkDone,
    ratePlanChunk: plansRatePlanChunk,
    struggleRate: struggleRate,
    getStruggle: struggleLoad,
    struggleTarget: STRUGGLE_TARGET
  };
})();
