#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
raw_dump_part*.txt を読み込み、各学校の学費・生活費データを構造化JSONに変換する。

各レコードの生テキスト形式(スペース除去済み):
###{uuid}\t{address}\t{feeBlock}

feeBlock は概ね次の構造:
  入学金X円授業料X円制服X円...(可変項目)...合計X円(備考自由文)
  生活費住居費（月額/円）X円...(可変項目)...合計X円(備考自由文)
  居住タイプ...(0個以上の繰り返し: 住居タイプ/部屋のタイプ/通学手段/通学時間/サポート/定員/備考)
"""
import re
import json
import glob
import os

DATA_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + "/data"
MASTER_TSV = os.path.join(DATA_DIR, "schools_master.tsv")
OUT_JSON = os.path.join(DATA_DIR, "schools_cost_data.json")

RECORD_SPLIT_RE = re.compile(
    r"###([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\t"
)

# ラベル(金額)円 のペアを順番に抽出する汎用パターン。
# ラベルは「日本語・中黒(・)・カタカナ長音(ー)等」を許容し、次の数字が来るまでをラベルとみなす。
ITEM_RE = re.compile(
    r"([^\d,円()（）\-−]{1,20}?)(-?[0-9][0-9,]*)円"
)

def load_master():
    order = []
    names = {}
    with open(MASTER_TSV, encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if not line:
                continue
            uid, name = line.split("\t", 1)
            order.append(uid)
            names[uid] = name
    return order, names

def load_all_records():
    """全raw_dump_part*.txtを読み込み、uuid -> (address, feeBlock) の辞書を返す(先勝ち)。"""
    records = {}
    files = sorted(glob.glob(os.path.join(DATA_DIR, "raw_dump_part*.txt")))
    for fp in files:
        content = open(fp, encoding="utf-8").read()
        # ### で分割。先頭要素は空またはゴミなので捨てる
        parts = RECORD_SPLIT_RE.split(content)
        # parts = [garbage, uuid1, rest1, uuid2, rest2, ...]
        for i in range(1, len(parts), 2):
            uid = parts[i]
            rest = parts[i + 1]
            # rest = address \t feeBlock  (feeBlockの末尾に次レコードの"---"等が付くことがある)
            rest = rest.split("\n---")[0]
            if "\t" in rest:
                address, feeBlock = rest.split("\t", 1)
            else:
                address, feeBlock = "", rest
            if uid not in records:
                records[uid] = {"address": address.strip(), "feeBlock": feeBlock.strip()}
    return records

PAREN_NO_DIGIT_RE = re.compile(r"（[^（）0-9]*）")

def strip_unit_parens(text):
    """数字を含まない括弧書き(例: （月額/円）（スカート）等の単位注記)を除去する。
    金額そのものを含む括弧(例: （-20,000円）)は保持する。"""
    prev = None
    while prev != text:
        prev = text
        text = PAREN_NO_DIGIT_RE.sub("", text)
    return text

def extract_items(segment):
    """テキスト片から [(label, amount_int), ...] を順序通り抽出する。"""
    segment = strip_unit_parens(segment)
    items = []
    for m in ITEM_RE.finditer(segment):
        label = m.group(1)
        amt_str = m.group(2).replace(",", "")
        try:
            amt = int(amt_str)
        except ValueError:
            continue
        items.append((label, amt))
    return items

def split_sections(feeBlock):
    """feeBlockを 初年度経費部/生活費部/居住タイプ部 に分割する。"""
    seikatsu_idx = feeBlock.find("生活費")
    kyoju_idx = feeBlock.find("居住タイプ")

    if seikatsu_idx == -1:
        nenji_part = feeBlock
        seikatsu_part = ""
        kyoju_part = ""
    else:
        nenji_part = feeBlock[:seikatsu_idx]
        if kyoju_idx == -1 or kyoju_idx < seikatsu_idx:
            seikatsu_part = feeBlock[seikatsu_idx + len("生活費"):]
            kyoju_part = ""
        else:
            seikatsu_part = feeBlock[seikatsu_idx + len("生活費"):kyoju_idx]
            kyoju_part = feeBlock[kyoju_idx:]
    return nenji_part, seikatsu_part, kyoju_part

TOTAL_RE = re.compile(r"合計(-?[0-9][0-9,]*)円")

def extract_total(segment):
    """テキスト片から「合計X円」の最後の出現を金額として抽出する。
    (合計が複数回出るレアケースにも対応するため最後の値を採用)"""
    segment = strip_unit_parens(segment)
    matches = TOTAL_RE.findall(segment)
    if not matches:
        return None
    try:
        return int(matches[-1].replace(",", ""))
    except ValueError:
        return None

MAX_LABEL_LEN = 12  # これを超えるラベルは備考文と数字が誤って結合したノイズの可能性が高いため除外

def _clean_breakdown(items):
    """明細から「合計」を含む結合ラベルや、備考文と誤結合した長すぎるラベル(抽出ノイズ)を除外する。"""
    return [
        {"label": label, "amount": amt}
        for label, amt in items
        if "合計" not in label and label.strip() and len(label) <= MAX_LABEL_LEN
    ]

def parse_nenji(nenji_part):
    """初年度経費部から項目リストと合計を抽出。"""
    total = extract_total(nenji_part)
    breakdown = _clean_breakdown(extract_items(nenji_part))
    return {"total": total, "breakdown": breakdown}

def parse_seikatsu(seikatsu_part):
    total = extract_total(seikatsu_part)
    breakdown = _clean_breakdown(extract_items(seikatsu_part))
    return {"total": total, "breakdown": breakdown}

HOUSING_FIELD_LABELS = [
    "住居タイプ", "部屋のタイプ", "住居からの通学手段", "住居からの通学時間",
    "住居のサポート", "住居の定員",
]

def parse_housing_variants(kyoju_part):
    """居住タイプ部を「住居タイプ」出現ごとに分割し、各変種のフィールドと備考を抽出。"""
    if not kyoju_part:
        return []
    # 先頭のセクション見出し「居住タイプ」を除去してから「住居タイプ」で分割
    kyoju_part = re.sub(r"^居住タイプ", "", kyoju_part)
    chunks = re.split(r"(?=住居タイプ)", kyoju_part)
    chunks = [c for c in chunks if c.strip() and "住居タイプ" in c]
    variants = []
    for chunk in chunks:
        v = {}
        # 住居タイプ: 次の既知ラベルまたは文字列末尾までの文字列
        def grab(label, next_labels):
            pattern = r"{}(.*?)(?:{}|$)".format(
                re.escape(label), "|".join(re.escape(n) for n in next_labels)
            )
            m = re.search(pattern, chunk)
            return m.group(1).strip() if m else ""

        v["housing_type"] = grab("住居タイプ", ["部屋のタイプ", "住居からの通学手段", "住居からの通学時間", "住居のサポート", "住居の定員", "備考"])
        v["room_type"] = grab("部屋のタイプ", ["住居からの通学手段", "住居からの通学時間", "住居のサポート", "住居の定員", "備考"])
        v["commute_method"] = grab("住居からの通学手段", ["住居からの通学時間", "住居のサポート", "住居の定員", "備考"])
        v["commute_time"] = grab("住居からの通学時間", ["住居のサポート", "住居の定員", "備考"])
        v["support"] = grab("住居のサポート", ["住居の定員", "備考"])
        v["capacity"] = grab("住居の定員", ["備考"])
        note_m = re.search(r"備考(.*)$", chunk)
        v["note"] = note_m.group(1).strip() if note_m else ""
        variants.append(v)
    return variants

def main():
    order, names = load_master()
    records = load_all_records()

    missing = [uid for uid in order if uid not in records]
    if missing:
        print("WARNING: missing raw data for", len(missing), "schools:", missing)

    result = []
    for uid in order:
        rec = records.get(uid)
        entry = {
            "id": uid,
            "name": names[uid],
            "address": rec["address"] if rec else "",
        }
        if rec:
            nenji_part, seikatsu_part, kyoju_part = split_sections(rec["feeBlock"])
            entry["first_year_cost"] = parse_nenji(nenji_part)
            entry["monthly_living_cost"] = parse_seikatsu(seikatsu_part)
            entry["housing_variants"] = parse_housing_variants(kyoju_part)
            entry["raw_fee_block"] = rec["feeBlock"]
        else:
            entry["first_year_cost"] = {"total": None, "breakdown": []}
            entry["monthly_living_cost"] = {"total": None, "breakdown": []}
            entry["housing_variants"] = []
            entry["raw_fee_block"] = ""
        result.append(entry)

    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print("Wrote", len(result), "schools to", OUT_JSON)

    # 簡易サマリ
    no_total = [e["name"] for e in result if e["first_year_cost"]["total"] is None]
    zero_total = [e["name"] for e in result if e["first_year_cost"]["total"] == 0]
    no_living = [e["name"] for e in result if e["monthly_living_cost"]["total"] is None]
    zero_living = [e["name"] for e in result if e["monthly_living_cost"]["total"] == 0]
    print("初年度費用: 合計欠損", len(no_total), " 合計0円(未確定)", len(zero_total))
    print("月額生活費: 合計欠損", len(no_living), " 合計0円(未確定)", len(zero_living))

if __name__ == "__main__":
    main()
