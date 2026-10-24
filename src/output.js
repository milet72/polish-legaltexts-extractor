import { randomUUID } from "node:crypto";
import { open, link, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";

// A hard link publishes a complete file and atomically refuses existing targets.
export async function writeExclusive(path, bytes) {
	const temporary = join(dirname(path), `.legaltexts-${randomUUID()}.tmp`);
	const file = await open(temporary, "wx", 0o600);
	try {
		await file.writeFile(bytes);
		await file.close();
		await link(temporary, path);
	} finally {
		await file.close();
		await unlink(temporary);
	}
} // writeExclusive()
