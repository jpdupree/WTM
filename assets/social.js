import { watchControl } from "./firebase.js";

const stage = document.getElementById("stage");
const emptyEl = document.getElementById("empty");

// Shows the post the commentator picked on the Social Wall control page.
watchControl("socialPost", (val) => {
  if (!val || !val.code) {
    stage.innerHTML = "";
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;
  const iframe = document.createElement("iframe");
  iframe.className = "ig-frame";
  iframe.src = `https://www.instagram.com/${val.type || "p"}/${val.code}/embed`;
  iframe.setAttribute("scrolling", "no");
  iframe.allow = "encrypted-media";
  stage.innerHTML = "";
  stage.appendChild(iframe);
});
