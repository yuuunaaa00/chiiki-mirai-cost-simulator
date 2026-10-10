#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""交通手段(飛行機・車)の計算に使うデータを作る。

入力:
  - data/school_locations.json : 各校の緯度経度(国土地理院「地理院地図」住所検索APIで町域レベルを検索した結果)
  - OurAirports(パブリックドメイン)の空港データ airports.csv のうち、日本の定期便就航空港
出力:
  - data/airports.json : 空港一覧(IATAコード・日本語名・都道府県・緯度経度・行き先候補にするか)
  - data/school_transport.json : 学校ごとの最寄り空港・フェリーが必要か
"""
import csv, json, math, os, sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AIRPORTS_CSV = sys.argv[1] if len(sys.argv) > 1 else None

# 日本語名(定期便のある空港)。行き先候補から外すもの(dest=False)は、
# 就航路線がごく限られる空港や、学校のない離島の空港。
JA = {
 "WKJ":("稚内空港",True),"RIS":("利尻空港",True),"MBE":("紋別空港",True),"MMB":("女満別空港",True),
 "AKJ":("旭川空港",True),"SHB":("中標津空港",True),"OKD":("札幌丘珠空港",False),"KUH":("釧路空港",True),
 "CTS":("新千歳空港",True),"OBO":("帯広空港",True),"OIR":("奥尻空港",True),"HKD":("函館空港",True),
 "AOJ":("青森空港",True),"MSJ":("三沢空港",True),"ONJ":("大館能代空港",True),"AXT":("秋田空港",True),
 "HNA":("いわて花巻空港",True),"SYO":("庄内空港",True),"GAJ":("山形空港",True),"SDJ":("仙台空港",True),
 "KIJ":("新潟空港",True),"NTQ":("能登空港",True),"FKS":("福島空港",True),"TOY":("富山空港",True),
 "KMQ":("小松空港",True),"IBR":("茨城空港",True),"OKI":("隠岐空港",True),"MMJ":("信州まつもと空港",True),
 "NRT":("成田空港",True),"HND":("羽田空港",True),"TTJ":("鳥取空港",True),"TJH":("但馬空港",True),
 "YGJ":("米子空港",True),"IZO":("出雲空港",True),"NKM":("県営名古屋空港",False),"NGO":("中部国際空港",True),
 "FSZ":("富士山静岡空港",True),"OIM":("大島空港",False),"ITM":("伊丹空港",True),"OKJ":("岡山空港",True),
 "IWJ":("萩・石見空港",True),"UKB":("神戸空港",True),"HIJ":("広島空港",True),"KIX":("関西国際空港",True),
 "TSJ":("対馬空港",False),"TAK":("高松空港",True),"IWK":("岩国空港",True),"TKS":("徳島空港",True),
 "MYE":("三宅島空港",False),"UBJ":("山口宇部空港",True),"KKJ":("北九州空港",True),"MYJ":("松山空港",True),
 "IKI":("壱岐空港",False),"SHM":("南紀白浜空港",True),"FUK":("福岡空港",True),"KCZ":("高知空港",True),
 "OIT":("大分空港",True),"HSG":("佐賀空港",True),"HAC":("八丈島空港",False),"NGS":("長崎空港",True),
 "KMJ":("熊本空港",True),"FUJ":("五島福江空港",False),"AXJ":("天草空港",True),"KMI":("宮崎空港",True),
 "KOJ":("鹿児島空港",True),"TNE":("種子島空港",True),"KUM":("屋久島空港",True),"ASJ":("奄美空港",True),
 "KKX":("喜界空港",True),"TKN":("徳之島空港",True),"OKE":("沖永良部空港",True),"RNJ":("与論空港",False),
 "UEO":("久米島空港",True),"OKA":("那覇空港",True),"MMY":("宮古空港",False),"ISG":("石垣空港",False),
}
PREFS = ["北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県","茨城県","栃木県","群馬県","埼玉県","千葉県",
 "東京都","神奈川県","新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県","三重県",
 "滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県","徳島県",
 "香川県","愛媛県","高知県","福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"]

# 橋がなくフェリーでしか渡れない島にある学校(学校名で指定)
FERRY_SCHOOLS = {
 "北海道奥尻高等学校","北海道礼文高等学校","新潟県立佐渡高等学校","新潟県立佐渡総合高等学校","新潟県立羽茂高等学校",
 "島根県立隠岐島前高等学校","島根県立隠岐高等学校","島根県立隠岐水産高等学校","広島県立大崎海星高等学校",
 "愛媛県立弓削高等学校","香川県立小豆島中央高等学校","長崎県立北松西高等学校","鹿児島県立屋久島高等学校",
 "鹿児島県立古仁屋高等学校","鹿児島県立喜界高等学校","鹿児島県立沖永良部高等学校","鹿児島県立種子島高等学校",
 "鹿児島県立徳之島高等学校","沖縄県立久米島高等学校",
}


# 島にある空港(その島の学校の行き先にだけ使う)
ISLAND_AIRPORTS = {"OIR","RIS","OKI","TNE","KUM","ASJ","KKX","TKN","OKE","RNJ","UEO","MMY","ISG","TSJ","IKI","FUJ","OIM","MYE","HAC"}
# 島の学校のうち、島に空港があるもの
SCHOOL_ISLAND_AIRPORT = {
 "北海道奥尻高等学校":"OIR","島根県立隠岐高等学校":"OKI","島根県立隠岐水産高等学校":"OKI",
 "鹿児島県立屋久島高等学校":"KUM","鹿児島県立種子島高等学校":"TNE","鹿児島県立古仁屋高等学校":"ASJ",
 "鹿児島県立喜界高等学校":"KKX","鹿児島県立沖永良部高等学校":"OKE","鹿児島県立徳之島高等学校":"TKN",
 "沖縄県立久米島高等学校":"UEO",
}


def landmass(pref):
    """海をまたいだ空港を「最寄り」にしないため、北海道・本州・四国・九州・沖縄に分ける"""
    i = PREFS.index(pref)
    if i == 0: return "北海道"
    if i <= 34: return "本州"
    if i <= 38: return "四国"
    if i <= 45: return "九州"
    return "沖縄"


def hv(a, b):
    R, r = 6371, math.pi / 180
    dl, dn = (b[0] - a[0]) * r, (b[1] - a[1]) * r
    h = math.sin(dl / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin(dn / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h))


def main():
    airports = []
    for r in csv.DictReader(open(AIRPORTS_CSV, encoding="utf-8")):
        code = r["iata_code"]
        if r["iso_country"] != "JP" or r["scheduled_service"] != "yes" or code not in JA:
            continue
        name, dest = JA[code]
        pref = PREFS[int(r["iso_region"].split("-")[1]) - 1]
        airports.append({"code": code, "name": name, "pref": pref, "dest": dest,
                         "lat": round(float(r["latitude_deg"]), 4), "lng": round(float(r["longitude_deg"]), 4)})
    airports.sort(key=lambda a: (PREFS.index(a["pref"]), -a["lat"]))
    missing = set(JA) - {a["code"] for a in airports}
    if missing:
        print("WARNING: not found in CSV:", missing)
    json.dump(airports, open(os.path.join(BASE, "data", "airports.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    schools = json.load(open(os.path.join(BASE, "data", "schools_cost_data.json"), encoding="utf-8"))
    locs = json.load(open(os.path.join(BASE, "data", "school_locations.json"), encoding="utf-8"))
    dests = [a for a in airports if a["dest"]]
    out = {}
    for s in schools:
        loc = locs[s["id"]]
        p = (loc["lat"], loc["lng"])
        if s["name"] in SCHOOL_ISLAND_AIRPORT:
            cands = [a for a in airports if a["code"] == SCHOOL_ISLAND_AIRPORT[s["name"]]]
        elif s["name"] in FERRY_SCHOOLS:
            # 空港のない島: 本土側(離島以外)の最寄り空港 + フェリー
            cands = [a for a in dests if a["code"] not in ISLAND_AIRPORTS]
        else:
            cands = [a for a in dests if a["code"] not in ISLAND_AIRPORTS and landmass(a["pref"]) == landmass(s["prefecture"])]
        near = min(cands, key=lambda a: hv(p, (a["lat"], a["lng"])))
        out[s["id"]] = {"name": s["name"], "lat": loc["lat"], "lng": loc["lng"], "airport": near["code"],
                        "airportKm": round(hv(p, (near["lat"], near["lng"])), 1),
                        "ferry": s["name"] in FERRY_SCHOOLS,  # 車で行くにはフェリーが必要
                        "planeFerry": s["name"] in FERRY_SCHOOLS and s["name"] not in SCHOOL_ISLAND_AIRPORT}  # 空港からもフェリーが必要
    names = {s["name"] for s in schools}
    assert FERRY_SCHOOLS <= names, FERRY_SCHOOLS - names
    json.dump(out, open(os.path.join(BASE, "data", "school_transport.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("airports:", len(airports), "(行き先候補", len(dests), ") / schools:", len(out))
    far = sorted(out.values(), key=lambda v: -v["airportKm"])[:8]
    for v in far:
        print("  最寄り空港まで遠い学校:", v["name"], v["airport"], v["airportKm"], "km")


if __name__ == "__main__":
    main()
