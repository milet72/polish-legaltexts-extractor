# Polish Official Gazette PDF Extractor

Implementation specification for a Node.js 20 command-line utility that retrieves and processes electronically published PDFs from **Dziennik Ustaw** and **Monitor Polski**.

**Status:** specification only; implementation has not started. The source documents' exact layouts and the availability/quality of their PDF structure tags have not yet been validated against a representative corpus. Algorithms below are requirements and testable hypotheses, not claims of perfect extraction.

## CLI

Two executable commands must have identical behavior except for their publication source:

```sh
get-du 2026 1399
get-du 2026/1399
get-mp 2026 943
get-mp 2026/943
```

Parsing rules:

- Accept precisely two positional decimal integers (`year position`) or a single `year/position` argument; no extra arguments.
- Validate year and positive position; reject malformed input with usage and nonzero exit status.
- `get-du` refers to `https://www.dziennikustaw.gov.pl/DU/<year>/<position>`.
- `get-mp` refers to `https://www.monitorpolski.gov.pl/MP/<year>/<position>`.
- Discover the official PDF download URL from the publication page or another verified official source. **Do not assume that all downloadable PDF filenames can be constructed from year and position.** Resolve relative links against the page URL and restrict downloads to the relevant official publication domain (including an explicit, tested set of legitimate redirects, if necessary).
- Publication pages may have multiple PDF attachments. Establish a documented, deterministic primary-file rule based on actual site data; when several files remain plausible, fail with a clear diagnostic rather than silently choosing one.
- Save the downloaded PDF under its actual URL basename. Write output files to the current working directory (unless a future explicit output-directory option is added). Preserve the downloaded PDF for reproducibility.
- Create `<basefilename>.txt`, replacing the final `.pdf` suffix with `.txt` (case-insensitive). Use UTF-8 without BOM.
- PNG filenames: `<basefilename>.<nnn>.png`, where `<basefilename>` is the PDF filename **without** `.pdf`, and `<nnn>` is the 1-based, zero-padded **annex-page index** (`001`, `002`, ...), not the absolute PDF page index. Use at least three digits; do not truncate indices beyond 999.
- Use atomic output writes where practical; do not leave a misleading completed `.txt` on failure. Clearly report failures, ambiguous regions and output paths. Do not overwrite unrelated pre-existing files silently; document and test the output-collision policy.

Example for the known DU PDF `D2026000139901.pdf`:

```text
D2026000139901.pdf
D2026000139901.txt
D2026000139901.001.png
D2026000139901.002.png
```

The PNG files are generated only when annex pages exist. The sample filenames above are illustrative, not a claim that this particular PDF contains two annex pages.

## Intended text output

Extract the legal main text while excluding page headers, page numbers and footnotes. Preserve the original reading order and paragraph boundaries, with typography-derived paragraph detection. Do **not** confuse a PDF visual line with a paragraph or a numbered legal unit.

The output is a single UTF-8 text file with:

1. Main-body paragraphs in document order, separated by a blank line.
2. Formatting marked by explicit paired sequences (provisional convention: `<B>...</B>`, `<I>...</I>`, `<U>...</U>`, `<SUP>...</SUP>`, `<SUB>...</SUB>`). Markers are case-sensitive and must be configurable in one place. Escape literal text that might collide with markers; finalize escape semantics before shipping.
3. Table placeholders at their exact logical positions, in ascending order: `<TABLE:1>`, `<TABLE:2>`, etc.
4. After the main text, each table's HTML preceded by its corresponding identifier, with unambiguous delimiters; choose one documented serialization contract and test parsing it back. Table HTML must not appear inline in the main body.
5. **No text from annex pages**: each page in the `Załączniki` section is rendered to a PNG instead. Annex images are separate output files and are not inserted into the text. Preserve any non-annex body content before the annex begins, even if it shares the first annex page only when reliable geometric separation is possible; otherwise report ambiguity.

The marker spellings and the exact table-section separators above are **proposed defaults**; consolidate as constants and document final decisions. All markers should be losslessly distinguishable from literal source text.

## Page segmentation, headers and footnotes

Use page geometry, fonts and vector paths, not plain-text regex replacement alone.

- Remove recurring header text such as `Dziennik Ustaw`, `Monitor Polski`, publication position and page numerals by position and typography, allowing for changing page numbers.
- Detect footnote sections primarily by their short horizontal separator rules; confirm using the smaller font size and spatial relationship of the text immediately below the separator.
- Remove all text from a confirmed footnote section, not only the footnote number or first line. Do not assume that everything below a fixed Y coordinate is a footnote.
- Exclude detected footnote and header regions **before** learning body typography and paragraph spacing.
- Distinguish a footnote separator from table borders and other horizontal rules; verify it lies outside a detected table and separates smaller footnote text from normal body content.
- First pages, landscape pages, title pages and annex pages may have different layouts. Treat low-confidence decisions as diagnosable ambiguities instead of deleting text silently.

## Paragraph reconstruction

**Vertical spacing is the primary deterministic signal.** Legal numbering is explicitly **not** the primary signal because paragraphs can be unnumbered.

- Determine normal line spacing and extra pre-paragraph spacing **separately for each PDF**; official publications can alter typesetting to fit the page. No universal point threshold or font-size multiplier is permitted as the sole classifier.
- Measure consecutive body lines using baseline distances and bounding-box gaps. Normalize or group measurements by text flow, font scale and page geometry.
- Identify repeated spacing clusters within that document; distinguish normal wrapped-line spacing from increased pre-paragraph spacing. Use a robust fallback and flag documents with insufficient or overlapping clusters.
- Respect multi-column layouts, headings, lists and table boundaries when collecting spacing samples; do not let table-cell spacing contaminate the body calibration.
- Join visual lines inside a paragraph using appropriate whitespace and cautious dehyphenation. Preserve true hyphenated words, punctuation, Polish diacritics and legal numbering exactly.
- A PDF page boundary alone is **not** a paragraph boundary. Reconstruct cross-page paragraph continuations using geometry, typography, indentation and, where needed, structural/textual evidence. Exclude intervening headers and footnotes before joining.
- Preserve paragraphs independent of whether they begin with `Art.`, `§`, `1.`, `1)`, `a)` or no prefix.
- Keep intermediate provenance for each paragraph (source page(s), coordinates, confidence/reason for joins) for diagnostics, even if not written to the final `.txt`.

## Inline formatting

Detect and serialize:

- **Bold** and *italic* through font properties and actual spans.
- Underline through correlated graphics/text decoration, since PDF underline is frequently a drawn line rather than a font property.
- Superscript and subscript by baseline displacement and size relative to adjacent text in the same logical line; footnote reference superscripts remain when they belong to retained body text, even though footnote bodies are removed.
- Combined and nested styles, across span boundaries, without producing crossed or unbalanced tags. Normalize adjacent runs with identical styles and choose a deterministic nesting order.
- Apply the same formatting policy to text inside HTML table cells, but use ordinary HTML 4-compatible inline tags inside tables (`<B>`, `<I>`, `<U>`, `<SUP>`, `<SUB>`).

## Tables

Tables are extracted as **HTML 4-compatible markup** and appended to the text file. Put a single numbered placeholder at the corresponding location in the main text. Exclude all table content from ordinary paragraph reconstruction.

- Detect both ruled and borderless tables using vector line geometry, repeated text alignments, spatial grouping and available library detection features.
- Reconstruct cells, row/column order, merged cells (`ROWSPAN`, `COLSPAN`), multi-line content, heading cells and nested formatting.
- Join tables continuing across several PDF pages into **one** HTML table and use only one placeholder at their first occurrence. Compare their column boundaries and widths, continuation patterns and repeated headers; do not merge adjacent but genuinely different tables merely because their column layouts match.
- Measure physical column boundaries in PDF points for ruled tables; infer boundaries with confidence annotations for borderless tables. Preserve raw widths internally.
- Normalize column widths as **integer percentages** of the total table width; allocate rounding residues so the base-column percentages sum to exactly 100%. Widths on merged cells equal the sum of the participating base columns.
- Use legacy attributes directly on `<TD>` / `<TH>`, e.g. `<TD WIDTH="66%">`; where the first row is merged, still apply correct widths to its cells and establish underlying widths on a suitable unmerged row if necessary.
- Do **not** output `<COL>`, `<COLGROUP>`, CSS, HTML5-only elements or modern table layout features. Use only compatible `<TABLE>`, `<TR>`, `<TD>`, `<TH>`, `ROWSPAN`, `COLSPAN`, `WIDTH` and optionally other HTML 4-era presentation attributes as needed.
- The intended `WIDTH` is a rendering hint, so HTML 4 browser layout may differ slightly from PDF; prioritize preserving column proportions and content.
- Do not fabricate merged-cell structure when it cannot be reconstructed: log ambiguity and provide a conservative fallback.

Example:

```html
<TABLE WIDTH="100%" BORDER="1" CELLSPACING="0" CELLPADDING="2">
	<TR><TH WIDTH="34%">Nazwa</TH><TH WIDTH="66%">Opis</TH></TR>
	<TR><TD>A</TD><TD>Treść</TD></TR>
</TABLE>
```

## Annex (`Załączniki`) rendering

The annex section is **page-oriented image output**, not text or table extraction.

- Detect the beginning of the annex section using prominent headings, such as `Załącznik` / `Załączniki` or `Załączniki do ...`, **combined with page position and document context**. Account for inflection, uppercase, multiple individual annex titles and annex numbering. Avoid triggering on ordinary body-text references to an annex.
- Once an annex section genuinely begins, treat its pages through the end of the PDF as annex pages, unless representative documents demonstrate a subsequent non-annex section requiring a richer state machine.
- If the annex begins partway through a PDF page, render the **whole physical page** as the first annex PNG (the requirement is page-oriented). Avoid duplicate extraction of annex text; any preceding main-body text on that shared page requires explicit coordinate handling or an ambiguity report.
- Number PNG pages from `001` at the first physical page of the annex, regardless of the PDF's absolute page number or the number of separately titled annexes. Do **not** restart numbering for `Załącznik nr 2`.
- Render at a configurable fixed resolution, default **300 DPI** (validate trade-offs with large annexes). Preserve full page dimensions, rotation and clipping.
- If color is genuinely present in a page's *visible rendered content*, write an RGB PNG with 8 bits/channel (**24-bit**); otherwise write an 8-bit grayscale PNG. Do not classify a page as colored solely because the PDF declares an RGB colorspace: inspect rendered pixel chroma with a documented tolerance and avoid anti-aliasing false positives. If color ambiguity exists, prefer RGB to avoid losing information.
- PNG compression must be lossless. Alpha channel and palette-indexed PNG are not target formats; render against an opaque white background.
- Do not assume that annexes are text-based; bitmap/scanned annex pages must render correctly without OCR.
- Log source absolute page numbers alongside the annex-relative filenames.

## Proposed architecture

These are conceptual stages rather than mandated exact module filenames:

1. `cli` — command dispatch, argument validation, user-facing errors.
2. `source` — publication page lookup, link resolution and PDF download.
3. `pdf-adapter` — structured text, positions, fonts, graphics and page rasterization.
4. `page-classifier` — body/header/footnote/table/annex segmentation.
5. `paragraphs` — per-document spacing calibration and cross-page reconstruction.
6. `inline-format` — normalized styled runs and text marker serialization.
7. `tables` — cell grid, cross-page merge, HTML 4 serializer and table markers.
8. `annex-images` — page rendering, color/grayscale analysis and PNG encoding.
9. `output` — UTF-8 text serialization, file naming and atomic writes.

Evaluate official **MuPDF JavaScript** APIs first (structured text, `paragraph-break`, vector extraction and rendering), then PDF.js or a narrowly-scoped native/CLI helper only if required by a demonstrated gap. The final application must run on **Node.js 20**, and a third-party executable or native library cannot be assumed installed without explicit documentation.

Prefer an intermediate model with page provenance, text lines, runs and styles, paragraph objects, table grids and annex-page classifications. Each stage should be independently testable.

## Verification and acceptance tests

Build a representative, legally distributable test corpus from both gazette sites; include fixtures and expected results for:

- First/last page, changing header numbers, absent/present/multi-line footnotes and horizontal rules that are **not** footnotes.
- Dense and sparse layouts, different per-document line spacing, numbered and unnumbered paragraphs, headings and paragraph continuations across pages.
- Bold/italic/underline, super/subscripts, nested runs and Polish characters.
- Bordered/borderless tables, merged cells, multiple tables on a page, multi-page tables with repeated headers, and table width normalization summing to 100%.
- Annexes starting on new pages and partway through a page, multiple numbered annexes, monochrome pages and pages with subtle actual color, PDFs without annexes.
- Missing publication, HTTP error, redirect policy, PDFs with multiple candidate attachments, invalid arguments and output collisions.

Assert especially that no body content is silently lost or duplicated, each table has exactly one placeholder and one appendix HTML representation, and annex PNG numbering is contiguous and relative to the annex start. Compare extracted results to manually annotated ground truth; record precision/recall of paragraph boundaries, tables and annex boundaries. Emit diagnostics for uncertain cases.

## Open implementation decisions

The following are defaults or details requiring corpus validation, **not** reasons to skip implementation:

- Exact literal formatting and table delimiter escape rules.
- Whether repeated headers of a multi-page table should remain in the combined HTML once or appear as repeated rows.
- Robust detection of an annex starting mid-page and whether its pre-annex text can be separated without loss.
- Choice of PDF/PNG engine and color-chroma tolerance after benchmarking against actual publications.
- Attachment selection when a publication lists multiple official PDFs.

Make decisions explicit in code and documentation, prefer conservative extraction with warnings, and preserve enough positional provenance to debug every exception.
