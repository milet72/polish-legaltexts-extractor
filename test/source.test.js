import test from "node:test";
import assert from "node:assert/strict";
import { parseArguments } from "../src/arguments.js";
import { officialUrl, publicationUrl, discoverPdf, pdfBasename, requestOfficial, fetchPublication } from "../src/source.js";

const pageUrl = "https://www.dziennikustaw.gov.pl/DU/2024/1";

test("both CLI argument forms accept only decimal year and positive position", function argumentsTest() {
	assert.deepEqual(parseArguments(["2024", "1"]), { year: 2024, position: 1 });
	assert.deepEqual(parseArguments(["2024/1"]), { year: 2024, position: 1 });
	for (const args of [[], ["2024"], ["2024/1/2"], ["2024", "1", "2"], ["2024", "0"], ["2024", "-1"],
		["2024", "1e3"], ["2024", "9007199254740992"], ["1917", "1"], ["2024", "1 "], ["2024", "0x10"]]) {
		assert.throws(function invalid() { parseArguments(args); }); // invalid()
	}
	assert.equal(publicationUrl("du", 2024, 1), pageUrl);
	assert.equal(publicationUrl("mp", 2024, 1), "https://www.monitorpolski.gov.pl/MP/2024/1");
}); // argumentsTest()

test("URL policy rejects cross-gazette, suffix spoofing, ports, credentials and unsafe filenames", function urlPolicy() {
	for (const url of ["http://www.dziennikustaw.gov.pl/a.pdf", "https://www.monitorpolski.gov.pl/a.pdf",
		"https://dziennikustaw.gov.pl.evil.example/a.pdf", "https://dziennikustaw.gov.pl:444/a.pdf",
		"https://user:pass@dziennikustaw.gov.pl/a.pdf", "file:///tmp/a.pdf"]) {
		assert.throws(function rejectUrl() { officialUrl(url, "du"); }, /outside/); // rejectUrl()
	}
	assert.equal(officialUrl("/a.pdf#page=1", "du", pageUrl).href, "https://www.dziennikustaw.gov.pl/a.pdf");
	assert.throws(function unsafeSource() { publicationUrl("__proto__", 2024, 1); }, /Source/); // unsafeSource()
	assert.equal(pdfBasename("https://www.dziennikustaw.gov.pl/a/D2024000000101.PDF?x=1"), "D2024000000101.PDF");
	for (const name of ["%2fescape.pdf", "%5cescape.pdf", "%00.pdf", ".hidden.pdf", "a.txt", "%2e%2e%2fescape.pdf"]) {
		assert.throws(function unsafeName() { pdfBasename(`https://www.dziennikustaw.gov.pl/${name}`); }); // unsafeName()
	}
}); // urlPolicy()

test("HTML parser handles entities, relative links, duplicates and rejects ambiguous attachments", function links() {
	const html = '<a href="/DU/2024/1/main.pdf?a=1&amp;b=2">PDF</a><a href="/DU/2024/1/main.pdf?a=1&amp;b=2#page=1">Again</a>';
	assert.equal(discoverPdf(html, pageUrl, "du"), "https://www.dziennikustaw.gov.pl/DU/2024/1/main.pdf?a=1&b=2");
	assert.throws(function absent() { discoverPdf("<p>No PDF</p>", pageUrl, "du"); }, /found 0/); // absent()
	assert.throws(function ambiguous() {
		discoverPdf('<a href="/DU/2024/1/a.pdf">A</a><a href="/DU/2024/1/b.pdf">B</a>', pageUrl, "du");
	}, /found 2/); // ambiguous()
	assert.throws(function external() {
		discoverPdf('<a href="https://evil.example/a.pdf">PDF</a>', pageUrl, "du");
	}, /outside/); // external()
}); // links()

test("observed gazette layout selects publication attachments and never the privacy PDF", function primaryFile() {
	for (const [source, path, host] of [["du", "DU", "dziennikustaw"], ["mp", "MP", "monitorpolski"]]) {
		const page = `https://www.${host}.gov.pl/${path}/2024/1`;
		const privacy = '<a href="/static/docs/PolitykaPrywatnosci.pdf">Privacy</a>';
		const html = `<a href="/${path}/2024/1/main.pdf">PDF</a>${privacy}`;
		assert.equal(discoverPdf(html, page, source), page + "/main.pdf");
		assert.throws(function privacyOnly() { discoverPdf(privacy, page, source); }, /found 0/); // privacyOnly()
		assert.throws(function multiple() {
			discoverPdf(html + `<a href="/${path}/2024/1/annex.pdf">Annex</a>`, page, source);
		}, /found 2/); // multiple()
	}
}); // primaryFile()

test("redirect destinations are validated before any subsequent request", async function redirectPolicy() {
	const requested = [];
	async function request(url, options) {
		requested.push(url);
		assert.equal(options.redirect, "manual");
		return new Response(null, { status: 302, headers: { location: "https://evil.example/stolen.pdf" } });
	} // request()
	await assert.rejects(requestOfficial(pageUrl, "du", { request }), /outside/);
	assert.deepEqual(requested, [pageUrl]);
}); // redirectPolicy()

test("same-source redirects retain actual final PDF filename", async function redirectedPdf() {
	async function request(url) {
		if (url === pageUrl) return new Response('<a href="/DU/2024/1/download.pdf">PDF</a>');
		if (url.endsWith("download.pdf")) return new Response(null, { status: 302, headers: { location: "/actual.PDF" } });
		return new Response("%PDF-1.7\nfixture");
	} // request()
	const result = await fetchPublication("du", 2024, 1, { request });
	assert.equal(result.filename, "actual.PDF");
	assert.equal(result.pdfUrl, "https://www.dziennikustaw.gov.pl/actual.PDF");
}); // redirectedPdf()

test("observed HTTP PDF redirects are upgraded without making an HTTP request", async function httpsUpgrade() {
	const visited = [];
	async function request(url) {
		visited.push(url);
		if (visited.length === 1) {
			return new Response(null, { status: 302, headers: { location: "http://www.dziennikustaw.gov.pl/actual.pdf" } });
		}
		return new Response("%PDF-1.7");
	} // request()
	const result = await requestOfficial(pageUrl, "du", { request });
	assert.equal(result.url, "https://www.dziennikustaw.gov.pl/actual.pdf");
	assert.ok(visited.every(function encrypted(url) { return url.startsWith("https:"); })); // encrypted()
}); // httpsUpgrade()

test("HTTP errors, missing redirects and redirect loops fail", async function httpFailures() {
	for (const [status, headers, expected] of [
		[404, {}, /HTTP 404/], [302, {}, /missing Location/], [302, { location: "/loop" }, /Too many/],
	]) {
		async function request() { return new Response(null, { status, headers }); } // request()
		await assert.rejects(requestOfficial(pageUrl, "du", { request }), expected);
	}
}); // httpFailures()

test("size limits apply with or without Content-Length and non-PDF downloads fail", async function downloadLimits() {
	for (const headers of [{}, { "content-length": "100" }]) {
		async function request() { return new Response("oversized", { headers }); } // request()
		await assert.rejects(requestOfficial(pageUrl, "du", { request, maxBytes: 4 }), /exceeds/);
	}
	async function request(url) {
		return new Response(url === pageUrl ? '<a href="/DU/2024/1/a.pdf">PDF</a>' : "<html>Not PDF</html>");
	} // request()
	await assert.rejects(fetchPublication("du", 2024, 1, { request }), /PDF header/);
}); // downloadLimits()

test("request cancellation propagates to the transport", async function timeout() {
	async function request(url, { signal }) {
		return new Promise(function pending(resolve, reject) {
			signal.addEventListener("abort", function aborted() { reject(signal.reason); }, { once: true }); // aborted()
		}); // pending()
	} // request()
	// Keep the event loop live: AbortSignal.timeout deliberately uses an unref'ed timer.
	const keepAlive = setInterval(function tick() {}, 100); // tick()
	try {
		await assert.rejects(requestOfficial(pageUrl, "du", { request, timeoutMs: 10 }), /timeout/i);
	} finally {
		clearInterval(keepAlive);
	}
}); // timeout()
