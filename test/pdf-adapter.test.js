import test from "node:test";
import assert from "node:assert/strict";
import { PdfAdapter } from "../src/pdf-adapter.js";
import { createPdf } from "../test-support/create-pdf.js";

const bytes = createPdf();

test("MuPDF exposes Polish text, baselines, font properties and provenance", function textGeometry() {
	const pdf = new PdfAdapter(bytes);
	try {
		assert.equal(pdf.pageCount, 2);
		const page = pdf.inspectPage(0);
		assert.deepEqual(page.bounds, [0, 0, 240, 180]);
		const lines = page.blocks.flatMap(function blockLines(block) { return block.lines; }); // blockLines()
		const polish = lines.find(function polishLine(line) { return line.text.includes("Załącznik"); }); // polishLine()
		assert.equal(polish.text, "Załącznik: Łódź, żółć");
		assert.equal(polish.characters[0].origin[1], 45);
		assert.equal(polish.characters[0].quad.length, 8);
		assert.equal(polish.pageIndex, 0);
		assert.ok(lines[0].characters[0].font.bold);
		assert.ok(lines.some(function italicLine(line) { return line.characters[0].font.italic; })); // italicLine()
		assert.ok(lines.some(function raised(line) {
			return line.text === "2" && line.characters[0].origin[1] === 55 && line.characters[0].size === 6;
		})); // raised()
		assert.doesNotThrow(function serializable() { JSON.stringify(page); }); // serializable()
	} finally {
		pdf.close();
	}
}); // textGeometry()

test("vector walks preserve known underline, grid and separator coordinates", function vectorGeometry() {
	const pdf = new PdfAdapter(bytes);
	try {
		const page = pdf.inspectPage(0);
		const path = page.paths[0];
		assert.equal(path.paint, "stroke");
		assert.equal(path.lineWidth, 0.5);
		assert.equal(path.commands.length, 16);
		assert.deepEqual(path.commands[2], { operation: "move", points: [[20, 150]] });
		assert.deepEqual(path.commands[3], { operation: "line", points: [[75, 150]] });
		const color = pdf.inspectPage(1);
		assert.ok(color.paths.some(function filled(path) { return path.paint === "fill"; })); // filled()
		assert.ok(page.warnings.length > 0);
	} finally {
		pdf.close();
	}
}); // vectorGeometry()

test("PNG encoding is 8-bit grayscale or 24-bit RGB without alpha at 300 DPI", function pngFormats() {
	const pdf = new PdfAdapter(bytes);
	try {
		for (const [index, colorMode, pngColorType] of [[0, "grayscale", 0], [1, "rgb", 2]]) {
			const result = pdf.renderPage(index);
			assert.equal(result.width, 1000);
			assert.equal(result.height, 750);
			assert.equal(result.colorMode, colorMode);
			assert.deepEqual([...result.png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
			assert.equal(result.png[24], 8); // IHDR bit depth
			assert.equal(result.png[25], pngColorType);
		}
	} finally {
		pdf.close();
	}
}); // pngFormats()

test("input, page, DPI, raster and geometry resource limits fail explicitly", function limits() {
	assert.throws(function byteLimit() { new PdfAdapter(bytes, { maxPdfBytes: 10 }); }, /size limit/); // byteLimit()
	assert.throws(function pageLimit() { new PdfAdapter(bytes, { maxPages: 1 }); }, /page count/); // pageLimit()
	const pdf = new PdfAdapter(bytes, { maxPagePixels: 100 });
	try {
		assert.throws(function pixelLimit() { pdf.renderPage(0); }, /pixel budget/); // pixelLimit()
		assert.throws(function invalidPage() { pdf.inspectPage(2); }, /out of range/); // invalidPage()
		assert.throws(function invalidDpi() { pdf.renderPage(0, { dpi: NaN }); }, /DPI/); // invalidDpi()
	} finally {
		pdf.close();
		pdf.close();
	}
	assert.throws(function closed() { pdf.inspectPage(0); }, /closed/); // closed()
	for (const setting of ["maxCharactersPerPage", "maxPathCommandsPerPage"]) {
		const limited = new PdfAdapter(bytes, { [setting]: 1 });
		try {
			assert.throws(function inspectLimited() { limited.inspectPage(0); }, /limit exceeded/); // inspectLimited()
		} finally {
			limited.close();
		}
	}
}); // limits()
