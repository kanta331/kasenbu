// content/kasenbu-content.json の機械検査。英文はこのファイルに含めない。
//   node scripts/validate.mjs [path]
// エラーがあれば一覧を出して exit 1。警告は数えるだけで止めない。
import { readFileSync } from 'node:fs';

const path = process.argv[2] ?? new URL('../content/kasenbu-content.json', import.meta.url).pathname;
const data = JSON.parse(readFileSync(path, 'utf8'));

const TYPES = new Set(['REL', 'INS', 'PTC', 'REF', 'CONJ', 'NOUNCL', 'IT', 'NEGCMP', 'INV', 'SOTHAT', 'ABS', 'VPRED', 'IDIOM']);
const KINDS = new Set(['REL', 'NOUNCL', 'ADVCL', 'PTC', 'INF', 'INS', 'ABS']);
const LOGIC = new Set(['順接', '逆接', '譲歩', '理由', '同時']);
const ERRORS = new Set(['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9']);
const CLAUSE_KINDS = new Set(['REL', 'NOUNCL', 'ADVCL', 'PTC', 'INF']); // 主節の動詞が入ってはいけない範囲
const HOLE = '〔？〕';

const errors = [], warnings = [];
const err = (id, msg) => errors.push(`${id}: ${msg}`);
const warn = (id, msg) => warnings.push(`${id}: ${msg}`);

const byId = new Map(data.sentences.map(s => [s.id, s]));
if (byId.size !== data.sentences.length) err('-', '文IDが重複している');

const isRange = r => Array.isArray(r) && r.length === 2 && Number.isInteger(r[0]) && Number.isInteger(r[1]);
const inside = (r, n) => isRange(r) && r[0] >= 0 && r[1] < n && r[0] <= r[1];
const overlap = (a, b) => a[0] <= b[1] && b[0] <= a[1];
const contains = (outer, inner) => outer[0] <= inner[0] && inner[1] <= outer[1];
const crosses = (a, b) => overlap(a, b) && !contains(a, b) && !contains(b, a);
const holes = s => (s.match(/〔？〕/g) ?? []).length;

for (const s of data.sentences) {
  const id = s.id, n = s.tokens?.length ?? 0;
  if (!/^(S\d{3}-\d+|K\d{4}-[12]-[abx]-\d+)$/.test(id)) err(id, 'IDの形が違う');
  if (!n) { err(id, 'tokens が空'); continue; }
  if (s.space_before && s.space_before.length !== n) err(id, 'space_before の長さが tokens と違う');
  if (s.source?.kind === 'kakomon') {
    const part = id.split('-')[2];
    if ((part === 'x' ? null : part) !== s.source.part) err(id, 'source.part が ID と食い違う');
  }

  // 主節：範囲、主語と述語が重ならないこと
  const m = s.main ?? {};
  const clauses = [{ s: m.s, v: m.v }, ...(m.more ?? [])];
  clauses.forEach((c, i) => {
    const tag = i ? `主節${i + 1}` : '主節';
    if (!inside(c.v, n)) err(id, `${tag}の述語の範囲が不正 ${JSON.stringify(c.v)}`);
    if (c.s === null) { if (i === 0 && !m.imperative) err(id, '主語が null なのに imperative でない'); }
    else if (!inside(c.s, n)) err(id, `${tag}の主語の範囲が不正 ${JSON.stringify(c.s)}`);
    else if (inside(c.v, n) && overlap(c.s, c.v)) err(id, `${tag}の主語と述語が重なっている`);
  });

  // 節・句：範囲、種類、かかり先、入れ子が交差しないこと
  const spans = s.spans ?? [];
  spans.forEach((sp, i) => {
    if (!inside(sp.range, n)) return err(id, `spans[${i}] の範囲が不正`);
    if (!KINDS.has(sp.kind)) err(id, `spans[${i}] の kind が不明: ${sp.kind}`);
    if (sp.head !== null && sp.head !== undefined) {
      if (!Number.isInteger(sp.head) || sp.head < 0 || sp.head >= n) err(id, `spans[${i}] の head が範囲外`);
      else if (sp.head >= sp.range[0] && sp.head <= sp.range[1]) err(id, `spans[${i}] の head が自分の範囲の中にある`);
    }
    if (sp.kind === 'REL' && sp.head === null) err(id, `spans[${i}] REL なのに head がない`);
    for (let j = 0; j < i; j++) {
      if (inside(spans[j].range, n) && crosses(sp.range, spans[j].range)) err(id, `spans[${j}] と spans[${i}] が交差している`);
    }
    // 主節の述語が従属節の中に入っていたら、骨格の取り方が壊れている
    if (CLAUSE_KINDS.has(sp.kind)) clauses.forEach((c, k) => {
      if (inside(c.v, n) && overlap(sp.range, c.v)) err(id, `${k ? `主節${k + 1}` : '主節'}の述語が spans[${i}](${sp.kind}) の中にある`);
      if (c.s && inside(c.s, n) && crosses(sp.range, c.s)) err(id, `${k ? `主節${k + 1}` : '主節'}の主語と spans[${i}] が交差している`);
    });
  });

  for (const t of s.types ?? []) if (!TYPES.has(t)) err(id, `types に不明な型: ${t}`);

  for (const [i, r] of (s.referents ?? []).entries()) {
    if (!Number.isInteger(r.token) || r.token < 0 || r.token >= n) err(id, `referents[${i}] の token が範囲外`);
    const target = r.sent ? byId.get(r.sent) : s;
    if (!target) { err(id, `referents[${i}] の参照先の文がない: ${r.sent}`); continue; }
    if (!inside(r.range, target.tokens.length)) err(id, `referents[${i}] の range が範囲外`);
    else if (!r.sent && r.token >= r.range[0] && r.token <= r.range[1]) err(id, `referents[${i}] が自分自身を指している`);
  }
  if ((s.types ?? []).includes('REF') && !(s.referents ?? []).length) warn(id, 'REF 型なのに referents がない');

  for (const [i, c] of (s.connectors ?? []).entries()) {
    if (!Number.isInteger(c.token) || c.token < 0 || c.token >= n) err(id, `connectors[${i}] の token が範囲外`);
    if (!LOGIC.has(c.logic)) err(id, `connectors[${i}] の logic が5種以外: ${c.logic}`);
    else if (s.tokens[c.token]?.toLowerCase() !== c.word.split(' ')[0].toLowerCase()) err(id, `connectors[${i}] の token が word と合わない`);
  }

  for (const [i, h] of (s.hard ?? []).entries()) {
    if (!inside(h.range, n)) err(id, `hard[${i}] の範囲が不正`);
    if (!h.ja) err(id, `hard[${i}] の語義が空`);
  }

  // 訳と選択肢
  if (!s.model_ja) err(id, 'model_ja が空');
  if (!s.skeleton_ja) err(id, 'skeleton_ja が空');
  const nh = holes(s.skeleton_ja ?? '');
  if ((s.hard ?? []).length && !nh) err(id, `hard があるのに skeleton_ja に${HOLE}がない`);
  if (!(s.hard ?? []).length && nh) err(id, `hard がないのに skeleton_ja に${HOLE}がある`);
  if (holes(s.model_ja ?? '')) err(id, `model_ja に${HOLE}が残っている`);
  const ch = s.choices ?? [];
  if (ch.length !== 2) err(id, `choices が2つでない (${ch.length})`);
  for (const [i, c] of ch.entries()) {
    if (!ERRORS.has(c.error)) err(id, `choices[${i}] の誤読IDが不明: ${c.error}`);
    if (!c.ja) err(id, `choices[${i}] が空`);
    if (c.ja === s.model_ja) err(id, `choices[${i}] が model_ja と同文`);
    if (c.ja === s.skeleton_ja) err(id, `choices[${i}] が skeleton_ja と同文`);
  }
  if (ch.length === 2 && ch[0].ja === ch[1].ja) err(id, 'choices の2つが同文');
  if (ch.length === 2 && ch[0].error === ch[1].error) warn(id, `choices の誤読IDが2つとも ${ch[0].error}`);
}

// ボス
const SEALED_YEARS = new Set([2025, 2026]);
for (const b of data.bosses ?? []) {
  const id = b.id;
  if (!/^K\d{4}-[12]-[ab]$/.test(id)) err(id, 'ボスIDの形が違う');
  if (b.sealed !== SEALED_YEARS.has(b.year)) err(id, `sealed が年度と合わない (${b.year}, ${b.sealed})`);
  if (b.limit_sec !== 900) warn(id, `limit_sec が 900 でない (${b.limit_sec})`);
  for (const t of b.types ?? []) if (!TYPES.has(t)) err(id, `types に不明な型: ${t}`);
  for (const sid of b.sentences ?? []) {
    const s = byId.get(sid);
    if (!s) err(id, `文がない: ${sid}`);
    else if (s.source.year !== b.year || s.source.q !== b.q || s.source.part !== b.part) err(id, `${sid} の出典がボスと合わない`);
  }
  const cps = b.checkpoints ?? [];
  if (cps.length < 5 || cps.length > 7) err(id, `checkpoints が5〜7個でない (${cps.length})`);
  if (!cps.some(c => c.kind === 'skeleton')) err(id, 'skeleton のチェックポイントがない');
  for (const [i, c] of cps.entries()) {
    if (!['skeleton', 'word'].includes(c.kind)) err(id, `checkpoints[${i}] の kind が不明: ${c.kind}`);
    if (!/(か|か（.*）)$/.test(c.text.trim())) warn(id, `checkpoints[${i}] が「〜か」で終わっていない（はい／いいえで答えにくい）`);
  }
  if (!b.sealed && !b.model_ja) err(id, 'model_ja が空');
}
// 下線部の文がすべてボスに入っているか
const bossSents = new Set((data.bosses ?? []).flatMap(b => b.sentences));
for (const s of data.sentences) if (s.source?.part && !bossSents.has(s.id)) err(s.id, '下線部の文なのにどのボスにも入っていない');

// 難語の発音・カタカナ・例文（受け箱から単語カードへ送る分）
if (data.words) {
  const need = new Set();
  for (const s of data.sentences) for (const h of s.hard ?? []) {
    let w = ''; for (let i = h.range[0]; i <= h.range[1]; i++) w += (i > h.range[0] && (s.space_before?.[i] ?? true) ? ' ' : '') + s.tokens[i];
    need.add(`${w}|${h.ja}`);
  }
  for (const k of need) if (!data.words[k]) warn('words', `発音・例文がない難語: ${k}`);
  for (const [k, v] of Object.entries(data.words)) {
    if (!/^\/.+\/$/.test(v.ipa ?? '')) err('words', `${k} の ipa が /…/ でない`);
    if (!/^[ァ-ヶー・ ]+$/.test(v.kana ?? '')) err('words', `${k} の kana がカタカナでない: ${v.kana}`);
    if (!Array.isArray(v.ex) || v.ex.length !== 2) err('words', `${k} の例文が2つでない`);
    for (const e of v.ex ?? []) {
      if (!e.en || !e.ja || !e.focus) err('words', `${k} の例文に空の欄`);
      else if (!e.en.includes(e.focus)) err('words', `${k} の focus「${e.focus}」が例文にない`);
    }
  }
}

const held = data.sentences.filter(s => s.status === 'hold').length;
console.log(`文 ${data.sentences.length}（hold ${held}） / ボス ${(data.bosses ?? []).length}`);
console.log(`エラー ${errors.length} / 警告 ${warnings.length}`);
for (const e of errors) console.log('ERROR', e);
for (const w of warnings) console.log('WARN ', w);
process.exit(errors.length ? 1 : 0);
