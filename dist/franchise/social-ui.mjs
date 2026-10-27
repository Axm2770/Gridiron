import * as S from "./state.mjs";
import { socialFeed, hubPreferences } from "./front-office.mjs";
import { castSocialVote } from "./social-network.mjs";
import { syncReputation, reputationLeaders } from "./reputation.mjs";
import { playerFace, scorePill, previewAttributes } from "./player-ui.mjs";
import { icon } from "./presentation.mjs";
const arg = (x) => esc(JSON.stringify(x));
export const audienceLabel = (n) =>
  n >= 1e6
    ? (n / 1e6).toFixed(1) + "M"
    : n >= 1e3
      ? (n / 1e3).toFixed(n < 10000 ? 1 : 0) + "K"
      : String(n);
export function socialPost(post, pref, thread) {
  const player = post.authorPlayer,
    portrait = post.authorFace;
  const author = player
    ? `<button class="network-author-player" ${previewAttributes(portrait, post.team)} onclick="W.player(${arg(player)},${post.team})">${playerFace(portrait)}</button>`
    : `<span class="network-fan-avatar">${esc(
        post.name
          .split(" ")
          .map((n) => n[0])
          .slice(0, 2)
          .join(""),
      )}</span>`;
  const vote = pref.socialVotes?.[post.id],
    voted = Number.isInteger(vote),
    poll = post.poll;
  const pollHTML = poll
    ? `<section class="network-poll"><b>${esc(poll.question)}</b><div>${poll.options.map((option, i) => (voted ? `<button class="network-poll-result ${vote === i ? "voted" : ""}" onclick="Network.vote(${arg(post.id)},${i})" aria-label="Change vote to ${esc(option)}"><i style="width:${poll.shares[i]}%"></i><span>${vote === i ? "✓ " : ""}${esc(option)}</span><strong>${poll.shares[i]}%</strong></button>` : `<button class="network-poll-option" onclick="Network.vote(${arg(post.id)},${i})">${esc(option)}</button>`)).join("")}</div><small>${audienceLabel(poll.votes + Number(voted))} votes · ${voted ? "Your vote is saved" : "Choose your side"}</small></section>`
    : "";
  return `<article class="hub-social-post network-post ${player ? "network-player-post" : ""}"><div class="hub-social-author">${author}<span><b>${esc(post.name)} ${player ? '<i class="network-player-badge" title="Player account">' + icon("check") + "</i>" : ""}</b><small>@${esc(post.handle)} · ${post.year} W${post.week + 1}${player ? " · Player post" : post.voiceKind ? " · " + esc(post.voiceKind) : ""}</small></span><span class="network-topic">${esc(post.tone)}</span></div>${player ? `<div class="network-reach"><b>${Math.round(post.reputation.recognition)}</b> reputation <span>${esc(post.reputation.label)}</span> · ${audienceLabel(post.reputation.audience)} followers</div>` : ""}<p>${esc(post.body)}</p>${post.pair ? `<div class="hub-comparison">${post.pair.map((x) => `<button ${previewAttributes(x.p, x.team)} onclick="W.player(${arg(x.p.id)},${x.team})">${playerFace(x.p)}<b>${esc(x.p.name)}</b><small>${clubs[x.team][0]} · ${x.p.pos}</small><strong>${Number.isFinite(x.value) ? x.value.toLocaleString("en-US") : "—"}</strong><small>${esc(post.metric)} · ${post.year}</small><span>${scorePill("rating", x.p.ovr)} OVR <i> · ${Math.round(x.reputation ?? 0)} REP</i></span><small class="network-sample">${esc(x.sample || "Posted comparison snapshot")}</small></button>`).join("")}<span class="hub-versus">VS</span></div>` : post.storyId ? `<button class="hub-social-source" onclick="Hub.story(${arg(post.storyId)})">${icon("database")}<span><small>FROM YOUR NEWSROOM</small><b>${esc(post.title)}</b></span>${icon("chevron")}</button>` : ""}${pollHTML}<div class="hub-social-actions"><button class="${pref.socialLikes.includes(post.id) ? "liked" : ""}" aria-pressed="${pref.socialLikes.includes(post.id)}" onclick="Hub.react(${arg(post.id)},'socialLikes')">${pref.socialLikes.includes(post.id) ? "♥" : "♡"} ${audienceLabel(post.likes + Number(pref.socialLikes.includes(post.id)))}</button><button aria-expanded="${thread === post.id}" onclick="Hub.thread(${arg(post.id)})">${icon("mic")} ${post.comments.length} replies</button><button aria-label="${pref.socialSaved.includes(post.id) ? "Unsave" : "Save"} discussion" aria-pressed="${pref.socialSaved.includes(post.id)}" onclick="Hub.react(${arg(post.id)},'socialSaved')">${pref.socialSaved.includes(post.id) ? "★ Saved" : "☆ Save"}</button><span>${logo(post.team)} ${clubs[post.team]?.[0] || "NFL"}</span></div>${thread === post.id ? `<div class="hub-thread network-thread">${post.comments.map((c) => `<div class="${c.replyTo ? "network-reply" : ""}"><div><b>${esc(c.name)}</b>${c.stance ? `<small>${esc(c.stance)}</small>` : ""}</div>${c.replyTo ? `<span>Replying to ${esc(c.replyTo)}</span>` : ""}<p>${esc(c.text)}</p></div>`).join("")}</div>` : ""}</article>`;
}
export function socialReputationPanel() {
  return `<section class="panel hub-panel network-reputation-panel"><div class="panel-head"><h2>Names driving the conversation</h2></div><div>${reputationLeaders(
    state,
  )
    .slice(0, 5)
    .map(
      (x) =>
        `<button ${previewAttributes(x.p, x.team)} onclick="W.player(${arg(x.p.id)},${x.team})">${playerFace(x.p)}<span><b>${esc(x.p.name)}</b><small>${clubs[x.team][0]} · ${x.label}</small></span><strong>${Math.round(x.recognition)}<small>REP</small></strong></button>`,
    )
    .join(
      "",
    )}</div><p>Recognition changes gradually. Esteem also reflects recent form. </p></section>`;
}
export function installSocialNetwork({ isBusy }) {
  window.Network = {
    vote(id, index) {
      if (isBusy()) return;
      try {
        state = S.transact(state, (s) =>
          castSocialVote(s, socialFeed(s, clubs), id, index),
        );
        save();
        render();
      } catch (e) {
        toast(e.message);
      }
    },
  };
  const previous = render;
  render = function () {
    ensureMatchState();
    S.migrate(state);
    syncReputation(state);
    previous();
  };
  syncReputation(state);
}
