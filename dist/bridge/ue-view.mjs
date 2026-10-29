// Embedded Unreal match view. On Windows desktop with the renderer installed, the Matchday 3D
// panel shows Unreal's broadcast (Pixel Streaming over WebRTC) instead of the Three.js stadium.
// The page is the WebRTC player; signalling goes through the sandboxed preload (desktop
// pixel-stream.cjs). The video sits in a fixed overlay that tracks #stadium-host, so the app's
// re-renders never detach it. Anywhere Unreal is unavailable, or if the stream fails, the Three.js
// view underneath simply shows through. Rendering never affects results: the game still simulates
// every play; Unreal only draws the telemetry it is sent.
const PREF_KEY = "gridiron-match-view";
const prefers = () => {
  try {
    return localStorage.getItem(PREF_KEY) !== "classic";
  } catch {
    return true;
  }
};
const remember = (value) => {
  try {
    localStorage.setItem(PREF_KEY, value);
  } catch {}
};

// WebRTC player for one Unreal streamer. Unreal sends the offer (sendOffer: true); we answer.
export function createStreamPlayer(api, video, { onState = () => {} } = {}) {
  let pc = null,
    closed = false;
  const send = (msg) => api.send(msg);
  const reset = () => {
    pc?.close();
    pc = null;
  };
  api.onMessage(async (msg) => {
    if (closed) return;
    try {
      if (msg.type === "config") {
        reset();
        pc = new RTCPeerConnection(msg.peerConnectionOptions || {});
        pc.onicecandidate = (e) => e.candidate && send({ type: "iceCandidate", candidate: e.candidate.toJSON() });
        pc.ontrack = (e) => {
          if (e.track.kind !== "video") return;
          video.srcObject = e.streams[0] || new MediaStream([e.track]);
          video.play?.().catch(() => {});
        };
        pc.onconnectionstatechange = () => onState(pc?.connectionState === "connected" ? "live" : pc?.connectionState === "failed" ? "failed" : "connecting");
        send({ type: "subscribe", streamerId: "DefaultStreamer" });
      } else if (msg.type === "offer" && pc) {
        await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send({ type: "answer", sdp: answer.sdp });
      } else if (msg.type === "iceCandidate" && pc && msg.candidate) {
        await pc.addIceCandidate(msg.candidate);
      } else if (msg.type === "playerDisconnected") {
        onState("waiting");
      }
    } catch (error) {
      console.warn("Unreal stream:", error);
      onState("failed");
    }
  });
  api.onStatus?.((status) => {
    // A renderer that (re)connected after the page opened needs a fresh subscription.
    if (!closed && status.streamer && !status.subscribed && pc) send({ type: "subscribe", streamerId: status.streamerId || "DefaultStreamer" });
  });
  api.open();
  return {
    close() {
      closed = true;
      reset();
      api.close();
    },
  };
}

export function installUnrealMatchView() {
  const api = window.gridironUE?.stream;
  if (!api || !api.available()) return;
  const overlay = document.createElement("div");
  overlay.className = "ue-match-view";
  overlay.hidden = true;
  overlay.innerHTML = `<video muted playsinline autoplay></video><div class="ue-match-status" role="status"></div><button class="small secondary ue-match-toggle" type="button">Classic 3D</button>`;
  document.body.append(overlay);
  const video = overlay.querySelector("video"),
    label = overlay.querySelector(".ue-match-status"),
    toggle = overlay.querySelector(".ue-match-toggle");
  let player = null,
    starting = false,
    stateText = "";
  const setState = (s) => {
    stateText = s;
    overlay.dataset.state = s;
    label.textContent = s === "live" ? "" : s === "failed" ? "Unreal view unavailable — showing classic 3D" : "Starting the Unreal match view…";
    if (s === "failed") overlay.hidden = true;
  };
  async function start() {
    if (player || starting) return;
    starting = true;
    setState("connecting");
    try {
      const result = await api.start();
      if (!result?.available) return setState("failed");
      player = createStreamPlayer(api, video, { onState: setState });
    } catch {
      setState("failed");
    } finally {
      starting = false;
    }
  }
  function stop() {
    player?.close();
    player = null;
    video.srcObject = null;
    overlay.hidden = true;
  }
  toggle.addEventListener("click", () => {
    remember("classic");
    stop();
    api.stop();
    render();
  });
  // Offer the way back on the Three.js toolbar when the player chose classic.
  window.useUnrealMatchView = () => {
    remember("unreal");
    render();
  };
  // Keep the overlay exactly over the stadium panel while it is on screen: every frame while
  // streaming, plus on scroll (any scroll container) and resize so it never lags a layout change.
  const position = () => {
    const host = document.getElementById("stadium-host");
    if (!player || !host || !host.isConnected || stateText === "failed") {
      overlay.hidden = true;
      return;
    }
    const r = host.getBoundingClientRect();
    overlay.hidden = r.width < 2 || r.height < 2;
    Object.assign(overlay.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  };
  const follow = () => {
    position();
    if (player) requestAnimationFrame(follow);
  };
  addEventListener("scroll", position, { capture: true, passive: true });
  addEventListener("resize", position, { passive: true });
  const previous = render;
  render = function () {
    previous();
    const host = document.getElementById("stadium-host");
    const wanted = !!(host && state.live && prefers());
    if (wanted && !player) start().then(() => player && requestAnimationFrame(follow));
    if (!wanted && player) stop();
    if (host && state.live && !prefers() && !document.querySelector(".ue-match-return")) {
      host.insertAdjacentHTML("beforebegin", `<div class="stadium-toolbar ue-match-return"><button class="small secondary" onclick="useUnrealMatchView()">Unreal match view →</button></div>`);
    }
  };
  window.UnrealMatchView = { state: () => stateText, active: () => !!player };
}
