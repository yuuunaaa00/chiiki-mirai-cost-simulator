/* 地域みらい留学費用シミュレーター
 * 金額はすべて概算です。計算の前提は README.md の「計算ロジック」を参照してください。
 */
(function () {
  "use strict";

  // -------------------------------------------------------------------------
  // 計算の前提(仕様書より)
  // -------------------------------------------------------------------------
  const CONSIDER = {
    PEOPLE: 2,                    // 親1人＋子1人で行く想定
    VISITS: 2,                    // 訪問回数: オープンスクール、受検
    HOTEL_PER_PERSON_NIGHT: 8000, // 宿泊費(1人1泊)の目安
    EXAM_FEE: 2200,               // 受検の費用(公立高校の受検料の目安・子1人1回)
  };
  const AFTER = {
    POCKET_BASE: 10000,  // お小遣いの基本額(月)
    MEAL_UNIT: 750,      // 一食の想定額(自炊300円と外食1,200円の中央値)
    MEALS_PER_MONTH: 90, // 30日×3食
  };
  const RETURN_LABELS = { gw: "GW", summer: "夏休み", winter: "冬休み", spring: "春休み" };

  // 都道府県代表点(県庁所在地付近)。交通費の概算(直線距離)にのみ使用。
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
  function distanceKm(prefA, prefB) {
    const a = PREF_CENTROIDS[prefA], b = PREF_CENTROIDS[prefB];
    if (!a || !b) return 0;
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function fareOneWay(km) {
    for (const [max, fare] of JR_FARE_BANDS) if (km <= max) return fare;
    return JR_FARE_BANDS[JR_FARE_BANDS.length - 1][1];
  }

  function calcConsider(homePref, school, nights) {
    const km = distanceKm(homePref, school.pref);
    const roundTrip = fareOneWay(km) * 2;
    const transport = roundTrip * CONSIDER.PEOPLE * CONSIDER.VISITS;
    const lodging = nights * CONSIDER.HOTEL_PER_PERSON_NIGHT * CONSIDER.PEOPLE * CONSIDER.VISITS;
    const exam = CONSIDER.EXAM_FEE;
    return { school, km, transport, lodging, exam, subtotal: transport + lodging + exam };
  }

  function missedMeals(meal) {
    if (meal.status === "known" || meal.status === "none") {
      return Math.max(0, AFTER.MEALS_PER_MONTH - (meal.provided || 0));
    }
    return 0; // in_cost / unknown は加算しない
  }

  function calcAfter(homePref, school, returnKeys) {
    const km = distanceKm(homePref, school.pref);
    const roundTrip = fareOneWay(km) * 2; // 1人分
    const returnCost = roundTrip * returnKeys.length;
    const missed = missedMeals(school.meal);
    const pocket = AFTER.POCKET_BASE + AFTER.MEAL_UNIT * missed;
    const monthlyTotal = (school.monthly || 0) + pocket;
    const firstYearTotal = (school.firstYear || 0) + monthlyTotal * 12 + returnCost;
    return { school, km, roundTrip, returnCost, missed, pocket, monthlyTotal, firstYearTotal };
  }

  // -------------------------------------------------------------------------
  // 表示ユーティリティ
  // -------------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const yen = (n) => "¥" + Math.round(n).toLocaleString("ja-JP");
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

  // -------------------------------------------------------------------------
  // 学校ピッカー
  // -------------------------------------------------------------------------
  let SCHOOLS = [];
  const byId = (id) => SCHOOLS.find((s) => s.id === id);

  function setupPicker({ listId, searchId, chipsId, multiple, max }) {
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
      const inputs = list.querySelectorAll("input");
      inputs.forEach((inp) => {
        inp.checked = selected.includes(inp.value);
        const full = multiple && selected.length >= max && !inp.checked;
        inp.disabled = full;
        inp.closest(".school-option").classList.toggle("is-disabled", full);
      });
      chips.innerHTML = selected.map((id) => {
        const s = byId(id);
        return `<span class="chip"><span class="chip-text">${esc(s.name)}</span><button type="button" data-remove="${esc(id)}" aria-label="${esc(s.name)}を外す">×</button></span>`;
      }).join("");
    }

    list.addEventListener("change", (e) => {
      const inp = e.target;
      if (inp.name !== name) return;
      if (multiple) {
        selected = inp.checked ? [...selected, inp.value].slice(0, max) : selected.filter((v) => v !== inp.value);
      } else {
        selected = inp.checked ? [inp.value] : [];
      }
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
  // 検討時の費用
  // -------------------------------------------------------------------------
  function renderConsider(homePref, results, nights) {
    const total = results.reduce((sum, r) => sum + r.subtotal, 0);
    const label = results.length > 1 ? `選んだ${results.length}校の合計` : "検討時にかかる費用の目安";
    const nightsLabel = nights === 0 ? "日帰り" : `${nights}泊`;
    const blocks = results.map((r) => `
      <article class="school-block">
        <h4>${esc(r.school.name)}</h4>
        <p class="school-meta">${esc(homePref)}から約${Math.round(r.km).toLocaleString("ja-JP")}km(直線距離)・<a href="${schoolUrl(r.school.id)}" target="_blank" rel="noopener">学校ページを見る</a></p>
        <dl class="rows">
          ${row("往復交通費", yen(r.transport))}
          ${row("宿泊費", yen(r.lodging), nights === 0 ? "日帰りのため宿泊費はかかりません" : `${nightsLabel}で計算しています`)}
          ${row("受検の費用", yen(r.exam))}
          ${results.length > 1 ? row("小計", yen(r.subtotal), "", "is-subtotal") : ""}
        </dl>
      </article>`).join("");

    $("result-consider").innerHTML = `
      <h3 class="result-title">計算結果</h3>
      <div class="total-panel">
        <span class="total-label">${label}</span>
        <span class="total-value">${yen(total)}</span>
      </div>
      ${blocks}
      ${notesBox("補足説明", ["親1人＋子1人で行く想定です。"])}
      ${checklistBox([
        "入寮審査がある場合、現地に行く必要があるかオンラインか確認してください。",
        "訪問にかかる交通費は地方自治体から補助が出る場合があります。詳細は各学校へご確認ください。",
      ])}`;
  }

  function onSubmitConsider(picker) {
    const homePref = $("c-home").value;
    const ids = picker.get();
    showError("c-home-error", homePref ? "" : "現在の居住地を選んでください。");
    showError("c-school-error", ids.length ? "" : "志望校を1校以上選んでください。");
    if (!homePref || !ids.length) return;
    const nights = Number(document.querySelector('input[name="c-nights"]:checked').value);
    const results = ids.map((id) => calcConsider(homePref, byId(id), nights));
    renderConsider(homePref, results, nights);
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
    const base = `基本${yen(AFTER.POCKET_BASE)}`;
    if (meal.status === "unknown") {
      return `${base}。食事の提供条件が公表資料から確認できなかったため、食事が出ない分は含めていません。`;
    }
    if (meal.status === "in_cost") {
      return `${base}。自炊等の食費の目安は月々の生活費に含まれています。`;
    }
    const mealText = `食事の提供: ${esc(meal.label)}`;
    if (r.missed === 0) return `${base}(${mealText})`;
    return `${base}＋食事が出ない分 ${yen(AFTER.MEAL_UNIT)}×${r.missed}食(${mealText})`;
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

    const returnLabel = returnKeys.map((k) => RETURN_LABELS[k]).join("・");

    $("result-after").innerHTML = `
      <h3 class="result-title">計算結果</h3>
      <div class="total-panel">
        <span class="total-label">1年目にかかる費用の目安</span>
        <span class="total-value">${yen(r.firstYearTotal)}</span>
        <span class="total-note">初年度の費用＋(月々の生活費＋お小遣い)×12か月＋帰省費${missing.length ? `。${missing.join("・")}は未掲載のため含んでいません` : ""}</span>
      </div>
      <article class="school-block">
        <h4>${esc(s.name)}</h4>
        <p class="school-meta">${esc(homePref)}から約${Math.round(r.km).toLocaleString("ja-JP")}km(直線距離)・<a href="${schoolUrl(s.id)}" target="_blank" rel="noopener">学校ページを見る</a></p>
        <dl class="rows">
          ${row("初年度の費用", s.firstYear != null ? yen(s.firstYear) : ASK, "入学金・授業料・制服・教科書など")}
          ${row("月々の生活費", s.monthly != null ? `${yen(s.monthly)}<span class="unit">/月</span>` : ASK, "寮費・食費・光熱費など(学校が公表している金額)")}
          ${row("お小遣い", `${yen(r.pocket)}<span class="unit">/月</span>`, pocketSub(r))}
          ${row("帰省費", `${yen(r.returnCost)}<span class="unit">/年</span>`, `往復${yen(r.roundTrip)}×${returnKeys.length}回(${returnLabel})`)}
        </dl>
      </article>
      ${notesBox("補足説明", [
        "修学旅行の有無などは含まれていません。",
        "帰省費は1人分の公共交通機関の交通費の概算です。",
        `食事が一部出ない場合は「一食${AFTER.MEAL_UNIT}円※ × 出ない食事分」をお小遣いに加算しています。`,
        "※出ない食事を自炊で賄う場合の想定額300円と、外食で賄う場合の想定額1200円の中央値で設定しています。",
      ])}
      ${checklistBox(checklist)}`;
  }

  function onSubmitAfter(picker) {
    const homePref = $("a-home").value;
    const ids = picker.get();
    const returnKeys = Array.from(document.querySelectorAll('#a-return input:checked')).map((el) => el.value);
    showError("a-home-error", homePref ? "" : "現在の居住地を選んでください。");
    showError("a-school-error", ids.length ? "" : "志望校を1校選んでください。");
    showError("a-return-error", returnKeys.length ? "" : "帰省する時期を1つ以上選んでください。");
    if (!homePref || !ids.length || !returnKeys.length) return;
    const r = calcAfter(homePref, byId(ids[0]), returnKeys);
    renderAfter(homePref, r, returnKeys);
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
      const res = await fetch("data/schools.json");
      if (!res.ok) throw new Error(res.status);
      SCHOOLS = await res.json();
    } catch (e) {
      $("screen-select").insertAdjacentHTML("beforeend",
        '<p class="load-error">学校データを読み込めませんでした。ページを再読み込みしてください。</p>');
      return;
    }

    fillPrefSelect("c-home");
    fillPrefSelect("a-home");
    const cPicker = setupPicker({ listId: "c-list", searchId: "c-search", chipsId: "c-chips", multiple: true, max: 3 });
    const aPicker = setupPicker({ listId: "a-list", searchId: "a-search", chipsId: "a-chips", multiple: false, max: 1 });

    document.querySelectorAll(".mode-card").forEach((btn) =>
      btn.addEventListener("click", () => showScreen(btn.dataset.mode)));
    document.querySelectorAll("[data-back]").forEach((btn) =>
      btn.addEventListener("click", () => showScreen(null)));

    $("form-consider").addEventListener("submit", (e) => { e.preventDefault(); onSubmitConsider(cPicker); });
    $("form-after").addEventListener("submit", (e) => { e.preventDefault(); onSubmitAfter(aPicker); });

    const hash = location.hash.replace("#", "");
    if (hash === "consider" || hash === "after") showScreen(hash);
  }

  // テスト用に計算関数を公開
  window.CostSim = { calcConsider, calcAfter, missedMeals, fareOneWay, distanceKm, CONSIDER, AFTER };

  init();
})();
