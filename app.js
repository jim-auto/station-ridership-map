/* =====================================================
 * 駅別乗降客数マップ - app.js
 * ===================================================== */

// ---------------------
// グローバル状態
// ---------------------
let map;
let stationLayer;
let allFeatures = [];
let lovehotelLayer;
let lovehotelData = null;
let routeLines = [];

// ---------------------
// 定数
// ---------------------
const JAPAN_CENTER = [36.5, 137.0];
const JAPAN_ZOOM = 6;
const DATA_PATH = "data/stations.geojson";
const LOVEHOTEL_PATH = "data/lovehotels_tokyo.geojson";

const REGION_MAP = {
  "北海道": "北海道",
  "青森県": "東北", "岩手県": "東北", "宮城県": "東北",
  "秋田県": "東北", "山形県": "東北", "福島県": "東北",
  "茨城県": "関東", "栃木県": "関東", "群馬県": "関東", "埼玉県": "関東",
  "千葉県": "関東", "東京都": "関東", "神奈川県": "関東",
  "新潟県": "中部", "富山県": "中部", "石川県": "中部", "福井県": "中部",
  "山梨県": "中部", "長野県": "中部", "岐阜県": "中部",
  "静岡県": "中部", "愛知県": "中部",
  "三重県": "近畿", "滋賀県": "近畿", "京都府": "近畿", "大阪府": "近畿",
  "兵庫県": "近畿", "奈良県": "近畿", "和歌山県": "近畿",
  "鳥取県": "中国", "島根県": "中国", "岡山県": "中国",
  "広島県": "中国", "山口県": "中国",
  "徳島県": "四国", "香川県": "四国", "愛媛県": "四国", "高知県": "四国",
  "福岡県": "九州・沖縄", "佐賀県": "九州・沖縄", "長崎県": "九州・沖縄",
  "熊本県": "九州・沖縄", "大分県": "九州・沖縄", "宮崎県": "九州・沖縄",
  "鹿児島県": "九州・沖縄", "沖縄県": "九州・沖縄",
};

const REGION_ORDER = [
  "北海道", "東北", "関東", "中部", "近畿", "中国", "四国", "九州・沖縄",
];

// 県庁所在地 or 県内人口最大都市の代表駅名（候補を配列で指定、最大乗降客数を採用）
const CAPITAL_STATIONS = {
  "北海道": ["札幌"], "青森県": ["青森"], "岩手県": ["盛岡"],
  "宮城県": ["仙台"], "秋田県": ["秋田"], "山形県": ["山形"],
  "福島県": ["福島", "郡山", "いわき"], "茨城県": ["水戸"],
  "栃木県": ["宇都宮"], "群馬県": ["前橋", "高崎"],
  "埼玉県": ["大宮"], "千葉県": ["千葉", "船橋"],
  "東京都": ["東京"], "神奈川県": ["横浜"],
  "新潟県": ["新潟"], "富山県": ["富山"], "石川県": ["金沢"],
  "福井県": ["福井"], "山梨県": ["甲府"], "長野県": ["長野"],
  "岐阜県": ["岐阜"], "静岡県": ["静岡", "浜松"],
  "愛知県": ["名古屋"], "三重県": ["津", "四日市"],
  "滋賀県": ["大津"], "京都府": ["京都"],
  "大阪府": ["大阪"], "兵庫県": ["三ノ宮", "姫路"],
  "奈良県": ["奈良"], "和歌山県": ["和歌山"],
  "鳥取県": ["鳥取"], "島根県": ["松江"],
  "岡山県": ["岡山", "倉敷"], "広島県": ["広島"],
  "山口県": ["山口", "下関"], "徳島県": ["徳島"],
  "香川県": ["高松"], "愛媛県": ["松山"],
  "高知県": ["高知"], "福岡県": ["博多"],
  "佐賀県": ["佐賀"], "長崎県": ["長崎"],
  "熊本県": ["熊本"], "大分県": ["大分"],
  "宮崎県": ["宮崎"], "鹿児島県": ["鹿児島中央"],
  "沖縄県": ["おもろまち"],
};

const CIRCLE_OPTIONS = {
  weight: 1,
  opacity: 0.8,
  fillOpacity: 0.5,
};

// ---------------------
// 初期化
// ---------------------
function initApp() {
  initMap();
  initControls();
  initTablePanel();
  loadStationData();
  // デフォルトでラブホ表示
  document.getElementById("walk-filter-group").style.display = "flex";
  loadAndShowLovehotels();
}

// ---------------------
// 地図の初期化
// ---------------------
function initMap() {
  map = L.map("map", {
    zoomControl: true,
  }).setView(JAPAN_CENTER, JAPAN_ZOOM);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 18,
  }).addTo(map);

  addLegend();

  // 地図移動時に経路線をクリア
  map.on("zoomstart", clearRouteLines);
}

// ---------------------
// 凡例の追加
// ---------------------
function addLegend() {
  const legend = L.control({ position: "bottomright" });

  legend.onAdd = function () {
    const div = L.DomUtil.create("div", "legend");
    const grades = [
      { label: "50万人以上", color: "#d32f2f", radius: 16 },
      { label: "20万人以上", color: "#e65100", radius: 12 },
      { label: "10万人以上", color: "#f9a825", radius: 9 },
      { label: "5万人以上", color: "#1976d2", radius: 7 },
      { label: "3万人以上", color: "#388e3c", radius: 5 },
      { label: "3万人未満", color: "#78909c", radius: 4 },
    ];

    let html = "<div class='legend-title'>乗降客数 (人/日)</div>";
    grades.forEach((g) => {
      const size = g.radius * 2;
      html += `<div class="legend-item">
        <span class="legend-circle" style="width:${size}px;height:${size}px;background:${g.color}"></span>
        <span class="legend-label">${g.label}</span>
      </div>`;
    });

    div.innerHTML = html;
    return div;
  };

  legend.addTo(map);
}

// ---------------------
// コントロールの初期化
// ---------------------
function initControls() {
  const thresholdSelect = document.getElementById("threshold-select");
  const searchInput = document.getElementById("search-input");

  // おすすめ駅ショートカット
  document.getElementById("jump-spot").addEventListener("click", () => {
    const toggle = document.getElementById("table-toggle");
    const content = document.getElementById("table-content");
    const tabs = document.getElementById("table-tabs");
    // パネルを開く
    if (!content.classList.contains("active")) {
      content.classList.add("active");
      tabs.classList.add("active");
      toggle.textContent = "一覧を閉じる ▲";
    }
    // おすすめ駅タブをアクティブに
    tabs.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    content.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));
    const spotBtn = tabs.querySelector('[data-tab="spot"]');
    if (spotBtn) spotBtn.classList.add("active");
    const spotPane = document.getElementById("tab-spot");
    if (spotPane) spotPane.classList.add("active");
    // スクロール
    spotPane.scrollIntoView({ behavior: "smooth" });
  });

  thresholdSelect.addEventListener("change", () => {
    renderStations();
    renderRegionTable();
  });

  searchInput.addEventListener("input", (e) => {
    handleSearch(e.target.value.trim());
  });

  // ラブホ表示トグル
  const lhToggle = document.getElementById("lovehotel-toggle");
  const walkFilterGroup = document.getElementById("walk-filter-group");
  const walkFilter = document.getElementById("walk-filter");
  lhToggle.addEventListener("change", () => {
    if (lhToggle.checked) {
      walkFilterGroup.style.display = "flex";
      loadAndShowLovehotels();
    } else {
      hideLovehotels();
      walkFilterGroup.style.display = "none";
    }
  });
  walkFilter.addEventListener("change", () => {
    if (lhToggle.checked && lovehotelData) showLovehotels();
  });

  // 検索結果の外側クリックで閉じる
  document.addEventListener("click", (e) => {
    const results = document.getElementById("search-results");
    if (!e.target.closest(".control-group")) {
      results.classList.remove("active");
    }
  });
}

// ---------------------
// データ読み込み
// ---------------------
async function loadStationData() {
  try {
    const response = await fetch(DATA_PATH);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const geojson = await response.json();
    allFeatures = geojson.features || [];
    renderStations();
    renderRegionTable();
    renderCapitalRanking();
    renderSpotRanking();
  } catch (err) {
    console.error("駅データの読み込みに失敗しました:", err);
  }
}

// ---------------------
// 駅の描画
// ---------------------
function renderStations() {
  const threshold = getThreshold();

  // 既存レイヤーを削除
  if (stationLayer) {
    map.removeLayer(stationLayer);
  }

  const filtered = allFeatures.filter(
    (f) => (f.properties.ridership || 0) >= threshold
  );

  stationLayer = L.geoJSON(
    { type: "FeatureCollection", features: filtered },
    {
      pointToLayer: (feature, latlng) => {
        const ridership = feature.properties.ridership || 0;
        return L.circleMarker(latlng, {
          ...CIRCLE_OPTIONS,
          radius: calcRadius(ridership),
          color: getColor(ridership),
          fillColor: getColor(ridership),
        });
      },
      onEachFeature: (feature, layer) => {
        layer.bindPopup(buildPopupContent(feature.properties));
      },
    }
  );

  stationLayer.addTo(map);
}

// ---------------------
// 閾値の取得
// ---------------------
function getThreshold() {
  return parseInt(document.getElementById("threshold-select").value, 10) || 0;
}

// ---------------------
// 円の半径計算
// ---------------------
function calcRadius(ridership) {
  if (ridership >= 500000) return 16;
  if (ridership >= 200000) return 12;
  if (ridership >= 100000) return 9;
  if (ridership >= 50000) return 7;
  if (ridership >= 30000) return 5;
  return 4;
}

// ---------------------
// 色の決定
// ---------------------
function getColor(ridership) {
  if (ridership >= 500000) return "#d32f2f";
  if (ridership >= 200000) return "#e65100";
  if (ridership >= 100000) return "#f9a825";
  if (ridership >= 50000) return "#1976d2";
  if (ridership >= 30000) return "#388e3c";
  return "#78909c";
}

// ---------------------
// ポップアップ生成
// ---------------------
function buildPopupContent(props) {
  const ridership = (props.ridership || 0).toLocaleString();
  return `
    <div class="station-popup">
      <table>
        <tr><th>駅名</th><td>${escapeHtml(props.station_name || "")}</td></tr>
        <tr><th>路線名</th><td>${escapeHtml(props.line_name || "")}</td></tr>
        <tr><th>事業者</th><td>${escapeHtml(props.operator_name || "")}</td></tr>
        <tr><th>都道府県</th><td>${escapeHtml(props.prefecture || "")}</td></tr>
        <tr><th>乗降客数</th><td class="ridership-value">${ridership}人/日</td></tr>
        <tr><th>年度</th><td>${escapeHtml(String(props.year || ""))}</td></tr>
      </table>
    </div>
  `;
}

// ---------------------
// 駅検索
// ---------------------
function handleSearch(query) {
  const resultsList = document.getElementById("search-results");
  resultsList.innerHTML = "";

  if (!query) {
    resultsList.classList.remove("active");
    return;
  }

  const queryLower = query.toLowerCase();
  const matches = allFeatures
    .filter((f) => {
      const name = (f.properties.station_name || "").toLowerCase();
      return name.includes(queryLower);
    })
    .slice(0, 20);

  if (matches.length === 0) {
    resultsList.innerHTML = '<li style="color:#999">該当なし</li>';
    resultsList.classList.add("active");
    return;
  }

  matches.forEach((feature) => {
    const li = document.createElement("li");
    const props = feature.properties;
    li.innerHTML = `${escapeHtml(props.station_name)}<span class="line-name">${escapeHtml(props.line_name || "")}</span>`;
    li.addEventListener("click", () => {
      flyToStation(feature);
      resultsList.classList.remove("active");
      document.getElementById("search-input").value = props.station_name;
    });
    resultsList.appendChild(li);
  });

  resultsList.classList.add("active");
}

// ---------------------
// 駅へ移動
// ---------------------
function flyToStation(feature) {
  const coords = feature.geometry.coordinates;
  const latlng = L.latLng(coords[1], coords[0]);
  map.flyTo(latlng, 14, { duration: 0.8 });

  // ポップアップを開く
  if (stationLayer) {
    stationLayer.eachLayer((layer) => {
      if (
        layer.feature &&
        layer.feature.properties.station_name ===
          feature.properties.station_name &&
        layer.feature.properties.line_name === feature.properties.line_name
      ) {
        setTimeout(() => layer.openPopup(), 900);
      }
    });
  }
}

// ---------------------
// テーブルパネルの初期化
// ---------------------
function initTablePanel() {
  const toggle = document.getElementById("table-toggle");
  const content = document.getElementById("table-content");
  const tabs = document.getElementById("table-tabs");

  toggle.addEventListener("click", () => {
    const isOpen = content.classList.toggle("active");
    tabs.classList.toggle("active", isOpen);
    toggle.textContent = isOpen ? "一覧を閉じる ▲" : "一覧を表示 ▼";
    if (isOpen) {
      map.invalidateSize();
    }
  });

  // タブ切り替え
  tabs.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      tabs.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      content.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    });
  });

  // 全画面切り替え
  const expandBtn = document.getElementById("table-expand");
  expandBtn.addEventListener("click", () => {
    const isFullscreen = document.body.classList.toggle("table-fullscreen");
    expandBtn.textContent = isFullscreen ? "地図に戻る" : "全画面表示";
    if (!isFullscreen) {
      map.invalidateSize();
    }
  });
}

// ---------------------
// 地域別テーブル描画
// ---------------------
function renderRegionTable() {
  const threshold = getThreshold();
  const content = document.getElementById("tab-region");

  const filtered = allFeatures.filter(
    (f) => (f.properties.ridership || 0) >= threshold
  );

  // 地域ごとにグループ化
  const grouped = {};
  filtered.forEach((f) => {
    const pref = f.properties.prefecture || "不明";
    const region = REGION_MAP[pref] || "その他";
    if (!grouped[region]) grouped[region] = [];
    grouped[region].push(f);
  });

  // 各地域内を乗降客数降順でソート
  Object.values(grouped).forEach((list) => {
    list.sort((a, b) => (b.properties.ridership || 0) - (a.properties.ridership || 0));
  });

  let html = "";

  REGION_ORDER.forEach((region) => {
    const stations = grouped[region];
    if (!stations || stations.length === 0) return;

    const totalRidership = stations.reduce(
      (sum, f) => sum + (f.properties.ridership || 0), 0
    );

    html += `<div class="region-section">`;
    html += `<h3>${escapeHtml(region)}</h3>`;
    html += `<div class="region-summary">${stations.length}駅 / 合計 ${totalRidership.toLocaleString()}人</div>`;
    html += `<table class="region-table">`;
    html += `<thead><tr><th>駅名</th><th>路線</th><th>事業者</th><th>乗降客数</th></tr></thead>`;
    html += `<tbody>`;

    stations.forEach((f, idx) => {
      const p = f.properties;
      html += `<tr class="clickable-row" data-region-idx="${region}-${idx}">`;
      html += `<td>${escapeHtml(p.station_name || "")}</td>`;
      html += `<td>${escapeHtml(p.line_name || "")}</td>`;
      html += `<td>${escapeHtml(p.operator_name || "")}</td>`;
      html += `<td class="ridership-cell">${(p.ridership || 0).toLocaleString()}</td>`;
      html += `</tr>`;
    });

    html += `</tbody></table></div>`;
  });

  if (!html) {
    html = '<p style="padding:12px;color:#999">該当する駅がありません</p>';
  }

  content.innerHTML = html;

  // 行クリックで地図移動
  content.querySelectorAll(".clickable-row").forEach((row) => {
    row.addEventListener("click", () => {
      const [region, idx] = row.dataset.regionIdx.split(/-(.+)/);
      const feature = grouped[region][parseInt(idx, 10)];
      if (feature) flyToStation(feature);
    });
  });
}

// ---------------------
// 県庁所在地ランキング描画
// ---------------------
function renderCapitalRanking() {
  const content = document.getElementById("tab-capital");

  // 各県の代表駅を検索（候補の中で最大乗降客数を採用）
  const results = [];
  const featureMap = {};

  for (const [pref, stationNames] of Object.entries(CAPITAL_STATIONS)) {
    let best = null;
    let bestFeature = null;

    for (const feat of allFeatures) {
      const p = feat.properties;
      if (!stationNames.includes(p.station_name)) continue;
      if (!best || p.ridership > best.ridership) {
        best = p;
        bestFeature = feat;
      }
    }

    if (best) {
      results.push({
        pref,
        station_name: best.station_name,
        operator_name: best.operator_name,
        line_name: best.line_name,
        ridership: best.ridership,
      });
      featureMap[pref] = bestFeature;
    } else {
      results.push({
        pref,
        station_name: stationNames[0],
        operator_name: "-",
        line_name: "-",
        ridership: 0,
      });
    }
  }

  // 乗降客数の少ない順にソート
  results.sort((a, b) => a.ridership - b.ridership);

  const maxRidership = Math.max(...results.map((r) => r.ridership));

  let html = '<div class="region-section">';
  html += "<h3>都道府県代表駅ランキング（少ない順）</h3>";
  html += '<div class="region-summary">県庁所在地 or 県内人口最大都市の代表駅（事業者別の最大値）</div>';
  html += '<table class="region-table">';
  html += "<thead><tr><th></th><th>都道府県</th><th>駅名</th><th class='hide-sp'>事業者</th><th>乗降客数</th><th class='capital-bar-cell hide-sp'></th></tr></thead>";
  html += "<tbody>";

  results.forEach((r, idx) => {
    const barWidth = maxRidership > 0 ? (r.ridership / maxRidership) * 100 : 0;
    const hasFeature = featureMap[r.pref] ? "clickable-row" : "";
    html += `<tr class="${hasFeature}" data-capital-pref="${r.pref}">`;
    html += `<td class="capital-rank">${idx + 1}</td>`;
    html += `<td>${escapeHtml(r.pref)}</td>`;
    html += `<td>${escapeHtml(r.station_name)}</td>`;
    html += `<td class="hide-sp">${escapeHtml(r.operator_name)}</td>`;
    html += `<td class="ridership-cell">${r.ridership.toLocaleString()}</td>`;
    html += `<td class="capital-bar-cell hide-sp"><div class="capital-bar" style="width:${barWidth}%;background:${getColor(r.ridership)}"></div></td>`;
    html += "</tr>";
  });

  html += "</tbody></table></div>";
  content.innerHTML = html;

  // 行クリックで地図移動
  content.querySelectorAll(".clickable-row").forEach((row) => {
    row.addEventListener("click", () => {
      const feature = featureMap[row.dataset.capitalPref];
      if (feature) flyToStation(feature);
    });
  });
}

// ---------------------
// おすすめ駅ランキング描画
// ---------------------
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dp / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function renderSpotRanking() {
  const content = document.getElementById("tab-spot");

  // ラブホデータ読み込み
  let hotels;
  try {
    const resp = await fetch(LOVEHOTEL_PATH);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    hotels = await resp.json();
  } catch (err) {
    content.innerHTML =
      '<p style="padding:12px;color:#999">ラブホテルデータの読み込みに失敗しました</p>';
    return;
  }

  // 対象都道府県の3万人以上の駅を集約（都道府県ごと）
  const targetPrefs = [
    { pref: "東京都", label: "東京" },
    { pref: "大阪府", label: "大阪" },
    { pref: "愛知県", label: "名古屋" },
    { pref: "神奈川県", label: "横浜・神奈川" },
    { pref: "福岡県", label: "福岡" },
    { pref: "北海道", label: "札幌" },
    { pref: "京都府", label: "京都" },
    { pref: "兵庫県", label: "神戸・兵庫" },
    { pref: "宮城県", label: "仙台" },
    { pref: "埼玉県", label: "埼玉" },
    { pref: "千葉県", label: "千葉" },
    { pref: "広島県", label: "広島" },
  ];
  const stationsByPref = {};
  for (const { pref } of targetPrefs) stationsByPref[pref] = {};

  for (const feat of allFeatures) {
    const p = feat.properties;
    if (!(p.prefecture in stationsByPref) || (p.ridership || 0) < 30000) continue;
    const name = p.station_name;
    const sm = stationsByPref[p.prefecture];
    if (!sm[name]) {
      sm[name] = {
        ridership: 0,
        lon: feat.geometry.coordinates[0],
        lat: feat.geometry.coordinates[1],
        feature: feat,
      };
    }
    sm[name].ridership += p.ridership;
    if (p.ridership > (sm[name].maxRidership || 0)) {
      sm[name].maxRidership = p.ridership;
      sm[name].feature = feat;
    }
  }

  // 都道府県ごとにランキング作成
  const allResults = {};
  for (const { pref } of targetPrefs) {
    const results = [];
    for (const [name, st] of Object.entries(stationsByPref[pref])) {
      let count = 0;
      for (const h of hotels.features) {
        const hc = h.geometry.coordinates;
        const d = haversine(st.lat, st.lon, hc[1], hc[0]);
        if (d <= 1200) count++;
      }
      if (count > 0) {
        const score = (st.ridership / 10000) * count;
        results.push({ name, ridership: st.ridership, count, score, feature: st.feature });
      }
    }
    results.sort((a, b) => b.count - a.count || b.ridership - a.ridership);
    allResults[pref] = results;
  }

  // 都市切り替えボタン
  let html = '<div class="spot-city-tabs">';
  targetPrefs.forEach(({ pref, label }, i) => {
    html += `<button class="spot-city-btn${i === 0 ? " active" : ""}" data-pref="${pref}">${label}</button>`;
  });
  html += "</div>";

  // 各都市のテーブル（最初の都市だけ表示）
  for (const { pref, label } of targetPrefs) {
    const results = allResults[pref];
    if (!results || results.length === 0) continue;
    const maxScore = results[0].score;
    const isFirst = pref === targetPrefs[0].pref;

    html += `<div class="spot-city-pane${isFirst ? " active" : ""}" data-pref="${pref}">`;
    html += '<div class="region-section">';
    html += '<div class="region-summary">タップで駅にフォーカス＆周辺ラブホを表示</div>';
    html += '<table class="region-table">';
    html += '<thead><tr><th></th><th>駅名</th><th>乗降客数</th><th>ラブホ数</th></tr></thead>';
    html += "<tbody>";

    results.forEach((r, idx) => {
      html += `<tr class="clickable-row" data-spot-name="${escapeHtml(r.name)}" data-spot-pref="${pref}">`;
      html += `<td class="capital-rank">${idx + 1}</td>`;
      html += `<td>${escapeHtml(r.name)}</td>`;
      html += `<td class="ridership-cell">${r.ridership.toLocaleString()}</td>`;
      html += `<td style="text-align:right;font-weight:600;color:#e91e63">${r.count}</td>`;
      html += "</tr>";
    });

    html += "</tbody></table></div></div>";
  }
  content.innerHTML = html;

  // 都市切り替えイベント
  content.querySelectorAll(".spot-city-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      content.querySelectorAll(".spot-city-btn").forEach((b) => b.classList.remove("active"));
      content.querySelectorAll(".spot-city-pane").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      content.querySelector(`.spot-city-pane[data-pref="${btn.dataset.pref}"]`).classList.add("active");
    });
  });

  // 全結果をフラット化
  const flatResults = Object.values(allResults).flat();

  // 行クリックで地図移動 + ラブホ表示 + 経路表示
  content.querySelectorAll(".clickable-row").forEach((row) => {
    row.addEventListener("click", () => {
      const name = row.dataset.spotName;
      const pref = row.dataset.spotPref;
      const r = allResults[pref] && allResults[pref].find((r) => r.name === name);
      if (!r || !r.feature) return;

      // ラブホ表示をONにする
      const toggle = document.getElementById("lovehotel-toggle");
      if (!toggle.checked) {
        toggle.checked = true;
        loadAndShowLovehotels().then(() => {
          flyToStation(r.feature);
          showRoutesToNearbyHotels(r.feature, hotels);
        });
      } else {
        flyToStation(r.feature);
        showRoutesToNearbyHotels(r.feature, hotels);
      }
    });
  });
}

// ---------------------
// 駅から周辺ラブホへの経路線を表示
// ---------------------
function showRoutesToNearbyHotels(stationFeature, hotelsGeoJson) {
  clearRouteLines();

  const coords = stationFeature.geometry.coordinates;
  const stLat = coords[1];
  const stLon = coords[0];
  const stLatLng = L.latLng(stLat, stLon);

  // 1.2km以内のラブホを距離順で取得
  const nearby = [];
  for (const h of hotelsGeoJson.features) {
    const hc = h.geometry.coordinates;
    const dist = haversine(stLat, stLon, hc[1], hc[0]);
    if (dist <= 1200) {
      nearby.push({ hotel: h, dist });
    }
  }
  nearby.sort((a, b) => a.dist - b.dist);

  // 各ホテルへの接続線を描画
  nearby.forEach((item) => {
    const hc = item.hotel.geometry.coordinates;
    const hLatLng = L.latLng(hc[1], hc[0]);
    const walkMin = Math.round(item.dist / 80);
    const name = item.hotel.properties.name || "";

    // 点線を描画
    const line = L.polyline([stLatLng, hLatLng], {
      color: "#e91e63",
      weight: 2,
      opacity: 0.6,
      dashArray: "6, 8",
    }).addTo(map);

    // 中間点に徒歩分数を表示
    const midLat = (stLat + hc[1]) / 2;
    const midLon = (stLon + hc[0]) / 2;
    const label = L.marker(L.latLng(midLat, midLon), {
      icon: L.divIcon({
        className: "route-label",
        html: `<span>${walkMin}分</span>`,
        iconSize: [40, 16],
        iconAnchor: [20, 8],
      }),
    }).addTo(map);

    routeLines.push(line, label);
  });
}

function clearRouteLines() {
  routeLines.forEach((layer) => map.removeLayer(layer));
  routeLines = [];
}

// ---------------------
// ラブホテル読み込み・表示
// ---------------------
async function loadAndShowLovehotels() {
  if (!lovehotelData) {
    try {
      const resp = await fetch(LOVEHOTEL_PATH);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      lovehotelData = await resp.json();
    } catch (err) {
      console.error("ラブホテルデータの読み込みに失敗:", err);
      document.getElementById("lovehotel-toggle").checked = false;
      return;
    }
  }
  showLovehotels();
}

function getWalkFilter() {
  return parseInt(document.getElementById("walk-filter").value, 10) || 15;
}

function showLovehotels() {
  if (lovehotelLayer) map.removeLayer(lovehotelLayer);

  const maxWalk = getWalkFilter();
  const filtered = {
    type: "FeatureCollection",
    features: lovehotelData.features.filter(
      (f) => (f.properties.walk_min || 0) <= maxWalk
    ),
  };

  lovehotelLayer = L.markerClusterGroup({
    maxClusterRadius: 40,
    iconCreateFunction: (cluster) => L.divIcon({
      html: `<div class="lh-cluster">${cluster.getChildCount()}</div>`,
      className: "lh-icon",
      iconSize: [30, 30],
    }),
  });

  const geojsonLayer = L.geoJSON(filtered, {
    pointToLayer: (feature, latlng) => {
      return L.marker(latlng, {
        icon: L.divIcon({
          className: "lh-icon",
          html: '<div class="lh-marker">H</div>',
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        }),
      });
    },
    onEachFeature: (feature, layer) => {
      const p = feature.properties;
      const stars = p.rating ? `${"★".repeat(Math.round(p.rating))} ${p.rating}` : "";
      const reviews = p.user_ratings_total ? `(${p.user_ratings_total}件)` : "";
      const stations = (p.all_nearby_stations || []).join("、");

      layer.bindPopup(`
        <div class="lovehotel-popup">
          <div class="lh-name">${escapeHtml(p.name || "")}</div>
          <div class="lh-info">
            ${p.address ? escapeHtml(p.address) + "<br>" : ""}
            ${stars ? `<span class="lh-rating">${stars}</span> ${reviews}<br>` : ""}
            最寄: <span class="lh-distance">${escapeHtml(p.nearest_station || "")}駅 徒歩${p.walk_min || "?"}分 (${p.distance_m || "?"}m)</span><br>
            ${stations ? "周辺駅: " + escapeHtml(stations) : ""}
          </div>
        </div>
      `);
    },
  });

  lovehotelLayer.addLayer(geojsonLayer);
  lovehotelLayer.addTo(map);
}

function hideLovehotels() {
  if (lovehotelLayer) {
    map.removeLayer(lovehotelLayer);
    lovehotelLayer = null;
  }
}


// ---------------------
// HTMLエスケープ
// ---------------------
function escapeHtml(str) {
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// ---------------------
// アプリ起動
// ---------------------
document.addEventListener("DOMContentLoaded", initApp);
