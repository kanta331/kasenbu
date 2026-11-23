#!/usr/bin/env python3
"""下ごしらえ：正本と過去問の英文を文に分け、トークン化する。
英文そのものは content/（gitignore 済み）にだけ出す。このスクリプトに英文は含めない。
  python3 scripts/build.py split   -> content/work/sentences.json
"""
import json, re, sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
MAT, CON = ROOT/'materials', ROOT/'content'
SEIHON_RANGE = range(1, 101)
KAKOMON_YEARS = [2022, 2023, 2024, 2025, 2026]

TOKEN_RE = re.compile(r"(?:[A-Za-z]\.){2,}|'tween|'(?:s|m|re|ve|ll|d)\b|[A-Za-z0-9$]+(?:[-'’.,][A-Za-z0-9]+)*|[^\sA-Za-z0-9]")
CLITIC_S = re.compile(r"(?i)^(that|it|he|she|there|what|who|here|let)('s)$")
CLITIC = re.compile(r"^([A-Za-z]+)('(?:m|re|ve|ll|d))$")
def tokenize_ws(s):
    """[(token, 前に空白があるか)]。代名詞＋'s と 'm 're 've 'll 'd は2トークンに分ける（所有の 's は分けない）。"""
    out = []
    for m in TOKEN_RE.finditer(s):
        tok, ws = m.group(), m.start() > 0 and s[m.start()-1].isspace()
        c = CLITIC_S.match(tok) or CLITIC.match(tok)
        if c: out += [(c.group(1), ws), (c.group(2), False)]
        else: out.append((tok, ws))
    return out
def tokenize(s): return [t for t, _ in tokenize_ws(s)]

SPLIT_RE = re.compile(r'(?<=[.?!])(["”’)]?)\s+(?=["“(]?[A-Z])')
def split_sentences(par):
    out, start = [], 0
    for m in SPLIT_RE.finditer(par):
        end = m.start() + len(m.group(1))
        out.append(par[start:end].strip()); start = m.end()
    out.append(par[start:].strip())
    return [s for s in out if s]

def load_seihon():
    raw = (MAT/'seihon.txt').read_text(encoding='utf-8')
    items, cur, buf = {}, None, []
    for line in raw.split('\n'):
        m = re.fullmatch(r'\((\d+)\)\s*', line.strip())
        if m:
            if cur is not None: items[cur] = buf
            cur, buf = int(m.group(1)), []
        elif cur is not None and line.strip():
            buf.append(line.strip())
    if cur is not None: items[cur] = buf
    fixes = [f for p in sorted((CON/'src').glob('fixes*.json')) for f in json.loads(p.read_text())['fixes']]
    applied = []
    for no, a, b in fixes:
        pars = items[no]; hit = False
        for i, p in enumerate(pars):
            if a in p: pars[i] = p.replace(a, b, 1); hit = True; break
        if not hit: sys.exit(f'fix not found: ({no}) {a!r}')
        applied.append(no)
    return items

def seihon_sentences():
    out = []
    for no, pars in sorted(load_seihon().items()):
        if no not in SEIHON_RANGE: continue
        k = 0
        for p in pars:
            for s in split_sentences(p):
                k += 1
                out.append({'id': f'S{no:03d}-{k}', 'source': {'kind': 'seihon', 'no': no}, 'text': s})
    return out

def kakomon_sentences(year):
    path = CON/f'transcript/{year}.txt'
    if not path.exists(): path = next((CON/'sealed').glob(f'{year}_*.txt'))   # 封印分
    txt = path.read_text(encoding='utf-8')
    out, q, notes = [], None, {}
    for line in txt.split('\n'):
        if line in ('(1)', '(2)'): q = int(line[1]); counters = {'a': 0, 'b': 0, 'x': 0}; para = 0; continue
        if line.startswith('NOTE:'): notes.setdefault(q, []).append(line[5:].strip()); continue
        if not line.strip(): continue
        para += 1   # ボス戦で本文を段落ごとに出すため
        # 下線の内外で区切ってから文分割
        for m in re.finditer(r'<([ab])>(.*?)</\1>|([^<]+)', line):
            part = m.group(1); seg = m.group(2) if part else m.group(3)
            for s in split_sentences(seg.strip()):
                key = part or 'x'; counters[key] += 1
                out.append({'id': f'K{year}-{q}-{key}-{counters[key]}',
                            'source': {'kind': 'kakomon', 'year': year, 'q': q, 'part': part, 'para': para},
                            'text': s})
    return out

def cmd_split():
    sents = seihon_sentences()
    for y in KAKOMON_YEARS: sents += kakomon_sentences(y)
    for s in sents:
        tw = tokenize_ws(s['text'])
        s['tokens'] = [t for t, _ in tw]
        s['space_before'] = [w for _, w in tw]   # 画面で語をつなげて表示するため
    (CON/'work').mkdir(exist_ok=True)
    tmp = CON/'work/sentences.json.tmp'   # 並行作業で読みかけを掴まないよう置き換えで書く
    tmp.write_text(json.dumps(sents, ensure_ascii=False, indent=1)); tmp.replace(CON/'work/sentences.json')
    for s in sents:
        print(f"{s['id']:<14}{len(s['tokens']):>3}  {' '.join(s['tokens'][:4])} … {' '.join(s['tokens'][-3:])}")
    print(len(sents), 'sentences')

# ---- 組み立て：content/src/ann_*.json（語句で書いた注釈）→ トークン範囲 ----
def find_seq(tokens, phrase, after=0):
    """phrase を tokens 内で探す。'語句@2' は2回目。'A … B' は A の頭から B の終わりまで。"""
    nth = 1
    if '@' in phrase:
        phrase, n = phrase.rsplit('@', 1); nth = int(n)
    if '…' in phrase:
        a, b = [x.strip() for x in phrase.split('…', 1)]
        ra = find_seq(tokens, a + (f'@{nth}' if nth > 1 else ''), after)
        rb = find_seq(tokens, b, ra[0])
        return [ra[0], rb[1]]
    pt = tokenize(phrase); hits = 0
    for i in range(after, len(tokens) - len(pt) + 1):
        if tokens[i:i+len(pt)] == pt:
            hits += 1
            if hits == nth: return [i, i + len(pt) - 1]
    raise KeyError(phrase)

def resolve(sent, a, errors):
    t = sent['tokens']
    def R(ph, after=0):
        try: return find_seq(t, ph, after)
        except KeyError: errors.append(f"{sent['id']}: 見つからない語句 {ph!r}"); return [0, 0]
    out = dict(sent)
    out['main'] = {'s': R(a['s']) if a.get('s') else None, 'v': R(a['v'])}
    # 等位で並ぶ2つ目以降の主節。主語が共通なら s は None
    more = [[None, v] for v in a.get('v_more', [])] + a.get('more', [])
    if more: out['main']['more'] = [{'s': R(ms) if ms else None, 'v': R(mv)} for ms, mv in more]
    if a.get('imperative'): out['main']['imperative'] = True
    out['spans'] = [{'range': R(ph), 'kind': k, 'head': (R(h)[1] if h else None)} for ph, k, h in a.get('spans', [])]
    out['types'] = a.get('types', [])
    out['referents'] = []
    for r in a.get('ref', []):
        ref = {'token': R(r[0])[0]}
        if len(r) > 2 and r[2]:   # 先行詞が別の文にある
            other = SENTS[r[2]]
            try: ref.update(sent=r[2], range=find_seq(other['tokens'], r[1]))
            except KeyError: errors.append(f"{sent['id']}: 先行詞が {r[2]} に見つからない {r[1]!r}")
        else: ref['range'] = R(r[1])
        out['referents'].append(ref)
    out['connectors'] = [{'token': R(w)[0], 'word': w.split('@')[0], 'logic': lg} for w, lg in a.get('conn', [])]
    out['hard'] = [{'range': R(w), 'ja': ja} for w, ja in a.get('hard', [])]
    out['skeleton_ja'] = a['skel']; out['model_ja'] = a['model']
    out['choices'] = [{'ja': ja, 'error': e} for ja, e in a['ch']]
    if a.get('note'): out['note'] = a['note']
    out['status'] = a.get('status', 'ok')          # hold の文は出題しない
    if a.get('hold_reason'): out['hold_reason'] = a['hold_reason']
    return out

SENTS = {}
def cmd_assemble():
    sents = json.loads((CON/'work/sentences.json').read_text())
    SENTS.update({s['id']: s for s in sents})
    ann, bosses = {}, []
    for f in sorted((CON/'src').glob('ann_*.json')):
        d = json.loads(f.read_text())
        bosses += d.pop('_bosses', [])
        for k, v in d.items():
            if k.startswith('_'): continue
            if k in ann: sys.exit(f'重複: {k}')
            ann[k] = v
    errors, out = [], []
    for s in sents:
        if s['id'] in ann: out.append(resolve(s, ann[s['id']], errors))
    missing = [s['id'] for s in sents if s['id'] not in ann]
    bundle = {'version': 1, 'sentences': out, 'bosses': bosses}
    (CON/'kasenbu-content.json').write_text(json.dumps(bundle, ensure_ascii=False, indent=1))
    print(f'{len(out)} 文を出力 / 未作成 {len(missing)} 文')
    for e in errors: print('ERROR', e)
    if errors: sys.exit(1)

def cmd_check(path):
    """注釈ファイル1つだけを組み立て、content/work/check_<名前>.json に出す（全体の束には触れない）。"""
    sents = json.loads((CON/'work/sentences.json').read_text())
    SENTS.update({s['id']: s for s in sents})
    d = json.loads(pathlib.Path(path).read_text()); bosses = d.pop('_bosses', [])
    errors, out = [], []
    for s in sents:
        if s['id'] in d: out.append(resolve(s, d[s['id']], errors))
    unknown = [k for k in d if not k.startswith('_') and k not in SENTS]
    dst = CON/f"work/check_{pathlib.Path(path).stem}.json"
    dst.write_text(json.dumps({'version': 1, 'sentences': out, 'bosses': bosses}, ensure_ascii=False, indent=1))
    print(f'{len(out)} 文 → {dst}')
    for k in unknown: print('ERROR 存在しない文ID', k)
    for e in errors: print('ERROR', e)
    if errors or unknown: sys.exit(1)

if __name__ == '__main__':
    cmds = {'split': cmd_split, 'assemble': cmd_assemble, 'check': cmd_check}
    cmds[sys.argv[1]](*sys.argv[2:])
