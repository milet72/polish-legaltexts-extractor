import mupdf from "mupdf";
import { LIMITS } from "./limits.js";

function transformPoint(x, y, matrix) {
	const [a, b, c, d, e, f] = matrix;
	return [a * x + c * y + e, b * x + d * y + f];
} // transformPoint()

function collectPath(path, matrix, budget) {
	const commands = [];
	function add(operation, points = []) {
		if (++budget.count > budget.maximum) throw new Error("Page path-command limit exceeded.");
		commands.push({ operation, points });
	} // add()
	path.walk({
		moveTo(x, y) { add("move", [transformPoint(x, y, matrix)]); }, // moveTo()
		lineTo(x, y) { add("line", [transformPoint(x, y, matrix)]); }, // lineTo()
		curveTo(x1, y1, x2, y2, x3, y3) {
			add("curve", [transformPoint(x1, y1, matrix), transformPoint(x2, y2, matrix), transformPoint(x3, y3, matrix)]);
		}, // curveTo()
		closePath() { add("close"); }, // closePath()
	});
	return commands;
} // collectPath()

/**
 * Copies MuPDF objects into a plain, provenance-bearing intermediate model.
 * Lines are visual lines, not paragraphs; paths are paint operations, not
 * confirmed visible footnote rules or table borders (clipping may apply).
 */
export class PdfAdapter {
	#document;
	#limits;
	pageCount;

	constructor(bytes, limits = {}) {
		this.#limits = { ...LIMITS, ...limits };
		for (const name of ["maxPdfBytes", "maxPages", "maxPagePixels", "maxCharactersPerPage", "maxPathCommandsPerPage"]) {
			if (!Number.isSafeInteger(this.#limits[name]) || this.#limits[name] < 1) {
				throw new Error(`Invalid resource limit: ${name}`);
			}
		}
		if (!(bytes instanceof Uint8Array) || bytes.byteLength > this.#limits.maxPdfBytes) {
			throw new Error("PDF input must be bytes within the download size limit.");
		}
		this.#document = mupdf.Document.openDocument(bytes, "application/pdf");
		try {
			if (!this.#document.isPDF()) throw new Error("Only PDF documents are supported.");
			if (this.#document.needsPassword()) throw new Error("Password-protected PDF is not supported.");
			this.pageCount = this.#document.countPages();
			if (!this.pageCount || this.pageCount > this.#limits.maxPages) {
				throw new Error("PDF page count is outside the configured limit.");
			}
		} catch (error) {
			this.close();
			throw error;
		}
	} // constructor()

	#loadPage(index) {
		if (!this.#document) throw new Error("PDF adapter is closed.");
		if (!Number.isSafeInteger(index) || index < 0 || index >= this.pageCount) {
			throw new Error("Page index is out of range (indices start at zero).");
		}
		return this.#document.loadPage(index);
	} // #loadPage()

	inspectPage(index) {
		const page = this.#loadPage(index);
		let structured;
		let device;
		const result = {
			pageIndex: index, bounds: page.getBounds(),
			blocks: [], images: [], paths: [],
			warnings: ["Vector paint paths are unclassified and may be clipped, hidden, or part of a drawing."],
		};
		let block;
		let line;
		let characters = 0;
		const fontCache = new Map();
		const pathBudget = { count: 0, maximum: this.#limits.maxPathCommandsPerPage };
		const maximumCharacters = this.#limits.maxCharactersPerPage;
		try {
			// Preserve whitespace/ligatures and separate blocks. Do not treat MuPDF
			// paragraph heuristics as the document-specific paragraph classifier.
			structured = page.toStructuredText("preserve-whitespace,preserve-ligatures");
			structured.walk({
				beginTextBlock(bounds) {
					block = { pageIndex: index, blockIndex: result.blocks.length, bounds, lines: [] };
					result.blocks.push(block);
				}, // beginTextBlock()
				beginLine(bounds, writingMode, direction) {
					line = { pageIndex: index, blockIndex: block.blockIndex, lineIndex: block.lines.length,
						bounds, writingMode, direction, characters: [], text: "" };
					block.lines.push(line);
				}, // beginLine()
				onChar(text, origin, font, size, quad, color, bidi) {
					try {
						if (++characters > maximumCharacters) throw new Error("Page character limit exceeded.");
						if (!fontCache.has(font.pointer)) {
							fontCache.set(font.pointer, { name: font.getName(), bold: font.isBold(), italic: font.isItalic() });
						}
						line.characters.push({ text, origin, size, quad, color, bidi, font: fontCache.get(font.pointer) });
						line.text += text;
					} finally {
						font.destroy();
					}
				}, // onChar()
				onImageBlock(bounds, transform, image) {
					try {
						result.images.push({ pageIndex: index, bounds, transform,
							width: image.getWidth(), height: image.getHeight() });
					} finally {
						image.destroy();
					}
				}, // onImageBlock()
			});
			device = new mupdf.Device({
				strokePath(path, stroke, transform, colorSpace, color, alpha) {
					try {
						result.paths.push({ pageIndex: index, paint: "stroke",
							commands: collectPath(path, transform, pathBudget),
							transform, lineWidth: stroke.getLineWidth(), dashes: stroke.getDashes(),
							colorSpace: colorSpace.getName(), color, alpha });
					} finally {
						path.destroy();
						stroke.destroy();
						colorSpace.destroy();
					}
				}, // strokePath()
				fillPath(path, evenOdd, transform, colorSpace, color, alpha) {
					try {
						result.paths.push({ pageIndex: index, paint: "fill",
							commands: collectPath(path, transform, pathBudget),
							transform, evenOdd, colorSpace: colorSpace.getName(), color, alpha });
					} finally {
						path.destroy();
						colorSpace.destroy();
					}
				}, // fillPath()
			});
			page.run(device, mupdf.Matrix.identity);
			return result;
		} finally {
			try {
				device?.close();
			} finally {
				device?.destroy();
				structured?.destroy();
				page.destroy();
			}
		}
	} // inspectPage()

	renderPage(index, { dpi = LIMITS.dpi } = {}) {
		if (!Number.isFinite(dpi) || dpi < 1 || dpi > 1200) throw new Error("DPI must be between 1 and 1200.");
		const page = this.#loadPage(index);
		let rgb;
		let grayscale;
		try {
			const scale = dpi / 72;
			const bounds = page.getBounds();
			const width = Math.ceil(bounds[2] * scale) - Math.floor(bounds[0] * scale);
			const height = Math.ceil(bounds[3] * scale) - Math.floor(bounds[1] * scale);
			if (!Number.isFinite(width * height) || width < 1 || height < 1 ||
				width * height > this.#limits.maxPagePixels) {
				throw new Error("Rendered page exceeds the pixel budget; lower DPI or raise the explicit budget.");
			}
			// No alpha: MuPDF renders onto opaque white. Inspect visible pixels,
			// never the declared PDF colorspace. Any chroma chooses RGB; no
			// tolerance that might erase subtle real color has been assumed.
			rgb = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false);
			const pixels = rgb.getPixels();
			let colored = false;
			for (let i = 0; i < pixels.length; i += 3) {
				if (pixels[i] !== pixels[i + 1] || pixels[i] !== pixels[i + 2]) {
					colored = true;
					break;
				}
			}
			if (!colored) grayscale = rgb.convertToColorSpace(mupdf.ColorSpace.DeviceGray, false);
			const pixmap = grayscale ?? rgb;
			pixmap.setResolution(dpi, dpi);
			return { pageIndex: index, dpi, width: pixmap.getWidth(), height: pixmap.getHeight(),
				colorMode: colored ? "rgb" : "grayscale", png: Buffer.from(pixmap.asPNG()) };
		} finally {
			grayscale?.destroy();
			rgb?.destroy();
			page.destroy();
		}
	} // renderPage()

	close() {
		this.#document?.destroy();
		this.#document = undefined;
	} // close()
}
