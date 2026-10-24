# Official fixture corpus

Original official PDFs were downloaded on 2026-10-24 after the network allowlist
change propagated to the running machine:

- https://www.dziennikustaw.gov.pl/DU/2024/1
- https://www.monitorpolski.gov.pl/MP/2024/1

DU has 8 pages; MP has 24. See each metadata.json for exact final URL, SHA-256 and
visually reviewed pages/features. DU pages 1/8 and MP pages 3/10 were rendered at
120 DPI and visually inspected. MP's table is inside its annex, so a future
extractor must render it rather than append it as a main-body HTML table.

MuPDF warns about a truncated flate stream on MP physical page 4. Preserve this
diagnostic and the original bytes. Opening/traversing the file does not prove
that every glyph on that page was recovered.

These are official normative acts/program material, used as reproducible
fixtures; their original bytes are retained without alteration. Use
`npm run fetch:fixture` as documented in README to acquire more examples, then
inspect/render each document before recording verified features.

Retain publication URL, final PDF URL, retrieval date, SHA-256, actual filename,
page count, manual review date and verified features in each metadata.json.
Build a representative set from both gazettes: header/footnote variants, dense
and sparse paragraph spacing, cross-page text/tables, nested formatting,
merged/borderless cells, no-annex documents, mixed-page annex starts and visible
color. Do not claim these cases are covered by the backend contract tests.

The synthetic generator in `test-support/create-pdf.js` validates the MuPDF API
contract without network access. It is not official-layout ground truth.
