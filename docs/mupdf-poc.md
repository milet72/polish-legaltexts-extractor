# MuPDF Node.js proof of concept

Validated on Node.js 20.20.2 with the official ESM/WASM package `mupdf@1.28.1`.
No third-party executable, native addon or build tool was needed.

Run the commands in the README to reproduce the two-page synthetic experiment.
The adapter is in `src/pdf-adapter.js`; its input is PDF bytes and its output is
a plain JSON-compatible intermediate model plus independent PNG bytes.

| Required backend capability | Demonstrated result |
| --- | --- |
| Text and Polish characters | Exact round trip of `Załącznik: Łódź, żółć` |
| Line geometry and baselines | Page bounds, line bounds/directions, per-character origin, size and quad |
| Font attributes | Actual bold/italic properties, not filename-only guesses |
| Raised/lowered small text | Coordinates and font size preserved; semantic classification not attempted |
| Vectors | Path commands, transforms, stroke width/dashes, paint color/alpha; known grid and separator coordinates asserted |
| PNG rendering | Both pages rendered at 300 DPI to 1000 × 750 pixels |
| Pixel format | Page 1: PNG type 0, 8 bits; page 2: type 2, 8 bits/channel; no alpha |
| Resource controls | Byte/page/pixel/character/path limits fail explicitly |

The first local inspector run completed in 62 ms including document opening,
geometry extraction, full pixel color inspection and PNG encoding. This is a
single small synthetic measurement, not a performance claim for legal documents.
The rendered first page was also visually checked: Polish glyphs, italic/bold,
raised/lowered numerals, underline, grid and short rule appeared at their intended
positions. Automated tests verify both PNG formats and exact feature coordinates.

Use MuPDF's `Page.toStructuredText()` walker for text geometry, and
`Page.run(new Device(...))` with `Path.walk()` for vector paint paths.
Copy all values out of the WASM-owned objects and explicitly destroy documents,
pages, structured text, callback-owned fonts/paths and temporary pixmaps.

The adapter intentionally does not enable `paragraph-break` as the final
paragraph algorithm. MuPDF's visual lines and block grouping are not a substitute
for the specification's document-specific spacing analysis.

Official-site validation:

- Downloaded DU/2024/1 (8 pages) and MP/2024/1 (24 pages) from the original
  publication links. Original bytes, SHA-256, URLs, retrieval dates and selected
  manual annotations are committed under `test/fixtures`.
- Traversed text geometry and vectors on all 32 physical pages. Visually checked
  DU pages 1/8 and MP pages 3/10 at 120 DPI: masthead/body typography, multiline
  footnote, annex title page, and a 7-column × 4-row ruled table within the annex.
- Both publication HTML pages include a global privacy-policy PDF. Select only
  a unique attachment beneath the publication URL path. Both PDF endpoints
  redirect to HTTP root filenames; their HTTPS equivalents were tested and work.
  The downloader upgrades those same-host PDF redirects without making an HTTP
  request. It does not approve external hosts or guess primary filenames.
- MuPDF emits `premature end of data in flate filter` on MP physical page 4.
  Preserve the original PDF and warning; do not assume complete text recovery.

Unproven capabilities and gaps:

- Vectors describe paint operations, not final visibility. A later classifier
  must handle clipping, overlapping graphics, transforms, thin filled rules and
  table/footnote ambiguity; a horizontal path alone is insufficient.
- Character geometry permits underline/baseline analysis but does not itself
  implement the five output formatting markers.
- Paragraph reconstruction, header/footnote removal, ruled/borderless and
  multi-page tables, and annex boundaries remain unimplemented. Expand the
  initial manually reviewed corpus before claiming general layout coverage.
- The synthetic corpus is deliberately small and does not establish coverage of
  scans, tagged PDFs, arbitrary Unicode, rotated/cropped pages or complex layouts.
- Synchronous WASM work cannot be interrupted by an AbortSignal. The current
  tools have size limits but should not be presented as a hostile-PDF sandbox.

MuPDF satisfies the initial backend integration requirements. There is no
demonstrated reason to introduce another PDF engine at this stage.
