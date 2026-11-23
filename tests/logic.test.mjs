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
