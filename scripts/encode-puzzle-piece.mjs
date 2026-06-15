// Embed a puzzle-piece image into wtm-runner.html, XOR-obfuscated + base64,
// so it can't be lifted from a public URL or view-source without beating the
// game. The runner decodes it to an inline data URL only on the win event.
//
//   node scripts/encode-puzzle-piece.mjs path/to/piece.png
//
// Re-run with a new image to swap the piece (e.g. for the next reveal); commit
// the updated wtm-runner.html. The XOR key must match PIECE_KEY in the runner.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, extname } from "node:path";

const KEY = "wtm2026belvoir"; // must equal PIECE_KEY in wtm-runner.html

const input = process.argv[2];
if (!input) {
  console.error("usage: node scripts/encode-puzzle-piece.mjs <image-file>");
  process.exit(1);
}

const MIMES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};
const ext = extname(input).toLowerCase();
const mime = MIMES[ext];
if (!mime) {
  console.error(`Unsupported image type "${ext}". Use png, jpg, webp, or gif.`);
  process.exit(1);
}

const bytes = readFileSync(input);
const key = Buffer.from(KEY, "utf8");
const x = Buffer.allocUnsafe(bytes.length);
for (let i = 0; i < bytes.length; i++) x[i] = bytes[i] ^ key[i % key.length];
const b64 = x.toString("base64");

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = resolve(__dirname, "../wtm-runner.html");
let html = readFileSync(htmlPath, "utf8");

const mimeLine = `const PIECE_MIME = '${mime}'; // PIECE_MIME`;
const dataLine = `const PIECE_DATA = '${b64}'; // PIECE_DATA`;
const mimeRe = /const PIECE_MIME = .*?; \/\/ PIECE_MIME/;
const dataRe = /const PIECE_DATA = .*?; \/\/ PIECE_DATA/;

if (!mimeRe.test(html) || !dataRe.test(html)) {
  console.error("Could not find PIECE_MIME / PIECE_DATA markers in wtm-runner.html");
  process.exit(1);
}
// Use a function replacer so `$` in (theoretically) the payload is never
// treated as a replacement pattern. base64 has no `$`, but this is safe.
html = html.replace(mimeRe, () => mimeLine);
html = html.replace(dataRe, () => dataLine);
writeFileSync(htmlPath, html);

const kb = (bytes.length / 1024).toFixed(0);
console.log(
  `Embedded ${input} (${kb} KB, ${mime}) into wtm-runner.html ` +
    `as ${b64.length} base64 chars. Commit and push to deploy.`,
);
if (bytes.length > 600 * 1024) {
  console.log(
    "  Heads up: that's a chunky image — consider resizing to <= ~600 KB so " +
      "the HTML stays light.",
  );
}
