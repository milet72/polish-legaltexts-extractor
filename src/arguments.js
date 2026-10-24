export function parseArguments(args) {
	const parts = args.length === 1 ? args[0].split("/") : args;
	if (parts.length !== 2 || !parts.every(isDecimal)) {
		throw new Error("Usage: <command> year position OR <command> year/position");
	}
	const [year, position] = parts.map(Number);
	if (!Number.isSafeInteger(year) || year < 1918 || year > 9999 ||
		!Number.isSafeInteger(position) || position < 1) {
		throw new Error("Year must be 1918–9999; position must be a positive safe integer.");
	}
	return { year, position };
} // parseArguments()

function isDecimal(value) {
	return /^[0-9]+$/.test(value);
} // isDecimal()
