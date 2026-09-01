# AGENTS.md — «شاهد من القرآن» (quran-tag)

Vanilla static Quran PWA (no build step, no frameworks). Arabic-first UI.

## Repo map
- `index.html`, `app.js`, `styles.css` — main app (plain JS, `var`-style ES5 to match file conventions).
- `lab.js` — lab graph helpers.
- `data/quran.json` — per-surah `{ name, verses[] }`. **Ayah arrays exclude the basmala** (surah 2 has 285 verses). App indexes text as `verses[ayahNumber-1]` everywhere; tag verse keys `"surah:ayah"` match that numbering.
- `data/ontology.json` — `{ concepts: [{ w, d[] }] }`, 569 concepts mapping lexicon words (`w`) to thematic domains (`d`, c1..c24) from «التفسير الموضوعي لسور القرآن الكريم».
- `sw.js` — service worker; bump `const CACHE = 'quran-tag-vNN'` whenever `app.js`/`styles.css` change (stale-cache has caused phantom errors before).
- `skills/` — auto-generated editor session files, **do not commit**.

## Tag-suggestion engine (ontology)
Lives in `app.js` (loaded after `lab.js` helpers). Flow:
1. `loadOntology()` fetches `data/ontology.json` once (`ontologyStatus` idle→loading→ready).
2. `suggestTagsForCategory(catId, max)`:
   - text = category name + its tag names; grounding = `categoryBoundAyahsText(catId)` (all ayahs carrying a tag of that category).
   - scores each concept via `matchConceptToCategory`, **excludes any root already used as a tag** (`existingRoots`).
   - if nothing scores → falls back to a fixed generic list (الإيمان، العبادة، …) at 0.35.
   - returns `{word, score, rel, domain}` descending; accept creates a new tag via `createTag(word, TAG_COLORS[i%…], scid, '', 'suggest:'+scid)`.

### Matching invariants (do not regress)
- **Token-boundary only.** `matchConceptToCategory` never uses `indexOf` substring matching. It builds whole-word sets (`tok:T`, `root:R`) via `tokenSet(text)` and measures `conceptCover(cTokens, sets)` = fraction of the concept's tokens found as full words in the category name (×0.55) and bound ayahs (×0.85).
- **`arabicRoot` is conservative**: keeps `الله`/`اللهم` intact; strips ONLY the definite-article joins (`وال|بال|فال|لل|ال`) and a leading wasla alef. NEVER strips single-letter `و/ب/ك/ف/ل` (they’re real root letters: الكفر، الوحي، البر).
- **`normalizeWordForMatch`**: wasla alef ٱ→ا first, then removes ALL diacritics + Qur’anic annotation signs (`\u0610-\u061A`, `\u064B-\u065F`, `\u0670`, `\u06D6-\u06ED`, `\u0640`, `\u08F0-\u08FF`) so `بِٱللَّهِ`→`بالله`, `اِ۬لدِّينِ`→`الدين` stay one token. Keep-range includes `\u06D0-\u06D3`.

## Diagnostic harness
`/var/folders/qk/tv1fp6314yndsybfb8d73wzc0000gn/T/opencode/ontology_diag.js` extracts the real functions from `app.js` (never a stale copy) and runs regression scenarios with `mustPropose`/`mustNotPropose` assertions. Re-run after any matcher change:
```
node /var/folders/qk/tv1fp6314yndsybfb8d73wzc0000gn/T/opencode/ontology_diag.js
```

## Editing quirks
- The `edit` tool intermittently fails on `app.js` even with the correct path. Reliable fallback: python3 heredocs against the relative path with cwd = repo root.
- Repo root is `/Users/abderraoufallani/quran-tag` (`ff`, not `ll`).

## Audio / riwaya
RIWAYA = `{ qaloon, hafs }`; `currentRiwaya()` reads LS `qaloon_riwaya`. **Memorize-page audio feature was cancelled by the user** after verifying there is no flat+CORS per-ayah qaloon source; do not re-open it without an explicit request.