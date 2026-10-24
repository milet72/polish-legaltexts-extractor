import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeExclusive } from "../src/output.js";

test("atomic output publication preserves existing files and cleans temporary files", async function collisions() {
	const directory = await mkdtemp(join(tmpdir(), "legaltexts-output-"));
	try {
		const path = join(directory, "result.txt");
		await writeExclusive(path, "Załącznik: żółć");
		await assert.rejects(writeExclusive(path, "overwrite"), { code: "EEXIST" });
		assert.equal(await readFile(path, "utf8"), "Załącznik: żółć");
		assert.deepEqual(await readdir(directory), ["result.txt"]);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}); // collisions()

test("concurrent writers cannot overwrite each other", async function concurrentPublication() {
	const directory = await mkdtemp(join(tmpdir(), "legaltexts-race-"));
	try {
		const path = join(directory, "result.txt");
		const outcomes = await Promise.allSettled([writeExclusive(path, "one"), writeExclusive(path, "two")]);
		assert.equal(outcomes.filter(function successful(outcome) { return outcome.status === "fulfilled"; }).length, 1); // successful()
		assert.ok(["one", "two"].includes(await readFile(path, "utf8")));
		assert.deepEqual(await readdir(directory), ["result.txt"]);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}); // concurrentPublication()
