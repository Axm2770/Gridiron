// Turns plain inbox/news message text into structured pixel-styled HTML.
// Understands paragraphs (blank lines), "Heading:" lines followed by "• item"
// bullets, "Label: detail" items, "(secondary)" tags and signed numbers.
// Older saves stored the same content on one line ("Targets: • a • b"), so
// inline bullets are unfolded too. Pure and DOM-free so it can be tested.

const escHTML = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const TONES = [
  [/^(exceed|kept|win|good|boost|upside|strength|pro)/i, "good"],
  [/^(meet|on track|steady|neutral|note)/i, "ok"],
  [/^(miss|broken|lose|loss|risk|warning|danger|con|weak|fail)/i, "bad"],
];
const toneOf = (label) => TONES.find(([re]) => re.test(label))?.[1] || "";

// Which way is "better" for a metric: +1 when up is good (morale, chemistry, fans, owner
// patience, trust, job security…), −1 when up is bad (drama, injury risk, dead money, fatigue…).
const UP_BAD = /drama|injur|\brisk\b|dead (money|cap)|fatigue|workload|weeks? out|cap hit|win target|losses|losing streak|tension|distraction|holdout/i;
export const metricDirection = (label) => (UP_BAD.test(String(label || "")) ? -1 : 1);
// "good" | "bad" | "flat" for a signed change (drama +7 is bad, trust −15 is bad, 0 is flat).
export function metricTone(label, delta) {
  const d = Number(delta);
  if (!Number.isFinite(d) || d === 0) return "flat";
  return d * metricDirection(label) > 0 ? "good" : "bad";
}

// Highlight signed numbers (+12, −10, -18, +5%) and colour them by what they measure: the label
// is the clause before the number, so "drama +7" is bad and "owner patience −10 (−18 …)" is bad
// twice. mf-pos / mf-neg mean a good / bad outcome, not the sign.
export function inlineTone(text) {
  const src = escHTML(text);
  return src.replace(/(^|[\s(])([+＋−–-])([0-9]+(?:\.[0-9]+)?%?)(?=[\s).,;]|$)/g, (all, pre, sign, n, at) => {
    const clause = src.slice(Math.max(0, at - 48), at).split(/[,;.:!?]|&quot;/).pop(),
      delta = (/[+＋]/.test(sign) ? 1 : -1) * parseFloat(n),
      tone = metricTone(clause, delta) === "bad" ? "mf-neg" : "mf-pos";
    return pre + '<b class="mf-num ' + tone + '">' + sign + n + "</b>";
  });
}
const inline = inlineTone;

function item(text) {
  let t = text.trim(), tag = "";
  const sec = t.match(/\s*\((secondary|optional)\)\s*$/i);
  if (sec) { t = t.slice(0, sec.index); tag = `<span class="mf-tag mf-tag-soft">${escHTML(sec[1].toUpperCase())}</span>`; }
  const lab = t.match(/^([A-Z][^:.]{0,28}):\s+(.+)$/);
  if (lab) {
    const tone = toneOf(lab[1]);
    return `<li class="mf-item mf-labelled${tone ? ` mf-${tone}` : ""}"><span class="mf-label">${escHTML(lab[1])}</span><span class="mf-text">${inline(lab[2])}${tag}</span></li>`;
  }
  return `<li class="mf-item"><span class="mf-text">${inline(t)}${tag}</span></li>`;
}

// Unfold "Lead text. Targets: • a • b Consequences: • c" into lines.
export function unfold(block) {
  if (block.includes("\n") || !/\s•\s/.test(" " + block)) return block;
  const parts = block.split(/\s*•\s*/);
  const out = [];
  const pullHead = (s) => {
    const m = s.match(/^(.*?)(?:^|\s)([A-Z][a-z]+):\s*$/);
    return m ? [m[1].trim(), m[2] + ":"] : [s.trim(), ""];
  };
  let [lead, head] = pullHead(parts[0]);
  if (lead) out.push(lead, "");
  if (head) out.push(head);
  const rest = parts.slice(1);
  rest.forEach((p, i) => {
    const [txt, next] = pullHead(p);
    // A closing remark after the last bullet ("The board will…") becomes its own paragraph.
    const tail = i === rest.length - 1 ? txt.split(/(?<=[.!])\s+(?=(?:The board|The owner|Track|You can|Reply|Open|Expect)\b)/) : [txt];
    if (tail[0]) out.push("• " + tail[0]);
    if (tail.length > 1) out.push("", tail.slice(1).join(" "));
    if (next) out.push("", next);
  });
  return out.join("\n");
}

export function formatMessage(body) {
  const src = String(body ?? "").replace(/\r/g, "").trim();
  if (!src) return "";
  const blocks = src.split(/\n\s*\n/).flatMap((b) => unfold(b.trim()).split(/\n\s*\n/));
  const html = [];
  let lead = true;
  for (const raw of blocks) {
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    let head = "";
    if (/:$/.test(lines[0]) && lines[0].length <= 40 && lines.length > 1) head = lines.shift().slice(0, -1);
    const bullets = lines.filter((l) => /^[•\-*]\s+/.test(l));
    const prose = lines.filter((l) => !/^[•\-*]\s+/.test(l));
    if (bullets.length) {
      const before = prose.length && lines[0] === prose[0] ? `<p class="mf-p">${inline(prose.join(" "))}</p>` : "";
      html.push(
        `<section class="mf-section">${head ? `<h4 class="mf-head">${escHTML(head)}</h4>` : ""}${before}<ul class="mf-list">${bullets.map((b) => item(b.replace(/^[•\-*]\s+/, ""))).join("")}</ul></section>`,
      );
    } else {
      const text = lines.join(" ");
      if (head) html.push(`<section class="mf-section"><h4 class="mf-head">${escHTML(head)}</h4><p class="mf-p">${inline(text)}</p></section>`);
      else html.push(`<p class="mf-p${lead ? " mf-lead" : ""}">${inline(text)}</p>`);
    }
    lead = false;
  }
  return `<div class="mf">${html.join("")}</div>`;
}
