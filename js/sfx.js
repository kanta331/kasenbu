/* 効果音（docs/GAME.md ステップ1）。音源ファイルは使わず Web Audio で合成する短い音。
   iPhone は最初のタップまで音を出せないので、最初の pointerdown で鳴らせる状態にする。
   消音は書き出し画面のスイッチ1つ（localStorage）。 */
const MUTE = 'kasenbu:mute';
let ctx = null;

export const muted = () => { try { return localStorage.getItem(MUTE) === '1'; } catch { return false; } };
export const setMuted = m => { try { m ? localStorage.setItem(MUTE, '1') : localStorage.removeItem(MUTE); } catch {} };

function ac() {
  if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
// 最初のタップで準備（iOS の決まり）
window.addEventListener('pointerdown', () => { if (!muted()) ac(); }, { once: true, capture: true });

/** 1音：周波数 f（Hz）、開始 t（秒後）、長さ d、波形 type、音量 v */
function tone(f, t = 0, d = 0.12, type = 'sine', v = 0.18, slideTo = null) {
  const a = ac(); if (!a) return;
  const t0 = a.currentTime + t;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + d);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  o.connect(g).connect(a.destination);
  o.start(t0); o.stop(t0 + d + 0.02);
}
const play = fn => { if (!muted()) try { fn(); } catch {} };

export const sfx = {
  /** 命中：明るい2音 */
  hit: () => play(() => { tone(880, 0, 0.09, 'triangle', 0.16); tone(1320, 0.07, 0.14, 'triangle', 0.14); }),
  /** はずれ：低く下がる1音 */
  miss: () => play(() => tone(220, 0, 0.22, 'sawtooth', 0.06, 140)),
  /** 技の習得：やわらかい3音 */
  learn: () => play(() => { [660, 880, 1175].forEach((f, i) => tone(f, i * 0.09, 0.22, 'sine', 0.14)); }),
  /** 対戦終了（命中が多いほど上まで上がる） */
  win: (n = 5) => play(() => { [523, 659, 784, 1047, 1319].slice(0, Math.max(2, n)).forEach((f, i) => tone(f, i * 0.08, 0.18, 'triangle', 0.13)); }),
  /** ステータスが上がった */
  up: () => play(() => { tone(587, 0, 0.1, 'triangle', 0.12); tone(784, 0.08, 0.1, 'triangle', 0.12); tone(1175, 0.16, 0.2, 'triangle', 0.12); }),
  /** ステータスが下がった（悔しい音） */
  down: () => play(() => { tone(330, 0, 0.16, 'triangle', 0.1); tone(247, 0.14, 0.32, 'triangle', 0.1, 196); }),
  /** タイトル：静かな1音（タップで飛ばしたときだけ鳴る） */
  title: () => play(() => { tone(392, 0, 0.6, 'sine', 0.08); tone(587, 0.05, 0.7, 'sine', 0.05); }),
};
