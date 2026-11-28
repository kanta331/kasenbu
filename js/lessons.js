/* 技（15枚）。docs/GAME.md。「対戦」を押すたびに、まだ覚えていない技を1つ「技を覚える」で先に見せる。
   skill が技の名前、title はその中身の見出し。
   例文（ex）は形を見せるためだけの短い作例で、出題・採点には使わない。
   本物の文は content から EXAMPLE_RULES[real] で選ぶ（英文をコードに持たない）。

   ex の書き方：語は空白区切り。句読点も空白で区切る（表示では前の語に付く）。
     [s … ] 主語（緑の下線）  [v … ] 述語動詞（赤の太字）  [m … ] 飾り（薄く）
     [r … ] 指示語（紫）      [d … ] 指す先（紫の地）       [l … ] 論理語（金）
     ( … ) 節・句（青い括弧）  { … } 挿入（[ ] で表示）
*/
export const LESSONS = [
  {
    skill: '芯を取る',
    title: '文の芯：「だれが」＋「どうする」',
    goal: '英語の文には必ず芯がある。まずそれを見つける。',
    focus: [], real: 'short',
    cards: [
      { say: '「だれが・何が」を緑の下線、「どうする・どうだ」を赤の太字で示す。この2つが文の芯。', ex: '[s Birds ] [v fly ] .', ja: '鳥は飛ぶ。' },
      { say: '日本語では動詞が最後に来る。英語では芯の動詞が2番目に来て、その後ろに「何を」「いつ」が続く。', ex: '[s My sister ] [v reads ] books every night .', ja: '私の姉は毎晩本を読む。' },
      { say: 'is / are / was も赤になる。「＝」の印だと思えばいい。', ex: '[s This room ] [v is ] cold .', ja: 'この部屋は寒い。' },
    ],
    realSay: '作例と同じく、最初は緑と赤だけを見る。',
  },
  {
    skill: '動詞を見分ける',
    title: '赤になれる語、なれない語',
    goal: '動詞の形の目印を覚える。',
    focus: ['VPRED'], real: 'verbs',
    cards: [
      { say: '赤になれる語には目印がある。is / are / was / were、語尾の -s や -ed、前に can / will / may / must が付いた形。can speak のように2語で1つの赤になることもある。', ex: '[s She ] [v can speak ] three languages .', ja: '彼女は3つの言語を話せる。' },
      { say: '-ing だけ、to＋動詞は、芯の赤にはなれない。「〜すること」として主語になる。', ex: '[s Reading books ] [v is ] fun .', ja: '本を読むことは楽しい。' },
      { say: 'to＋動詞の主語も同じ。赤は takes。', ex: '[s To learn a language ] [v takes ] time .', ja: '言語を学ぶことには時間がかかる。' },
      { say: 'was＋-ed、has＋-ed も2語で1つの赤。was broken は「割られた」。', ex: '[s The window ] [v was broken ] by the wind .', ja: '窓は風で割られた。' },
    ],
    realSay: '赤が2語以上になっている文。どの語が赤に入るかを見る。',
  },
  {
    skill: '飾りを薄くする',
    title: '前置詞のかたまりは飾り',
    goal: 'in / of / on で始まるかたまりを薄くして読む。',
    focus: [], real: 'longsubj',
    cards: [
      { say: 'in / on / of / for / with / to などで始まるかたまりは、前の語を説明する飾り。薄くすると芯が見える。', ex: '[s The cat [m on the sofa ] ] [v is sleeping ] .', ja: 'ソファーの上の猫は眠っている。' },
      { say: 'books is と読まない。is の主語は price（値段）。飾りの中の語は主語にならない。', ex: '[s The price [m of these books ] ] [v is ] high .', ja: 'これらの本の値段は高い。' },
      { say: '飾りは2つ3つ続くこともある。全部まとめて主語。', ex: '[s The people [m in the town ] [m near the sea ] ] [v are ] kind .', ja: '海の近くの町の人々は親切だ。' },
    ],
    realSay: '緑の下線が長い文。下線の中の飾りを薄く読む。',
  },
  {
    skill: '先に述語を探す',
    title: '主語はどこまで？　先に赤を探す',
    goal: '長い主語の終わりを自分で決める。',
    focus: [], real: 'longsubj',
    cards: [
      { say: '主語の終わりは書いていない。コツは、先に芯の赤を探し、その手前までを主語にすること。', ex: '[s The way [m to the station ] ] [v is ] easy .', ja: '駅への道はわかりやすい。' },
      { say: '赤は can make。その手前の A small change in our daily life 全体が主語。', ex: '[s A small change [m in our daily life ] ] [v can make ] a big difference .', ja: '日常生活の小さな変化が、大きな違いを生みうる。' },
    ],
    realSay: '対戦の「主語はどこまで」「述語動詞はどれ」のターンは、この手順で取る。',
  },
  {
    skill: '（ ）を閉じる',
    title: '後ろから説明する節：which / that / who',
    goal: '名詞の後ろの（ ）を開いて、閉じる。',
    focus: ['REL'], real: 'relword',
    cards: [
      { say: '名詞のすぐ後ろに which / that / who が来たら、そこから「その名詞の説明」が始まる。青い（ ）でくくる。（ ）の中にも主語と動詞があるが、芯ではない。', ex: '[s The book ( which I bought ) ] [v is ] old .', ja: '私が買った本は古い。' },
      { say: '（ ）は芯の赤の直前で閉じる。閉じ忘れると「bought is」のように動詞をつないでしまう。いちばん多い間違い（E1）。', ex: '[s The man ( who lives next door ) ] [v is ] a doctor .', ja: '隣に住んでいる男性は医者だ。' },
      { say: '訳すときは（ ）の中を先に訳し、名詞の前に置く。「フランス語を話す→女の子」。', ex: '[s I ] [v know ] a girl ( who speaks French ) .', ja: '私はフランス語を話す女の子を知っている。' },
    ],
    realSay: '（ ）がどこで開いてどこで閉じるか、赤がどこにあるかを見る。',
  },
  {
    skill: '消えた which を補う',
    title: 'which が消える形',
    goal: '見えない which に気づく。',
    focus: ['REL'], real: 'contact',
    cards: [
      { say: 'which / that はよく省かれる。名詞の後ろにいきなり「主語＋動詞」が来たら、そこで（ が始まっている。', ex: '[s The book ( I bought yesterday ) ] [v is ] old .', ja: '私が昨日買った本は古い。' },
      { say: '目印は「名詞・名詞・動詞」の並び。Everything she said のように名詞が2つ続いたら、間に which を補って読む。', ex: '[s Everything ( she said ) ] [v was ] true .', ja: '彼女が言ったことはすべて本当だった。' },
      { say: 'the way S V（〜するやり方）もこの形。', ex: '[s The way ( he talks ) ] [v is ] funny .', ja: '彼の話し方はおかしい。' },
    ],
    realSay: 'which のない（ ）がある本物の文。（ ）の始まりを確かめる。',
  },
  {
    skill: '前置詞＋which をほどく',
    title: '前置詞＋which',
    goal: 'in which の（ ）の中で、だれが何をするかを取り違えない。',
    focus: ['REL'], real: 'prepwh',
    cards: [
      { say: 'in which / on which のように、前置詞が which の前に出ることがある。（ ）の中の主語は which の後ろの語。', ex: '[s The house ( in which he lives ) ] [v is ] big .', ja: '彼が住んでいる家は大きい。' },
      { say: '元に戻すと the plan is based on the idea。考えが計画に基づくのではなく、計画が考えに基づく。逆にしない（E2）。', ex: '[s The idea ( on which the plan is based ) ] [v is ] simple .', ja: 'その計画が基づいている考えは単純だ。' },
    ],
    realSay: '前置詞＋which の文。（ ）の中の主語を確かめる。',
  },
  {
    skill: '-ing／-ed を（ ）に入れる',
    title: '-ing / -ed が後ろから説明する',
    goal: '名詞の後ろの -ing / -ed を（ ）に入れる。',
    focus: ['PTC', 'VPRED'], real: 'postptc',
    cards: [
      { say: '名詞のすぐ後ろの -ing のかたまりも、その名詞の説明（ ）。「〜している」。', ex: '[s The girl ( sitting by the window ) ] [v is ] my sister .', ja: '窓際に座っている女の子は私の妹だ。' },
      { say: '-ed なら「〜された」。', ex: '[s The letter ( written in English ) ] [v was ] long .', ja: '英語で書かれた手紙は長かった。' },
      { say: '-ed が2つ並んだら要注意。一方は説明の（ ）、もう一方が赤。', ex: '[s The data ( collected last year ) ] [v showed ] a clear change .', ja: '昨年集められたデータは、はっきりした変化を示した。' },
    ],
    realSay: '名詞の後ろの -ing / -ed を（ ）に入れて、本当の赤を探す。',
  },
  {
    skill: '割り込みを飛ばす',
    title: '割り込み：カンマではさまれた部分',
    goal: '割り込みを [ ] でくくって、いったん飛ばす。',
    focus: ['INS'], real: 'ins',
    cards: [
      { say: '主語と赤の間に、カンマやダッシュではさまれた説明が割り込むことがある。[ ] でくくって飛ばす。', ex: '[s My father ] , { a doctor } , [v works ] very hard .', ja: '私の父は医者で、とても熱心に働く。' },
      { say: 'however のような1語でも同じ。飛ばして The plan failed を先に取る。', ex: '[s The plan ] , { however } , [v failed ] .', ja: 'しかし、その計画は失敗した。' },
      { say: '割り込みが長いと主語を忘れる。[ ] の後で主語に戻ってから赤につなぐ。', ex: '[s The museum ] , { which opened in 1990 and attracts many visitors every year } , [v is ] near the river .', ja: 'その美術館は、1990年に開館し毎年多くの人が訪れるが、川の近くにある。' },
    ],
    realSay: '[ ] を飛ばして、緑と赤をつなげて読む。',
  },
  {
    skill: '名詞のかたまりにする',
    title: '名詞のかたまり：that / what / how',
    goal: '（ ）全体を1つの名詞として扱う。',
    focus: ['NOUNCL'], real: 'nouncl',
    cards: [
      { say: 'that / what / how / whether で始まる（ ）は、全体で1つの名詞。「〜ということ」「〜するもの」「どのように〜か」。', ex: '[s I ] [v know ] ( that he is busy ) .', ja: '私は彼が忙しいことを知っている。' },
      { say: 'what の（ ）が主語になると主語が長くなる。（ ）を閉じたところに赤が来る。', ex: '[s ( What he said ) ] [v was ] true .', ja: '彼が言ったことは本当だった。' },
      { say: 'The reason … is that 〜 は「…の理由は〜ということだ」。過去問によく出る。', ex: '[s The reason ] [v is ] ( that we have no time ) .', ja: '理由は、私たちに時間がないということだ。' },
    ],
    realSay: '名詞の（ ）を見つけて、文の中で主語・目的語のどちらになっているかを見る。',
  },
  {
    skill: '指す先を決める',
    title: 'it / they は何を指す？',
    goal: '指す先を決めてから訳す。',
    focus: ['REF', 'IT'], real: 'ref',
    cards: [
      { say: 'it / they / this は、前に出た語の代わり。紫で示す。何を指すか必ず決めてから訳す（E9）。', ex: 'I bought [d a new bag ] . [r It ] was cheap .', ja: '新しいかばんを買った。それ（＝かばん）は安かった。' },
      { say: 'it が後ろの to 〜 を指すこともある。It is … to 〜 は「〜することは…だ」。', ex: '[s [r It ] ] [v is ] important [d to sleep well ] .', ja: 'よく眠ることは大切だ。' },
      { say: 'those は前の複数の名詞の代わり。ここでは prices。', ex: '[s The [d prices ] here ] [v are ] higher than [r those ] in my town .', ja: 'ここの物価は、私の町の物価より高い。' },
    ],
    realSay: '紫の語が指す先を確かめる。',
  },
  {
    skill: '向きを読む',
    title: '論理語：話の向きを決める語',
    goal: '順接・逆接・譲歩・理由・同時を見分ける。',
    focus: ['CONJ'], real: 'conn',
    cards: [
      { say: '文と文をつなぐ語は話の向きを決める。金色で示す。順接：so / thus / therefore（だから・こうして）。', ex: '[l Thus ] , [s the plan ] [v worked ] .', ja: 'こうして、その計画はうまくいった。' },
      { say: '逆接：but / yet / however（しかし）。向きを逆に読むと訳全体が逆になる（E4）。', ex: '[s It ] [v was ] cheap , [l yet ] nobody bought it .', ja: 'それは安かったが、誰も買わなかった。' },
      { say: '譲歩：although / though / even though / even if（〜だけれども）。言いたいことは後半。', ex: '[l Although ] it rained , [s we ] [v went ] out .', ja: '雨が降ったけれども、私たちは出かけた。' },
      { say: '理由：because / since / as（〜なので）。同時：while / as（〜する間・〜しながら）。as と since は文脈で決める。', ex: '[s She ] [v listened ] to music [l while ] she cooked .', ja: '彼女は料理をしながら音楽を聞いた。' },
    ],
    realSay: '金色の語の向きを確かめる。',
  },
  {
    skill: '文頭・文末の -ing を切る',
    title: '文頭・文末の -ing / -ed',
    goal: 'カンマまでを（ ）にして、芯を後ろに探す。',
    focus: ['PTC'], real: 'leadptc',
    cards: [
      { say: '文の頭の -ing のかたまりは、カンマまでを（ ）でくくる。芯はカンマの後ろ。', ex: '( Walking in the park ) , [s I ] [v met ] an old friend .', ja: '公園を歩いていて、私は旧友に会った。' },
      { say: '（ ）の中の動作をするのは芯の主語。書かれているのは the book。', ex: '( Written in easy English ) , [s the book ] [v is ] popular .', ja: 'やさしい英語で書かれているので、その本は人気がある。' },
      { say: '文末の「, -ing」は「そして〜する」「〜しながら」。', ex: '[s He ] [v left ] the room , ( saying nothing ) .', ja: '彼は何も言わずに部屋を出ていった。' },
    ],
    realSay: '-ing / -ed の（ ）と、芯の主語の関係を見る。',
  },
  {
    skill: '組を探す',
    title: 'so … that と not A but B',
    goal: '2つで1組の形に気づく。',
    focus: ['SOTHAT', 'NEGCMP'], real: 'negcmp',
    cards: [
      { say: 'so 〜 that … は「とても〜なので…」。so を見たら、後ろの that を探しに行く。', ex: '[s I ] [v was ] so tired that I fell asleep .', ja: 'とても疲れていたので、眠ってしまった。' },
      { say: 'not A but B は「AではなくB」。言いたいのは B。', ex: '[s The problem ] [v is ] not money but time .', ja: '問題はお金ではなく時間だ。' },
      { say: 'more A than B は「BというよりA」。比べているのは A と B。', ex: '[s He ] [v is ] more a teacher than a scholar .', ja: '彼は学者というより教師だ。' },
    ],
    realSay: '2つで1組の語を見つける。',
  },
  {
    skill: '〔？〕のまま進む',
    title: 'まとめ：長い文をほどく手順',
    goal: 'ここまでの手順を1つの文に使う。',
    focus: ['REL', 'INS'], real: 'long',
    cards: [
      { say: '①芯の赤を探す　②その手前を主語にする　③（ ）と [ ] でくくって飛ばす　④論理語の向きを確かめる　⑤it などの指す先を決める。', ex: '[s The book ( which my teacher recommended ) ] , { though difficult } , [v changed ] the way ( I read ) .', ja: '先生が勧めてくれた本は、難しかったが、私の読み方を変えた。' },
      { say: '知らない語は〔？〕のまま進む。骨格が取れれば、〔？〕があっても文の形はわかる（E3）。', ex: '[s The 〔？〕 ( which he found ) ] [v was ] very old .', ja: '彼が見つけた〔？〕はとても古かった。' },
    ],
    realSay: '本物の長い文に①〜⑤を使う。これで15の技がそろった。以後は対戦だけになる。',
  },
];

/** ex の書き方を HTML にする。 */
const CLS = { s: 'subj', v: 'verb', m: 'dim', r: 'ref', d: 'refdst', l: 'logic' };
const NOSPACE = new Set(['.', ',', '?', '!', ';', ':']);
export function exampleHTML(src, { plain = false } = {}) {
  const stack = [];
  let html = '', first = true;
  const sp = t => { const s = first || NOSPACE.has(t) ? '' : '</span> <span class="nw">'; first = false; return s; };
  for (const t of src.trim().split(/\s+/)) {
    if (/^\[[svmrdl]$/.test(t)) { stack.push(CLS[t[1]]); continue; }
    if (t === ']') { stack.pop(); continue; }
    if (t === '(' || t === '{') { html += sp('x') + `<span class="br">${plain ? '' : t === '(' ? '(' : '['}</span>`; first = true; continue; }
    if (t === ')' || t === '}') { if (!plain) html += `<span class="br">${t === ')' ? ')' : ']'}</span>`; continue; }
    const c = plain ? [] : [...new Set(stack)];
    html += sp(t) + `<span class="tok ${c.join(' ')}">${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`;
  }
  return `<div class="sent"><span class="nw">${html}</span></div>`;
}
