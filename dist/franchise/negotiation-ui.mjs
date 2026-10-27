import * as S from "./state.mjs";
import * as C from "./contracts.mjs";
import { CharacterStage, appearanceFor } from "./character-stage.mjs";
import {
  beginNegotiation,
  discussPitch,
  evaluateNegotiation,
  submitNegotiation,
  useCounter,
  contractSummary,
  NEGOTIATION_PITCHES,
} from "./negotiations.mjs";
import { playerFace, scorePill } from "./player-ui.mjs";
import { reputationView } from "./reputation.mjs";
import { icon } from "./presentation.mjs";
const money = (n) =>
  "$" +
  (n / S.MILLION).toLocaleString("en-US", { maximumFractionDigits: 2 }) +
  "M";
const arg = (x) => esc(JSON.stringify(x));
export function installNegotiationUI({ isBusy }) {
  let activeId = null,
    mode = "free",
    stage = null,
    notice = "",
    shot = 0;
  const dispose = () => {
    stage?.dispose();
    stage = null;
  };
  const previousModal = modal,
    previousClose = closeModal;
  modal = function (html) {
    dispose();
    document.getElementById("modal").classList.remove("negotiation-dialog");
    previousModal(html);
  };
  closeModal = function () {
    dispose();
    document.getElementById("modal").classList.remove("negotiation-dialog");
    previousClose();
  };
  document.getElementById("modal").addEventListener("close", dispose);
  const change = (fn) => {
    if (isBusy()) {
      toast("Wait for the simulation to finish.");
      return false;
    }
    try {
      state = S.transact(state, fn);
      save();
      notice = "";
      return true;
    } catch (e) {
      notice = e.message;
      return false;
    }
  };
  const player = () =>
    mode === "free"
      ? state.agents.find((p) => p.id === activeId)
      : state.roster.find((p) => p.id === activeId);
  function terms() {
    const form = document.getElementById("negotiation-terms");
    if (!form) return state.franchise.negotiations?.[activeId]?.terms;
    const t = Object.fromEntries(new FormData(form));
    t.noTrade = new FormData(form).has("noTrade");
    return t;
  }
  function proposalHTML(n) {
    return `<form id="negotiation-terms" onsubmit="event.preventDefault();Neg.review()"><div class="neg-form-grid">${[
      ["annual", "Annual base", 0.8, 100, 0.1],
      ["years", "Years", 1, 5, 1],
      ["bonus", "Signing bonus", 0, 300, 0.1],
      ["guaranteed", "Guaranteed base", 0, 500, 0.1],
    ]
      .map(
        ([key, label, min, max, step]) =>
          `<label>${label}<span>${["years"].includes(key) ? "" : "$M"}</span><input aria-label="${label}" name="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${esc(n.terms[key])}" oninput="Neg.live()" required></label>`,
      )
      .join(
        "",
      )}</div><details class="neg-advanced"><summary>Advanced structure ${icon("chevron")}</summary><div class="neg-form-grid">${[
      ["roster", "Annual roster bonus", 0.1],
      ["workout", "Annual workout bonus", 0.1],
      ["incentive", "TD incentive", 0.1],
      ["voidYears", "Void years", 1],
    ]
      .map(
        ([key, label, step]) =>
          `<label>${label}<input aria-label="${label}" name="${key}" type="number" min="0" step="${step}" value="${esc(n.terms[key] || 0)}" oninput="Neg.live()"></label>`,
      )
      .join(
        "",
      )}<label>Incentive type<select name="incentiveType" onchange="Neg.live()"><option ${n.terms.incentiveType === "NLTBE" ? "selected" : ""}>NLTBE</option><option ${n.terms.incentiveType === "LTBE" ? "selected" : ""}>LTBE</option></select></label><label class="neg-check"><input name="noTrade" type="checkbox" ${n.terms.noTrade ? "checked" : ""} onchange="Neg.live()"> No-trade clause</label></div></details><div class="neg-projection" id="neg-projection"></div><p class="neg-helper">Guarantees above are guaranteed base salary. The signing bonus is added to total guaranteed money. The touchdown incentive is earned at five touchdowns.</p><button class="neg-primary" type="submit" ${!S.allowed(state, "finance") ? "disabled" : ""}>Present proposal ${icon("arrow")}</button></form>`;
  }
  function draw() {
    const p = player();
    if (!p) {
      closeModal();
      toast("This player is no longer available for these talks.");
      return;
    }
    const n = mode === "free" ? beginNegotiation(state, p.id) : null,
      c = state.franchise.contracts[p.id],
      rep = reputationView(state, p),
      readonly = !S.allowed(state, "finance");
    let body = "",
      line = "",
      step = mode === "free" ? n.step : "Current deal";
    if (mode === "free") {
      line =
        n.line ||
        `Thanks for inviting us in. We are looking at a base around ${money(p.salary * S.MILLION)} a year, with the guarantees and football situation considered together. What is your approach?`;
      if (n.status === "submitted")
        body = `<div class="neg-outcome">${icon("check")}<h3>Proposal submitted.</h3><p>The offer competes with other teams. A signing is decided through the free-agent market.</p><div class="neg-summary-grid">${[
          ["Term", n.terms.years + " years"],
          ["Annual base", money(Number(n.terms.annual) * S.MILLION)],
          ["Decision day", n.submittedDay + 2],
          ["Period", state.franchise.market.phase],
        ]
          .map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`)
          .join(
            "",
          )}</div><button class="secondary" onclick="Neg.redraft()">Improve submitted offer</button><button onclick="closeModal();W.open('Market')">Return to market →</button></div>`;
      else if (n.step === "Introduction")
        body = `<h3>Set the tone.</h3><div class="neg-pitches">${Object.entries(
          NEGOTIATION_PITCHES,
        )
          .map(
            ([key, text]) =>
              `<button onclick="Neg.pitch('${key}')" ${readonly ? "disabled" : ""}><span>${icon(key === "Security" ? "wallet" : key === "Compete" ? "target" : "users")}</span><b>${key}</b><small>${text}</small>${icon("chevron")}</button>`,
          )
          .join(
            "",
          )}</div><p class="neg-helper">The conversation frames your proposal. Terms and competing offers determine the final decision.</p>`;
      else if (n.step === "Feedback")
        body = `<div class="neg-feedback"><span class="neg-status ${n.feedback === "Needs improvement" ? "caution" : ""}">${esc(n.feedback)}</span><h3>Round ${n.round} · Agent response</h3><div class="neg-summary-grid">${[
          ["Annual base", money(Number(n.terms.annual) * S.MILLION)],
          ["Term", n.terms.years + " years"],
          ["Requested base", money(Number(n.counter.annual) * S.MILLION)],
          [
            "Requested guaranteed base",
            money(Number(n.counter.guaranteed) * S.MILLION),
          ],
        ]
          .map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`)
          .join(
            "",
          )}</div><div class="neg-response-options"><button onclick="Neg.counter()">Use agent's counter</button><button class="secondary" onclick="Neg.edit()">Revise my proposal</button><button class="secondary" onclick="Neg.submit()">Submit my current offer</button></div><p class="neg-helper">Feedback is indicative. Submitting enters the bidding market; it does not sign the player or reserve cap space.</p></div>`;
      else body = proposalHTML(n);
    } else {
      if (!c) {
        closeModal();
        return;
      }
      const eligible = !c.ended && c.start + c.years === S.financeYear(state),
        index = S.financeYear(state) - c.start;
      line =
        notice ||
        "Let us walk through the current agreement. We can discuss a base-to-bonus restructure, review the cap schedule, or handle an expiring deal through the available tag options.";
      body = `<div class="neg-summary-grid">${[
        ["Contract", c.start + "–" + (c.start + c.years - 1)],
        ["Signing bonus", money(c.bonus)],
        ["Current cap charge", money(S.capHit(c, S.financeYear(state)))],
        ["Void years", c.voidYears || 0],
      ]
        .map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`)
        .join(
          "",
        )}</div><div class="neg-ledger"><table><thead><tr><th>SEASON</th><th>BASE</th><th>CAP CHARGE</th></tr></thead><tbody>${Array.from({ length: c.years + (c.voidYears || 0) }, (_, i) => `<tr><td>${c.start + i}</td><td>${money(c.base[i] || 0)}</td><td>${money(S.capHit(c, c.start + i))}</td></tr>`).join("")}</tbody></table></div><div class="neg-restructure"><label>Convert base to signing bonus ($M)<input aria-label="Convert base to bonus" id="neg-restructure" type="number" min=".1" step=".1" value="1"></label><button class="secondary" onclick="Neg.restructure()" ${readonly || index < 0 || index >= c.years || state.live ? "disabled" : ""}>Discuss restructure</button></div><p class="neg-helper">A restructure moves cap charges into future years. At least $0.8M base must remain.</p><button class="small" onclick="Expansion.extension('${esc(p.id)}')" ${readonly || state.live || index < 0 || index >= c.years ? "disabled" : ""}>Negotiate extension →</button><div class="neg-tag-row"><button class="secondary small" onclick="Neg.tag('Non-exclusive franchise')" ${readonly || !eligible || state.live ? "disabled" : ""}>Franchise tag</button><button class="secondary small" onclick="Neg.tag('Transition')" ${readonly || !eligible || state.live ? "disabled" : ""}>Transition tag</button><small>${eligible ? "One tag per league year." : "Tags unlock when this contract expires."}</small></div>`;
    }
    modal(
      `<div class="negotiation-scene"><div class="neg-topbar"><span>${icon("briefcase")} CONTRACT MEETING <i>●</i> ${esc(step.toUpperCase())}</span><button class="icon-button" aria-label="Leave contract meeting" onclick="closeModal()">×</button></div><div class="neg-workspace"><section class="neg-cinema"><div id="neg-character-stage"></div><div class="neg-location">PRIVATE MEETING / FRONT OFFICE<small>${shot ? "AGENT RESPONSE" : "FRONT OFFICE"}</small></div><div class="neg-player-dossier">${playerFace(p)}<div><h2>${esc(p.name)}</h2><p>${esc(p.realPosition || p.pos)} · ${p.age} years · ${scorePill("rating", p.ovr)} OVR</p><span>${rep.label} · ${Math.round(rep.recognition)} reputation</span></div></div></section><section class="neg-talk"><div class="neg-cap-strip"><span>YOUR CAP ROOM<b>${money(S.capLedger(state).room)}</b></span><span>COMPETING TEAMS<b>${state.franchise.market.offers.filter((o) => o.playerId === p.id && o.team !== state.team).length}</b></span></div><div class="neg-agent-line"><span>PLAYER REPRESENTATIVE </span><p>“${esc(line)}”</p></div>${notice && mode === "free" ? `<div class="neg-error" role="alert">${esc(notice)}</div>` : ""}${readonly ? '<p class="neg-error">Your career role delegates contract decisions to the front office.</p>' : ""}${body}</section></div></div>`,
    );
    document.getElementById("modal").classList.add("negotiation-dialog");
    try {
      stage = new CharacterStage(
        document.getElementById("neg-character-stage"),
        {
          scene: "office",
          shot,
          coach: {
            ...(state.franchise.userCoach?.appearance ||
              appearanceFor({ id: "coach-" + state.team })),
            outfit: "Suit",
            headset: false,
          },
          player: { ...appearanceFor(p), outfit: "Suit" },
          extras: [],
        },
      );
      if (stage.host.clientWidth / Math.max(1, stage.host.clientHeight) < 1) {
        stage.camera.fov = shot ? 35 : 44;
        stage.target.set(shot ? 1 : 0, shot ? 1.25 : 1.15, shot ? -0.2 : 0);
        stage.camera.position.set(shot ? 1.4 : 0.1, 1.65, shot ? 4.9 : 5.5);
        stage.camera.lookAt(stage.target);
        stage.camera.updateProjectionMatrix();
      }
    } catch (e) {
      document.getElementById("neg-character-stage").innerHTML =
        '<div class="neg-scene-fallback">' +
        icon("briefcase") +
        "<b>Private contract meeting</b><small>Character rendering unavailable on this device.</small></div>";
    }
    if (n?.step === "Proposal") Neg.live();
  }
  window.Neg = {
    open(id, type = "free") {
      if (isBusy()) return;
      pauseAuto();
      window.broadcast?.stop();
      activeId = id;
      mode = type;
      notice = "";
      shot = 0;
      try {
        if (type === "free") {
          const n = beginNegotiation(state, id);
          shot = ["Feedback", "Submitted"].includes(n.step) ? 1 : 0;
        }
        draw();
        save();
      } catch (e) {
        toast(e.message);
      }
    },
    pitch(key) {
      if (change((s) => discussPitch(s, activeId, key))) {
        shot = 1;
        draw();
      }
    },
    live() {
      const t = terms(),
        p = player(),
        n = state.franchise.negotiations?.[activeId];
      if (!t || !p || !n) return;
      n.terms = { ...t };
      const el = document.getElementById("neg-projection");
      try {
        const c = C.proposal(state, p, t),
          v = contractSummary(state, c);
        el.innerHTML = `<div><span>Total value</span><b>${money(v.total)}</b></div><div><span>Total guaranteed</span><b>${money(v.guaranteed)}</b></div><div><span>First-year cap</span><b>${money(v.cap)}</b></div><div class="${v.remaining < 0 ? "negative" : ""}"><span>Room after signing</span><b>${money(v.remaining)}</b></div>`;
      } catch (e) {
        el.textContent = e.message;
      }
      save();
    },
    review() {
      const t = terms();
      if (change((s) => evaluateNegotiation(s, activeId, t))) shot = 1;
      draw();
    },
    counter() {
      if (change((s) => useCounter(s, activeId))) draw();
    },
    edit() {
      if (
        change((s) => {
          const n = beginNegotiation(s, activeId);
          if (n.status === "submitted")
            throw Error("Improve the submitted offer first.");
          n.step = "Proposal";
        })
      )
        draw();
    },
    redraft() {
      if (
        change((s) => {
          S.requireRole(s, "finance");
          const n = beginNegotiation(s, activeId);
          n.status = "open";
          n.step = "Proposal";
        })
      )
        draw();
    },
    submit() {
      if (change((s) => submitNegotiation(s, activeId))) {
        render();
        shot = 1;
      }
      draw();
    },
    restructure() {
      const amount = document.getElementById("neg-restructure").value;
      if (
        change((s) => {
          if (s.live)
            throw Error("Finish the live match before changing contracts.");
          C.restructure(s, activeId, amount);
        })
      ) {
        notice =
          "The restructure is complete. The cap schedule below now includes the future bonus charges.";
        shot = 1;
        render();
      }
      draw();
    },
    tag(type) {
      if (
        change((s) => {
          if (s.live)
            throw Error("Finish the live match before tagging players.");
          C.tag(s, activeId, type);
        })
      ) {
        notice = "The tag has been applied to this agreement.";
        render();
      }
      draw();
    },
  };
  F.offer = (id) => Neg.open(id, "free");
  F.contract = (id) => Neg.open(id, "existing");
}
