// node --test tests/
// 教材の英文はリポジトリに入れないので、テスト用の文は記号のトークンで作る。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/logic.js';

const TODAY = '2026-12-01';
const tok = n => Array.from({ length: n }, (_, i) => `w${i}`);

// 形式A〜Fすべてを持つ文
function full(id, extra = {}) {
  return {
    id, source: { kind: 'seihon', no: 1 }, tokens: tok(12), space_before: Array(12).fill(true),
    main: { s: [0, 3], v: [7, 7] },
    spans: [{ range: [1, 3], kind: 'REL', head: 0 }],
    types: ['REL', 'REF', 'CONJ'],
    referents: [{ token: 9, range: [0, 1] }],
    connectors: [{ token: 8, word: 'w8', logic: '逆接' }],
    hard: [{ range: [10, 10], ja: '語' }],
    skeleton_ja: '〔？〕', model_ja: '訳', choices: [{ ja: '誤1', error: 'E1' }, { ja: '誤2', error: 'E4' }],
    status: 'ok', ...extra,
  };
}
// 指示語・論理語・節のない文
function plain(id) {
  return { ...full(id), spans: [], referents: [], connectors: [], types: [] };
}
function content(sentences, bosses = []) { return { version: 1, sentences, bosses }; }
const many = n => Array.from({ length: n }, (_, i) => full(`S${String(i + 1).padStart(3, '0')}-1`));

test('5問のうち最低1問が形式F、最低1問が復習になる', () => {
  const c = content(many(30));
  let st = L.emptyState();
  st = L.recordAnswer(st, c.sentences[4], 'B', false, '2026-11-30');   // 昨日間違えた → 今日が期限
  for (let seed = 1; seed <= 50; seed++) {
    const q = L.selectSession(c, st, TODAY, seed);
    assert.equal(q.length, 5);
    assert.ok(q.some(x => x.fmt === 'F'), `seed ${seed}: F がない`);
    assert.ok(q.some(x => x.review && x.sid === c.sentences[4].id), `seed ${seed}: 復習がない`);
    assert.equal(new Set(q.map(x => x.sid)).size, 5, '同じ文が2回出ている');
  }
});

test('復習が無い日でも形式Fは必ず1問入る', () => {
  const c = content(many(10));
  for (let seed = 1; seed <= 30; seed++) assert.ok(L.selectSession(c, L.emptyState(), TODAY, seed).some(x => x.fmt === 'F'));
});

test('間違えた文が翌日・3日後・7日後に、前回と別の形式で出る', () => {
  const c = content(many(30));
  const s = c.sentences[0];
  const st = L.recordAnswer(L.emptyState(), s, 'C', false, TODAY);
  const day = L.dayNumber(TODAY);
  assert.deepEqual(st.reviews.filter(r => r.sid === s.id).map(r => r.due - day), [1, 3, 7]);
  for (const off of [1, 3, 7]) {
    const d = new Date(TODAY + 'T00:00:00'); d.setDate(d.getDate() + off);
    for (let seed = 1; seed <= 20; seed++) {
      const q = L.selectSession(c, st, d, seed).find(x => x.sid === s.id);
      assert.ok(q && q.review, `${off}日後に出ていない`);
      assert.notEqual(q.fmt, 'C', `${off}日後に同じ形式で出た`);
    }
  }
  // 期限前（2日後に翌日分を消化済みにしたあと）は出ない日がある：翌日分を消化すると次は3日後
  const d1 = new Date(TODAY + 'T00:00:00'); d1.setDate(d1.getDate() + 1);
  const st2 = L.recordAnswer(st, s, 'B', true, d1, { review: true });
  assert.deepEqual(st2.reviews.filter(r => r.sid === s.id).map(r => r.due - day), [3, 7]);
});

test('復習でまた間違えたら、予定を組み直す', () => {
  const s = full('S001-1');
  const st = L.recordAnswer(L.emptyState(), s, 'C', false, TODAY);
  const d1 = new Date(TODAY + 'T00:00:00'); d1.setDate(d1.getDate() + 1);
  const st2 = L.recordAnswer(st, s, 'A', false, d1, { review: true });
  const day1 = L.dayNumber(d1);
  assert.deepEqual(st2.reviews.map(r => [r.due - day1, r.avoid]), [[1, 'A'], [3, 'A'], [7, 'A']]);
});

test('同じ文・同じ形式で3回連続正解すると卒業する', () => {
  const s = full('S001-1');
  let st = L.emptyState();
  st = L.recordAnswer(st, s, 'A', true, TODAY);
  st = L.recordAnswer(st, s, 'A', true, TODAY);
  assert.equal(st.items[s.id].fmt.A.graduated, false);
  st = L.recordAnswer(st, s, 'A', false, TODAY);     // 途中で間違えると数え直し
  st = L.recordAnswer(st, s, 'A', true, TODAY);
  st = L.recordAnswer(st, s, 'A', true, TODAY);
  assert.equal(st.items[s.id].fmt.A.graduated, false);
  st = L.recordAnswer(st, s, 'A', true, TODAY);
  assert.equal(st.items[s.id].fmt.A.graduated, true);
  assert.equal(st.items[s.id].fmt.B, undefined, '別の形式は卒業しない');
  // 卒業した形式はもう出ない
  const c = content([s]);
  for (let seed = 1; seed <= 30; seed++) assert.ok(L.selectSession(c, st, TODAY, seed).every(q => !(q.sid === s.id && q.fmt === 'A')));
});

test('指示語のない文に形式Dが出ない（論理語のない文にE、節のない文にCも出ない）', () => {
  const s = plain('S099-1');
  assert.deepEqual(L.applicableFormats(s), ['A', 'B', 'F']);
  const c = content([s, ...many(3)]);
  for (let seed = 1; seed <= 50; seed++) {
    for (const q of L.selectSession(c, L.emptyState(), TODAY, seed)) if (q.sid === s.id) assert.ok(!['C', 'D', 'E'].includes(q.fmt));
  }
});

test('1語の主語には形式Aを出さない', () => {
  assert.ok(!L.applicableFormats({ ...full('S003-1'), main: { s: [0, 0], v: [1, 1] } }).includes('A'));
});

test('hold の文と、挑戦前のボスの過去問の文は出ない', () => {
  const k = { ...full('K2022-1-a-1'), source: { kind: 'kakomon', year: 2022, q: 1, part: 'a' } };
  const kx = { ...full('K2022-1-x-1'), source: { kind: 'kakomon', year: 2022, q: 1, part: null } };
  const h = { ...full('S004-1'), status: 'hold' };
  const boss = { id: 'K2022-1-a', year: 2022, q: 1, part: 'a', sealed: false, types: ['REL'], limit_sec: 900, sentences: ['K2022-1-a-1'], checkpoints: [] };
  const c = content([k, kx, h, full('S005-1')], [boss]);
  let st = L.emptyState();
  assert.deepEqual(L.eligibleSentences(c, st).map(s => s.id), ['S005-1']);
  st.bosses[boss.id] = { status: 'tried', tries: [] };   // 挑戦した後は、その篇の文（下線外も）が出る
  assert.deepEqual(L.eligibleSentences(c, st).map(s => s.id), ['K2022-1-a-1', 'K2022-1-x-1', 'S005-1']);
});

test('封印：2025年度は1月9日、2026年度は1月16日から', () => {
  assert.equal(L.isUnsealed(2025, '2027-01-08'), false);
  assert.equal(L.isUnsealed(2025, '2027-01-09'), true);
  assert.equal(L.isUnsealed(2026, '2027-01-15'), false);
  assert.equal(L.isUnsealed(2026, '2027-01-16'), true);
  assert.equal(L.isUnsealed(2022, '2026-11-24'), true);
  const b = (year, q, part, sealed) => ({ id: `K${year}-${q}-${part}`, year, q, part, sealed, types: [] });
  const c = content([], [b(2026, 1, 'a', true), b(2025, 1, 'a', true)]);
  assert.equal(L.nextBoss(c, L.emptyState(), '2026-12-01'), null);
  assert.equal(L.nextBoss(c, L.emptyState(), '2027-01-10').id, 'K2025-1-a');
});

test('ボス：skeleton がすべて「はい」かつ時間内で撃破', () => {
  const boss = { id: 'K2022-1-a', types: ['PTC'], limit_sec: 900, checkpoints: [{ kind: 'skeleton', text: 'a' }, { kind: 'skeleton', text: 'b' }, { kind: 'word', text: 'c' }] };
  assert.equal(L.judgeBoss(boss, { 0: true, 1: true, 2: false }, 900).defeated, true, 'word を落としても撃破');
  assert.equal(L.judgeBoss(boss, { 0: true, 1: true, 2: true }, 901).defeated, false, '時間切れ');
  const r = L.judgeBoss(boss, { 0: true, 1: false, 2: true }, 600);
  assert.equal(r.defeated, false);
  assert.deepEqual(r.missed.map(m => m.i), [1]);
  const st = L.recordBoss(L.emptyState(), boss, r, 600);
  assert.equal(st.bosses[boss.id].status, 'tried');
  assert.deepEqual(st.boost, ['PTC'], '落としたら次の5問でその型を多く出す');
});

test('タップの採点', () => {
  const s = full('S001-1');
  assert.equal(L.judgeTap(s, 'A', 3), true);
  assert.equal(L.judgeTap(s, 'A', 2), false);
  assert.equal(L.judgeTap(s, 'B', 7), true);
  assert.equal(L.judgeTap(s, 'C', 3), true);
  assert.equal(L.judgeTap(s, 'D', 1), true);
  assert.equal(L.judgeTap(s, 'D', 2), false);
});

test('受け箱：1行1語、全角縦棒で5項目、出典は TR38 / K2024-1b', () => {
  const s = { ...full('S038-2'), source: { kind: 'seihon', no: 38 }, text: 'w0 w1' };
  const k = { ...full('K2024-1-b-1'), source: { kind: 'kakomon', year: 2024, q: 1, part: 'b' }, text: 'w0' };
  let st = L.recordAnswer(L.emptyState(), s, 'F', false, TODAY, { err: 'E4' });
  st = L.recordAnswer(st, k, 'A', false, TODAY);
  const lines = L.inboxLines(content([s, k]), st);
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[0].split('｜'), ['w10', 'TR38', 'w0 w1', 'E4', '語']);
  assert.deepEqual(lines[1].split('｜'), ['w10', 'K2024-1b', 'w0', 'E1', '語']);
});

test('試験まであと何日', () => {
  assert.equal(L.daysUntilExam('2027-01-22'), 1);
  assert.equal(L.daysUntilExam('2026-11-24'), 60);
});

test('答えが1つに決まらない形式（skip）は出さない', () => {
  const s = { ...full('S026-2'), skip: ['A'] };
  assert.ok(!L.applicableFormats(s).includes('A'));
  assert.ok(L.applicableFormats(s).includes('B'));
});

// ---- 基礎講座 ----
import { LESSONS, exampleHTML } from '../js/lessons.js';

test('基礎講座：押すたびに順番に出て、全部終われば出ない', () => {
  let st = L.emptyState();
  assert.equal(L.lessonDue(st, TODAY, 3), 0);
  st = L.recordLesson(st, 0, TODAY, 'S001-1');
  assert.equal(L.lessonDue(st, TODAY, 3), 1);             // 同じ日でも次の回が出る
  st = L.recordLesson(st, 1, TODAY, null, { skipped: true });   // とばした回は終わった扱い
  assert.deepEqual(st.lessons.skipped, [1]);
  assert.equal(L.lessonDue(st, TODAY, 3), 2);
  st = L.recordLesson(st, 2, '2026-12-03');
  assert.equal(L.lessonDue(st, '2026-12-04', 3), null);   // 全部終わった
  assert.deepEqual(st.lessons.examples, ['S001-1']);
  const old = L.emptyState(); delete old.lessons;          // 講座のない古い保存データ
  assert.equal(L.lessonDue(old, TODAY, 3), 0);
});

test('基礎講座：本物の文は正本から、規則に合う短い順、使った文は避ける', () => {
  const mk = (id, n, kind = 'seihon', extra = {}) => ({ id, source: { kind, no: 1 }, tokens: tok(n), main: { s: [0, 0], v: [1, 1] }, spans: [], ...extra });
  const c = { sentences: [mk('S1', 9), mk('S2', 6), mk('K1', 5, 'kakomon'), mk('S3', 6, 'seihon', { status: 'hold' }), mk('S4', 20)], bosses: [] };
  let st = L.emptyState();
  assert.equal(L.pickExample(c, st, 'short').id, 'S2');
  st = L.recordLesson(st, 0, TODAY, 'S2');
  assert.equal(L.pickExample(c, st, 'short').id, 'S1');
  assert.equal(L.pickExample(c, st, 'nouncl'), null);
});

test('基礎講座：規則がそろい、作例の括弧が閉じている', () => {
  assert.equal(LESSONS.length, 15);
  for (const les of LESSONS) {
    assert.ok(L.EXAMPLE_RULES[les.real], les.title);
    for (const c of les.cards) {
      const t = c.ex.split(/\s+/);
      const open = t.filter(x => /^\[[svmrdl]$/.test(x)).length, close = t.filter(x => x === ']').length;
      assert.equal(open, close, c.ex);
      assert.equal(t.filter(x => x === '(').length, t.filter(x => x === ')').length, c.ex);
      assert.equal(t.filter(x => x === '{').length, t.filter(x => x === '}').length, c.ex);
      assert.ok(c.say && c.ja, les.title);
    }
  }
  const h = exampleHTML('[s The book ( which I bought ) ] [v is ] old .');
  assert.match(h, /tok subj">book/);
  assert.match(h, /tok verb">is/);
  assert.match(h, /old<\/span><span class="tok ">\.<\/span>/);
  assert.doesNotMatch(exampleHTML('[s A ] ( b )', { plain: true }), /subj|\(/);
});

test('基礎講座の型を重く出す（focus）', () => {
  const many = Array.from({ length: 30 }, (_, k) => ({ ...full(`S0${10 + k}-1`), types: ['REL'] }));
  const target = { ...full('S090-1'), types: ['NOUNCL'] };
  const count = focus => {
    let n = 0;
    for (let seed = 1; seed <= 200; seed++)
      if (L.selectSession(content([...many, target]), L.emptyState(), TODAY, seed, { focus }).some(q => q.sid === 'S090-1')) n++;
    return n;
  };
  const without = count([]), withF = count(['NOUNCL']);
  assert.ok(withF > without * 1.5, `focus なし ${without} / あり ${withF}`);
});

test('基礎講座の状態：終えた・とばした・まだ。とばした回を見直し終えると終えた扱い', () => {
  let st = L.recordLesson(L.emptyState(), 0, TODAY, 'S001-1');
  st = L.recordLesson(st, 1, TODAY, null, { skipped: true });
  assert.equal(L.lessonStatus(st, 0), 'done');
  assert.equal(L.lessonStatus(st, 1), 'skipped');
  assert.equal(L.lessonStatus(st, 2), null);
  assert.equal(st.lessons.exampleOf[0], 'S001-1');
  st = L.recordLesson(st, 1, TODAY, 'S002-1');          // 見直しで最後まで進んだ
  assert.equal(L.lessonStatus(st, 1), 'done');
  assert.equal(L.lessonDue(st, TODAY, 15), 2);           // 次の回は変わらない
});

// ---- Claude先生 ----
import * as T from '../js/sensei.js';

test('先生：前提に文・骨格・あなたの答え・誤読を入れ、下書きは形式ごと', () => {
  const s = { ...full('S038-2'), source: { kind: 'seihon', no: 38 }, text: 'w0 w1 w2' };
  const info = { fmt: 'A', mine: '主語＝「w0 w1」', right: '主語＝「w0」', err: 'E1', errName: '節を閉じずに' };
  const c = T.senseiContext(s, info);
  assert.match(c, /文：w0 w1 w2/);
  assert.match(c, /必修英文100題 38番/);
  assert.match(c, /主節の述語動詞：「/);
  assert.match(c, /KANTAくんの答え：主語＝「w0 w1」/);
  assert.match(c, /誤読の種類：E1/);
  assert.equal(T.draftQuestion(info), '先生、主語を「w0 w1」までだと思ったんですけど、なんでちがうんですか');
  assert.match(T.draftQuestion({ fmt: 'F', mine: 'ちがう訳' }), /「ちがう訳」の訳を選んだ/);
});

test('先生：送る会話は KANTAくんから始め、直前の1件にキャッシュの印', () => {
  const msgs = [{ role: 'assistant', content: 'a0' }, { role: 'user', content: 'u1' }, { role: 'assistant', content: 'a1' }, { role: 'user', content: 'u2' }];
  const p = T.chatPayload(msgs);
  assert.equal(p[0].role, 'user');
  assert.equal(p.length, 3);
  assert.equal(p[1].content[0].cache_control.type, 'ephemeral');
  assert.equal(p[2].content, 'u2');
  const sys = T.systemBlocks('文：x');
  assert.equal(sys[0].cache_control.type, 'ephemeral');
  assert.match(sys[1].text, /【問題の文】/);
});

// ---- 受け箱を単語カードへ ----
import fs from 'node:fs';

test('受け箱：まだ送っていない分だけを送る', () => {
  const s = { ...full('S038-2'), source: { kind: 'seihon', no: 38 }, text: 'w0 w1' };
  let st = L.recordAnswer(L.emptyState(), s, 'F', false, TODAY, { err: 'E4' });
  const ents = L.inboxToSend(content([s]), st);
  assert.equal(ents.length, 1);
  assert.deepEqual([ents[0].word, ents[0].tr, ents[0].meaning], ['w10', 'TR38', '語']);
  st = { ...st, inboxSent: [ents[0].key] };
  assert.equal(L.inboxToSend(content([s]), st).length, 0);
});

test('中の eitango：受け箱をカードに重ねる決まり（apply_words.py と同じ）', () => {
  const html = fs.readFileSync(new URL('../eitango/index.html', import.meta.url), 'utf8');
  const a = html.indexOf('function inboxNorm'), b = html.indexOf('\n  S=load();', a);
  const applyInbox = new Function(html.slice(a, b) + '\nreturn applyInbox;')();
  const cards = [
    { id: 'observe', word: 'observe', set: 'list', senses: ['観察する'], status: 'approved' },
    { id: 'thus-tr2', word: 'thus', set: 'tr', tr: 'TR2', status: 'approved' },
  ];
  const n = applyInbox(cards, [
    { word: 'observe', tr: 'TR38', sentence: 's1', meaning: '気づく' },        // 初級に統合
    { word: 'thus', tr: 'TR2', sentence: 's2', meaning: 'このように' },        // tr を met に昇格
    { word: 'vocation', tr: 'K2024-1b', sentence: 's3', meaning: '天職' },     // 新規
    { word: 'observe', tr: 'TR38', sentence: 's1', meaning: '気づく' },        // 同じものは重ねない
    { word: '', meaning: 'x' },                                                // 形式不正は飛ばす
  ]);
  assert.equal(n, 3);
  assert.equal(cards[0].set, 'met'); assert.deepEqual(cards[0].senses, ['気づく', '観察する']); assert.equal(cards[0].origin.length, 1);
  assert.equal(cards[1].set, 'met');
  assert.equal(cards[2].id, 'vocation'); assert.equal(cards[2].status, 'approved'); assert.equal(cards[2].origin[0].misread, '');
});

test('受け箱：発音・カタカナ・例文を付けて送り、中の eitango はない欄だけ埋める', () => {
  const s = { ...full('S038-2'), source: { kind: 'seihon', no: 38 }, text: 'w0 w1' };
  const ex = [{ en: 'A w10 b.', ja: 'あ', focus: 'w10' }];
  const c = { ...content([s]), words: { 'w10|語': { ipa: '/x/', kana: 'エックス', ex } } };
  const st = L.recordAnswer(L.emptyState(), s, 'F', false, TODAY, { err: 'E4' });
  const e = L.inboxToSend(c, st)[0];
  assert.deepEqual([e.ipa, e.kana, e.examples], ['/x/', 'エックス', ex]);
  assert.deepEqual(L.cardExtra(c, 'nope', 'x'), { ipa: '', kana: '', examples: [] });

  const html = fs.readFileSync(new URL('../eitango/index.html', import.meta.url), 'utf8');
  const a = html.indexOf('function inboxNorm'), b = html.indexOf('\n  S=load();', a);
  const applyInbox = new Function(html.slice(a, b) + '\nreturn applyInbox;')();
  const cards = [{ id: 'observe', word: 'observe', set: 'list', ipa: '/old/', senses: ['観察する'], examples: [{ en: 'keep' }], status: 'approved' }];
  applyInbox(cards, [
    { word: 'observe', tr: 'TR1', sentence: 's', meaning: '気づく', ipa: '/new/', kana: 'オブザーブ', examples: ex },
    { word: 'novel', tr: 'TR2', sentence: 's', meaning: '目新しい', ipa: '/n/', kana: 'ナヴル', examples: ex },
  ]);
  assert.equal(cards[0].ipa, '/old/');              // あるものは変えない
  assert.equal(cards[0].kana, 'オブザーブ');         // ないものだけ埋める
  assert.deepEqual(cards[0].examples, [{ en: 'keep' }]);
  assert.deepEqual([cards[1].ipa, cards[1].kana, cards[1].examples], ['/n/', 'ナヴル', ex]);
});

// ---- 入口（docs/GAME.md ステップ1） ----
test('読み上げ：主語の終わりと節の始まり・終わりで区切り、句読点は前に付ける', () => {
  const s = { id: 'X', tokens: ['The', 'book', 'which', 'I', 'bought', 'is', 'old', '.'], space_before: [true, true, true, true, true, true, true, false],
    main: { s: [0, 4], v: [5, 5] }, spans: [{ range: [2, 4], kind: 'REL', head: 1 }] };
  assert.deepEqual(L.speechChunks(s), ['The book', 'which I bought', 'is old.']);
});

test('パック：開封途中か、ゲージ（6時間）が満タンなら開ける', () => {
  const now = 1e12, H = 3600e3;
  assert.equal(L.packReady(null, now), false);
  assert.equal(L.packReady({ v: 1, charge: 6 * H, chargeAt: now }, now), true);
  assert.equal(L.packReady({ v: 1, charge: 2 * H, chargeAt: now - 3 * H }, now), false);
  assert.equal(L.packReady({ v: 1, charge: 2 * H, chargeAt: now - 4 * H }, now), true);
  assert.equal(L.packReady({ v: 1, charge: 0, chargeAt: now, pending: { cards: [{ id: 'a' }] } }, now), true);
});

test('タイトルの文：前日までに外した文の新しいもの。今日外した文・出せない文は出さない', () => {
  const a = full('S001-1'), b = full('S002-1'), c = { ...full('K2025-1-a-1'), source: { kind: 'kakomon', year: 2025, q: 1, part: 'a' } };
  const st = L.emptyState();
  st.log = [
    { t: new Date('2026-11-30T08:00:00').getTime(), sid: 'S001-1', ok: false },
    { t: new Date('2026-11-30T09:00:00').getTime(), sid: 'K2025-1-a-1', ok: false },   // 封印中（出せない）
    { t: new Date('2026-12-01T07:00:00').getTime(), sid: 'S002-1', ok: false },        // 今日
  ];
  assert.equal(L.titleSentence(content([a, b, c]), st, TODAY).id, 'S001-1');
  assert.equal(L.titleSentence(content([a, b, c]), L.emptyState(), TODAY), null);
});

test('技：15枚すべてに名前がある', () => {
  assert.ok(LESSONS.every(l => typeof l.skill === 'string' && l.skill.length));
  assert.equal(new Set(LESSONS.map(l => l.skill)).size, 15);
});
