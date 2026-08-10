import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

export function loadFixture(name: string): string {
  return readFileSync(path.join(fixturesDir, name), "utf-8");
}
