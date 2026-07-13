/** Setup splash UI — external script so file:// CSP (script-src 'self') allows it. */

if (/Macintosh/i.test(navigator.userAgent)) {
  document.documentElement.classList.add("mac-traffic");
}

function setStep(id, state) {
  const el = document.getElementById("step-" + id);
  const icon = document.getElementById("step-" + id + "-icon");
  const spinner = document.getElementById("step-" + id + "-spinner");
  const bar = document.getElementById("step-" + id + "-bar");
  if (!el) return;
  el.className = "step " + (state === "pending" ? "" : state);
  spinner.style.display = state === "active" ? "block" : "none";
  if (state === "done") {
    icon.innerHTML = "&#10003;";
    if (bar) {
      bar.classList.remove("indeterminate");
      bar.style.width = "100%";
    }
  }
  if (state === "error") {
    icon.innerHTML = "&#10007;";
    if (bar) {
      bar.classList.remove("indeterminate");
      bar.style.width = "0%";
    }
  }
  if (state === "active" && bar) {
    bar.classList.add("indeterminate");
    bar.style.width = "40%";
  }
}

function setStepProgress(id, pct) {
  const bar = document.getElementById("step-" + id + "-bar");
  if (!bar) return;
  bar.classList.remove("indeterminate");
  bar.style.width = Math.round(pct) + "%";
}

function appendLog(msg) {
  const box = document.getElementById("log");
  box.textContent += msg + "\n";
  box.scrollTop = box.scrollHeight;
}

function setProgress(pct) {
  document.getElementById("progress").style.width = pct + "%";
  document.getElementById("progress-pct").textContent = Math.round(pct) + "%";
}

function showLaunchBtn() {
  document.getElementById("launch-btn").classList.add("visible");
}

function showOcrConfirm() {
  document.getElementById("ocr-overlay").classList.add("visible");
}

function ocrRespond(accepted) {
  document.getElementById("ocr-overlay").classList.remove("visible");
  window.electronSetup.confirmOcr(accepted);
}

function showOcrRetry() {
  document.getElementById("ocr-retry-btn").style.display = "block";
}

function retryOcr() {
  document.getElementById("ocr-retry-btn").style.display = "none";
  window.electronSetup.retryOcr();
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("launch-btn")?.addEventListener("click", () => {
    window.electronSetup.launchApp();
  });
  document.getElementById("ocr-retry-btn")?.addEventListener("click", retryOcr);
  document.getElementById("ocr-skip-btn")?.addEventListener("click", () => ocrRespond(false));
  document.getElementById("ocr-install-btn")?.addEventListener("click", () => ocrRespond(true));
});
