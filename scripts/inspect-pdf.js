import { readFile, stat, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { PdfAdapter } from "../src/pdf-adapter.js";
import { writeExclusive } from "../src/output.js";
import { LIMITS } from "../src/limits.js";

async function main(args) {
	if (args.length < 2 || args.length > 4) {
		throw new Error("Usage: npm run inspect:pdf -- input.pdf NEW-output-directory [page=1] [dpi=300]");
	}
	const [input, directory, page = "1", resolution = "300"] = args;
	if (!/^[1-9][0-9]*$/.test(page)) throw new Error("Page must be a positive integer.");
	const pageIndex = Number(page) - 1;
	const dpi = Number(resolution);
	if ((await stat(input)).size > LIMITS.maxPdfBytes) throw new Error("PDF exceeds the input size limit.");
	const bytes = await readFile(input);
	const started = performance.now();
	const pdf = new PdfAdapter(bytes);
	try {
		const geometry = pdf.inspectPage(pageIndex);
		const rendered = pdf.renderPage(pageIndex, { dpi });
		const { png, ...rendering } = rendered;
		const result = { schemaVersion: 1, backend: "mupdf@1.28.1",
			sha256: createHash("sha256").update(bytes).digest("hex"),
			pageCount: pdf.pageCount, geometry, rendering,
			elapsedMs: Math.round(performance.now() - started) };
		// Refuse existing directories, even empty ones. Failed inspections do not
		// overwrite previous results. Metadata is written last as completion marker.
		await mkdir(directory);
		await writeExclusive(join(directory, "page.png"), png);
		await writeExclusive(join(directory, "inspection.json"), JSON.stringify(result, null, "\t") + "\n");
		console.log(`Inspected page ${pageIndex + 1}/${pdf.pageCount}: ${geometry.blocks.length} text blocks, ${geometry.paths.length} paths, ${rendered.colorMode} PNG; ${result.elapsedMs} ms. Output: ${directory}`);
	} finally {
		pdf.close();
	}
} // main()

main(process.argv.slice(2)).catch(function reportFailure(error) {
	console.error(error.message);
	process.exitCode = 1;
}); // reportFailure()
