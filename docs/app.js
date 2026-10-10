/* 地域みらい留学費用シミュレーター
 * 金額はすべて概算です。計算の前提は README.md の「計算ロジック」を参照してください。
 */
(function () {
  "use strict";

  // -------------------------------------------------------------------------
  // 計算の前提
  // -------------------------------------------------------------------------
  const CONSIDER = {
    PEOPLE: 2,                 // 親1人＋子1人で行く想定
    VISITS: 2,                 // 現地訪問(オープンスクールなど)と受検の2回
    HOTEL_PER_ROOM_NIGHT: 14463, // ビジネスホテルの平均客室単価(東京商工リサーチ 2025年度)。親子で1室
    EXAM_FEE: 2200,            // 受検の費用(公立高校の受検料の目安・子1人1回)
  };
  const AFTER = {
    POCKET_BASE: 10000,  // お小遣いの基本額(月)
    MEAL_UNIT: 750,      // 一食の想定額(自炊300円と外食1,200円の中央値)
    MEALS_PER_MONTH: 90, // 30日×3食
  };
  const PLANE_YIELD = 15.3;   // 国内線の旅客1人1kmあたりの運賃収入(国土交通省 2024年度・主要航空会社平均)
  const ROAD_FACTOR = 1.25;   // 道路距離 ≒ 直線距離 × 1.25 と仮定
  const FUEL_ECONOMY = 13.3;  // 自家用乗用車(ガソリン)の実際の平均燃費 km/L(国土交通省 自動車燃料消費量調査 2025年度)
  const GAS_PRICE = 170;      // レギュラーガソリン全国平均 円/L(資源エネルギー庁 石油製品価格調査 2026年8月17日 169.8円)
  const RETURN_LABELS = { gw: "GW", summer: "夏休み", winter: "冬休み", spring: "春休み" };
  const MODE_LABELS = { car: "車", plane: "飛行機", jr: "JR" };

  // 都道府県代表点(県庁所在地付近)。お住まいの地域の位置として使用。
  const PREF_CENTROIDS = {
    "北海道": [43.0642, 141.3469], "青森県": [40.8244, 140.7400], "岩手県": [39.7036, 141.1527],
    "宮城県": [38.2688, 140.8721], "秋田県": [39.7186, 140.1024], "山形県": [38.2404, 140.3633],
    "福島県": [37.7503, 140.4676], "茨城県": [36.3418, 140.4468], "栃木県": [36.5658, 139.8836],
    "群馬県": [36.3911, 139.0608], "埼玉県": [35.8569, 139.6489], "千葉県": [35.6047, 140.1233],
    "東京都": [35.6895, 139.6917], "神奈川県": [35.4478, 139.6425], "新潟県": [37.9026, 139.0232],
    "富山県": [36.6953, 137.2113], "石川県": [36.5947, 136.6256], "福井県": [36.0652, 136.2216],
    "山梨県": [35.6642, 138.5686], "長野県": [36.6513, 138.1810], "岐阜県": [35.3912, 136.7223],
    "静岡県": [34.9769, 138.3831], "愛知県": [35.1802, 136.9066], "三重県": [34.7303, 136.5086],
    "滋賀県": [35.0045, 135.8686], "京都府": [35.0116, 135.7681], "大阪府": [34.6863, 135.5200],
    "兵庫県": [34.6913, 135.1830], "奈良県": [34.6851, 135.8329], "和歌山県": [34.2261, 135.1675],
    "鳥取県": [35.5039, 134.2378], "島根県": [35.4723, 133.0505], "岡山県": [34.6618, 133.9344],
    "広島県": [34.3966, 132.4596], "山口県": [34.1859, 131.4714], "徳島県": [34.0658, 134.5593],
    "香川県": [34.3401, 134.0434], "愛媛県": [33.8416, 132.7657], "高知県": [33.5597, 133.5311],
    "福岡県": [33.6064, 130.4181], "佐賀県": [33.2494, 130.2988], "長崎県": [32.7503, 129.8779],
    "熊本県": [32.7898, 130.7417], "大分県": [33.2382, 131.6126], "宮崎県": [31.9111, 131.4239],
    "鹿児島県": [31.5602, 130.5581], "沖縄県": [26.2124, 127.6809],
  };
  const PREF_LIST = Object.keys(PREF_CENTROIDS);

  // JR在来線(幹線)の営業キロ別・片道普通運賃の目安 [距離上限km, 円]
  const JR_FARE_BANDS = [
    [3, 150], [6, 190], [10, 200], [15, 240], [20, 330], [25, 420], [30, 480],
    [35, 570], [40, 680], [45, 790], [50, 900], [60, 990], [70, 1170], [80, 1340],
    [90, 1520], [100, 1690], [120, 1980], [140, 2210], [160, 2520], [180, 2860],
    [200, 3190], [220, 3570], [240, 3810], [260, 4070], [280, 4370], [300, 4620],
    [320, 4940], [340, 5170], [360, 5610], [400, 5940], [440, 6260], [480, 6800],
    [520, 7350], [560, 7770], [600, 8210], [640, 8650], [680, 8970], [720, 9410],
    [760, 9830], [800, 10010], [900, 10890], [1000, 11970], [1200, 13520],
    [1400, 15150], [1600, 16850], [2000, 19560], [3000, 22000],
  ];

  // -------------------------------------------------------------------------
  // 計算(純粋関数)
  // -------------------------------------------------------------------------
  function haversine(a, b) {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
  const schoolPoint = (s) => [s.lat, s.lng];
  const homePoint = (pref) => PREF_CENTROIDS[pref];
  const round10 = (n) => Math.round(n / 10) * 10;

  function jrFare(km) {
    for (const [max, fare] of JR_FARE_BANDS) if (km <= max) return fare;
    return JR_FARE_BANDS[JR_FARE_BANDS.length - 1][1];
  }

  // NEXCOの普通車の料金の計算方法(税込): 150円 + 24.6円/km、100km超〜200kmの部分は25%引き、200km超の部分は30%引き
  function tollOneWay(roadKm) {
    const a = Math.min(roadKm, 100);
    const b = Math.min(Math.max(roadKm - 100, 0), 100);
    const c = Math.max(roadKm - 200, 0);
    return round10(150 + 24.6 * (a + b * 0.75 + c * 0.7));
  }

  const planeFare = (km) => round10(PLANE_YIELD * km);

  function landmass(pref) {
    const i = PREF_LIST.indexOf(pref);
    if (i === 0) return "北海道";
    if (i === 46) return "沖縄";
    return "本州・四国・九州";
  }

  // 交通手段が使えるかどうか(使えない場合は理由を返す)
  function modeAvailability(homePref, school) {
    const home = landmass(homePref), dest = landmass(school.pref);
    const out = { jr: null, car: null, plane: null };
    if (home === "沖縄" || dest === "沖縄") {
      if (home !== dest || school.ferry) {
        out.jr = "沖縄県との行き来はJRではできません";
        out.car = "沖縄県との行き来は車ではできません";
      }
    }
    if (!out.car) {
      if (school.ferry) out.car = "島にある学校のため、車だけでは行けません(フェリーが必要)";
      else if (home !== dest) out.car = "北海道と本州の間は車だけでは行けません(フェリーが必要)";
    }
    return out;
  }

  // 交通手段ごとの「片道1回分」の費用。perPerson=true は1人あたり(JR・飛行機)、false は車1台あたり
  function tripLegs(mode, homePref, homeAirport, school) {
    if (mode === "car") {
      const roadKm = haversine(homePoint(homePref), schoolPoint(school)) * ROAD_FACTOR;
      const toll = tollOneWay(roadKm);
      const fuel = round10(roadKm / FUEL_ECONOMY * GAS_PRICE);
      return { perPerson: false, legs: [
        { label: "高速代", oneWay: toll, desc: `片道${yenPlain(toll)}` },
        { label: "ガソリン代", oneWay: fuel, desc: `片道 約${fmt(roadKm)}km ÷ 燃費${FUEL_ECONOMY}km/L × ${GAS_PRICE}円/L ＝ ${yenPlain(fuel)}` },
      ] };
    }
    if (mode === "plane") {
      const from = AIRPORTS[homeAirport], to = AIRPORTS[school.airport];
      const same = from.code === to.code;
      const oneWay = same ? 0 : planeFare(haversine([from.lat, from.lng], [to.lat, to.lng]));
      const groundKm = haversine([to.lat, to.lng], schoolPoint(school));
      const ground = jrFare(groundKm);
      return { perPerson: true, legs: [
        { label: "航空券", oneWay, fixedDesc: same ? "出発する空港と行き先の空港が同じため、航空券はかかりません" : "",
          desc: `${esc(from.name)} ⇄ ${esc(to.name)}　1人片道${yenPlain(oneWay)}` },
        { label: "空港から学校まで", oneWay: ground, desc: `${esc(to.name)} ⇄ 学校(約${Math.round(groundKm)}km)　1人片道${yenPlain(ground)}` },
      ] };
    }
    const oneWay = jrFare(haversine(homePoint(homePref), schoolPoint(school)));
    return { perPerson: true, legs: [{ label: "往復交通費(JR)", oneWay, desc: `1人片道${yenPlain(oneWay)}` }] };
  }

  // people: 人数(車は1台分として扱う)、trips: 往復の回数、tripText: 回数の内訳の表示
  function calcTransport(mode, homePref, homeAirport, school, people, trips, tripText) {
    const t = tripLegs(mode, homePref, homeAirport, school);
    const n = t.perPerson ? people : 1;
    const mulText = ` × 往復${n > 1 ? ` × ${n}人` : ""} × ${trips}回${tripText}`;
    const items = t.legs.map((l) => ({
      label: l.label,
      amount: l.oneWay * 2 * n * trips,
      sub: l.fixedDesc || l.desc + mulText,
    }));
    return { mode, items, total: items.reduce((s, it) => s + it.amount, 0) };
  }

  function calcConsider(homePref, homeAirport, school, mode, nights) {
    const t = calcTransport(mode, homePref, homeAirport, school, CONSIDER.PEOPLE, CONSIDER.VISITS, "(現地訪問・受検)");
    if (mode === "car") t.items[0].sub += "。車1台で親子2人が移動する想定です";
    const lodging = nights * CONSIDER.HOTEL_PER_ROOM_NIGHT * CONSIDER.VISITS;
    const exam = CONSIDER.EXAM_FEE;
    return { school, mode, nights, transport: t, lodging, exam, subtotal: t.total + lodging + exam };
  }

  function missedMeals(meal) {
    if (meal.status === "known" || meal.status === "none") {
      return Math.max(0, AFTER.MEALS_PER_MONTH - (meal.provided || 0));
    }
    return 0; // in_cost / unknown は加算しない
  }

  function calcAfter(homePref, homeAirport, school, returnKeys, mode) {
    const km = haversine(homePoint(homePref), schoolPoint(school));
    const returnLabel = returnKeys.map((k) => RETURN_LABELS[k]).join("・");
    // 帰省は生徒1人分(車の場合は車1台で往復1回分)
    const ret = calcTransport(mode, homePref, homeAirport, school, 1, returnKeys.length, `(${returnLabel})`);
    const returnCost = ret.total;
    const missed = missedMeals(school.meal);
    const pocket = AFTER.POCKET_BASE + AFTER.MEAL_UNIT * missed;
    const monthlyTotal = (school.monthly || 0) + pocket;
    const firstYearTotal = (school.firstYear || 0) + monthlyTotal * 12 + returnCost;
    return { school, km, mode, ret, returnCost, missed, pocket, monthlyTotal, firstYearTotal };
  }

  // -------------------------------------------------------------------------
  // 表示ユーティリティ
  // -------------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Math.round(n).toLocaleString("ja-JP");
  const yen = (n) => "￥" + fmt(n) + (n > 0 ? "~" : "");   // 結果の金額は「￥○○○~」
  const yenPlain = (n) => "￥" + fmt(n);                     // 計算式の中の金額
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const schoolUrl = (id) => "https://c-mirai.jp/schools/" + encodeURIComponent(id);

  function showError(id, msg) { const el = $(id); el.textContent = msg; el.hidden = !msg; }

  function row(label, valueHtml, sub, cls) {
    return `<div class="row${cls ? " " + cls : ""}"><dt>${label}</dt><dd>${valueHtml}</dd>${sub ? `<p class="row-sub">${sub}</p>` : ""}</div>`;
  }
  function notesBox(title, items) {
    return `<section class="info-box is-notes"><h4>${title}</h4><ul>${items.map((t) => `<li>${t}</li>`).join("")}</ul></section>`;
  }
  function checklistBox(items) {
    return `<section class="info-box is-checklist"><h4>学校への確認事項</h4><ul>${items.map((t) => `<li>${t}</li>`).join("")}</ul></section>`;
  }
  function totalPanel(label, amount, note) {
    return `<div class="total-panel"><span class="total-label">${label}</span><span class="total-value">${yen(amount)}</span>${note ? `<span class="total-note">${note}</span>` : ""}</div>`;
  }

  // -------------------------------------------------------------------------
  // 入力内容の記録(Googleスプレッドシート / Google Apps Script)
  // config.js の logEndpoint にウェブアプリのURLが設定されているときだけ送信する。
  // 個人を特定できる情報は送らない。セッションIDはページを開くたびに作り直す(保存しない)。
  // -------------------------------------------------------------------------
  const LOG_ENDPOINT = (window.SIM_CONFIG && window.SIM_CONFIG.logEndpoint) || "";
  const SESSION_ID = Math.random().toString(36).slice(2, 10);

  function logUsage(payload) {
    if (!LOG_ENDPOINT) return;
    try {
      fetch(LOG_ENDPOINT, {
        method: "POST",
        mode: "no-cors",   // Apps Scriptのウェブアプリへは応答を読まずに送るだけにする
        keepalive: true,
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ ...payload, session: SESSION_ID, page: location.hostname }),
      }).catch(() => {});
    } catch (e) { /* 記録の失敗は計算結果の表示に影響させない */ }
  }

  // -------------------------------------------------------------------------
  // データ
  // -------------------------------------------------------------------------
  let SCHOOLS = [];
  let AIRPORTS = {};
  let AIRPORT_LIST = [];
  const byId = (id) => SCHOOLS.find((s) => s.id === id);

  function defaultAirport(pref) {
    const c = PREF_CENTROIDS[pref];
    const main = AIRPORT_LIST.filter((a) => a.dest);
    const inPref = main.filter((a) => a.pref === pref);
    const pool = inPref.length ? inPref : main.filter((a) => landmass(a.pref) === landmass(pref));
    return pool.reduce((best, a) => (haversine(c, [a.lat, a.lng]) < haversine(c, [best.lat, best.lng]) ? a : best)).code;
  }

  // -------------------------------------------------------------------------
  // 学校ピッカー
  // -------------------------------------------------------------------------
  function setupPicker({ listId, searchId, chipsId, multiple, max, onChange }) {
    const list = $(listId), search = $(searchId), chips = $(chipsId);
    const inputType = multiple ? "checkbox" : "radio";
    const name = listId + "-school";
    let selected = [];

    const groups = PREF_LIST.map((pref) => ({ pref, schools: SCHOOLS.filter((s) => s.pref === pref) }))
      .filter((g) => g.schools.length);
    list.innerHTML = groups.map((g) => `
      <details class="pref-group" data-pref="${esc(g.pref)}">
        <summary><span>${esc(g.pref)}<span class="pref-count">${g.schools.length}校</span></span></summary>
        ${g.schools.map((s) => `
          <label class="school-option" data-name="${esc(s.name)}" data-pref="${esc(g.pref)}">
            <input type="${inputType}" name="${name}" value="${esc(s.id)}">
            <span>${esc(s.name)}</span>
          </label>`).join("")}
      </details>`).join("") + `<p class="picker-empty" hidden>該当する学校が見つかりません</p>`;

    function sync() {
      list.querySelectorAll("input").forEach((inp) => {
        inp.checked = selected.includes(inp.value);
        const full = multiple && selected.length >= max && !inp.checked;
        inp.disabled = full;
        inp.closest(".school-option").classList.toggle("is-disabled", full);
      });
      chips.innerHTML = selected.map((id) => {
        const s = byId(id);
        return `<span class="chip"><span class="chip-text">${esc(s.name)}</span><button type="button" data-remove="${esc(id)}" aria-label="${esc(s.name)}を外す">×</button></span>`;
      }).join("");
      if (onChange) onChange(selected.slice());
    }

    list.addEventListener("change", (e) => {
      const inp = e.target;
      if (inp.name !== name) return;
      if (multiple) selected = inp.checked ? [...selected, inp.value].slice(0, max) : selected.filter((v) => v !== inp.value);
      else selected = inp.checked ? [inp.value] : [];
      sync();
    });
    chips.addEventListener("click", (e) => {
      const id = e.target.getAttribute("data-remove");
      if (!id) return;
      selected = selected.filter((v) => v !== id);
      sync();
    });
    search.addEventListener("input", () => {
      const q = search.value.trim();
      let hits = 0;
      list.querySelectorAll(".pref-group").forEach((group) => {
        let groupHits = 0;
        group.querySelectorAll(".school-option").forEach((opt) => {
          const match = !q || opt.dataset.name.includes(q) || opt.dataset.pref.includes(q);
          opt.hidden = !match;
          if (match) groupHits++;
        });
        group.hidden = groupHits === 0;
        group.open = !!q && groupHits > 0;
        hits += groupHits;
      });
      list.querySelector(".picker-empty").hidden = hits > 0;
    });

    sync();
    return { get: () => selected.slice() };
  }

  function fillPrefSelect(id) {
    $(id).insertAdjacentHTML("beforeend", PREF_LIST.map((p) => `<option value="${p}">${p}</option>`).join(""));
  }

  function fillAirportSelect(id) {
    const byPref = {};
    AIRPORT_LIST.forEach((a) => { (byPref[a.pref] = byPref[a.pref] || []).push(a); });
    $(id).innerHTML = PREF_LIST.filter((p) => byPref[p]).map((p) =>
      `<optgroup label="${p}">${byPref[p].map((a) => `<option value="${a.code}">${esc(a.name)}</option>`).join("")}</optgroup>`).join("");
  }

  // -------------------------------------------------------------------------
  // 学校ごとの交通手段(・宿泊日数)の選択欄。検討時と留学後で共通
  // -------------------------------------------------------------------------
  const NIGHT_LABELS = ["日帰り", "1泊", "2泊"];

  function createTransportForm({ prefix, withNights }) {
    const state = { ids: [], mode: {}, nights: {}, airportTouched: false };
    const homeSel = $(prefix + "-home"), airportSel = $(prefix + "-airport");

    function segmentGroup(kind, id, options, current, unavailable, aria) {
      return `
        <div class="segmented is-compact" role="radiogroup" aria-label="${esc(aria)}">
          ${options.map(([value, label]) => {
            const reason = unavailable && unavailable[value];
            return `
            <label class="segment${reason ? " is-unavailable" : ""}">
              <input type="radio" name="${prefix}-${kind}-${esc(id)}" id="${prefix}-${kind}-${esc(id)}-${value}" value="${value}"
                data-kind="${kind}" data-school="${esc(id)}" ${String(current) === String(value) ? "checked" : ""} ${reason ? "disabled" : ""}>
              <span>${label}</span>
            </label>`;
          }).join("")}
        </div>`;
    }

    function render() {
      const homePref = homeSel.value;
      $(prefix + "-transport-field").hidden = state.ids.length === 0;
      $(prefix + "-transport-list").innerHTML = state.ids.map((id) => {
        const s = byId(id);
        const avail = homePref ? modeAvailability(homePref, s) : { jr: null, car: null, plane: null };
        if (!state.mode[id] || avail[state.mode[id]]) state.mode[id] = avail.jr ? "plane" : "jr";
        if (state.nights[id] == null) state.nights[id] = 0;
        const reasons = ["car", "plane", "jr"].map((m) => avail[m]).filter(Boolean);
        return `
          <div class="transport-row">
            <p class="transport-school">${esc(s.name)}</p>
            <div class="transport-choice">
              ${withNights ? '<span class="choice-label">交通手段</span>' : ""}
              ${segmentGroup("mode", id, ["car", "plane", "jr"].map((m) => [m, MODE_LABELS[m]]), state.mode[id], avail, s.name + "への交通手段")}
            </div>
            ${reasons.length ? `<p class="transport-note">${reasons.map(esc).join("。")}。</p>` : ""}
            ${state.mode[id] === "plane" && AIRPORTS[s.airport] ? `<p class="transport-note">学校の最寄り空港: ${esc(AIRPORTS[s.airport].name)}${s.planeFerry ? "(島へはさらにフェリーで移動)" : ""}</p>` : ""}
            ${withNights ? `
            <div class="transport-choice">
              <span class="choice-label">宿泊日数</span>
              ${segmentGroup("nights", id, NIGHT_LABELS.map((l, i) => [i, l]), state.nights[id], null, s.name + "の宿泊日数")}
            </div>` : ""}
          </div>`;
      }).join("");
      const usesPlane = state.ids.some((id) => state.mode[id] === "plane");
      $(prefix + "-airport-field").hidden = !usesPlane;
      if (usesPlane && homePref && !state.airportTouched) airportSel.value = defaultAirport(homePref);
    }

    homeSel.addEventListener("change", () => { state.airportTouched = false; render(); });
    airportSel.addEventListener("change", () => { state.airportTouched = true; });
    $(prefix + "-transport-list").addEventListener("change", (e) => {
      const id = e.target.getAttribute("data-school"), kind = e.target.getAttribute("data-kind");
      if (!id) return;
      if (kind === "nights") state.nights[id] = Number(e.target.value);
      else { state.mode[id] = e.target.value; render(); }
    });

    return {
      setSchools(ids) { state.ids = ids; render(); },
      mode: (id) => state.mode[id] || "jr",
      nights: (id) => state.nights[id] || 0,
      airport: () => airportSel.value || defaultAirport(homeSel.value),
    };
  }

  // -------------------------------------------------------------------------
  // 画面切り替え
  // -------------------------------------------------------------------------
  function showScreen(mode) {
    $("screen-select").hidden = !!mode;
    $("screen-consider").hidden = mode !== "consider";
    $("screen-after").hidden = mode !== "after";
    try { history.replaceState(null, "", mode ? "#" + mode : location.pathname + location.search); } catch (e) { /* noop */ }
    window.scrollTo({ top: 0 });
  }

  // -------------------------------------------------------------------------
  // 検討時の費用: 表示
  // -------------------------------------------------------------------------
  function renderConsider(homePref, results) {
    const total = results.reduce((sum, r) => sum + r.subtotal, 0);
    const used = new Set(results.map((r) => r.mode));
    const lodgingSub = (nights) => nights === 0
      ? "日帰りのため宿泊費はかかりません"
      : `1室(親子2人)${yenPlain(CONSIDER.HOTEL_PER_ROOM_NIGHT)} × ${nights}泊 × <strong>2回分(現地訪問1回・受検1回)</strong>`;

    const blocks = results.map((r) => {
      const notes = [];
      if (r.mode === "plane" && r.school.planeFerry) notes.push("空港から島へ渡るフェリー代は含みません。");
      if (r.mode === "jr" && r.school.ferry) notes.push("島へ渡るフェリー代は含みません。");
      return `
      <article class="school-block">
        <h4>${esc(r.school.name)}</h4>
        <p class="school-meta">${esc(homePref)}から・交通手段: ${MODE_LABELS[r.mode]}・宿泊: ${NIGHT_LABELS[r.nights]}・<a href="${schoolUrl(r.school.id)}" target="_blank" rel="noopener">学校ページを見る</a></p>
        <dl class="rows">
          ${r.transport.items.map((it) => row(it.label, yen(it.amount), it.sub)).join("")}
          ${row("宿泊費", yen(r.lodging), lodgingSub(r.nights))}
          ${row("受検の費用", yen(r.exam), "受検料(子1人分)")}
          ${row("小計", yen(r.subtotal), "", "is-subtotal")}
        </dl>
        ${notes.length ? `<p class="school-note">${notes.join("")}</p>` : ""}
      </article>`;
    }).join("");

    const notes = [
      "親1人＋子1人で行く想定です。",
      "交通費・宿泊費は、現地訪問(オープンスクールなど)と受検の<strong>2回分</strong>を計算しています。",
      `宿泊費は、ビジネスホテルの平均客室単価(東京商工リサーチ調べ・2025年度：1室1泊${yenPlain(CONSIDER.HOTEL_PER_ROOM_NIGHT)})をもとに、親子で1室に泊まる想定です。`,
      "宿泊費には食事代は含まれていません(素泊まりの想定です)。",
    ];
    if (used.has("jr")) notes.push("JRは、在来線の普通運賃の目安です。新幹線・特急を使う場合は高くなります。");
    if (used.has("plane")) notes.push(`航空券は、国内線の平均単価(国土交通省・2024年度：1人1kmあたり${PLANE_YIELD}円)をもとにした目安です。直行便がない場合や時期によって変わります。自宅から空港までの交通費は含みません。`);
    if (used.has("car")) notes.push(`車の費用は、道路の距離を直線距離の約1.25倍として計算した目安です。高速代は高速道路会社(NEXCO)の普通車の料金の計算方法、ガソリン代は自家用乗用車の実際の平均燃費(国土交通省・2025年度：1Lあたり${FUEL_ECONOMY}km)とレギュラーガソリンの全国平均価格(資源エネルギー庁・2026年8月：1Lあたり約${GAS_PRICE}円)をもとにしています。駐車場代や、本州四国連絡橋などの特別な料金は含みません。`);

    $("result-consider").innerHTML = `
      <h3 class="result-title">計算結果</h3>
      ${blocks}
      ${results.length > 1 ? `
        <section class="summary-list">
          <h4>選んだ学校ごとの小計</h4>
          <dl class="rows">${results.map((r) => row(esc(r.school.name), yen(r.subtotal))).join("")}</dl>
        </section>` : ""}
      ${totalPanel(results.length > 1 ? `選んだ${results.length}校の合計` : "検討時にかかる費用の目安", total)}
      ${checklistBox([
        "入寮審査がある場合、現地に行く必要があるかオンラインか確認してください。",
        "訪問にかかる交通費は地方自治体から補助が出る場合があります。詳細は各学校へご確認ください。",
      ])}
      ${notesBox("補足説明", notes)}`;
  }

  function onSubmitConsider(picker, tf) {
    const homePref = $("c-home").value;
    const ids = picker.get();
    showError("c-home-error", homePref ? "" : "現在の居住地を選んでください。");
    showError("c-school-error", ids.length ? "" : "志望校を1校以上選んでください。");
    if (!homePref || !ids.length) return;
    const homeAirport = tf.airport();
    const results = ids.map((id) => calcConsider(homePref, homeAirport, byId(id), tf.mode(id), tf.nights(id)));
    renderConsider(homePref, results);
    logUsage({
      type: "検討時",
      home: homePref,
      schools: results.map((r) => ({ name: r.school.name, mode: MODE_LABELS[r.mode], nights: NIGHT_LABELS[r.nights] })),
      airport: results.some((r) => r.mode === "plane") ? AIRPORTS[homeAirport].name : "",
      total: results.reduce((s, r) => s + r.subtotal, 0),
    });
    const out = $("result-consider");
    out.hidden = false;
    out.focus({ preventScroll: true });
    out.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // -------------------------------------------------------------------------
  // 留学後の費用
  // -------------------------------------------------------------------------
  const ASK = '<span class="ask">学校へお問い合わせください</span>';

  function pocketSub(r) {
    const meal = r.school.meal;
    const base = `基本${yenPlain(AFTER.POCKET_BASE)}`;
    if (meal.status === "unknown") return `${base}。食事の提供条件が公表資料から確認できなかったため、食事が出ない分は含めていません。`;
    if (meal.status === "in_cost") return `${base}。自炊等の食費の目安は月々の生活費に含まれています。`;
    const mealText = `食事の提供: ${esc(meal.label)}`;
    if (r.missed === 0) return `${base}(${mealText})`;
    return `${base}＋食事が出ない分 ${yenPlain(AFTER.MEAL_UNIT)}×${r.missed}食(${mealText})`;
  }

  function renderAfter(homePref, r, returnKeys) {
    const s = r.school;
    const missing = [];
    if (s.firstYear == null) missing.push("初年度の費用");
    if (s.monthly == null) missing.push("月々の生活費");

    const checklist = [
      "家具家電・引っ越し費用は含まれておりません。必要な場合は、各学校へ詳細をご確認ください。",
      "帰省費や月々の生活費について、地方自治体から補助が出る場合があります。詳細は各学校へご確認ください。",
    ];
    if (s.meal.status === "unknown") checklist.push("食事が出る曜日・時間帯(1日何食出るか)を確認してください。");
    if (missing.length) checklist.push(`${missing.join("・")}は公表資料に金額の掲載がありません。金額を確認してください。`);

    const retSub = r.ret.items.map((it) => `${it.label}: ${it.sub}`).join("<br>")
      + (r.mode === "car" ? "<br>車1台で往復1回分として計算しています。" : "")
      + ((r.mode === "jr" && s.ferry) || (r.mode === "plane" && s.planeFerry) ? "<br>島へ渡るフェリー代は含みません。" : "");
    const notes = [
      "修学旅行の有無などは含まれていません。",
      r.mode === "car" ? "帰省費は、車1台で往復1回分の高速代・ガソリン代の概算です。" : "帰省費は1人分の公共交通機関の交通費の概算です。",
      "冬は暖房などで光熱費が高くなる傾向があります。",
      `食事が一部出ない場合は「一食${AFTER.MEAL_UNIT}円※ × 出ない食事分」をお小遣いに加算しています。`,
      "※出ない食事を自炊で賄う場合の想定額300円と、外食で賄う場合の想定額1200円の中央値で設定しています。",
    ];
    if (r.mode === "jr") notes.push("JRは、在来線の普通運賃の目安です。新幹線・特急を使う場合は高くなります。");
    if (r.mode === "plane") notes.push(`航空券は、国内線の平均単価(国土交通省・2024年度：1人1kmあたり${PLANE_YIELD}円)をもとにした目安です。自宅から空港までの交通費は含みません。`);
    if (r.mode === "car") notes.push(`高速代は高速道路会社(NEXCO)の普通車の料金の計算方法、ガソリン代は自家用乗用車の実際の平均燃費(1Lあたり${FUEL_ECONOMY}km)とガソリン価格(1Lあたり約${GAS_PRICE}円)をもとにした目安です。`);

    $("result-after").innerHTML = `
      <h3 class="result-title">計算結果</h3>
      <article class="school-block">
        <h4>${esc(s.name)}</h4>
        <p class="school-meta">${esc(homePref)}から約${fmt(r.km)}km(直線距離)・<a href="${schoolUrl(s.id)}" target="_blank" rel="noopener">学校ページを見る</a></p>
        <dl class="rows">
          ${row("初年度の費用", s.firstYear != null ? yen(s.firstYear) : ASK, "入学金・授業料・制服・教科書など")}
          ${row("月々の生活費", s.monthly != null ? `${yen(s.monthly)}<span class="unit">/月</span>` : ASK, "寮費・食費・光熱費など(学校が公表している金額)")}
          ${row("お小遣い", `${yen(r.pocket)}<span class="unit">/月</span>`, pocketSub(r))}
          ${row(`帰省費(${MODE_LABELS[r.mode]})`, `${yen(r.returnCost)}<span class="unit">/年</span>`, retSub)}
        </dl>
      </article>
      ${totalPanel("1年目にかかる費用の目安", r.firstYearTotal,
        `初年度の費用＋(月々の生活費＋お小遣い)×12か月＋帰省費${missing.length ? `。${missing.join("・")}は未掲載のため含んでいません` : ""}`)}
      ${checklistBox(checklist)}
      ${notesBox("補足説明", notes)}`;
  }

  function onSubmitAfter(picker, tf) {
    const homePref = $("a-home").value;
    const ids = picker.get();
    const returnKeys = Array.from(document.querySelectorAll("#a-return input:checked")).map((el) => el.value);
    showError("a-home-error", homePref ? "" : "現在の居住地を選んでください。");
    showError("a-school-error", ids.length ? "" : "志望校を1校選んでください。");
    showError("a-return-error", returnKeys.length ? "" : "帰省する時期を1つ以上選んでください。");
    if (!homePref || !ids.length || !returnKeys.length) return;
    const homeAirport = tf.airport();
    const r = calcAfter(homePref, homeAirport, byId(ids[0]), returnKeys, tf.mode(ids[0]));
    renderAfter(homePref, r, returnKeys);
    logUsage({
      type: "留学後",
      home: homePref,
      schools: [{ name: r.school.name, mode: MODE_LABELS[r.mode], nights: "" }],
      airport: r.mode === "plane" ? AIRPORTS[homeAirport].name : "",
      returns: returnKeys.map((k) => RETURN_LABELS[k]).join("・"),
      total: r.firstYearTotal,
    });
    const out = $("result-after");
    out.hidden = false;
    out.focus({ preventScroll: true });
    out.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // -------------------------------------------------------------------------
  // 初期化
  // -------------------------------------------------------------------------
  async function init() {
    try {
      const [s, a] = await Promise.all([
        fetch("data/schools.json").then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
        fetch("data/airports.json").then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
      ]);
      SCHOOLS = s;
      AIRPORT_LIST = a;
      AIRPORT_LIST.forEach((ap) => { AIRPORTS[ap.code] = ap; });
    } catch (e) {
      $("screen-select").insertAdjacentHTML("beforeend",
        '<p class="load-error">学校データを読み込めませんでした。ページを再読み込みしてください。</p>');
      return;
    }

    fillPrefSelect("c-home");
    fillPrefSelect("a-home");
    fillAirportSelect("c-airport");
    fillAirportSelect("a-airport");
    const cTransport = createTransportForm({ prefix: "c", withNights: true });
    const aTransport = createTransportForm({ prefix: "a", withNights: false });
    const cPicker = setupPicker({ listId: "c-list", searchId: "c-search", chipsId: "c-chips", multiple: true, max: 3,
      onChange: (ids) => cTransport.setSchools(ids) });
    const aPicker = setupPicker({ listId: "a-list", searchId: "a-search", chipsId: "a-chips", multiple: false, max: 1,
      onChange: (ids) => aTransport.setSchools(ids) });

    document.querySelectorAll(".mode-card").forEach((btn) =>
      btn.addEventListener("click", () => showScreen(btn.dataset.mode)));
    document.querySelectorAll("[data-back]").forEach((btn) =>
      btn.addEventListener("click", () => showScreen(null)));

    $("form-consider").addEventListener("submit", (e) => { e.preventDefault(); onSubmitConsider(cPicker, cTransport); });
    $("form-after").addEventListener("submit", (e) => { e.preventDefault(); onSubmitAfter(aPicker, aTransport); });

    const hash = location.hash.replace("#", "");
    if (hash === "consider" || hash === "after") showScreen(hash);
  }

  // テスト用に計算関数を公開
  window.CostSim = { calcConsider, calcAfter, calcTransport, tollOneWay, planeFare, jrFare, haversine, missedMeals, modeAvailability, defaultAirport, CONSIDER, AFTER, FUEL_ECONOMY, GAS_PRICE };

  init();
})();
