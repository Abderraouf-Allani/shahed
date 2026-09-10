(function () {
  'use strict';

  var B = window.QuranMemHideBridge;
  if (!B) return;

  var normAyahText = B.normAyahText;
  var state = B.state;

  /* Smart-hiding V1: static estimators + contract scorer (no learner data).
     Pure except normAyahText + state.quran/state.riwaya via bridge. */
var MEMV1_CHILD = { targets: { 1: 0.15, 2: 0.30, 3: 0.48, 4: 0.68, 5: 0.90 }, alpha: 0.35, beta: 0.30, maxRun: 2 };
var MEMV1_ADULT = { targets: { 1: 0.22, 2: 0.38, 3: 0.56, 4: 0.75, 5: 0.92 }, alpha: 0.20, beta: 0.20, maxRun: 3 };
var MEMV1_MORPH_PLACEHOLDER = 0.5;

var memCorpusCache = null;

/* One pass over the active dataset: unigrams, within-ayah bigrams,
   bigram→continuation map, forward fan-out, preceding-bigram multiplicity. */
function memBuildCorpusIndex() {
  if (memCorpusCache && memCorpusCache.riwaya === state.riwaya && memCorpusCache.quran === state.quran) {
    return memCorpusCache.corpus;
  }
  var uni = {}, bi = {}, cont = {}, fwd = {}, seenNext = {};
  var N = 0;
  state.quran.forEach(function (ch) {
    (ch.verses || []).forEach(function (v) {
      var toks = normAyahText(v).replace(/^\s+|\s+$/g, '').split(' ').filter(function (t) { return t.length > 0; });
      for (var i = 0; i < toks.length; i++) {
        var w = toks[i];
        N++;
        uni[w] = (uni[w] || 0) + 1;
        if (i >= 1) {
          var pv = toks[i - 1], bk = pv + '|' + w;
          bi[bk] = (bi[bk] || 0) + 1;
          if (i >= 2) {
            /* continuation of the bigram ENDING at i-1 is toks[i] */
            var B = toks[i - 2] + '|' + pv;
            var c = cont[B];
            if (!c) { c = { total: 0, next: {}, distinct: 0 }; cont[B] = c; }
            if (!c.next[w]) { c.next[w] = 0; c.distinct++; }
            c.next[w]++;
            c.total++;
          }
          var f = fwd[pv];
          if (!f) { f = { total: 0, distinct: 0 }; fwd[pv] = f; seenNext[pv] = {}; }
          if (!seenNext[pv][w]) { seenNext[pv][w] = 1; f.distinct++; }
          f.total++;
        }
      }
    });
  });
  var preCount = {}, V = 0, maxFreq = 1;
  Object.keys(uni).forEach(function (w) {
    V++;
    if (uni[w] > maxFreq) maxFreq = uni[w];
  });
  Object.keys(cont).forEach(function (bk) {
    Object.keys(cont[bk].next).forEach(function (w) {
      preCount[w] = (preCount[w] || 0) + 1;
    });
  });
  var corpus = { N: N, V: V, maxFreq: maxFreq, uni: uni, bi: bi, cont: cont, fwd: fwd, preCount: preCount };
  memCorpusCache = { riwaya: state.riwaya, quran: state.quran, corpus: corpus };
  return corpus;
}

/* Per-word P/L/A/I/G/D over memState-style sections
   [{ayahWords:[{ayah, words:[{text,hidden,...}]}]}]. Ayah-relative positions;
   n-grams never cross ayahs. */
/* V1 estimators: pure (normalized token, positional context, corpus).
   Signatures match the frozen contract: predictability / linguisticDifficulty /
   anchorValue / interference / transitionDifficulty. */
function memPredictability(t, i, toks, secCount, corpus) {
  var pr;
  if (i === 0) {
    pr = (corpus.uni[t] || 0) / corpus.N;
  } else if (i === 1) {
    pr = (corpus.bi[toks[0] + '|' + t] || 0) / Math.max(1, corpus.uni[toks[0]] || 0);
  } else {
    var ce = corpus.cont[toks[i - 2] + '|' + toks[i - 1]];
    var tri = ce ? ((ce.next[t] || 0) / ce.total) : 0;
    var bc = corpus.bi[toks[i - 1] + '|' + t] || 0;
    pr = 0.6 * tri + 0.4 * (bc / Math.max(1, corpus.uni[toks[i - 1]] || 0));
  }
  /* Section-local repetition boost (estimator-level, weights untouched). */
  return Math.max(pr, Math.min(1, ((secCount[t] || 1) - 1) / 2));
}

function memLinguistic(t, corpus) {
  var c = corpus.uni[t] || 0;
  var rarity = 1 - Math.log(1 + c) / Math.log(1 + corpus.maxFreq);
  return 0.5 * rarity + 0.3 * Math.min(1, t.length / 12) + 0.2 * MEMV1_MORPH_PLACEHOLDER;
}

function memAnchorValue(t, i, L, toks, corpus) {
  var c = corpus.uni[t] || 0;
  var boundary = (i === 0) ? 1 : ((i === L - 1) ? 0.6 : 0);
  var distinctiveness = 1 - Math.min(1, Math.log(1 + c) / Math.log(21));
  var cue = (i < L - 1 && c > 0) ? ((corpus.bi[t + '|' + toks[i + 1]] || 0) / c) : 0;
  return 0.40 * boundary + 0.30 * distinctiveness + 0.30 * cue;
}

function memInterference(t, corpus) {
  var cm = Math.min(1, Math.log(1 + (corpus.preCount[t] || 0)) / Math.log(11));
  var fw = corpus.fwd[t];
  var nm = fw ? Math.max(0, Math.min(1, (fw.distinct - 1) / 5)) : 0;
  return 0.5 * cm + 0.5 * nm;
}

/* Returns {g, amb}: continuation ambiguity + shared protection flag. */
function memTransition(t, i, toks, corpus) {
  var out = { g: 0, amb: false };
  if (i === 1) {
    var f0 = corpus.fwd[toks[0]];
    out.g = 1 - ((corpus.bi[toks[0] + '|' + t] || 0) / Math.max(1, f0 ? f0.total : 1));
  } else if (i >= 2) {
    var ce = corpus.cont[toks[i - 2] + '|' + toks[i - 1]];
    if (ce) {
      out.g = 1 - ((ce.next[t] || 0) / ce.total);
      out.amb = ce.distinct >= 2;
    }
  }
  return out;
}

function memEstimateSection(sections, corpus) {
  var secCount = {};
  var tokLists = [];
  sections.forEach(function (sec) {
    sec.ayahWords.forEach(function (aw) {
      var toks = aw.words.map(function (w) { return normAyahText(w.text).replace(/\s+/g, ''); });
      toks.forEach(function (t) { secCount[t] = (secCount[t] || 0) + 1; });
      tokLists.push(toks);
    });
  });
  var seq = 0, li = 0;
  sections.forEach(function (sec) {
    sec.ayahWords.forEach(function (aw) {
      var toks = tokLists[li++], L = toks.length;
      for (var i = 0; i < aw.words.length; i++) {
        var w = aw.words[i], t = toks[i];
        w._P = memPredictability(t, i, toks, secCount, corpus);
        w._L = memLinguistic(t, corpus);
        w._A = memAnchorValue(t, i, L, toks, corpus);
        w._I = memInterference(t, corpus);
        var tr = memTransition(t, i, toks, corpus);
        w._G = tr.g;
        w._amb = tr.amb;
        w._D = 0.30 * (1 - w._P) + 0.15 * w._L + 0.20 * w._I + 0.35 * w._G;
        w._seq = seq++;
      }
    });
  });
}

/* Difficulty target for an arbitrary rung fraction: linear interpolation
   between the profile anchors (k = frac / 0.2). Standard rungs reproduce the
   frozen k-targets exactly. */
function memTargetForFrac(prof, frac) {
  var k = Math.max(1, Math.min(5, frac / 0.2));
  var lo = Math.floor(k), hi = Math.ceil(k);
  if (lo === hi) return prof.targets[lo];
  return prof.targets[lo] + (prof.targets[hi] - prof.targets[lo]) * (k - lo);
}

function memHideScore(w, prof, target, progress, C) {
  var D = w._D;
  var dist = (D <= target) ? (target - D) : 2 * (D - target);
  var fit = 1 - Math.min(1, dist);
  return 0.60 * fit + 0.40 * (1 - D) + 0.15 * w._I * progress - prof.alpha * w._A - prof.beta * C;
}

/* Contract selection over flat word list (collectMemWords order).
   Returns words to hide now. The final rung (frac>=1) hides every remainder (explicit
   invariant); otherwise ranked pick with run/transition constraints and a
   progressive-relaxation fallback guaranteeing the exact increment. */
function memSelectHideSet(allWords, profKey, frac) {
  var prof = (profKey === 'child') ? MEMV1_CHILD : MEMV1_ADULT;
  var N = allWords.length;
  var hidden = allWords.map(function (w) { return !!w.hidden; });
  var hiddenNow = hidden.filter(function (h) { return h; }).length;
  var isFinal = frac >= 1 - 1e-9;
  if (isFinal) return allWords.filter(function (w) { return !w.hidden; });
  var need = Math.ceil(N * frac) - hiddenNow;
  if (need <= 0) return [];
  var target = memTargetForFrac(prof, frac);
  var progress = Math.max(0, Math.min(1, (frac - 0.2) / 0.8));
  var scored = [];
  allWords.forEach(function (w, idx) {
    if (w.hidden) return;
    var left = (idx > 0 && hidden[idx - 1]) ? 1 : 0;
    var right = (idx < N - 1 && hidden[idx + 1]) ? 1 : 0;
    scored.push({ w: w, idx: idx, s: memHideScore(w, prof, target, progress, (left + right) / 2) });
  });
  scored.sort(function (a, b) { return (b.s - a.s) || (a.w._seq - b.w._seq); });
  var selFlag = {}, selected = [];
  var runLenIf = function (idx) {
    var l = 0, r = 0, j = idx - 1;
    while (j >= 0 && (hidden[j] || selFlag[j])) { l++; j--; }
    j = idx + 1;
    while (j < N && (hidden[j] || selFlag[j])) { r++; j++; }
    return l + 1 + r;
  };
  var levels = [{ t: false, r: false }, { t: true, r: false }, { t: true, r: true }];
  for (var li = 0; li < levels.length && selected.length < need; li++) {
    var lv = levels[li];
    for (var si = 0; si < scored.length && selected.length < need; si++) {
      var cd = scored[si];
      if (selFlag[cd.idx]) continue;
      if (!lv.r && runLenIf(cd.idx) > prof.maxRun) continue;
      if (!lv.t && progress < 0.75 && cd.w._amb) continue;
      selFlag[cd.idx] = 1;
      selected.push(cd.w);
    }
  }
  return selected;
}

function memDefaultRungs() { return [0.2, 0.4, 0.6, 0.8, 1.0]; }

/* Regression support: falling back to `level` splices a midpoint breakpoint
   into the AHEAD interval [rungs[level], rungs[level+1]], so the onward climb
   gains a rest stop. Pure. Guards: max 12 rungs, min 0.06 gap. */
function memInsertBreakpoint(rungs, level) {
  var out = (rungs || memDefaultRungs()).slice();
  if (out.length >= 12) return out;
  if (level < 0) level = 0;
  if (level + 1 >= out.length) return out;
  var a = out[level], b = out[level + 1];
  if (!(b - a > 0.06)) return out;
  var m = Math.round(((a + b) / 2) * 100) / 100;
  out.splice(level + 1, 0, m);
  return out;
}

  window.QuranMemHide = {
    buildCorpusIndex: memBuildCorpusIndex,
    estimateSection: memEstimateSection,
    selectHideSet: memSelectHideSet,
    insertBreakpoint: memInsertBreakpoint,
    defaultRungs: memDefaultRungs,
    CHILD: MEMV1_CHILD,
    ADULT: MEMV1_ADULT
  };
})();
