import { parse } from "parse5";
import { fetch, EnvHttpProxyAgent } from "undici";
import { LIMITS } from "./limits.js";
import { parseArguments } from "./arguments.js";

const SOURCES = Object.freeze({
	du: { host: "dziennikustaw.gov.pl", path: "DU" },
	mp: { host: "monitorpolski.gov.pl", path: "MP" },
});
let proxyAgent;

function sourceDefinition(source) {
	if (!Object.hasOwn(SOURCES, source)) throw new Error("Source must be du or mp.");
	return SOURCES[source];
} // sourceDefinition()

export function officialUrl(value, source, base) {
	const { host } = sourceDefinition(source);
	const url = new URL(value, base);
	if (url.protocol !== "https:" || url.username || url.password || url.port ||
		![host, `www.${host}`].includes(url.hostname)) {
		throw new Error(`URL is outside the official ${source} HTTPS source: ${url.origin}`);
	}
	url.hash = "";
	return url;
} // officialUrl()

export function publicationUrl(source, year, position) {
	const validated = parseArguments([String(year), String(position)]);
	const { host, path } = sourceDefinition(source);
	return `https://www.${host}/${path}/${validated.year}/${validated.position}`;
} // publicationUrl()

export function pdfBasename(value) {
	const name = decodeURIComponent(new URL(value).pathname.split("/").at(-1));
	if (!/^[a-z0-9][a-z0-9._-]*\.pdf$/i.test(name) || name.length > 200) {
		throw new Error("PDF URL has an unsafe or unsupported filename.");
	}
	return name;
} // pdfBasename()

export function discoverPdf(html, pageUrl, source) {
	officialUrl(pageUrl, source);
	const publicationCandidates = new Set();
	const publicationPath = new URL(pageUrl).pathname.replace(/\/$/, "") + "/";
	const pending = [parse(html)];
	while (pending.length) {
		const node = pending.pop();
		if (node.tagName === "a") {
			const href = node.attrs.find(isHref)?.value;
			if (href) {
				const resolved = new URL(href, pageUrl);
				if (/\.pdf$/i.test(resolved.pathname)) {
					// Reject unapproved PDF destinations instead of silently following them.
					const candidate = officialUrl(resolved, source);
					if (candidate.pathname.startsWith(publicationPath)) publicationCandidates.add(candidate.href);
				}
			}
		}
		if (node.childNodes) pending.push(...node.childNodes);
	}
	// Observed on DU/2024/1 and MP/2024/1: the publication PDF lives
	// below that publication's URL, whereas a site-wide privacy PDF does not.
	// Never choose among multiple publication attachments by filename guessing.
	const selected = publicationCandidates;
	if (selected.size !== 1) {
		throw new Error(`Expected one unique official PDF link; found ${selected.size}. Attachment selection needs review.`);
	}
	return [...selected][0];
} // discoverPdf()

function isHref(attribute) {
	return attribute.name === "href";
} // isHref()

function redirectUrl(location, source, current) {
	const target = new URL(location, current);
	// Both observed gazette PDF endpoints return an HTTP root-file Location.
	// Request its HTTPS equivalent instead; never issue a plaintext request.
	if (target.protocol === "http:" && target.hostname === current.hostname &&
		!target.port && /\.pdf$/i.test(target.pathname)) {
		target.protocol = "https:";
	}
	return officialUrl(target, source);
} // redirectUrl()

async function proxyFetch(url, options) {
	proxyAgent ??= new EnvHttpProxyAgent();
	return fetch(url, { ...options, dispatcher: proxyAgent });
} // proxyFetch()

export async function closeSourceConnections() {
	if (proxyAgent) {
		const agent = proxyAgent;
		proxyAgent = undefined;
		await agent.close();
	}
} // closeSourceConnections()

export async function requestOfficial(url, source, {
	request = proxyFetch, maxBytes = LIMITS.maxPdfBytes,
	timeoutMs = LIMITS.timeoutMs, signal = AbortSignal.timeout(timeoutMs),
} = {}) {
	let current = officialUrl(url, source);
	for (let redirects = 0; redirects <= LIMITS.maxRedirects; redirects++) {
		const response = await request(current.href, {
			redirect: "manual", signal,
			headers: { "user-agent": "polish-legaltexts-extractor/0.1", accept: "*/*" },
		});
		if ([301, 302, 303, 307, 308].includes(response.status)) {
			await response.body?.cancel();
			const location = response.headers.get("location");
			if (!location) throw new Error("Official redirect is missing Location.");
			current = redirectUrl(location, source, current);
			continue;
		}
		if (!response.ok) {
			await response.body?.cancel();
			throw new Error(`Official source returned HTTP ${response.status} at ${current.href}`);
		}
		const declaredSize = Number(response.headers.get("content-length"));
		if (declaredSize > maxBytes) {
			await response.body?.cancel();
			throw new Error(`Response exceeds ${maxBytes} bytes.`);
		}
		const chunks = [];
		let length = 0;
		try {
			if (!response.body) throw new Error("Official source returned an empty body.");
			for await (const chunk of response.body) {
				length += chunk.length;
				if (length > maxBytes) throw new Error(`Response exceeds ${maxBytes} bytes.`);
				chunks.push(chunk);
			}
		} catch (error) {
			if (response.body && !response.body.locked) await response.body.cancel().catch(ignoreCancellation);
			throw error;
		}
		return { url: current.href, bytes: Buffer.concat(chunks, length) };
	}
	throw new Error("Too many official redirects.");
} // requestOfficial()

function ignoreCancellation() {
	// Preserve the download error if a stream was already closed by its iterator.
} // ignoreCancellation()

export async function fetchPublication(source, year, position, options = {}) {
	const url = publicationUrl(source, year, position);
	const page = await requestOfficial(url, source, { ...options, maxBytes: LIMITS.maxHtmlBytes });
	const pdfUrl = discoverPdf(page.bytes.toString("utf8"), page.url, source);
	const pdf = await requestOfficial(pdfUrl, source, options);
	if (!pdf.bytes.subarray(0, 1024).includes(Buffer.from("%PDF-"))) {
		throw new Error("Official download did not contain a PDF header.");
	}
	return { publicationUrl: page.url, pdfUrl: pdf.url, filename: pdfBasename(pdf.url), bytes: pdf.bytes };
} // fetchPublication()
