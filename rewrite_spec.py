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
Application: quran-tag — a static, offline-capable PWA Quran reader (riwaya Qaloon an Nafi').

1) Architecture
   - Pure vanilla JavaScript (single IIFE in app.js), no build step, no framework,
     no npm dependencies. Static files served as-is. Arabic RTL interface.
   - Views (hash routing): index grid of 114 surahs (#/), reader (#/surah/N,
     optional #/surah/N/M deep-link to ayah M), tags manager (#/tags).

2) Quran data
   - data/quran.json: 114 chapters, 6236 ayahs, Qaloon riwaya text (QaloonData by
     King Fahd Complex, fetched via GitHub mirror thetruetruth/quran-data-kfgqpc).
     Each chapter has chapter (1..114), name, bismillah, verses[].
   - data/surahs.json: 114 surah metadata (number, nameAr, nameEn, meaning, type,
     ayahCount).
   - CRITICAL CONSTRAINT (non-negotiable): the Quran source data files are a
     reference and must NEVER be modified — not even cosmetically. All text
     normalization/adjustments for display must happen in the rendering layer only.

3) Text rendering & the U+0649 issue
   - The KFGQPC "Qaloon" font draws alef maqsura at U+06D2 (ے), but the text
     encodes it as U+0649 (ى). The font's U+0649 glyph ("alefmaksura") is EMPTY
     (0 contours) in both .otf and .woff2, so browsers render nothing for it.
   - Resolution already applied (must be preserved): the Qaloon @font-face uses
     unicode-range that EXCLUDES U+0649 (U+0600-0648, U+064A-06FF, ...), so U+0649
     falls back to a system Arabic font (Geeza Pro / Noto Naskh Arabic / Segoe UI /
     Tahoma / Arial). The character in the DOM/text stays U+0649 — no substitution.
   - Requirement: the exact character U+0649 must remain in the text and DOM;
     only the font used to draw it may differ. Copy/share actions must use the raw
     text (U+0649 preserved).

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
   - Verse tag chips render inline; clicking opens a context popup showing the
     citation context (chapter / page / paragraph).
   - Toggles: show/hide tags, filter by selected tags, tag search, categories with
     drag-and-drop reassignment, create/edit/delete categories and tags, unique
     tag names (Arabic-Indic numbering for duplicates).

6) Export / import
   - JSON export format tag "quran-tag/v2" (FORMAT_VERSION 2). Import validates:
     JSON validity, presence of a tags array, format prefix, version equality
     (mismatch -> clear Arabic error, no import). Merge semantics: categories
     merged by normalized name; duplicate tag names renamed "name (٢)"; ayah
     associations merged without duplication; ayahMeta restored. Report callback
     returns success flag + Arabic summary.

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

8) PWA / performance
   - Service worker with versioned cache (e.g. quran-tag-v14). Navigation requests:
     network-first with cache fallback. Static assets: cache-first with
     stale-while-revalidate. Cache version must be bumped when assets change.
   - Lazy loading: pdf.js / fflate loaded only when a document is imported;
     five seed tag-books (dawaa, jam3, iman, asarar, adib) fetched and merged after
     the first render, never blocking startup.

9) UI / UX
   - Light/dark theme toggle (persisted), font-size controls 16..46px (persisted),
     keyboard navigation (left/right arrows across surahs when no menu/input open),
     "continue reading" banner from last-read surah, share/copy current surah
     (full text + ayah numbers), license/sources modal (Quran text source, pdf.js,
     fflate, font, build tools, opencode + LLM credits, and a technical note about
     the U+0649 rendering workaround).

10) Testing
    - Unit tests (node:test) covering helpers, normalization, quran data integrity,
      tags store, export/import, chapter detection, and document indexing
      (including multi-line ayah splitting and reversed-text cases).
    - E2E tests run against headless Chrome via the DevTools protocol: boot, grid,
      navigation, reader rendering (U+0649 preserved in DOM), search, tag flow,
      theme, license modal, font size, hash routing.
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
