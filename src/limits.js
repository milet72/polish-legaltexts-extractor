// Resource limits for the backend proof of concept, not layout thresholds.
export const LIMITS = Object.freeze({
	maxPdfBytes: 64 * 1024 * 1024,
	maxHtmlBytes: 2 * 1024 * 1024,
	maxPages: 500,
	maxPagePixels: 25_000_000,
	maxCharactersPerPage: 250_000,
	maxPathCommandsPerPage: 250_000,
	timeoutMs: 30_000,
	maxRedirects: 5,
	dpi: 300,
});
