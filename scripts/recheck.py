#!/usr/bin/env python3
"""別パス再検査：独立に取り直した主語・述語・節境界（content/work/recheck_raw.json）と
content/kasenbu-content.json を突き合わせ、食い違いを content/work/recheck_diff.json に出す。"""
import json, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
mine = json.loads((ROOT/'content/kasenbu-content.json').read_text())
other = json.loads((ROOT/'content/work/recheck_raw.json').read_text())
CLAUSE = {'REL', 'NOUNCL', 'ADVCL', 'PTC', 'INF'}
ov = lambda a, b: a[0] <= b[1] and b[0] <= a[1]
out = {}
for s in mine['sentences']:
    t, o, d = s['tokens'], other[s['id']], []
    w = lambda r: ' '.join(t[r[0]:r[1]+1]) if r else '∅'
    m = s['main']
    if m['s'] != o.get('s'): d.append(['subject', w(m['s']), w(o.get('s'))])
    if not ov(m['v'], o['v']): d.append(['verb', w(m['v']), w(o['v'])])
    mm = [x['v'] for x in m.get('more', [])]; om = [x['v'] for x in o.get('more', [])]
    for v in mm:
        if not any(ov(v, x) for x in om): d.append(['more_verb_only_mine', w(v), ''])
    for v in om:
        if not any(ov(v, x) for x in mm): d.append(['more_verb_only_other', '', w(v)])
    oc = [c for c in o.get('clauses', []) if c[2] in CLAUSE]
    for sp in s['spans']:
        if sp['kind'] not in CLAUSE: continue
        r = sp['range']
        same_start = [c for c in oc if c[0] == r[0]]
        if not same_start: d.append(['clause_only_mine', f"{sp['kind']} {w(r)}", ''])
        elif not any(c[1] == r[1] for c in same_start):
            d.append(['clause_end', f"{sp['kind']} …{t[r[1]]}", ' / '.join(f"{c[2]} …{t[c[1]]}" for c in same_start)])
    mine_starts = {sp['range'][0] for sp in s['spans']}
    for c in oc:
        if c[0] not in mine_starts: d.append(['clause_only_other', '', f"{c[2]} {w([c[0], c[1]])}"])
    if d: out[s['id']] = d
(ROOT/'content/work/recheck_diff.json').write_text(json.dumps(out, ensure_ascii=False, indent=1))
kinds = {}
for v in out.values():
    for k in v: kinds[k[0]] = kinds.get(k[0], 0) + 1
print(f"食い違いのある文 {len(out)} / {len(mine['sentences'])}", kinds)
