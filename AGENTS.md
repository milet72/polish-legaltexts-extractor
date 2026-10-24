# Codex implementation instructions

Read `README.md` in full before changing code. It is the product specification and takes precedence over incidental implementation convenience. This repository currently contains a specification, not an implemented extractor.

## Objective

Implement **two Node.js 20 CLI commands**: `get-du` and `get-mp`. They take `year position` or `year/position`, fetch official PDFs from their respective gazette sites, and produce a text file plus zero or more annex PNGs as described in `README.md`.

## Non-negotiable behavior

- Source scope is limited to `dziennikustaw.gov.pl` and `monitorpolski.gov.pl` and verified official redirects.
- Detect headers and footnotes geometrically; a footnote separator is a horizontal rule, confirmed by smaller following text. Do not use blanket bottom-of-page clipping.
- Establish paragraph boundaries from **document-specific typographic spacing**, not legal-number regexes. Join paragraphs across pages when appropriate.
- Mark bold, italic, underline, superscript and subscript; support overlapping style transitions correctly.
- Extract tables separately as HTML **4-compatible** `<TABLE>`, `<TR>`, `<TD>`, `<TH>` with percentage `WIDTH` attributes on cells. **Never** output `<COL>`, `<COLGROUP>`, CSS, or HTML5 table syntax. Place one table marker in the main text and append HTML tables at the end.
- Merge a table spanning multiple pages into a single HTML table. Its relative column percentages must total 100% after rounding.
- Render every page belonging to the `Załączniki` section as a PNG named `<pdf-base>.<001-based-annex-page>.png`. RGB/24-bit if visible color exists; grayscale/8-bit otherwise. Annex page numbering is **not** document page numbering. Annex content must not contaminate main-text or table extraction.
- Final `.txt` filename replaces `.pdf` on the original PDF basename; UTF-8, no BOM.

## Implementation discipline

1. Inspect actual example documents and create a small representative fixture corpus from **both** official sites before hardcoding geometry assumptions. Cite fixture URL, date, page count and manually verified features in fixture metadata.
2. Choose a PDF backend by a small measurable proof of concept: obtain line positions/baselines/font attributes, vectors for footnote rules/table grids, and render PNG pages. Investigate MuPDF JavaScript structured-text functionality first; prove the chosen Node 20 integration works before building extraction layers.
3. Build a staged intermediate representation with provenance (document page index, bounding boxes, confidence/reason). Detect page/annex/table regions before training paragraph spacing thresholds.
4. Keep reusable stages pure where practical, with independent unit tests and end-to-end fixtures. Write tests for ambiguous layouts and explicitly warn rather than silently delete text.
5. Treat PDF text and publication HTML as untrusted input. Never execute external commands through an interpolated shell string; validate URLs, filesystem names and output paths. Handle timeouts and large downloads, pages and images with resource limits.
6. Document all dependencies and exact install/run/test commands in `README.md` once they exist. Keep the application usable from Node.js 20 without undocumented system requirements.
7. Check with `npm test` and the documented end-to-end invocation before claiming completion. Compare rendered/annotated cases manually where geometry is involved.

## Coding conventions

- **Use tabs, not spaces, for source-code indentation.**
- **At the end of each function**, immediately after its closing curly brace, add a comment identifying the function, such as `} // parseArguments()`; follow the equivalent convention for named class methods and callbacks where reasonably identifiable.
- Use straightforward, descriptive names and explicit behavior. Avoid magic thresholds: centralize defaults and derive PDF-specific thresholds from analyzed document data.
- Keep source formatting, parsing, classification, serialization and network I/O in separate modules.
- Do not silently rewrite or discard a user's unrelated changes.
- Do not introduce a framework, browser dependency, OCR or AI service without demonstrating why geometry-based extraction is insufficient.

## Delivery checklist

- [ ] Both CLI commands and both accepted argument syntaxes work on Node.js 20.
- [ ] PDF is resolved from the correct official source and named from the retrieved file.
- [ ] Header and footnote text are excluded without deleting body text.
- [ ] Paragraph boundaries use per-document geometry and preserve cross-page paragraphs.
- [ ] Five formatting kinds (bold, italic, underline, sup, sub) serialize correctly.
- [ ] Tables become one marker each plus appended HTML 4-compatible tables, including multi-page cases and percentage widths.
- [ ] All annex pages render as consecutively numbered PNGs with correct grayscale/RGB pixel format.
- [ ] Non-annex PDFs generate no annex PNGs.
- [ ] Automated tests and representative manually checked fixtures pass.
- [ ] README documents the actual implementation, limits, examples and diagnostics.

If a requirement cannot be met reliably with the chosen backend, demonstrate the limitation with a minimal fixture and propose the smallest alternative; do not falsely report full coverage.
