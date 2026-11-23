// Writes docs/player-guide.md from the in-game Gridiron Guide (dist/ui/guide-content.mjs), so the
// repository doc and the game never drift. test-guide.mjs fails while the doc is stale.
// Usage: node scripts/build-player-guide.mjs [--check]
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { guideMarkdown } from "../dist/ui/guide-content.mjs";
import { NAV_GROUPS } from "../dist/franchise/presentation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  out = path.join(root, "docs", "player-guide.md");

// Sidebar labels for routes ("Game plan" is "Tactics" in the sidebar).
export function routeLabel(route) {
  for (const [, items] of NAV_GROUPS) for (const [r, label] of items) if (r === route) return label;
  const top = { Overview: "Club overview", Inbox: "Inbox", Matchday: "Matchday", News: "News & social", Settings: "Settings", "Careers & saves": "Careers (career library)" };
  return top[route] || route;
}
export const playerGuide = () => guideMarkdown(routeLabel) + "\n";

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = playerGuide();
  if (process.argv.includes("--check")) {
    const current = await readFile(out, "utf8").catch(() => "");
    if (current.replace(/\r\n/g, "\n") !== text) {
      console.error("docs/player-guide.md is out of date: run node scripts/build-player-guide.mjs");
      process.exit(1);
    }
    console.log("player guide up to date");
  } else {
    await writeFile(out, text);
    console.log(`wrote ${path.relative(root, out)} (${text.split("\n").length} lines)`);
  }
}
