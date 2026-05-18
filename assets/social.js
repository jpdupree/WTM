import { watchSocial } from "./firebase.js";

const stage = document.getElementById("stage");
const emptyEl = document.getElementById("empty");
const counter = document.getElementById("counter");

const CYCLE_MS = 12_000;
let posts = [];
let idx = 0;

function render() {
  if (posts.length === 0) {
    stage.innerHTML = "";
    emptyEl.hidden = false;
    counter.textContent = "";
    return;
  }
  emptyEl.hidden = true;
  idx = ((idx % posts.length) + posts.length) % posts.length;
  const p = posts[idx];
  const iframe = document.createElement("iframe");
  iframe.className = "ig-frame";
  iframe.src = `https://www.instagram.com/${p.type}/${p.code}/embed`;
  iframe.setAttribute("scrolling", "no");
  iframe.allow = "encrypted-media";
  stage.innerHTML = "";
  stage.appendChild(iframe);
  counter.textContent = `${idx + 1} / ${posts.length}`;
}

watchSocial((obj) => {
  posts = Object.values(obj || {}).sort((a, b) =>
    String(a.addedAt).localeCompare(String(b.addedAt)),
  );
  render();
});

// Auto-advance through the curated posts.
setInterval(() => {
  if (posts.length > 1) {
    idx++;
    render();
  }
}, CYCLE_MS);

render();
