#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""schools_cost_data.json の各校に、住所から判定した都道府県名と
概算の代表座標(県庁所在地の緯度経度)を付与する。
距離計算は「概算値」であるため、学校ごとの厳密な緯度経度ではなく
都道府県代表点を用いる簡易ロジックとする(要件定義での合意事項)。
"""
import json
import os

DATA_DIR = os.path.dirname(os.path.abspath(__file__)) + "/../data"
IN_JSON = os.path.join(DATA_DIR, "schools_cost_data.json")
OUT_JSON = IN_JSON  # 上書き

# 都道府県名(順序は北から南、判定の優先度に影響しないが一覧として保持)
# 緯度経度は県庁所在地(市役所付近)の概算値。
PREF_CENTROIDS = {
    "北海道": (43.0642, 141.3469),
    "青森県": (40.8244, 140.7400),
    "岩手県": (39.7036, 141.1527),
    "宮城県": (38.2688, 140.8721),
    "秋田県": (39.7186, 140.1024),
    "山形県": (38.2404, 140.3633),
    "福島県": (37.7503, 140.4676),
    "茨城県": (36.3418, 140.4468),
    "栃木県": (36.5658, 139.8836),
    "群馬県": (36.3911, 139.0608),
    "埼玉県": (35.8569, 139.6489),
    "千葉県": (35.6047, 140.1233),
    "東京都": (35.6895, 139.6917),
    "神奈川県": (35.4478, 139.6425),
    "新潟県": (37.9026, 139.0232),
    "富山県": (36.6953, 137.2113),
    "石川県": (36.5947, 136.6256),
    "福井県": (36.0652, 136.2216),
    "山梨県": (35.6642, 138.5686),
    "長野県": (36.6513, 138.1810),
    "岐阜県": (35.3912, 136.7223),
    "静岡県": (34.9769, 138.3831),
    "愛知県": (35.1802, 136.9066),
    "三重県": (34.7303, 136.5086),
    "滋賀県": (35.0045, 135.8686),
    "京都府": (35.0116, 135.7681),
    "大阪府": (34.6863, 135.5200),
    "兵庫県": (34.6913, 135.1830),
    "奈良県": (34.6851, 135.8329),
    "和歌山県": (34.2261, 135.1675),
    "鳥取県": (35.5039, 134.2378),
    "島根県": (35.4723, 133.0505),
    "岡山県": (34.6618, 133.9344),
    "広島県": (34.3966, 132.4596),
    "山口県": (34.1859, 131.4714),
    "徳島県": (34.0658, 134.5593),
    "香川県": (34.3401, 134.0434),
    "愛媛県": (33.8416, 132.7657),
    "高知県": (33.5597, 133.5311),
    "福岡県": (33.6064, 130.4181),
    "佐賀県": (33.2494, 130.2988),
    "長崎県": (32.7503, 129.8779),
    "熊本県": (32.7898, 130.7417),
    "大分県": (33.2382, 131.6126),
    "宮崎県": (31.9111, 131.4239),
    "鹿児島県": (31.5602, 130.5581),
    "沖縄県": (26.2124, 127.6809),
}

# 長い名前から先にマッチさせる(例: 「京都府」より先に「京都市」等で誤爆しないように)
PREF_NAMES_SORTED = sorted(PREF_CENTROIDS.keys(), key=len, reverse=True)


def guess_prefecture(address):
    for pref in PREF_NAMES_SORTED:
        if pref in address:
            return pref
    return None


def main():
    data = json.load(open(IN_JSON, encoding="utf-8"))
    unmatched = []
    for e in data:
        # 学校名(多くが「都道府県名+県立」等で始まる)を優先する。
        # 住所欄には、学校ページ内の別の連絡先(東京の支援団体の事務所など)が
        # 誤って拾われている場合があるため(例: 宮城県南三陸高等学校・宮崎県立飯野高等学校)。
        pref = guess_prefecture(e.get("name", ""))
        if pref is None:
            # 学校名に都道府県名がない場合(ニセコ国際高等学校など)は住所から判定
            pref = guess_prefecture(e.get("address", ""))
        if pref is None:
            unmatched.append((e["name"], e.get("address", "")))
            e["prefecture"] = None
            e["prefecture_lat"] = None
            e["prefecture_lng"] = None
        else:
            lat, lng = PREF_CENTROIDS[pref]
            e["prefecture"] = pref
            e["prefecture_lat"] = lat
            e["prefecture_lng"] = lng

    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print("Enriched", len(data), "schools.")
    if unmatched:
        print("WARNING: could not determine prefecture for", len(unmatched), "schools:")
        for name, addr in unmatched:
            print(" -", name, "|", addr)

    # 出力用に都道府県centroidテーブルも別ファイルとして保存(フロントエンドで再利用)
    with open(os.path.join(DATA_DIR, "prefecture_centroids.json"), "w", encoding="utf-8") as f:
        json.dump(PREF_CENTROIDS, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
