import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { parseArguments } from "../src/arguments.js";
import { fetchPublication, closeSourceConnections } from "../src/source.js";
import { PdfAdapter } from "../src/pdf-adapter.js";
import { writeExclusive } from "../src/output.js";

async function main(args) {
	if (args.length < 3 || args.length > 4) {
		throw new Error("Usage: npm run fetch:fixture -- du|mp NEW-output-directory year position OR year/position");
	}
	const [source, directory, ...publication] = args;
	const { year, position } = parseArguments(publication);
	try {
		const result = await fetchPublication(source, year, position);
		const pdf = new PdfAdapter(result.bytes);
		let pageCount;
		try {
			pageCount = pdf.pageCount;
		} finally {
			pdf.close();
		}
		const metadata = { source, year, position, publicationUrl: result.publicationUrl,
			pdfUrl: result.pdfUrl, filename: result.filename,
			retrievedAt: new Date().toISOString(),
			sha256: createHash("sha256").update(result.bytes).digest("hex"),
			pageCount, reviewedAt: null, manuallyVerifiedFeatures: [] };
		await mkdir(directory);
		await writeExclusive(join(directory, result.filename), result.bytes);
		await writeExclusive(join(directory, "metadata.json"), JSON.stringify(metadata, null, "\t") + "\n");
		console.log(`Saved ${result.filename} (${pageCount} pages) and metadata to ${directory}. Manual feature review is still required.`);
	} finally {
		await closeSourceConnections();
	}
} // main()

main(process.argv.slice(2)).catch(function reportFailure(error) {
	console.error(`Fixture download failed: ${error.message}`);
	if (error.cause?.code) console.error(`Transport code: ${error.cause.code}`);
	process.exitCode = 1;
}); // reportFailure()
