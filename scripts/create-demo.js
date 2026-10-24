import { createPdf } from "../test-support/create-pdf.js";
import { writeExclusive } from "../src/output.js";

try {
	if (process.argv.length !== 3) throw new Error("Usage: node scripts/create-demo.js NEW-output.pdf");
	await writeExclusive(process.argv[2], createPdf());
	console.log(`Saved synthetic PDF to ${process.argv[2]}`);
} catch (error) {
	console.error(error.message);
	process.exitCode = 1;
}
