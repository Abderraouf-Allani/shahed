#!/usr/bin/env python3
"""
Rewrite the embedded quran-tag application specification using DSPy into a
precise, implementation-ready specification you can paste into an LLM as a
prompt (for code generation, test generation, review, or verification).

Usage:
    OPENAI_API_KEY=sk-... python3 rewrite_spec.py
    python3 rewrite_spec.py --model openai/gpt-4o-mini --api-key sk-...
    python3 rewrite_spec.py --model openai/gpt-4o-mini --max-tokens 2500 --out specs-rewritten.md
    python3 rewrite_spec.py --model openai/qwen2.5-coder --base-url http://localhost:11434/v1
    python3 rewrite_spec.py --show

The rewritten specification is printed to stdout (or written to --out) so it
can be used verbatim as the prompt for another LLM.
"""

import argparse
import os
import sys

import dspy

QURAN_TAG_SPEC = """\
Application: quran-tag — a static, offline-capable PWA Quran reader with a
Qaloon / Hafs riwaya switch (brand-sub button in the header).

1) Architecture
   - Pure vanilla JavaScript (single IIFE in app.js plus a lazy-loaded lab.js),
     no build step, no framework, no npm dependencies. Static files served as-is.
     Arabic RTL interface.
   - Views (hash routing): index grid of 114 surahs (#/), reader (#/surah/N,
     optional #/surah/N/M deep-link to ayah M), tags manager (#/tags), tag lab
     graph canvas (#/lab), memorize (#/memorize).
   - Every route change scrolls the window to the top before rendering.

2) Quran data
   - data/quran.json: 114 chapters, 6214 ayahs, Qaloon riwaya text (QaloonData by
     King Fahd Complex, fetched via GitHub mirror thetruetruth/quran-data-kfgqpc).
     Each chapter has chapter (1..114), name, bismillah, verses[].
   - data/hafs.json: same shape, 6236 ayahs, Hafs riwaya text (hafsData_v18 by the
     same source). In the Kufan/Hafs count the basmala is verse 1 of al-Fatihah, so
     chapter 1 carries bismillah:"" and the basmala is verses[0]; all other
     chapters (except 9) carry the KFGQPC Hafs basmala in bismillah.
   - data/surahs.json: 114 surah metadata (number, nameAr, nameEn, meaning, type,
     ayahCount). ayahCount is Qaloon-based (e.g. 2:285, 9:130); the app displays
     per-riwaya counts from the active dataset (Hafs: 2:286, 9:129).
   - CRITICAL CONSTRAINT (non-negotiable): the Quran source data files are a
     reference and must NEVER be modified — not even cosmetically. All text
     normalization/adjustments for display must happen in the rendering layer only.

3) Text rendering, the U+0649 issue (resolved), and riwaya switching
   - Quran text encodes alef maqsura as U+0649 (ى). The old KFGQPC "Qaloon" font
     drew it at U+06D2 (ے) and its U+0649 glyph was EMPTY (0 contours), so
     browsers rendered nothing.
   - Resolution applied (must be preserved): the app ships KFGQPC Uthmanic Qaloun
     v2.1 (fonts/uthmanic-qaloun-v21.ttf + .woff2, @font-face family 'qpc-qaloun',
     font-display: swap), which has a real U+0649 outline covering every character
     present in the data. The Quran text font stack is 'qpc-qaloun', "Geeza Pro",
     "Noto Naskh Arabic", "Noto Sans Arabic", "Segoe UI", Tahoma, Arial.
   - Riwaya switch: the header's brand-sub button (#riwayaToggle) toggles between
     Qaloon and Hafs (persisted as qaloon_riwaya in localStorage; values
     "qaloon"/"hafs"). applyRiwaya() swaps state.quran to the matching dataset,
     resets the normalized-verses cache, and sets html[data-riwaya] which flips the
     mushaf font to the Hafs face: 'qpc-hafs' (fonts/uthmanic-hafs-v18.ttf +
     .woff2, @font-face family 'qpc-hafs') via
     html[data-riwaya="hafs"] .bismillah/.mushaf-text. The reader title, ayah
     counts and index totals are derived from the active dataset.
   - Hafs text is served raw (it keeps U+0649, U+06E1 sukun marks and U+0671 alef
     wasla, all covered by the hafs font; zero missing cmap codepoints).

4) Search
   - Surah search: by Arabic name, English name, meaning, or numeric index
     (accepts Arabic-Indic digits ٠-٩).
   - Ayah search: full-text over normalized text. Normalization strips diacritics
     (U+064B-0652, U+06D6-06ED, tatweel), maps superscript alef U+0670 -> ا, alef
     variants -> ا, ta marbuta -> ه, waw hamza -> و, hamza forms removed,
     alef maqsura (ى and ے) -> ي.

5) Tagging
   - Categories + tags; tags can be toggled onto verses; persisted in localStorage
     under key qaloon_tags_v1 (shape {categories, tags, verses, ayahMeta}).
   - Verse tag chips render inline; clicking a chip opens a context popup showing
     the citation context (chapter / page / paragraph) and, when present, the
     per-association tag context: relationship label + description note, with an
     "add/edit context" button that opens the context editor.
   - Per-association context: ayahMeta[tagId]["surah:ayah"] may hold {rel, note}.
     rel is a relationship id from the RELATIONSHIPS taxonomy (9 groups, 27 ids,
     Arabic labels — e.g. same-as, part-of, causes, related-to, which is also the
     default the lab uses for new links); note is free text up to 500 chars.
   - Toggles: show/hide tags, filter by selected tags, tag search, categories with
     drag-and-drop reassignment, create/edit/delete categories and tags, unique
     tag names (Arabic-Indic numbering for duplicates).

6) Export / import
   - JSON export format tag "quran-tag/v2" (FORMAT_VERSION 2). Import validates:
     JSON validity, presence of a tags array, format prefix, version equality
     (mismatch -> clear Arabic error, no import). Merge semantics: categories
     merged by normalized name; duplicate tag names renamed "name (٢)"; ayah
     associations merged without duplication; ayahMeta restored including the
     per-association rel/note context. Report callback returns success flag +
     Arabic summary.

7) Document citation extraction (PDF/DOCX)
   - User uploads a PDF or DOCX; text is extracted (pdf.js for PDF, fflate-based
     unzip for DOCX). Paragraphs are grouped into chapters by detecting headings
     starting with words like الفصل / الباب / القسم / الجزء / المبحث / المطلب /
     المقدمة / الخاتمة / التمهيد / التوطئة / الملحق / المرحلة / الوحدة / الدرس
     (ordinal-only continuation lines merge into the heading).
   - Ayah matching within each chapter: tier-1 exact whole-word boundary matches of
     normalized ayah text (min context), then tier-2 fuzzy word-run matching over
     windows (min DOC_MIN_WORDS=6 exact words; gap tolerance proportional to run
     length). Orientation detection handles text extracted right-to-left (word
     order reversed). Processing is chunked/async with progress callbacks.
   - A new tag is created in the "الكتب" category per document, associated with
     every matched ayah, carrying per-ayah metadata {chapter, page, paragraph}.

8) Tag lab (graph canvas, lazy-loaded)
   - #/lab shows one category's tags as draggable nodes on a grid canvas; each
     node lists the tag's ayahs (with note if any) and can collapse to just the
     tag name via a triangle toggle.
   - Links between tags are directed: an SVG dashed gold line with an arrowhead
     marker pointing at the target node; a label chip at the midpoint shows the
     relationship type. Clicking a line or chip opens the edge editor (relationship
     select from the full RELATIONSHIPS taxonomy, save/delete/cancel). Link mode
     ("ربط الوسوم") lets the user click two nodes to create an edge (default
     rel=related-to) and then opens the editor.
   - Double-clicking an ayah in a node opens it in the reader (#/surah/N/M).
   - Toolbar: category select, ربط الوسوم toggle, إضافة كل الوسوم, ترتيب تلقائي,
     إعادة ضبط, تصدير, استيراد.
   - Per-category layouts persisted in localStorage: qaloon_lab_v1 (shape
     {catId: {nodes: {tagId: {x, y, showAyahs}}, edges: [{from, to, rel}]}}) and
     qaloon_lab_cat (selected category). Sanitization prunes nodes not in the
     category and edges with missing/self endpoints.
   - Lab file export format: JSON {app: "quran-tag-lab", version: 1,
     categories: {catId: {name, nodes, edges}}}; import matches categories by id
     then by name, sanitizes, and never auto-adds tags.
   - lab.js is loaded lazily only when #/lab is opened (dynamic <script>), via a
     shared window.QuranLabBridge (esc, toAr, relLabel, RELATIONSHIPS, state,
     tagState, LS, appEl, positionTagMenu); the module exposes window.QuranLab
     {render, closeEdgePopup, onDocClick, onDocScroll} and delegates document
     click/scroll handlers back to the main app.

9) Memorize (progressive word-hiding)
   - #/memorize shows a setup form: surah picker (all 114), ayah range (from/to).
     Last session surah + range is persisted in localStorage (qaloon_mem_session,
     shape {surah, from, to}); defaults to surah 1, ayahs 1-5.
   - "ابدأ الحفظ" loads the ayah range from the active riwaya dataset, splits each
     ayah into words, and enters memorize mode.
   - Progressive difficulty: each click of "أخفِ المزيد" hides 20% of the TOTAL
     word count (randomly selected from currently visible words). After 5 clicks
     all words are hidden.
   - Hidden words use CSS class .mem-word.hidden: color:transparent, display:inline-block,
     min-width locked to the word's original rendered offsetWidth (measured before
     hide/unhide via measureAllWords). This prevents text-align:justify from
     reflowing word positions when other words become invisible.
   - "أرني الكلمة" (peek): hold mousedown/touchstart to temporarily reveal all
     words; release to restore. Uses _wasHidden snapshot to restore exact prior state.
   - "ساعدني" (help): reveals 40% of hidden words (random). On the last level
     (level 1 -> 0), reveals ALL remaining hidden words so none stay permanently hidden.
   - "منديد": resets to the setup form.
   - Controls bar is position:fixed at the bottom of the viewport with
     backdrop surface + shadow; .mem-area has padding-bottom:5rem to prevent
     ayah text from hiding behind it.
   - Button icons: hide button shows eye-off SVG (or checkmark SVG when all done);
     peek button shows eye SVG; help shows question-circle SVG; reset shows
     refresh-ccw SVG. Hide and peek buttons are icon-only (title attribute for
     accessibility); help and reset show icon + text.

10) Continue reading
   - The last read position is persisted as surah (qaloon_last) + ayah
     (qaloon_last_ayah), updated debounced (~250ms) while scrolling the reader.
   - The anchor ayah of a screen is computed from the viewport: the first ayah
     fully visible (its block within the visible area below the sticky header);
     if no ayah is fully visible (a single ayah fills the screen), the ayah
     intersecting the top line — the one "being read".
   - The index shows a "متابعة القراءة" banner deep-linking to #/surah/N/M, and
     the sticky app-header shows the surah name being read.
   - Deep-link navigation scrolls the target ayah to the top of the viewport
     (scrollIntoView block:start + scroll-margin-top) with a brief highlight.

11) PWA / performance
   - Service worker with versioned cache (currently quran-tag-v24). Navigation
     requests: network-first with cache fallback (index.html refreshed in cache).
     Static assets: cache-first, network update in the background
     (stale-while-revalidate). Precached core includes app.js, lab.js, styles.css,
     fonts (both qaloun and hafs), manifest, icons, and the data JSON files
     (surahs, quran, hafs). Cache version must be bumped when assets change.
   - Lazy loading: pdf.js / fflate loaded only when a document is imported; five
     seed tag-books (dawaa, jam3, asarar, adib, dirasat) fetched and merged
     after the first render, never blocking startup; lab.js loaded only when the
     lab view is opened.

12) UI / UX
   - Light/dark theme toggle (persisted), font-size controls 16..46px (persisted),
     keyboard navigation (left/right arrows across surahs when no menu/input open),
     "continue reading" banner + header reading indicator from the last read
     surah/ayah, share/copy current surah (full text + ayah numbers), license/
     sources modal (Quran text source, pdf.js, fflate, font, build tools, opencode
     + LLM credits, and a technical note about the U+0649 rendering workaround).
   - Header nav icons: tags (tag icon), lab (flask icon), memorize (book-open icon).

13) Testing
   - Unit tests (node:test) covering helpers, normalization, quran data integrity,
     tags store, export/import, chapter detection, and document indexing
     (including multi-line ayah splitting and reversed-text cases).
   - E2E tests run against headless Chrome via the DevTools protocol: boot, grid,
     navigation, reader rendering (U+0649 preserved in DOM), search, tag flow,
     theme, license modal, font size, hash routing, and the lab view.
"""

REWRITE_INSTRUCTIONS = """\
Rewrite the given raw application specification into an implementation-ready,
unambiguous specification document suitable to be used verbatim as the prompt
for an LLM (for code generation, test generation, review, or verification).

Produce Markdown with exactly these sections, in this order:
1. Overview — one short paragraph stating what the application is.
2. Functional requirements — numbered, concrete, testable requirements.
3. Non-negotiable constraints — highlight the Quran-data-integrity rule and the
   U+0649 rendering requirement as the top two items.
4. Technical details — fonts, normalization rules, matching thresholds, data
   shapes, storage keys, export format, caching strategy.
5. Acceptance criteria — a checklist of concrete, verifiable statements.

Rules:
- Resolve ambiguity: prefer concrete numbers, keys, thresholds and examples over
  vague language; keep the numbers exactly as given in the raw spec.
- Preserve every hard constraint; do not weaken or generalize them.
- Keep it complete but tight; no filler, no praise, no conversational text.
- Write in English.
"""


class RewriteSpec(dspy.Signature):
    """Rewrite a raw application specification into a precise, implementation-ready
    specification that can be used verbatim as an LLM prompt."""

    raw_spec: str = dspy.InputField(
        desc="The raw, informal specification of the application to be rewritten."
    )
    rewrite_instructions: str = dspy.InputField(
        desc="Detailed instructions describing the desired output structure and rules."
    )
    rewritten_spec: str = dspy.OutputField(
        desc="The rewritten, implementation-ready specification in Markdown."
    )


def build_program(lm):
    return dspy.Predict(RewriteSpec, lm=lm)


def resolve_key(args):
    key = args.api_key or os.environ.get("OPENAI_API_KEY", "")
    if not key and args.model.lower().startswith("openai/"):
        raise SystemExit(
            "No OpenAI API key found. Pass --api-key or set OPENAI_API_KEY."
        )
    return key or None


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Rewrite the embedded quran-tag specification with DSPy.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="The rewritten spec is printed to stdout unless --out is given.",
    )
    parser.add_argument(
        "--model",
        default="openai/gpt-4o-mini",
        help="DSPy model id (default: openai/gpt-4o-mini).",
    )
    parser.add_argument("--api-key", default=None, help="API key (or set OPENAI_API_KEY).")
    parser.add_argument(
        "--base-url",
        default=None,
        help="Optional OpenAI-compatible base URL for local servers (Ollama, LM Studio...).",
    )
    parser.add_argument("--max-tokens", type=int, default=2000, help="Max output tokens.")
    parser.add_argument(
        "--out",
        default=None,
        help="Write the rewritten spec to this file instead of stdout.",
    )
    parser.add_argument(
        "--show",
        action="store_true",
        help="Print the embedded raw spec and exit (no LLM call).",
    )
    parser.add_argument("--spec", default=None, help="Override the embedded spec with a file's contents.")
    args = parser.parse_args(argv)

    spec = QURAN_TAG_SPEC
    if args.spec:
        with open(args.spec, "r", encoding="utf-8") as fh:
            spec = fh.read()

    if args.show:
        print(spec)
        return 0

    key = resolve_key(args)
    lm = dspy.LM(
        model=args.model,
        api_key=key,
        base_url=args.base_url,
        max_tokens=args.max_tokens,
    )
    dspy.configure(lm=lm)

    rewriter = build_program(lm)
    result = rewriter(raw_spec=spec, rewrite_instructions=REWRITE_INSTRUCTIONS)
    output = result.rewritten_spec

    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(output)
        print("Rewritten spec written to", args.out, file=sys.stderr)
    else:
        print(output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
