import { watchControl } from "./firebase.js";

const stage = document.getElementById("stage");
const emptyEl = document.getElementById("empty");

// Shows the clip the crew picked on the Video Submissions control page.
watchControl("videoSubmission", (val) => {
  if (!val || !val.fileId) {
    stage.innerHTML = "";
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;
  const clip = document.createElement("div");
  clip.className = "clip" + (val.portrait ? " portrait" : "");
  const iframe = document.createElement("iframe");
  iframe.className = "video-frame";
  iframe.src = `https://drive.google.com/file/d/${val.fileId}/preview`;
  iframe.allow = "autoplay; encrypted-media";
  clip.appendChild(iframe);

  if (val.name || val.caption) {
    const label = document.createElement("div");
    label.className = "label";
    if (val.name) {
      const who = document.createElement("span");
      who.className = "who";
      who.textContent = val.name;
      label.appendChild(who);
    }
    if (val.caption) {
      const cap = document.createElement("span");
      cap.className = "caption";
      cap.textContent = val.caption;
      label.appendChild(cap);
    }
    clip.appendChild(label);
  }

  stage.innerHTML = "";
  stage.appendChild(clip);
});
