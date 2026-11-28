/* 読み上げ（docs/GAME.md ステップ1）。押したときだけ読む。もう一度押すと止まる。
   骨格の切れ目（logic.js の speechChunks）で区切って別々の発話にし、間を置く。 */
let current = null;   // いま読んでいるボタン

export const canSpeak = () => 'speechSynthesis' in window;

function voice() {
  const vs = speechSynthesis.getVoices();
  return vs.find(v => v.lang === 'en-US' && /Samantha|Alex|Ava|Allison/.test(v.name)) || vs.find(v => v.lang === 'en-US') || vs.find(v => /^en/.test(v.lang)) || null;
}

export function stop() {
  if (!canSpeak()) return;
  speechSynthesis.cancel();
  if (current) { current.textContent = '▶ 読む'; current = null; }
}

/** chunks を順に読む。btn の表示を切り替える */
export function speak(chunks, btn) {
  if (!canSpeak() || !chunks.length) return;
  if (current === btn) return stop();   // 2回目は止める
  stop();
  current = btn; btn.textContent = '■ 止める';
  const v = voice();
  chunks.forEach((text, i) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US'; u.rate = 0.88; if (v) u.voice = v;
    if (i === chunks.length - 1) u.onend = u.onerror = () => { if (current === btn) { btn.textContent = '▶ 読む'; current = null; } };
    speechSynthesis.speak(u);
  });
}
