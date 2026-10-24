import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PdfAdapter } from "../src/pdf-adapter.js";

for (const [directory, expectedPages] of [["du-2024-1", 8], ["mp-2024-1", 24]]) {
	test(`official ${directory}: pinned bytes open and all ${expectedPages} pages expose geometry`, async function officialPdf() {
		const root = new URL(`./fixtures/${directory}/`, import.meta.url);
		const metadata = JSON.parse(await readFile(new URL("metadata.json", root), "utf8"));
		const bytes = await readFile(new URL(metadata.filename, root));
		assert.equal(createHash("sha256").update(bytes).digest("hex"), metadata.sha256);
		const pdf = new PdfAdapter(bytes);
		try {
			assert.equal(pdf.pageCount, expectedPages);
			for (let index = 0; index < expectedPages; index++) {
				const page = pdf.inspectPage(index);
				assert.equal(page.pageIndex, index);
				assert.ok(page.blocks.length > 0, `physical page ${index + 1} must contain text`);
				assert.ok(page.paths.length > 0, `physical page ${index + 1} must expose its rules`);
			}
			const selected = pdf.inspectPage(directory.startsWith("du") ? 7 : 2);
			const text = selected.blocks.flatMap(function lines(block) {
				return block.lines.map(function lineText(line) { return line.text; }); // lineText()
			}).join(" "); // lines()
			assert.match(text, directory.startsWith("du") ? /Niniejsze rozporządzenie/ : /Załącznik do uchwały/);
			const rendered = pdf.renderPage(0, { dpi: 72 });
			assert.ok(rendered.png.length > 1000);
			assert.ok(rendered.width > 500);
		} finally {
			pdf.close();
		}
	}); // officialPdf()
}
