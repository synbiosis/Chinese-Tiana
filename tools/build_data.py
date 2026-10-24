#!/usr/bin/env python3
"""Build data/hanzi.js from public frequency lists and CC-CEDICT.

Inputs (download into a directory and pass it as the first argument):
  junda.txt   Jun Da's Modern Chinese character frequency list, converted to UTF-8
              https://lingua.mtsu.edu/chinese-computing/statistics/char/list.php?Which=MO
  cedict      CC-CEDICT (uncompressed)
              https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz
  words.txt   Word frequency list (OpenSubtitles, hermitdave/FrequencyWords zh_cn_50k)
"""
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

COUNT = 1000
PINYIN_MAP_COUNT = 6000
TONE_MARKS = {
    'a': 'āáǎà', 'e': 'ēéěè', 'i': 'īíǐì', 'o': 'ōóǒò', 'u': 'ūúǔù', 'ü': 'ǖǘǚǜ',
}


def normalize(syl):
    syl = syl.lower().replace('u:', 'ü').replace('v', 'ü')
    if not syl or not syl[-1].isdigit():
        syl += '5'
    return syl


def marked(syl):
    """'zhong1' -> 'zhōng'."""
    syl = normalize(syl)
    base, tone = syl[:-1], int(syl[-1])
    if tone in (0, 5):
        return base
    for v in ('a', 'e'):
        if v in base:
            return base.replace(v, TONE_MARKS[v][tone - 1], 1)
    if 'ou' in base:
        return base.replace('o', TONE_MARKS['o'][0 + tone - 1], 1)
    for i in range(len(base) - 1, -1, -1):
        if base[i] in TONE_MARKS:
            return base[:i] + TONE_MARKS[base[i]][tone - 1] + base[i + 1:]
    return base


def clean_defs(defs, limit=3, max_len=70):
    out = []
    for d in defs:
        if re.search(r'taboo|vulgar|fuck|slang for sex|euphemism', d):
            return ''
        if re.match(r'^(surname|variant of|old variant|see |used in |CL:|Taiwan pr\.|also pr\.|abbr\. for)', d):
            continue
        d = re.sub(r'\[[^\]]*\]', '', d)          # drop inline pinyin
        d = re.sub(r'[一-鿿]+\|', '', d)  # traditional|simplified -> simplified
        d = re.sub(r'\s*\([^)]*pr\.[^)]*\)', '', d)  # pronunciation notes
        d = d.strip()
        if out and len('; '.join(out + [d])) > max_len:
            break
        if d and d not in out:
            out.append(d)
        if len(out) >= limit:
            break
    return '; '.join(out)


def main(src):
    src = Path(src)
    text = (src / 'junda.txt').read_text()
    pre = text[text.index('<pre>') + 5:text.index('</pre>')]
    chars = []
    for row in pre.split('<br>'):
        parts = row.split('\t')
        if len(parts) >= 6 and re.match(r'[一-鿿]', parts[1]):
            chars.append({'c': parts[1], 'py': [normalize(p) for p in parts[4].split('/') if p], 'en': parts[5]})

    cedict = defaultdict(list)          # simplified -> [(pinyin syllables, defs)]
    for line in (src / 'cedict').read_text().splitlines():
        m = re.match(r'^(\S+) (\S+) \[([^\]]+)\] /(.*)/$', line)
        if m:
            cedict[m.group(2)].append(([normalize(s) for s in m.group(3).split()], m.group(4).split('/')))

    word_rank = {}
    for i, line in enumerate((src / 'words.txt').read_text().splitlines()):
        w = line.split(' ')[0]
        if re.fullmatch(r'[一-鿿]{2,3}', w) and w in cedict:
            word_rank.setdefault(w, i)

    top = chars[:COUNT]
    top_set = {c['c'] for c in chars[:2500]}
    by_char = defaultdict(list)
    for w, rank in sorted(word_rank.items(), key=lambda kv: kv[1]):
        if all(ch in top_set for ch in w):
            for ch in set(w):
                by_char[ch].append(w)

    out = []
    for i, ch in enumerate(top):
        c = ch['c']
        entries = [e for e in cedict.get(c, []) if not e[1][0].startswith(('surname', 'variant of', 'old variant'))]
        primary = ch['py'][0]
        # Prefer the CEDICT reading Jun Da lists first, else the first non-surname entry.
        entry = next((e for e in entries if e[0][0] == primary), entries[0] if entries else None)
        if entry and entry[0][0] != primary and primary not in [e[0][0] for e in cedict.get(c, [])]:
            primary = entry[0][0]
        meaning = clean_defs(entry[1]) if entry else ''
        if not meaning:
            meaning = ch['en'].replace('/', '; ')
        words = []
        for w in by_char.get(c, []):
            if w == c:
                continue
            wpy, wdefs = cedict[w][0]
            if len(wpy) != len(w):
                continue
            wdef = clean_defs(wdefs, 2)
            if not wdef:
                continue
            words.append([w, ' '.join(marked(s) for s in wpy), wdef])
            if len(words) >= 3:
                break
        others = sorted(({e[0][0] for e in cedict.get(c, []) if len(e[0]) == 1} | set(ch['py'])) - {primary})
        out.append({
            'r': i + 1, 'c': c, 'p': marked(primary), 'n': primary,
            'alt': [marked(s) for s in others], 'm': meaning, 'w': words,
        })

    # Readings of common characters, used to judge speech recognition results
    # (the recognizer may return a homophone instead of the target character).
    readings = {}
    for ch in chars[:PINYIN_MAP_COUNT]:
        syls = set(ch['py'])
        syls |= {e[0][0] for e in cedict.get(ch['c'], []) if len(e[0]) == 1}
        readings[ch['c']] = ','.join(sorted(syls))

    dest = Path(__file__).resolve().parent.parent / 'data' / 'hanzi.js'
    with dest.open('w') as f:
        f.write('// Generated by tools/build_data.py. Character frequency: Jun Da (Modern Chinese).\n')
        f.write('// Definitions and words: CC-CEDICT (CC BY-SA 4.0). Word frequency: FrequencyWords (OpenSubtitles).\n')
        f.write('window.HANZI = ')
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\nwindow.READINGS = ')
        json.dump(readings, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')
    print(f'wrote {len(out)} characters, {len(readings)} readings to {dest}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
