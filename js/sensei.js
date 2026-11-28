/* Claude先生に聞く（LINE 風。eitango・bunka-cards と同じ形）。
   右があなた＝KANTAくん、左が Claude先生。間違えた文について、その文の骨格を前提に答える。
   本人の希望で CLAUDE.md の「API 呼び出しをしない」の例外とした（2026-11-28）。
   鍵はこの端末の localStorage にだけ置き、先生に聞いたときだけ Anthropic の API に送る。
   話し方の手本は bunka-cards の掛け合い（eitango の sensei-samples.json と同じもの）。 */

export const MODEL = 'claude-sonnet-5-5', FALLBACK_MODEL = 'claude-sonnet-5';
const APIKEY = 'kasenbu:apikey';
export const CHAT_SEND = 16, CHAT_KEEP = 100;

export const SENSEI = 'あなたは「Claude先生」。東京大学大学院（文化資源学）の入試の英語（下線部和訳）に向けて英文の構文を学ぶ「KANTAくん」の質問に、LINE のチャットで答える。\n'
  + 'KANTAくんは TOEIC 400点台。構造が見えると進めるタイプで、文法用語の長い説明は苦手。いま、アプリの問題で1つの文の読み方を間違えた。\n'
  + '答え方：\n'
  + '・まず、KANTAくんの読み方のどこがずれているかを、やさしく、はっきり言う（「〜ではありません」「ここで（ ）が閉じます」）。\n'
  + '・次に、正しい骨格を短く示す。主語・述語動詞・（ ）の始まりと終わりを、実際の英語の語を「」で引いて言う。\n'
  + '・全体で250字以内。です・ます調。前置きや見出し、箇条書き、記号での強調は使わない。文法用語は最小限にし、使うときはひとことで言い換える。\n'
  + '・同じ間違いをしないための見分け方を1つ添える（例：「名詞のすぐ後ろに主語＋動詞が来たら、そこで（ が始まる」）。\n'
  + '・下の【問題の文】の解析を正解として前提にする。解析が明らかにおかしいと思ったら、その旨を短く言い、「この解析はおかしい」ボタンを押すよう勧める。\n'
  + '・文にない語を補ったり、英文を作り変えたりしない。例を出すときは5語前後の短い作例にする。\n';

export const SAMPLES = {
  "文化権": [
    {
      "who": "k",
      "text": "先生、『ぶんかけん』って、ヨーロッパ文化圏とかの『圏』ですか"
    },
    {
      "who": "t",
      "text": "こちらは『権利』の『権』です。文化を楽しんだり、つくったりする権利のことです"
    },
    {
      "who": "k",
      "text": "じゃあ映画を観たいのにチケットが高いのは、権利侵害ですか"
    },
    {
      "who": "t",
      "text": "そこまで直結はしません。ただ、お金や障害、住む場所で文化から遠ざけられる人をどう減らすかを考えるとき、この権利が根拠になります"
    }
  ],
  "劇場法": [
    {
      "who": "k",
      "text": "先生、劇場法って、劇場を建てなさいという法律ですか"
    },
    {
      "who": "t",
      "text": "建てなさい、ではありません。すでにある劇場や音楽堂に、貸すだけの「ハコ」でなく、創って発信する場になってほしいと促す法律です。2012年施行です"
    },
    {
      "who": "k",
      "text": "建物に向かって「中身を持て」と"
    },
    {
      "who": "t",
      "text": "呼びかけている相手は、建物ではなく設置者と運営者です。企画と人がいないと、劇場は動きませんから"
    }
  ]
};

export const apiKey = () => { try { return localStorage.getItem(APIKEY) || ''; } catch { return ''; } };
export const setKey = k => { try { k ? localStorage.setItem(APIKEY, k) : localStorage.removeItem(APIKEY); } catch {} };
export const online = () => navigator.onLine !== false;

const FMT_NAME = { A: '主語はどこまで（主語の最後の語をタップ）', B: '述語動詞はどれ（主節の述語動詞をタップ）', C: '節を閉じる（開き括弧が閉じる語をタップ）', D: '何を指すか（色の付いた語が指す語句をタップ）', E: '論理語（順接・逆接・譲歩・理由・同時から選ぶ）', F: '骨格訳（〔？〕入りの文の正しい訳を3つから選ぶ）' };
const KIND_NAME = { REL: '関係詞節（名詞を後ろから説明）', NOUNCL: '名詞節', ADVCL: '副詞節', PTC: '分詞のかたまり', INF: 'to 不定詞のかたまり', INS: '挿入', ABS: '独立分詞構文' };

function join(s, a, b) {
  let t = '';
  for (let i = a; i <= b; i++) t += (i > a && (s.space_before?.[i] ?? true) ? ' ' : '') + s.tokens[i];
  return t;
}

/** 先生に渡す前提。q = { fmt, mine（あなたの読み・平文）, right（正しい答え・平文）, err（誤読ID）, errName } */
export function senseiContext(s, q, prev = null) {
  const m = s.main;
  const lines = [];
  if (prev) lines.push('直前の文：' + prev.text);
  lines.push('文：' + s.text);
  lines.push(`出典：${s.source.kind === 'seihon' ? `必修英文100題 ${s.source.no}番` : `過去問 ${s.source.year}年度 (${s.source.q})`}`);
  if (m.s) lines.push('主節の主語：「' + join(s, m.s[0], m.s[1]) + '」');
  lines.push('主節の述語動詞：「' + join(s, m.v[0], m.v[1]) + '」');
  for (const c of m.more ?? []) lines.push('ほかの主節：主語「' + (c.s ? join(s, c.s[0], c.s[1]) : '（なし）') + '」述語「' + join(s, c.v[0], c.v[1]) + '」');
  for (const sp of s.spans ?? []) {
    lines.push(`${KIND_NAME[sp.kind] ?? sp.kind}：「${join(s, sp.range[0], sp.range[1])}」${sp.head != null ? `（「${s.tokens[sp.head]}」にかかる）` : ''}`);
  }
  for (const r of s.referents ?? []) {
    const src = r.sent && prev ? prev : s;
    lines.push(`指示語「${s.tokens[r.token]}」が指すもの：「${join(src, r.range[0], r.range[1])}」${r.sent ? '（直前の文）' : ''}`);
  }
  for (const c of s.connectors ?? []) lines.push(`論理語「${c.word}」：${c.logic}`);
  if ((s.hard ?? []).length) lines.push('難語：' + s.hard.map(h => `${join(s, h.range[0], h.range[1])}＝${h.ja}`).join('、'));
  lines.push('骨格訳：' + s.skeleton_ja);
  lines.push('模範訳：' + s.model_ja);
  if (s.note) lines.push('構造メモ：' + s.note);
  lines.push('');
  lines.push('問題の形式：' + (FMT_NAME[q.fmt] ?? q.fmt));
  if (q.mine) lines.push('KANTAくんの答え：' + q.mine);
  if (q.right) lines.push('正しい答え：' + q.right);
  if (q.err) lines.push(`KANTAくんの誤読の種類：${q.err}（${q.errName ?? ''}）`);
  return lines.join('\n');
}

/** 入力欄に入れておく下書き */
export function draftQuestion(q) {
  const mine = q.mine ? q.mine.replace(/^(主語|述語|節)＝/, '') : '';
  switch (q.fmt) {
    case 'A': return `先生、主語を${mine}までだと思ったんですけど、なんでちがうんですか`;
    case 'B': return `先生、述語動詞を${mine}だと思ったんですけど、なんでちがうんですか`;
    case 'C': return `先生、${mine}で閉じると思ったんですけど、どこで閉じるんですか`;
    case 'D': return `先生、${mine}だと思ったんですけど、なんでちがうんですか`;
    case 'E': return `先生、${mine}だと思ったんですけど、なんでちがうんですか`;
    case 'F': return `先生、「${q.mine}」の訳を選んだんですけど、どこがちがうんですか`;
    default: return '先生、この文の骨格がわかりません';
  }
}

/** 直近 CHAT_SEND 件。会話は必ず KANTAくん（user）から始める。新しい質問の1つ前にキャッシュの印 */
export function chatPayload(msgs) {
  let m = msgs.slice(-CHAT_SEND);
  if (m.length && m[0].role !== 'user') m = m.slice(1);
  return m.map((x, i) => i === m.length - 2
    ? { role: x.role, content: [{ type: 'text', text: x.content, cache_control: { type: 'ephemeral' } }] }
    : { role: x.role, content: x.content });
}

export function systemBlocks(context) {
  const samples = Object.entries(SAMPLES).map(([id, ms]) => `（${id}）\n` + ms.map(m => (m.who === 'k' ? 'KANTAくん：' : 'Claude先生：') + m.text).join('\n')).join('\n\n');
  return [
    { type: 'text', text: SENSEI + '\n【話し方の手本（別の分野の掛け合い）】\n' + samples, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: '\n【問題の文】\n' + context },
  ];
}

async function post(body) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey(),
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.error?.message || `HTTP ${r.status}`); e.status = r.status; throw e; }
  return d;
}
const textOf = d => (d.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('').trim();

/** eitango と同じ：ツールを使わないので between_tools で思考を止め、max_tokens を本文に回す。
    断られた（refusal）ときは、between_tools を外して Sonnet 5 で1回だけ聞き直す */
export async function callClaude(system, messages) {
  let d = await post({ model: MODEL, max_tokens: 1000, thinking: { type: 'between_tools' }, system, messages });
  if (d.stop_reason === 'refusal') {
    d = await post({ model: FALLBACK_MODEL, max_tokens: 1000, thinking: { type: 'disabled' }, system, messages });
    if (d.stop_reason === 'refusal') { const e = new Error('この質問には答えられませんでした'); e.status = 'refusal'; throw e; }
  }
  let text = textOf(d);
  if (d.stop_reason === 'max_tokens') text += ' …（長さの上限で途中で切れました）';
  return text;
}
