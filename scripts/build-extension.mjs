import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
const output = "dist-extension";
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp("extension", output, { recursive: true });
console.log(`Chrome extension built in ${join(process.cwd(), output)}`);