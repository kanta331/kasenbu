// 画面。状態の計算は logic.js、保存は db.js。
import * as L from './logic.js';
import * as DB from './db.js';
import { LESSONS, exampleHTML } from './lessons.js';
import * as T from './sensei.js';

const $app = document.getElementById('app');
const KIND_OPEN = { INS: '[', default: '(' }, KIND_CLOSE = { INS: ']', default: ')' };
const ERROR_NAME = {
  E1: '節を閉じずに、主節の動詞を節の中にかけた', E2: '前置詞＋関係詞で主語と目的語を逆にした', E3: '知らない語で止まった',
  E4: '論理語を逆に読んだ', E5: '動詞＋名詞の熟語をばらした', E6: '命令文を名詞のかたまりに読んだ',
  E7: '形の似た語と取り違えた', E8: '原文にない語を補った', E9: '指示語の指す先を取り違えた',
};
const PROMPT = {
  A: '主節の主語はどこまでか。主語の最後の語をタップ。',
  B: '主節の述語動詞をタップ。',
  C: '開き括弧（ が閉じる位置をタップ。節の最後の語を押す。',
  D: '色の付いた語が指す語句をタップ。',
  E: '色の付いた語の論理はどれか。',
  F: '〔？〕は知らない語。骨格として正しい訳を選ぶ。',
};

let content = null, state = null;
const today = () => new Date();
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const save = () => DB.put('state', state);
const byId = id => content.sentences.find(s => s.id === id);
const isWord = t => /[A-Za-z0-9〔]/.test(t);

function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.append(t); setTimeout(() => t.remove(), 1800);
}
async function copy(text, msg = 'コピーした') {
  try { await navigator.clipboard.writeText(text); }
  catch { const ta = document.createElement('textarea'); ta.className = 'copy'; ta.value = text; document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
  toast(msg);
}
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function view(html, dock = '') {
  $app.innerHTML = html + (dock ? `<div class="dock"><div>${dock}</div></div>` : '');
  window.scrollTo(0, 0);
}

// ---- 文の描画 ----
/**
 * opts.tap: 押せる語の判定 (i)=>bool / opts.mark: 'all'（解説）| 'none' / opts.brackets: 表示する spans
 * opts.highlight: {ref, logic} 問題で色を付ける語 / opts.tokens: 置き換えたトークン列（形式F）
 */
function sentenceHTML(s, opts = {}) {
  const toks = opts.tokens ?? s.tokens.map((t, i) => ({ t, i, ws: s.space_before?.[i] ?? true }));
  const n = s.tokens.length, cls = Array.from({ length: n }, () => new Set());
  const opens = Array.from({ length: n }, () => []), closes = Array.from({ length: n }, () => []);
  if (opts.mark === 'all') {
    const m = s.main;
    for (const c of [m, ...(m.more ?? [])]) {
      if (c.s) for (let i = c.s[0]; i <= c.s[1]; i++) if (isWord(s.tokens[i])) cls[i].add('subj');
      for (let i = c.v[0]; i <= c.v[1]; i++) cls[i].add('verb');
    }
    for (const r of s.referents ?? []) {
      cls[r.token].add('ref');
      if (!r.sent) for (let i = r.range[0]; i <= r.range[1]; i++) cls[i].add('refdst');
    }
    for (const c of s.connectors ?? []) cls[c.token].add('logic');
    for (const sp of s.spans ?? []) if (sp.head != null && sp.kind !== 'INS') cls[sp.head].add('head');
  }
  for (const sp of opts.brackets ?? (opts.mark === 'all' ? s.spans ?? [] : [])) {
    opens[sp.range[0]].push(KIND_OPEN[sp.kind] ?? KIND_OPEN.default);
    if (sp.range[1] != null) closes[sp.range[1]].unshift(KIND_CLOSE[sp.kind] ?? KIND_CLOSE.default);
  }
  for (const i of opts.highlight?.ref ?? []) cls[i].add('ref');
  for (const i of opts.highlight?.logic ?? []) cls[i].add('logic');
  for (const i of opts.highlight?.refdst ?? []) cls[i].add('refdst');

  let html = '';
  toks.forEach((x, k) => {
    const i = x.i;
    if (k > 0 && x.ws) html += '</span> <span class="nw">';   // 句読点・括弧は前後の語と離さない
    if (i != null) html += opens[i].map(b => `<span class="br">${b}</span>`).join('');
    const c = i != null ? [...cls[i]] : [];
    if (x.hole) c.push('hole');
    const tap = i != null && opts.tap?.(i);
    if (tap) c.push('tap');
    html += `<span class="tok ${c.join(' ')}"${tap ? ` data-i="${i}"${opts.sid ? ` data-sid="${opts.sid}"` : ''}` : ''}>${esc(x.t)}</span>`;
    if (i != null) html += closes[i].map(b => `<span class="br">${b}</span>`).join('');
  });
  return `<div class="sent${opts.prev ? ' prev' : ''}"><span class="nw">${html}</span></div>`;
}
/** 形式F：難語の範囲を〔？〕1つにまとめたトークン列 */
function holeTokens(s) {
  const out = [], hard = s.hard ?? [];
  for (let i = 0; i < s.tokens.length; i++) {
    const h = hard.find(x => x.range[0] === i);
    if (h) { out.push({ t: '〔？〕', i: null, ws: s.space_before?.[i] ?? true, hole: true }); i = h.range[1]; continue; }
    out.push({ t: s.tokens[i], i, ws: s.space_before?.[i] ?? true });
  }
  return out;
}
const legend = `<div class="legend"><i style="color:var(--subj)">下線</i>＝主語　<i style="color:var(--verb)">太字</i>＝述語　<i style="color:var(--clause)">( )</i>＝節・句　<i style="color:var(--clause)">[ ]</i>＝挿入　<i style="color:var(--ref)">紫</i>＝指示語と指す先　<i style="color:var(--logic)">金</i>＝論理語</div>`;

// ---- 読み込み ----
function showLoad(msg = '') {
  view(`<h1>下線部</h1>
    <p>最初に、Mac で作ったコンテンツ（<b>kasenbu-content.json</b>）を読み込む。iCloud Drive などに置いたファイルを選ぶ。以後はオフラインで動く。</p>
    ${msg ? `<p style="color:var(--verb)">${esc(msg)}</p>` : ''}
    <input id="file" type="file" accept=".json,application/json" style="display:none">`,
    `<button class="btn" id="pick">コンテンツを読み込む</button>${content ? '<button class="btn sub" id="back">やめる</button>' : ''}`);
  const f = document.getElementById('file');
  document.getElementById('pick').onclick = () => f.click();
  document.getElementById('back')?.addEventListener('click', showHome);
  f.onchange = async () => {
    try {
      const c = JSON.parse(await f.files[0].text());
      const e = L.checkContent(c);
      if (e) return showLoad(e);
      await DB.put('content', c); content = c;
      toast(`${c.sentences.length}文・ボス${c.bosses.length}体を読み込んだ`);
      showHome();
    } catch (e) { showLoad('読み込めませんでした：' + e.message); }
  };
}

// ---- ホーム ----
const STATUS = { defeated: '撃破', tried: '挑戦済み' };
function showHome() {
  const t = today(), next = L.nextBoss(content, state, t);
  const bosses = new Map(content.bosses.map(b => [b.id, b]));
  let grid = '';
  for (const y of [2022, 2023, 2024, 2025, 2026]) {
    const locked = !L.isUnsealed(y, t);
    grid += `<div class="year">${y}年度${locked ? '　<span class="muted">1月に開封</span>' : ''}</div><div class="bosses">`;
    for (const [q, p] of [[1, 'a'], [1, 'b'], [2, 'a'], [2, 'b']]) {
      const id = `K${y}-${q}-${p}`, b = bosses.get(id);
      if (!b) { grid += `<div class="boss sealed"><span class="lbl">(${q})${p}</span><span class="st">データなし</span></div>`; continue; }
      const st = state.bosses[id]?.status;
      const c = ['boss', st ?? '', locked ? 'sealed' : '', next?.id === id ? 'next' : ''].join(' ');
      grid += `<button class="${c}" data-boss="${id}"><span class="lbl">(${q})${p}</span>
        <span class="st">${locked ? '封印' : STATUS[st] ?? '未挑戦'}${next?.id === id ? '・次' : ''}</span>
        <span class="tags">${b.types.map(x => `<span class="tag">${x}</span>`).join('')}</span></button>`;
    }
    grid += '</div>';
  }
  view(`<div class="top"><h1>下線部</h1><span><a class="link" href="eitango/">単語カード</a><button class="link" id="lessons">講座</button><button class="link" id="export">書き出し</button></span></div>
    <div class="stats">
      <div class="stat"><b>${Math.max(0, L.daysUntilExam(t))}</b><span>試験まであと（日）</span></div>
      <div class="stat"><b>${L.defeatedCount(state)}<small style="font-size:16px">/20</small></b><span>骨格を取り切れた下線部（合格ライン（推定）${L.PASS_LINE}）</span></div>
    </div>
    ${grid}`,
    `${lessonNote()}<button class="btn" id="go">今日の5問</button>`);
  document.getElementById('go').onclick = startSession;
  document.getElementById('export').onclick = showExport;
  document.getElementById('lessons').onclick = showLessonList;
  $app.querySelectorAll('[data-boss]').forEach(el => el.onclick = () => showBossIntro(bosses.get(el.dataset.boss)));
}

// ---- 基礎講座（1日1回、今日の5問の前に入る） ----
function lessonNote() {
  const li = L.lessonDue(state, today(), LESSONS.length);
  return li == null ? '' : `<p class="lnote">基礎講座 第${li + 1}回（2〜3分）から始まる</p>`;
}
/** 講座の一覧。終えた回・とばした回を開いて見直せる（見直しは5問につながない）。 */
const LSTATUS = { done: '終えた', skipped: 'とばした' };
function showLessonList() {
  const rows = LESSONS.map((les, i) => {
    const st = L.lessonStatus(state, i);
    return st
      ? `<button class="lrow" data-li="${i}"><span class="lno">${i + 1}</span><span class="lname">${esc(les.title)}</span><span class="lst ${st}">${LSTATUS[st]}</span></button>`
      : `<div class="lrow off"><span class="lno">${i + 1}</span><span class="lname">${esc(les.title)}</span><span class="lst">まだ</span></div>`;
  }).join('');
  view(`<div class="top"><h1>基礎講座</h1><button class="link" id="back">ホーム</button></div>
    <p class="muted">終えた回・とばした回を見直せる。まだの回は「今日の5問」で順に出る。</p>
    <div class="llist">${rows}</div>`);
  document.getElementById('back').onclick = showHome;
  $app.querySelectorAll('[data-li]').forEach(el => el.onclick = () => showLesson(+el.dataset.li, 0, false, true));
}
function showLesson(li, k, shown = false, review = false) {
  const les = LESSONS[li], n = les.cards.length;
  const head = `<div class="qhead"><span>基礎講座 ${li + 1} / ${LESSONS.length}${review ? '　見直し' : ''}</span><button class="link" id="quit" style="padding:0">${review ? '一覧へ' : 'やめる'}</button></div>
    <h1 class="ltitle">${esc(les.title)}</h1>${k === 0 ? `<p class="lgoal">${esc(les.goal)}</p>` : ''}`;
  let body, nextLabel, exId = null;
  if (k < n) {
    const c = les.cards[k];
    body = `<p class="lsay">${esc(c.say)}</p>${exampleHTML(c.ex, { plain: !shown })}
      ${shown ? `<p class="lja">${esc(c.ja)}</p>${legendFor(c.ex)}` : ''}`;
    nextLabel = shown ? '次へ' : '形を見る';
  } else {
    const known = state.lessons?.exampleOf?.[li];
    const ex = (review && known && byId(known)) || L.pickExample(content, state, les.real);
    if (!ex) return review ? endReview(li, null) : finishLesson(li, null);
    exId = ex.id;
    body = `<p class="lsay">本物の文（正本${ex.source.no}番）。${esc(les.realSay)}</p>
      ${shown ? sentenceHTML(ex, { mark: 'all' }) + legend + `<dl class="kv"><dt>骨格訳</dt><dd>${esc(ex.skeleton_ja)}</dd><dt>模範訳</dt><dd>${esc(ex.model_ja)}</dd></dl>` : sentenceHTML(ex, {})}`;
    nextLabel = shown ? (review ? '一覧へ戻る' : les.focus.length ? 'この形を含む5問へ' : '今日の5問へ') : '形を見る';
  }
  view(head + body, `<button class="btn" id="lnext">${nextLabel}</button>${review ? '' : '<button class="btn sub" id="lskip">この回はとばして5問へ</button>'}`);
  document.getElementById('quit').onclick = review ? showLessonList : showHome;
  document.getElementById('lskip')?.addEventListener('click', () => {
    state = L.recordLesson(state, li, today(), null, { skipped: true }); save();
    runSession();
  });
  document.getElementById('lnext').onclick = () => {
    if (!shown) return showLesson(li, k, true, review);
    if (k < n) return showLesson(li, k + 1, false, review);
    review ? endReview(li, exId) : finishLesson(li, exId);
  };
}
function endReview(li, exId) {
  if (L.lessonStatus(state, li) === 'skipped') { state = L.recordLesson(state, li, today(), exId); save(); }
  showLessonList();
}
function finishLesson(li, exId) {
  state = L.recordLesson(state, li, today(), exId); save();
  runSession(LESSONS[li].focus);
}
/** 作例に出てくる色だけの凡例 */
function legendFor(src) {
  const items = [['[s', 'subj', '下線＝主語（だれが・何が）'], ['[v', 'verb', '太字＝述語動詞（どうする・どうだ）'], ['(', 'clause', '( )＝説明のかたまり'], ['{', 'clause', '[ ]＝割り込み'], ['[r', 'ref', '紫＝指示語と指す先'], ['[l', 'logic', '金＝論理語']];
  const toks = src.split(/\s+/);
  const has = items.filter(([m]) => toks.includes(m));
  return has.length ? `<div class="legend">${has.map(([, c, t]) => `<i style="color:var(--${c})">${t}</i>`).join('　')}</div>` : '';
}

// ---- 解剖（5問） ----
let session = null;
function startSession() {
  const li = L.lessonDue(state, today(), LESSONS.length);
  if (li != null) return showLesson(li, 0);
  runSession();
}
function runSession(focus = []) {
  const qs = L.selectSession(content, state, today(), Date.now(), { focus });
  if (!qs.length) return toast('出せる文がない');
  session = { qs, k: 0, results: [] };
  showQuestion();
}
function showQuestion() {
  const q = session.qs[session.k], s = byId(q.sid);
  const head = `<div class="qhead"><span>${session.k + 1} / ${session.qs.length}${q.review ? '　復習' : ''}</span><button class="link" id="quit" style="padding:0">やめる</button></div>
    <div class="prompt">${PROMPT[q.fmt]}</div>`;
  let body = '';
  if (q.fmt === 'A' || q.fmt === 'B') {
    body = sentenceHTML(s, { tap: i => isWord(s.tokens[i]) });
  } else if (q.fmt === 'C') {
    const sp = L.closableSpan(s);
    body = sentenceHTML(s, { tap: i => i >= sp.range[0] && isWord(s.tokens[i]), brackets: [{ range: [sp.range[0], null], kind: sp.kind }] });
  } else if (q.fmt === 'D') {
    const r = L.referentFor(s), prev = r.sent ? byId(r.sent) : null;
    body = (prev ? sentenceHTML(prev, { prev: true, sid: prev.id, tap: i => isWord(prev.tokens[i]) }) : '')
      + sentenceHTML(s, { sid: s.id, tap: i => !prev && isWord(s.tokens[i]) && i !== r.token, highlight: { ref: [r.token] } });
  } else if (q.fmt === 'E') {
    const c = s.connectors[0];
    body = sentenceHTML(s, { highlight: { logic: [c.token] } })
      + `<div class="logicbtns">${L.LOGIC.map(x => `<button class="choice" data-logic="${x}">${x}</button>`).join('')}</div>`;
  } else if (q.fmt === 'F') {
    const opts = [{ ja: s.model_ja, ok: true }, ...s.choices.map(c => ({ ja: c.ja, err: c.error }))];
    for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
    q.opts = opts;
    body = sentenceHTML(s, { tokens: holeTokens(s) })
      + `<div class="choices">${opts.map((o, i) => `<button class="choice" data-opt="${i}">${esc(o.ja)}</button>`).join('')}</div>`;
  }
  view(head + body + '<div id="after"></div>');
  document.getElementById('quit').onclick = () => { session = null; showHome(); };
  $app.querySelectorAll('.tok.tap').forEach(el => el.onclick = () => answer({ tap: +el.dataset.i, sid: el.dataset.sid }, el));
  $app.querySelectorAll('[data-logic]').forEach(el => el.onclick = () => answer({ logic: el.dataset.logic }, el));
  $app.querySelectorAll('[data-opt]').forEach(el => el.onclick = () => answer({ opt: +el.dataset.opt }, el));
}

function answer(a, el) {
  const q = session.qs[session.k];
  if (q.done) return;
  q.done = true;
  const s = byId(q.sid);
  let ok, err = null, yours = '';
  if (q.fmt === 'D') {
    const r = L.referentFor(s);
    ok = (r.sent ? a.sid === r.sent : true) && a.tap >= r.range[0] && a.tap <= r.range[1];
    const src = a.sid && a.sid !== s.id ? byId(a.sid) : s;
    yours = `「${esc(s.tokens[r.token])}」＝「${esc(src.tokens[a.tap])}」`;
  } else if ('tap' in a) {
    ok = L.judgeTap(s, q.fmt, a.tap);
    const m = s.main;
    if (q.fmt === 'A') yours = `主語＝「${esc(L.joinTokens(s, Math.min(m.s[0], a.tap), a.tap))}」`;
    if (q.fmt === 'B') {
      const inside = (s.spans ?? []).some(sp => sp.kind !== 'INS' && a.tap >= sp.range[0] && a.tap <= sp.range[1]);
      yours = `述語＝「${esc(s.tokens[a.tap])}」${inside ? '（これは括弧の中の語。主節の述語ではない）' : ''}`;
    }
    if (q.fmt === 'C') { const sp = L.closableSpan(s); yours = `節＝（${esc(L.joinTokens(s, sp.range[0], a.tap))}）`; }
  } else if ('logic' in a) {
    const c = s.connectors[0]; ok = a.logic === c.logic;
    yours = `「${esc(c.word)}」＝${a.logic}`;
    $app.querySelectorAll('[data-logic]').forEach(b => { if (b.dataset.logic === c.logic) b.classList.add('right'); });
  } else {
    const o = q.opts[a.opt]; ok = !!o.ok; err = o.err ?? null;
    if (!ok) yours = `${esc(o.ja)}<br><span class="muted">${o.err}：${ERROR_NAME[o.err]}</span>`;
    $app.querySelectorAll('[data-opt]').forEach(b => { if (q.opts[+b.dataset.opt].ok) b.classList.add('right'); });
  }
  if (!ok) el.classList.add(el.classList.contains('choice') ? 'wrong' : 'picked');
  else el.classList.add('hit');
  $app.querySelectorAll('.tok.tap').forEach(t => t.classList.remove('tap'));

  state = L.recordAnswer(state, s, q.fmt, ok, today(), { err, review: q.review });
  save();
  const info = ok ? null : { fmt: q.fmt, mine: plain(yours.split('<br>')[0]).replace(/（これは.*$/, ''), right: rightAnswer(s, q.fmt), err: q.fmt === 'F' ? err : L.FORMAT_ERROR[q.fmt] };
  if (info) info.errName = ERROR_NAME[info.err];
  session.results.push({ sid: s.id, fmt: q.fmt, ok, info });

  const hard = (s.hard ?? []).map(h => `${esc(L.joinTokens(s, h.range[0], h.range[1]))}：${esc(h.ja)}`).join('<br>');
  const prev = (s.referents ?? []).find(r => r.sent);
  const prevS = prev ? byId(prev.sent) : null;
  document.getElementById('after').innerHTML = `
    <div class="verdict${ok ? ' ok' : ''}">${ok ? '正解' : '不正解'}</div>
    ${!ok && yours ? `<div class="yours">あなたの選んだ読み：${yours}</div>` : ''}
    <div class="explain">
      ${prevS ? sentenceHTML(prevS, { prev: true, highlight: { refdst: range(prev.range) } }) : ''}
      ${sentenceHTML(s, { mark: 'all' })}${legend}
      <dl class="kv">
        <dt>骨格訳</dt><dd>${esc(s.skeleton_ja)}</dd>
        <dt>模範訳</dt><dd>${esc(s.model_ja)}</dd>
        ${hard ? `<dt>難語</dt><dd>${hard}</dd>` : ''}
        ${s.note ? `<dt>構造</dt><dd>${esc(s.note)}</dd>` : ''}
      </dl>
      <button class="link" id="flag">この解析はおかしい</button><span class="muted">${s.id}</span>
    </div>
    ${info && canAsk(s) ? senseiBoxHTML(s.id) : ''}`;
  if (info && canAsk(s)) bindSensei(document.querySelector('.chat'), s, info);
  document.getElementById('flag').onclick = e => { state.flags.push(s.id); save(); e.target.textContent = '記録した（書き出しで送れる）'; e.target.disabled = true; };
  document.querySelector('.verdict').scrollIntoView({ behavior: 'smooth', block: 'start' });
  const last = session.k === session.qs.length - 1;
  const dock = document.createElement('div'); dock.className = 'dock';
  dock.innerHTML = `<div><button class="btn" id="next">${last ? '結果' : '次へ'}</button></div>`;
  $app.append(dock);
  document.getElementById('next').onclick = () => { if (last) showSummary(); else { session.k++; showQuestion(); } };
}
// ---- Claude先生（間違えた文について聞く。ネットと APIキーが要る） ----
const plain = h => String(h).replace(/<br>/g, ' ').replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
/** 封印中の文は先生にも送らない */
const canAsk = s => !!s && (s.source.kind === 'seihon' || L.isUnsealed(s.source.year, today()));
function rightAnswer(s, fmt) {
  const m = s.main;
  if (fmt === 'A') return m.s ? `主語＝「${L.joinTokens(s, m.s[0], m.s[1])}」` : '';
  if (fmt === 'B') return `述語＝「${L.joinTokens(s, m.v[0], m.v[1])}」`;
  if (fmt === 'C') { const sp = L.closableSpan(s); return sp ? `節＝（${L.joinTokens(s, sp.range[0], sp.range[1])}）` : ''; }
  if (fmt === 'D') { const r = L.referentFor(s); const src = r.sent ? byId(r.sent) : s; return `「${s.tokens[r.token]}」＝「${L.joinTokens(src, r.range[0], r.range[1])}」`; }
  if (fmt === 'E') { const c = s.connectors[0]; return `「${c.word}」＝${c.logic}`; }
  if (fmt === 'F') return s.model_ja;
  return '';
}
const CHATS = 'kasenbu:chats';
const loadChats = () => { try { const o = JSON.parse(localStorage.getItem(CHATS)); return o && typeof o === 'object' ? o : {}; } catch { return {}; } };
const saveChats = o => { try { localStorage.setItem(CHATS, JSON.stringify(o)); } catch {} };
function bubble(who, text, extra = '') {
  return `<div class="msg ${who} ${extra}"><span class="av" aria-hidden="true">${who === 'k' ? 'K' : '先'}</span><div class="bub"><span class="who">${who === 'k' ? 'KANTAくん' : 'Claude先生'}</span><p>${esc(text)}</p></div></div>`;
}
function senseiBoxHTML(sid) {
  return `<div class="chat" data-sid="${sid}">
    <div class="chat-h">Claude先生に聞く</div>
    <div class="chat-log" aria-live="polite"></div>
    <div class="chat-key" hidden>
      <p class="muted">先生に聞くには Anthropic の APIキーが要る。キーはこの端末の中だけに保存し、先生に聞いたときだけ Anthropic に送る。</p>
      <input type="password" autocomplete="off" placeholder="sk-ant-…" aria-label="APIキー"><button class="btn sub keysave">キーを保存</button>
    </div>
    <form><textarea rows="3" maxlength="300" aria-label="先生への質問"></textarea><button type="submit" class="btn">送信</button></form>
    <button class="link chat-clear" type="button" hidden>この文の会話を消す</button>
  </div>`;
}
function bindSensei(box, s, info) {
  const log = box.querySelector('.chat-log'), form = box.querySelector('form'), ta = form.querySelector('textarea'), btn = form.querySelector('button');
  const keyBox = box.querySelector('.chat-key'), clear = box.querySelector('.chat-clear');
  const prevRef = (s.referents ?? []).find(r => r.sent), prev = prevRef ? byId(prevRef.sent) : null;
  let saved = loadChats()[s.id] ?? [], busy = false;
  const render = () => { log.innerHTML = saved.map(m => bubble(m.role === 'user' ? 'k' : 't', m.content)).join(''); clear.hidden = !saved.length; };
  const net = () => {
    const off = !T.online();
    keyBox.hidden = !!T.apiKey();
    btn.disabled = off || busy || !T.apiKey();
    btn.textContent = off ? '圏外' : busy ? '先生が読んでいます…' : '送信';
  };
  render(); net();
  ta.value = T.draftQuestion(info);
  window.addEventListener('online', net); window.addEventListener('offline', net);
  keyBox.querySelector('.keysave').onclick = () => {
    const inp = keyBox.querySelector('input'), k = inp.value.trim(); inp.value = '';
    if (!k) return;
    T.setKey(k); net(); toast('キーを保存した');
  };
  clear.onclick = () => {
    if (busy || !confirm('この文の先生との会話を消します')) return;
    const all = loadChats(); delete all[s.id]; saveChats(all); saved = []; render();
  };
  const add = html => { log.insertAdjacentHTML('beforeend', html); const el = log.lastElementChild; el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return el; };
  form.onsubmit = async e => {
    e.preventDefault();
    const q = ta.value.trim();
    if (busy || !q || !T.online() || !T.apiKey()) return;
    ta.value = '';
    add(bubble('k', q, 'new'));
    busy = true; net();
    const typing = add(bubble('t', '…', 'typing'));
    const msgs = saved.map(m => ({ role: m.role, content: m.content })).concat([{ role: 'user', content: q }]);
    try {
      const text = (await T.callClaude(T.systemBlocks(T.senseiContext(s, info, prev)), T.chatPayload(msgs))) || '（答えが空でした）';
      typing.remove();
      add(bubble('t', text, 'new'));
      const now = Date.now(), all = loadChats();
      saved = saved.concat([{ role: 'user', content: q, at: now }, { role: 'assistant', content: text, at: now }]).slice(-T.CHAT_KEEP);
      all[s.id] = saved; saveChats(all); clear.hidden = false;
    } catch (err) {
      typing.remove();
      ta.value = q;   // 答えられなかった質問は会話に残さず、入力欄に戻す
      add(bubble('t', err.status === 'refusal' ? err.message
        : err.status === 401 ? 'キーが正しくないようです。書き出し画面の「APIキーを消す」から入れ直してください。'
        : err.status ? `うまく答えられませんでした（${err.status}：${err.message}）` : '通信できませんでした。もう一度送ってください', 'err'));
    }
    busy = false; net();
  };
}

const range = r => Array.from({ length: r[1] - r[0] + 1 }, (_, i) => r[0] + i);

function showSummary() {
  const r = session.results;
  view(`<h1>${r.filter(x => x.ok).length} / ${r.length}</h1>
    <ul class="plain">${r.map((x, i) => `<li>${x.ok ? '○' : '×'}　形式${x.fmt}　<span class="muted">${x.sid}</span>${!x.ok && x.info && canAsk(byId(x.sid)) ? `　<button class="link ask" data-ask="${i}">Claude先生に聞く</button>` : ''}</li>`).join('')}</ul>`,
    `<button class="btn" id="again">もう一度5問</button><button class="btn sub" id="home">ホーム</button>`);
  document.getElementById('again').onclick = startSession;
  document.getElementById('home').onclick = showHome;
  $app.querySelectorAll('[data-ask]').forEach(el => el.onclick = () => showSensei(r[+el.dataset.ask]));
}
/** 結果画面から開く先生の画面：文の解析を上に、会話を下に */
function showSensei(res) {
  const s = byId(res.sid);
  view(`<div class="qhead"><span>Claude先生に聞く　形式${res.fmt}</span><span class="muted">${s.id}</span></div>
    ${sentenceHTML(s, { mark: 'all' })}${legend}
    <dl class="kv"><dt>あなたの答え</dt><dd>${esc(res.info.mine)}</dd><dt>骨格訳</dt><dd>${esc(s.skeleton_ja)}</dd><dt>模範訳</dt><dd>${esc(s.model_ja)}</dd></dl>
    ${senseiBoxHTML(s.id)}`, `<button class="btn sub" id="back">結果に戻る</button>`);
  bindSensei(document.querySelector('.chat'), s, res.info);
  document.getElementById('back').onclick = showSummary;
}

// ---- ボス戦 ----
function showBossIntro(b) {
  const t = today(), locked = b.sealed && !L.isUnsealed(b.year, t), st = state.bosses[b.id];
  if (locked) {
    view(`<h1>${b.year}年度 (${b.q})(${b.part})</h1><p>封印中。${L.UNSEAL_DATES[b.year].replace(/^\d+-0?(\d+)-0?(\d+)$/, '$1月$2日')}から挑戦できる。</p>
      <div class="tags">${b.types.map(x => `<span class="tag" style="font-size:13px">${x}</span>`).join(' ')}</div>`,
      `<button class="btn sub" id="home">戻る</button>`);
    return document.getElementById('home').onclick = showHome;
  }
  view(`<h1>${b.year}年度 (${b.q})(${b.part})</h1>
    <p class="muted">${STATUS[st?.status] ?? '未挑戦'}${st?.tries?.length ? `（${st.tries.length}回）` : ''}</p>
    <p>紙と鉛筆を用意する。開始すると ${L.mmss(b.limit_sec)} のカウントダウン。下線部を紙に訳し、書き終えたら押す。</p>
    <div class="tags">${b.types.map(x => `<span class="tag" style="font-size:13px">${x}</span>`).join(' ')}</div>`,
    `<button class="btn" id="start">開始</button><button class="btn sub" id="home">戻る</button>`);
  document.getElementById('start').onclick = () => runBoss(b);
  document.getElementById('home').onclick = showHome;
}
function passageHTML(b) {
  const ss = content.sentences.filter(s => s.source.kind === 'kakomon' && s.source.year === b.year && s.source.q === b.q);
  const paras = [];
  for (const s of ss) {
    const p = s.source.para ?? 1;
    (paras[p] ??= []).push(s);
  }
  let html = '';
  for (const ps of paras.filter(Boolean)) {
    let inPart = false, line = '';
    for (const s of ps) {
      const mine = s.source.part === b.part;
      if (mine && !inPart) line += `<span class="mk">(${b.part})</span><u>`;
      if (!mine && inPart) line += '</u> ';
      inPart = mine;
      line += esc(s.text) + ' ';
    }
    if (inPart) line += '</u>';
    html += `<p>${line.trim()}</p>`;
  }
  return html;
}
let timer = null, wakeLock = null;
async function runBoss(b) {
  const t0 = Date.now();
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {}
  view(`<div class="timer" id="t">${L.mmss(b.limit_sec)}</div>
    <div class="passage">${passageHTML(b)}</div>
    ${(b.notes ?? []).map(n => `<p class="muted">${esc(n)}</p>`).join('')}`,
    `<button class="btn" id="done">書き終えた</button>`);
  const $t = document.getElementById('t');
  clearInterval(timer);
  timer = setInterval(() => {
    const left = b.limit_sec - (Date.now() - t0) / 1000;
    $t.textContent = L.mmss(left); $t.classList.toggle('over', left < 0);
  }, 250);
  document.getElementById('done').onclick = () => {
    clearInterval(timer); wakeLock?.release?.(); wakeLock = null;
    checkBoss(b, Math.round((Date.now() - t0) / 1000), 0, {});
  };
}
function checkBoss(b, sec, i, answers) {
  const cps = b.checkpoints;
  if (i >= cps.length) return finishBoss(b, sec, answers);
  view(`<div class="qhead"><span>チェック ${i + 1} / ${cps.length}</span><span>${L.mmss(sec)}</span></div>
    <div class="cp">${esc(cps[i].text)}</div>
    <p class="muted">${cps[i].kind === 'skeleton' ? '骨格の項目（撃破の条件）' : '語の項目'}</p>`,
    `<div class="yesno"><button class="btn" id="y">はい</button><button class="btn sub" id="n" style="margin-top:0">いいえ</button></div>`);
  document.getElementById('y').onclick = () => checkBoss(b, sec, i + 1, { ...answers, [i]: true });
  document.getElementById('n').onclick = () => checkBoss(b, sec, i + 1, { ...answers, [i]: false });
}
function finishBoss(b, sec, answers) {
  const r = L.judgeBoss(b, answers, sec);
  const before = L.defeatedCount(state);
  state = L.recordBoss(state, b, r, sec); save();
  const after = L.defeatedCount(state);
  const why = r.defeated ? '' : [!r.skeletonOk ? '骨格の項目に「いいえ」がある' : '', !r.inTime ? `制限時間（${L.mmss(b.limit_sec)}）を超えた` : ''].filter(Boolean).join('／');
  view(`${r.defeated ? `<div class="slay"><h1>撃破</h1><div class="slaycount"><b id="slayn">${after > before ? before : after}</b><small>/20</small><span>骨格を取り切れた下線部</span></div></div>` : '<h1>挑戦済み</h1>'}
    <p class="muted">${b.year}年度 (${b.q})(${b.part})　所要 ${L.mmss(sec)}${why ? `　${why}` : ''}</p>
    ${r.missed.length ? `<h2>落とした項目</h2><ul class="plain">${r.missed.map(m => `<li>${esc(m.text)}</li>`).join('')}</ul>` : ''}
    ${!r.defeated ? `<p class="muted">次の5問で ${b.types.join('・')} を多く出す。</p>` : ''}
    <h2>模範訳</h2><p>${esc(b.model_ja)}</p>
    <p class="muted">この篇の文は、今後の解剖にも出る。</p>`,
    `<button class="btn" id="copy">添削に出す（文面をコピー）</button><button class="btn sub" id="home">ホーム</button>`);
  if (r.defeated && after > before) setTimeout(() => {
    const n = document.getElementById('slayn'); if (!n) return;
    n.textContent = after; n.classList.add('tick');
  }, reduced() ? 0 : 900);
  document.getElementById('copy').onclick = () => copy(L.bossCopyText(b, r, sec), 'コピーした。答案の写真と一緒に貼る');
  document.getElementById('home').onclick = showHome;
}

// ---- 書き出し ----
const EITANGO_INBOX = 'eigo:inbox';   // 中の eitango が起動時に読んでカードにする（同じ端末・同じ場所の localStorage）
function sendInbox() {
  const ents = L.inboxToSend(content, state);
  if (!ents.length) return toast('送る語がない');
  let box = [];
  try { box = JSON.parse(localStorage.getItem(EITANGO_INBOX)) || []; } catch {}
  const have = new Set(box.map(e => e.key));
  const day = new Date().toISOString().slice(0, 10);
  for (const e of ents) if (!have.has(e.key)) box.push({ key: e.key, word: e.word, tr: e.tr, sentence: e.sentence, misread: '', meaning: e.meaning, date: day, from: 'kasenbu' });
  try { localStorage.setItem(EITANGO_INBOX, JSON.stringify(box)); }
  catch { return toast('送れなかった（端末の空き容量）'); }
  state.inboxSent = [...(state.inboxSent ?? []), ...ents.map(e => e.key)]; save();
  toast(`${ents.length}語を単語カードに送った。次のパックから出る`);
  showExport();
}
function showExport() {
  const inbox = L.inboxLines(content, state), unsent = L.inboxToSend(content, state).length;
  view(`<h1>書き出し</h1>
    <p class="muted">週報：今週の回数、正答率の低い型、多い誤読、ボスの状態、「おかしい」と押した文。<br>受け箱：解剖で間違えた文の難語（${inbox.length}語）。「単語カードへ送る」で、まだ送っていない${unsent}語が単語カードの新しいカードになる。</p>`,
    `<button class="btn" id="week">週報をコピー</button><button class="btn sub" id="send">受け箱を単語カードへ送る（${unsent}語）</button><button class="btn sub" id="inbox">受け箱をコピー（${inbox.length}語）</button><button class="btn sub" id="load">コンテンツを入れ替える</button>${T.apiKey() ? '<button class="btn sub" id="forget">APIキーを消す</button>' : ''}<button class="btn sub" id="home">戻る</button>`);
  document.getElementById('week').onclick = () => copy(L.weeklyText(content, state));
  document.getElementById('send').onclick = sendInbox;
  document.getElementById('inbox').onclick = () => inbox.length ? copy(inbox.join('\n')) : toast('まだない');
  document.getElementById('load').onclick = () => showLoad();
  document.getElementById('forget')?.addEventListener('click', () => { if (confirm('この端末に保存した APIキーを消します')) { T.setKey(''); toast('キーを消した'); showExport(); } });
  document.getElementById('home').onclick = showHome;
}

// ---- 起動 ----
(async () => {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  content = await DB.get('content') ?? null;
  state = { ...L.emptyState(), ...(await DB.get('state') ?? {}) };
  if (!content) return showLoad();
  // 確認用：#q=S040-1:D でその文・その形式の1問だけを開く
  const m = location.hash.match(/^#q=([\w-]+):([A-F])$/);
  if (m && byId(m[1]) && L.applicableFormats(byId(m[1])).includes(m[2])) {
    session = { qs: [{ sid: m[1], fmt: m[2], review: false }], k: 0, results: [] };
    return showQuestion();
  }
  showHome();
})();
