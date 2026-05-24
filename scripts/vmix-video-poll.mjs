// WTM video-submission -> vMix bridge.
//
// Run this on the vMix machine (Node 18+). It watches the dashboard's
// current pick at /control/videoSubmission, looks up the clip's filename in
// Drive, and loads the local Google-Drive-for-Desktop copy into a vMix
// VideoList input so you can cut to it.
//
// One-time vMix setup:
//   • In vMix, add an empty **List / VideoList** input and name it exactly
//     the same as "vmixInput" below (default "Submission Clip").
//   • Settings → Web Controller → enable it; note the port (default 8088).
//   • (Recommended) set that input to play from the start when taken to
//     program, so each clip rolls from 0 on cut.
//
// Setup here:
//   • Copy vmix-config.example.json to vmix-config.json and fill in:
//       - driveApiKey: a Google API key with the Drive API enabled (the
//         submission files are shared "anyone with the link", so a key is
//         enough — no OAuth).
//       - responsesFolder: the local "(File responses)" folder path.
//       - vmixApi / vmixInput: your vMix API URL and the input name.
//   • Then: node scripts/vmix-video-poll.mjs

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const DB = "https://wtm-broadcast-default-rtdb.firebaseio.com";
const POLL_MS = 2000;

let cfg = {};
try {
  cfg = JSON.parse(
    readFileSync(new URL("./vmix-config.json", import.meta.url), "utf8"),
  );
} catch {
  /* fall back to env vars */
}
const driveApiKey = process.env.WTM_DRIVE_API_KEY || cfg.driveApiKey;
const responsesFolder = process.env.WTM_RESPONSES_FOLDER || cfg.responsesFolder;
const vmixApi = (
  process.env.WTM_VMIX_API ||
  cfg.vmixApi ||
  "http://127.0.0.1:8088/api/"
).replace(/\/*$/, "/");
const vmixInput = process.env.WTM_VMIX_INPUT || cfg.vmixInput || "Submission Clip";
const playOnLoad = cfg.playOnLoad === true;

if (!driveApiKey || !responsesFolder) {
  console.error(
    "Missing config. Copy scripts/vmix-config.example.json to\n" +
      "scripts/vmix-config.json and fill in driveApiKey and responsesFolder.",
  );
  process.exit(1);
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.text();
      const msg = JSON.parse(body)?.error?.message;
      detail = msg || body.slice(0, 300);
    } catch {
      /* non-JSON body */
    }
    throw new Error(`HTTP ${res.status}${detail ? " — " + detail : ""}`);
  }
  return res.json();
}

// Resolve a Drive file id to its filename (== the local synced filename).
const nameCache = new Map();
async function driveName(id) {
  if (nameCache.has(id)) return nameCache.get(id);
  const url =
    `https://www.googleapis.com/drive/v3/files/${id}` +
    `?fields=name&supportsAllDrives=true&key=${driveApiKey}`;
  const j = await getJson(url);
  if (!j.name) throw new Error(`Drive returned no name for ${id}`);
  nameCache.set(id, j.name);
  return j.name;
}

// Call a vMix API function. encodeURIComponent keeps the path intact
// (spaces -> %20, backslashes -> %5C), which vMix decodes.
async function vmix(params) {
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  const res = await fetch(`${vmixApi}?${qs}`);
  if (!res.ok) throw new Error(`vMix HTTP ${res.status} (${params.Function})`);
}

async function loadClip(fileId) {
  const name = await driveName(fileId);
  const path = join(responsesFolder, name);
  if (!existsSync(path)) {
    console.warn(`  ! not found locally: ${path}`);
    console.warn(`    check responsesFolder, or that Drive has synced "${name}".`);
  }
  // Keep one input you always cut to: clear it, add this clip, select it.
  await vmix({ Function: "ListRemoveAll", Input: vmixInput });
  await vmix({ Function: "ListAdd", Input: vmixInput, Value: path });
  // VideoList items are 1-based; if selection misbehaves on your build, try 0.
  await vmix({ Function: "SelectIndex", Input: vmixInput, Value: "1" });
  await vmix({ Function: "Restart", Input: vmixInput });
  if (playOnLoad) await vmix({ Function: "Play", Input: vmixInput });
  console.log(`  -> loaded into "${vmixInput}": ${name}`);
}

// One-shot diagnostic: `node scripts/vmix-video-poll.mjs --test <fileId>`
// Walks each layer (vMix, Drive, local file) and then tries a real load.
async function selfTest(id) {
  console.log("== WTM vMix bridge self-test ==");
  console.log("vmixApi:         ", vmixApi);
  console.log("vmixInput:       ", vmixInput);
  console.log("responsesFolder: ", responsesFolder);
  console.log(
    "driveApiKey:     ",
    driveApiKey ? `${driveApiKey.slice(0, 6)}… (${driveApiKey.length} chars)` : "(missing)",
  );
  console.log("");

  try {
    const r = await fetch(vmixApi);
    console.log(r.ok ? "[ok]   vMix API reachable" : `[FAIL] vMix API HTTP ${r.status}`);
  } catch (e) {
    console.log(`[FAIL] vMix API unreachable: ${e.message}`);
    console.log("       Is the Web Controller enabled, and is the port right?");
  }

  let name;
  try {
    name = await driveName(id);
    console.log(`[ok]   Drive filename: ${name}`);
  } catch (e) {
    console.log(`[FAIL] Drive lookup: ${e.message}`);
    console.log("       Check the API key, that the Drive API is enabled, and the file is shared.");
  }

  if (name) {
    const p = join(responsesFolder, name);
    console.log(
      existsSync(p) ? `[ok]   local file exists: ${p}` : `[FAIL] local file not found: ${p}`,
    );
  }

  try {
    await loadClip(id);
    console.log(`[ok]   load command sent — check the "${vmixInput}" input in vMix`);
  } catch (e) {
    console.log(`[FAIL] load: ${e.message}`);
  }
}

let lastId = null;
async function loop() {
  try {
    const sel = await getJson(`${DB}/control/videoSubmission.json`);
    const id = sel && sel.fileId ? sel.fileId : null;
    if (id !== lastId) {
      lastId = id;
      if (id) {
        console.log(
          `${new Date().toLocaleTimeString()} — selected: ${sel.name || id}`,
        );
        await loadClip(id);
      } else {
        console.log(`${new Date().toLocaleTimeString()} — selection cleared`);
        await vmix({ Function: "ListRemoveAll", Input: vmixInput }).catch(() => {});
      }
    }
  } catch (err) {
    console.error(`${new Date().toLocaleTimeString()} — ${err.message}`);
  }
  setTimeout(loop, POLL_MS);
}

const testFlag = process.argv.indexOf("--test");
if (testFlag >= 0) {
  const id = process.argv[testFlag + 1];
  if (!id) {
    console.error("Usage: node scripts/vmix-video-poll.mjs --test <driveFileId>");
    process.exit(1);
  }
  selfTest(id).then(() => process.exit(0));
} else {
  console.log(
    `WTM vMix video bridge started — watching ${DB}/control/videoSubmission ` +
      `every ${POLL_MS / 1000}s, loading into "${vmixInput}".`,
  );
  loop();
}
