// Browser voice adaptation: keep complete phrases, prefer US natural voices and avoid a growing speech backlog.
export function rankVoice(voice) {
  let n = voice.name || "",
    score = voice.lang === "en-US" ? 40 : /^en/.test(voice.lang) ? 15 : -100;
  if (/Natural|Neural|Online/i.test(n)) score += 35;
  if (
    /Google US English|Samantha|Aria|Jenny|Guy|Andrew|Ava|Allison|Alex\b|Daniel/i.test(
      n,
    )
  )
    score += 15;
  if (/Compact|eSpeak|Whisper/i.test(n)) score -= 20;
  return score;
}
export function speechText(text) {
  return text
    .replace(/CeeDee/g, "See Dee")
    .replace(/Puka Nacua/g, "Poo-kah Nah-koo-ah")
    .replace(/Nacua/g, "Nah-koo-ah")
    .replace(/Tagovailoa/g, "Tung-oh-vy-loh-ah")
    .replace(/Njoku/g, "En-joh-koo")
    .replace(/Achane/g, "Ay-chan")
    .replace(/Amon-Ra/g, "Ah-mon Rah");
}
export class BroadcastVoice {
  constructor({
    synth = globalThis.speechSynthesis,
    Utterance = globalThis.SpeechSynthesisUtterance,
    visible = () => true,
    volume = () => 0.65,
  } = {}) {
    this.synth = synth;
    this.Utterance = Utterance;
    this.visible = visible;
    this.volume = volume;
    this.queue = [];
    this.current = null;
    this.generation = 0;
    this.preferences = { voiceURI: "", pace: 1 };
    try {
      Object.assign(
        this.preferences,
        JSON.parse(globalThis.localStorage?.getItem("gridiron-voice") || "{}"),
      );
    } catch {}
  }
  voices() {
    return (this.synth?.getVoices() || [])
      .filter((v) => /^en/.test(v.lang))
      .sort((a, b) => rankVoice(b) - rankVoice(a));
  }
  configure(values) {
    Object.assign(this.preferences, values);
    this.preferences.pace = Math.max(
      0.85,
      Math.min(1.2, Number(this.preferences.pace) || 1),
    );
    try {
      globalThis.localStorage?.setItem(
        "gridiron-voice",
        JSON.stringify(this.preferences),
      );
    } catch {}
  }
  speak(text, line = {}) {
    if (!this.synth || !this.Utterance || !this.visible()) return;
    const item = { text, line, generation: this.generation };
    if (this.current) {
      this.queue = this.queue.filter((q) => q.line.type !== "Outcome");
      if (line.type === "Outcome") this.queue = [item];
      return;
    }
    this.deliver(item);
  }
  deliver(item) {
    if (!this.visible() || item.generation !== this.generation) return;
    let u = new this.Utterance(speechText(item.text)),
      voices = this.voices();
    u.voice =
      voices.find((v) => v.voiceURI === this.preferences.voiceURI) ||
      voices[0] ||
      null;
    u.lang = u.voice?.lang || "en-US";
    u.rate = this.preferences.pace * (item.line.excitement > 0 ? 1.035 : 0.98);
    u.pitch =
      item.line.role === "analyst" ? 0.92 : item.line.excitement > 1 ? 1.06 : 1;
    u.volume = Math.max(0, Math.min(1, this.volume()));
    this.current = u;
    const end = () => {
      if (item.generation !== this.generation) return;
      this.current = null;
      let next = this.queue.shift();
      if (next) this.deliver(next);
    };
    u.onend = end;
    u.onerror = end;
    this.synth.speak(u);
  }
  stop() {
    this.generation++;
    this.queue = [];
    this.current = null;
    this.synth?.cancel();
  }
  startPlay() {
    // Drop stale queued lines but allow the current sentence to finish.
    this.queue = [];
  }
}
