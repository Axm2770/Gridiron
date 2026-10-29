// Desktop update banner: a compact bar in the corner that reflects the updater's state. The
// desktop shell checks GitHub Releases on launch and every few hours; this only renders and
// forwards the player's choices (install, reload, open the release page, dismiss).
const MB = 1024 * 1024;
let dismissed = null;

function view(s) {
  const size = s.bytes ? ` · ${s.bytes >= MB ? (s.bytes / MB).toFixed(1) + " MB" : Math.max(1, Math.round(s.bytes / 1024)) + " KB"}` : "";
  switch (s.phase) {
    case "available":
      return { tone: "info", text: `Update ${s.latest} is available (${s.files} file${s.files === 1 ? "" : "s"}${size}).`, actions: [["install", "Install now", true], ["later", "Later"]] };
    case "downloading":
      return { tone: "info", text: `Installing update ${s.latest}… ${s.progress || 0}%`, progress: s.progress || 0, actions: [] };
    case "ready":
      return { tone: "good", text: `${s.message} Your careers are saved and carry over.`, actions: [["reload", "Reload now", true], ["later", "After this session"]] };
    case "shell-required":
      return { tone: "warn", text: s.message, actions: [["release", "Open download page", true], ["later", "Later"]] };
    case "error":
      return { tone: "warn", text: s.message, actions: [["retry", "Try again"], ["later", "Dismiss"]] };
    case "up-to-date":
      return s.manual ? { tone: "good", text: `You're on the latest version (${s.current}).`, actions: [["later", "OK"]] } : null;
    default:
      return s.message ? { tone: "info", text: s.message, actions: [["later", "OK"]] } : null;
  }
}

export function installUpdateBanner(api) {
  const bar = document.createElement("div");
  bar.className = "gd-update";
  bar.setAttribute("role", "status");
  document.body.append(bar);
  let status = api.status();
  const render = () => {
    const key = `${status.phase}:${status.latest}`,
      v = dismissed === key ? null : view(status);
    bar.hidden = !v;
    if (!v) return;
    bar.dataset.tone = v.tone;
    bar.innerHTML = `<span class="gd-update-text"></span>${v.progress != null ? `<span class="gd-update-progress"><i style="width:${v.progress}%"></i></span>` : ""}<span class="gd-update-actions">${v.actions.map(([id, label, primary]) => `<button class="gd-btn ${primary ? "gd-primary" : ""}" data-act="${id}">${label}</button>`).join("")}</span>`;
    bar.querySelector(".gd-update-text").textContent = v.text;
  };
  bar.addEventListener("click", (event) => {
    const act = event.target.closest("[data-act]")?.dataset.act;
    if (act === "install") api.download();
    else if (act === "reload") api.reload();
    else if (act === "release") api.openRelease();
    else if (act === "retry") api.check();
    else if (act === "later") {
      dismissed = `${status.phase}:${status.latest}`;
      render();
    }
  });
  api.onStatus((next) => {
    status = next;
    render();
  });
  render();
}
