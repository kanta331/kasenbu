// 出題の決め方・SRS・ボス判定・書き出し。すべて純関数（DOM にも IndexedDB にも触れない）。
// Node のテスト（tests/logic.test.mjs）からも読み込む。

export const EXAM_DATE = '2027-01-23';
export const UNSEAL_DATES = { 2025: '2027-01-09', 2026: '2027-01-16' }; // 封印を解く日（content ではなくコードに持つ）
export const PASS_LINE = 16;                 // 合格ライン（推定）
export const SESSION_SIZE = 5;
export const REVIEW_OFFSETS = [1, 3, 7];     // 間違えた文を戻す日（翌日・3日後・7日後）
export const GRADUATE_STREAK = 3;            // 同じ文・同じ形式で3回連続正解で卒業
export const FORMATS = ['A', 'B', 'C', 'D', 'E', 'F'];
export const LOGIC = ['順接', '逆接', '譲歩', '理由', '同時'];
const CLOSABLE = new Set(['REL', 'NOUNCL', 'ADVCL', 'PTC', 'INF']);
// 形式ごとに狙う誤読（形式Fは選んだ選択肢の誤読IDを使う）
export const FORMAT_ERROR = { A: 'E1', B: 'E1', C: 'E1', D: 'E9', E: 'E4' };

// ---- 日付 ----
export function dayNumber(date) {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : date;
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}
export const daysUntilExam = today => dayNumber(EXAM_DATE) - dayNumber(today);
export function isUnsealed(year, today) {
  const d = UNSEAL_DATES[year];
  return !d || dayNumber(today) >= dayNumber(d);
}

// ---- 乱数（テストで再現できるように種を取る） ----
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function pickWeighted(items, weight, rand) {
  const ws = items.map(weight), total = ws.reduce((a, b) => a + b, 0);
  if (!items.length || total <= 0) return items[0];
  let r = rand() * total;
  for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
}

// ---- 1文に出せる形式 ----
/** 形式C で閉じさせる節。文末で閉じる節は答えが自明なので避け、無ければ使う。 */
export function closableSpan(s) {
  const last = lastWordIndex(s);
  const c = (s.spans ?? []).filter(sp => CLOSABLE.has(sp.kind) && sp.range[1] - sp.range[0] >= 2);
  return c.find(sp => sp.range[1] < last) ?? c[0] ?? null;
}
export function lastWordIndex(s) {
  for (let i = s.tokens.length - 1; i >= 0; i--) if (/[A-Za-z0-9]/.test(s.tokens[i])) return i;
  return s.tokens.length - 1;
}
/** 指示語の問題。同じ文に先行詞があるものを優先し、無ければ直前の文を見せる問題にする。 */
export function referentFor(s) {
  const r = s.referents ?? [];
  return r.find(x => !x.sent) ?? r.find(x => x.sent) ?? null;
}
export function applicableFormats(s) {
  const f = [];
  const m = s.main;
  if (m.s && m.s[1] > m.s[0]) f.push('A');           // 1語の主語は自明なので出さない
  if (m.v) f.push('B');
  if (closableSpan(s)) f.push('C');
  if (referentFor(s)) f.push('D');
  if ((s.connectors ?? []).length) f.push('E');
  if ((s.choices ?? []).length === 2) f.push('F');
  return f.filter(x => !(s.skip ?? []).includes(x));   // 答えが1つに決まらない形式は注釈で外してある
}

// ---- どの文を出してよいか ----
export function bossOrder(bosses) {
  return [...bosses].sort((a, b) => a.year - b.year || a.q - b.q || a.part.localeCompare(b.part));
}
/** 次のボス：未撃破・開封済みのうち先頭の1体。 */
export function nextBoss(content, state, today) {
  return bossOrder(content.bosses).find(b => state.bosses[b.id]?.status !== 'defeated' && (!b.sealed || isUnsealed(b.year, today))) ?? null;
}
/** 解剖に出してよい文。hold は出さない。過去問は、その篇のボスに挑戦した後だけ（初見の価値を守る）。 */
export function eligibleSentences(content, state) {
  const opened = new Set();
  for (const b of content.bosses) if (state.bosses[b.id]?.status) opened.add(`${b.year}-${b.q}`);
  return content.sentences.filter(s => s.status !== 'hold' && (s.source.kind === 'seihon' || opened.has(`${s.source.year}-${s.source.q}`)));
}

// ---- 状態 ----
export function emptyState() {
  return {
    items: {},        // sid -> { fmt: { A: { streak, graduated, n } }, seen }
    reviews: [],      // { sid, due(日番号), avoid(形式), stage }
    typeStats: {},    // 型ID -> { n, ok }
    errorStats: {},   // 誤読ID -> 回数
    bosses: {},       // bossId -> { status: 'tried'|'defeated', tries: [...] }
    boost: [],        // ボス戦で落とした型。次の5問で多く出す
    log: [],          // { t, sid, fmt, ok, err }
    flags: [],        // 「この解析はおかしい」が押された文ID
    lessons: { next: 0, day: null, examples: [] },  // 基礎講座の進み具合
  };
}
const typeAcc = (state, t) => { const x = state.typeStats[t]; return x && x.n ? x.ok / x.n : 0.5; };
const fmtRec = (state, sid, fmt) => state.items[sid]?.fmt?.[fmt];
const graduated = (state, sid, fmt) => !!fmtRec(state, sid, fmt)?.graduated;

/** 文の重み。次のボスの型・ボス戦で落とした型・正答率の低い型を多く、見たことのない文を少し多く。 */
function sentenceWeight(s, state, bossTypes, focus = []) {
  let w = 1;
  for (const t of s.types ?? []) {
    w += (1 - typeAcc(state, t)) * 1.5;
    if (bossTypes.has(t)) w += 2;
    if (focus.includes(t)) w += 4;
    if (state.boost.includes(t)) w += 3;
  }
  if (!state.items[s.id]?.seen) w += 1;
  return w;
}
function chooseFormat(s, state, rand, { avoid = null, prefer = null } = {}) {
  let fs = applicableFormats(s).filter(f => f !== avoid && !graduated(state, s.id, f));
  if (!fs.length) fs = applicableFormats(s).filter(f => f !== avoid);
  if (!fs.length) return null;
  if (prefer && fs.includes(prefer)) return prefer;
  // 練習の少ない形式を多めに
  return pickWeighted(fs, f => 1 / (1 + (fmtRec(state, s.id, f)?.n ?? 0)), rand);
}

/**
 * 今日の5問を決める。返り値 [{ sid, fmt, review }]
 * - 最低1問は形式F、最低1問は復習（期限の来た復習があれば）
 * - 復習は前回と別の形式
 * - 同じ回に同じ文は出さない
 */
export function selectSession(content, state, today, seed = Date.now(), { focus = [] } = {}) {
  const rand = rng(seed), day = dayNumber(today);
  const pool = eligibleSentences(content, state);
  const byId = new Map(content.sentences.map(s => [s.id, s]));
  const boss = nextBoss(content, state, today);
  const bossTypes = new Set(boss?.types ?? []);
  const out = [], used = new Set();

  // 1) 復習（期限の古い順に最大2問）
  const due = state.reviews.filter(r => r.due <= day && byId.has(r.sid) && byId.get(r.sid).status !== 'hold')
    .sort((a, b) => a.due - b.due);
  for (const r of due) {
    if (out.filter(q => q.review).length >= 2) break;
    if (used.has(r.sid)) continue;
    const fmt = chooseFormat(byId.get(r.sid), state, rand, { avoid: r.avoid });
    if (!fmt) continue;
    out.push({ sid: r.sid, fmt, review: true }); used.add(r.sid);
  }

  // 2) 形式F を1問は入れる
  if (!out.some(q => q.fmt === 'F')) {
    const cands = pool.filter(s => !used.has(s.id) && applicableFormats(s).includes('F') && !graduated(state, s.id, 'F'));
    const s = pickWeighted(cands, x => sentenceWeight(x, state, bossTypes, focus), rand);
    if (s) { out.push({ sid: s.id, fmt: 'F', review: false }); used.add(s.id); }
  }

  // 3) 残りを重み付きで
  let guard = 0;
  while (out.length < SESSION_SIZE && guard++ < 200) {
    const cands = pool.filter(s => !used.has(s.id) && applicableFormats(s).some(f => !graduated(state, s.id, f)));
    if (!cands.length) break;
    const s = pickWeighted(cands, x => sentenceWeight(x, state, bossTypes, focus), rand);
    const fmt = chooseFormat(s, state, rand);
    if (!fmt) { used.add(s.id); continue; }
    out.push({ sid: s.id, fmt, review: false }); used.add(s.id);
  }
  // 復習を先頭、F を最後に（最後に骨格訳で締める）
  return [...out.filter(q => q.review), ...out.filter(q => !q.review && q.fmt !== 'F'), ...out.filter(q => !q.review && q.fmt === 'F')];
}

/** 1問の回答を状態に反映した新しい状態を返す。err は形式Fで選んだ誤答の誤読ID。 */
export function recordAnswer(state, s, fmt, ok, today, { err = null, review = false, t = Date.now() } = {}) {
  const st = structuredClone(state), day = dayNumber(today);
  const item = st.items[s.id] ??= { fmt: {}, seen: 0 };
  item.seen++;
  const rec = item.fmt[fmt] ??= { streak: 0, graduated: false, n: 0 };
  rec.n++;
  rec.streak = ok ? rec.streak + 1 : 0;
  if (rec.streak >= GRADUATE_STREAK) rec.graduated = true;

  for (const ty of s.types ?? []) {
    const x = st.typeStats[ty] ??= { n: 0, ok: 0 };
    x.n++; if (ok) x.ok++;
  }
  const e = ok ? null : (fmt === 'F' ? err : FORMAT_ERROR[fmt]);
  if (e) st.errorStats[e] = (st.errorStats[e] ?? 0) + 1;

  if (review) {   // 今日の復習を1つ消化
    const i = st.reviews.findIndex(r => r.sid === s.id && r.due <= day);
    if (i >= 0) st.reviews.splice(i, 1);
  }
  if (!ok) {      // 間違えたら翌日・3日後・7日後に、この形式を避けて戻す（予定は組み直す）
    st.reviews = st.reviews.filter(r => r.sid !== s.id);
    REVIEW_OFFSETS.forEach((off, k) => st.reviews.push({ sid: s.id, due: day + off, avoid: fmt, stage: k + 1 }));
  }
  if (st.boost.length && (s.types ?? []).some(ty => st.boost.includes(ty))) {
    st.boostLeft = (st.boostLeft ?? SESSION_SIZE) - 1;
    if (st.boostLeft <= 0) { st.boost = []; delete st.boostLeft; }
  }
  st.log.push({ t, sid: s.id, fmt, ok, err: e });
  return st;
}

// ---- 採点（タップ） ----
export function judgeTap(s, fmt, tapped) {
  const m = s.main;
  if (fmt === 'A') return tapped === m.s[1];
  if (fmt === 'B') return [m, ...(m.more ?? [])].some(c => c.v && tapped >= c.v[0] && tapped <= c.v[1]);
  if (fmt === 'C') return tapped === closableSpan(s).range[1];
  if (fmt === 'D') { const r = referentFor(s); return tapped >= r.range[0] && tapped <= r.range[1]; }
  throw new Error('tap 形式ではない: ' + fmt);
}

// ---- ボス ----
/** 撃破＝skeleton 種別がすべて「はい」かつ制限時間内。 */
export function judgeBoss(boss, answers, elapsedSec) {
  const cps = boss.checkpoints;
  const missed = cps.map((c, i) => ({ ...c, i })).filter(c => answers[c.i] !== true);
  const skeletonOk = cps.every((c, i) => c.kind !== 'skeleton' || answers[i] === true);
  const inTime = elapsedSec <= boss.limit_sec;
  return { defeated: skeletonOk && inTime, skeletonOk, inTime, missed };
}
export function recordBoss(state, boss, result, elapsedSec, t = Date.now()) {
  const st = structuredClone(state);
  const b = st.bosses[boss.id] ??= { status: 'tried', tries: [] };
  b.tries.push({ t, sec: elapsedSec, defeated: result.defeated, missed: result.missed.map(m => m.i) });
  if (result.defeated) b.status = 'defeated';
  if (!result.defeated) { st.boost = [...boss.types]; st.boostLeft = SESSION_SIZE; }
  return st;
}
export const defeatedCount = state => Object.values(state.bosses).filter(b => b.status === 'defeated').length;

// ---- 書き出し ----
export const sourceLabel = s => s.source.kind === 'seihon' ? `TR${s.source.no}` : `K${s.source.year}-${s.source.q}${s.source.part ?? ''}`;
export function joinTokens(s, from = 0, to = s.tokens.length - 1) {
  let out = '';
  for (let i = from; i <= to; i++) out += (i > from && (s.space_before?.[i] ?? true) ? ' ' : '') + s.tokens[i];
  return out;
}
export function mmss(sec) {
  const a = Math.abs(Math.round(sec));
  return `${sec < 0 ? '-' : ''}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
}
export function bossCopyText(boss, result, elapsedSec) {
  const lines = [`【添削依頼】${boss.year}年度 (${boss.q})(${boss.part})`, `所要時間：${mmss(elapsedSec)}（制限 ${mmss(boss.limit_sec)}）`, `判定：${result.defeated ? '撃破' : '挑戦済み'}`];
  lines.push(result.missed.length ? '落としたチェックポイント：' : '落としたチェックポイント：なし');
  for (const m of result.missed) lines.push(`- [${m.kind}] ${m.text}`);
  lines.push('', '手書き答案の写真を添付します。訳の骨格（主語・述語・節の範囲・論理）を中心に添削してください。');
  return lines.join('\n');
}
/** 解剖で間違えた文の難語を、eitango の受け箱形式で。`語｜出典｜出会った一文｜誤読｜文脈での意味` */
export function inboxLines(content, state) {
  const byId = new Map(content.sentences.map(s => [s.id, s]));
  const seen = new Set(), out = [];
  for (const l of state.log) {
    if (l.ok) continue;
    const s = byId.get(l.sid); if (!s) continue;
    for (const h of s.hard ?? []) {
      const word = joinTokens(s, h.range[0], h.range[1]);
      const key = `${word}|${s.id}`; if (seen.has(key)) continue; seen.add(key);
      out.push([word, sourceLabel(s), s.text, l.err ?? '', h.ja].map(x => String(x).replaceAll('｜', '|')).join('｜'));
    }
  }
  return out;
}
export function weeklyText(content, state, now = Date.now()) {
  const since = now - 7 * 86400000, week = state.log.filter(l => l.t >= since);
  const lines = [`【週報】${new Date(now).toISOString().slice(0, 10)}`, `今週の回答：${week.length}問（正解 ${week.filter(l => l.ok).length}）`];
  const typ = Object.entries(state.typeStats).filter(([, x]) => x.n >= 3).map(([t, x]) => [t, x.ok / x.n, x.n]).sort((a, b) => a[1] - b[1]).slice(0, 3);
  lines.push('正答率の低い型：' + (typ.length ? typ.map(([t, a, n]) => `${t} ${Math.round(a * 100)}%（${n}問）`).join('、') : 'まだ少ない'));
  const err = Object.entries(state.errorStats).sort((a, b) => b[1] - a[1]).slice(0, 3);
  lines.push('多い誤読：' + (err.length ? err.map(([e, n]) => `${e} ${n}回`).join('、') : 'なし'));
  const bs = bossOrder(content.bosses).map(b => `${b.id}:${{ defeated: '撃破', tried: '挑戦済み' }[state.bosses[b.id]?.status] ?? '未挑戦'}`);
  lines.push(`ボス：撃破 ${defeatedCount(state)}/20（合格ライン（推定）${PASS_LINE}）`, bs.join(' '));
  if (state.flags.length) lines.push('「おかしい」と報告した文：' + [...new Set(state.flags)].join(', '));
  return lines.join('\n');
}

// ---- コンテンツの最低限の確認（読み込み画面用） ----
export function checkContent(c) {
  if (!c || !Array.isArray(c.sentences) || !Array.isArray(c.bosses)) return 'kasenbu-content.json の形ではありません';
  if (!c.sentences.length) return '文が入っていません';
  const bad = c.sentences.find(s => !s.id || !Array.isArray(s.tokens) || !s.main);
  if (bad) return `文の形が違います: ${bad.id ?? '(IDなし)'}`;
  return null;
}

// ---- 基礎講座 ----
// 今日の5問を押すたびに、講座を1回分はさむ。全部終われば（とばした回も含む）出ない。
const REL_WORDS = ['which', 'that', 'who', 'whom', 'whose', 'where', 'when', 'why'];
const PREPS = ['in', 'on', 'of', 'for', 'with', 'to', 'by', 'from', 'at', 'under', 'through', 'about', 'into', 'upon', 'without', 'among', 'between', 'against', 'over', 'during'];
const isW = t => /[A-Za-z]/.test(t);
const nWords = s => s.tokens.filter(isW).length;
const lower = (s, i) => (s.tokens[i] ?? '').toLowerCase();
const spansOf = (s, k) => (s.spans ?? []).filter(x => x.kind === k);
/** 講座の「本物の文」を選ぶ規則。キーは lessons.js の real。 */
export const EXAMPLE_RULES = {
  short: s => !!s.main.s && nWords(s) >= 5 && nWords(s) <= 12 && !(s.spans ?? []).length,
  verbs: s => !!s.main.s && nWords(s) >= 5 && nWords(s) <= 14 && s.main.v[1] > s.main.v[0],
  longsubj: s => !!s.main.s && s.tokens.slice(s.main.s[0], s.main.s[1] + 1).filter(isW).length >= 4 && nWords(s) <= 20,
  relword: s => spansOf(s, 'REL').some(x => REL_WORDS.includes(lower(s, x.range[0]))),
  contact: s => spansOf(s, 'REL').some(x => !REL_WORDS.includes(lower(s, x.range[0])) && !PREPS.includes(lower(s, x.range[0]))),
  prepwh: s => spansOf(s, 'REL').some(x => PREPS.includes(lower(s, x.range[0])) && ['which', 'whom'].includes(lower(s, x.range[0] + 1))),
  postptc: s => spansOf(s, 'PTC').some(x => x.head != null),
  ins: s => spansOf(s, 'INS').length > 0,
  nouncl: s => spansOf(s, 'NOUNCL').length > 0,
  ref: s => (s.referents ?? []).some(r => !r.sent),
  conn: s => (s.connectors ?? []).length > 0,
  leadptc: s => spansOf(s, 'PTC').some(x => x.head == null) || ((s.types ?? []).includes('PTC') && !spansOf(s, 'PTC').length),
  negcmp: s => (s.types ?? []).some(t => t === 'NEGCMP' || t === 'SOTHAT'),
  long: s => nWords(s) >= 22 && (s.spans ?? []).length >= 2,
};
/** 残りの講座があれば次の講座の番号。全部終わって（またはとばして）いれば null。押すたびに出す。 */
export function lessonDue(state, today, total) {
  const L = state.lessons ?? { next: 0 };
  return L.next >= total ? null : L.next;
}
/** 講座の本物の例文。正本の文から、規則に合い、まだ講座で使っていない文を、短い順に。 */
export function pickExample(content, state, rule) {
  const f = EXAMPLE_RULES[rule]; if (!f) return null;
  const usedEx = new Set(state.lessons?.examples ?? []);
  const cands = content.sentences.filter(s => s.status !== 'hold' && s.source.kind === 'seihon' && f(s))
    .sort((a, b) => nWords(a) - nWords(b) || (a.id < b.id ? -1 : 1));
  return cands.find(s => !usedEx.has(s.id)) ?? cands[0] ?? null;
}
export function recordLesson(state, idx, today, exampleId = null, { skipped = false } = {}) {
  const st = structuredClone(state);
  const L = st.lessons ??= { next: 0, day: null, examples: [] };
  L.examples ??= [];
  if (idx >= L.next) L.next = idx + 1;
  L.day = dayNumber(today);
  if (exampleId) L.examples.push(exampleId);
  if (skipped) (L.skipped ??= []).push(idx);
  return st;
}
