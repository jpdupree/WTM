import { configured, watchSocial, setSocialPost, removeSocialPost } from "./firebase.js";

const $ = (id) => document.getElementById(id);
const urlInput = $("url");
const statusEl = $("status");
const list = $("list");

const banner = $("fb-banner");
if (configured) {
  banner.textContent = "Live — posts you add appear on the wall.";
  banner.className = "banner ok";
} else {
  banner.textContent =
    "Preview mode — Firebase not configured (see README). Posts won't sync.";
  banner.className = "banner warn";
}

// Pull the post type (p/reel/tv) and shortcode out of an Instagram URL.
function parseInstagram(url) {
  const m = String(url).match(/instagram\.com\/(p|reel|tv)\/([A-Za-z0-9_-]+)/i);
  return m ? { type: m[1].toLowerCase(), code: m[2] } : null;
}

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = "msg" + (kind ? " " + kind : "");
}

$("add").addEventListener("click", () => {
  const parsed = parseInstagram(urlInput.value);
  if (!parsed) {
    setStatus("That doesn't look like an Instagram post or reel link.", "error");
    return;
  }
  setSocialPost(parsed.code, {
    type: parsed.type,
    code: parsed.code,
    url: `https://www.instagram.com/${parsed.type}/${parsed.code}/`,
    addedAt: new Date().toISOString(),
  });
  urlInput.value = "";
  setStatus("Added to the wall.", "ok");
});

watchSocial((obj) => {
  const posts = Object.values(obj || {}).sort((a, b) =>
    String(a.addedAt).localeCompare(String(b.addedAt)),
  );
  list.innerHTML = "";
  if (posts.length === 0) {
    const note = document.createElement("div");
    note.className = "empty-note";
    note.textContent = "No posts on the wall yet.";
    list.appendChild(note);
    return;
  }
  for (const p of posts) {
    const row = document.createElement("div");
    row.className = "post-row";
    const link = document.createElement("a");
    link.className = "post-link";
    link.href = p.url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = `${p.type} / ${p.code}`;
    const x = document.createElement("button");
    x.type = "button";
    x.className = "x-btn";
    x.textContent = "×";
    x.title = "Remove from wall";
    x.addEventListener("click", () => removeSocialPost(p.code));
    row.append(link, x);
    list.appendChild(row);
  }
});
