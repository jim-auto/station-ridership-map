/* =====================================================
 * 駅別乗降客数マップ - app.js
 * ===================================================== */

// ---------------------
// グローバル状態
// ---------------------
let map;
let stationLayer;
let allFeatures = [];

// ---------------------
// 定数
// ---------------------
const JAPAN_CENTER = [36.5, 137.0];
const JAPAN_ZOOM = 6;
const DATA_PATH = "data/stations.geojson";

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
}

// ---------------------
// コントロールの初期化
// ---------------------
function initControls() {
  const thresholdSelect = document.getElementById("threshold-select");
  const searchInput = document.getElementById("search-input");

  thresholdSelect.addEventListener("change", () => {
    renderStations();
    renderRegionTable();
  });

  searchInput.addEventListener("input", (e) => {
    handleSearch(e.target.value.trim());
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

  toggle.addEventListener("click", () => {
    const isOpen = content.classList.toggle("active");
    toggle.textContent = isOpen
      ? "地域別一覧を閉じる ▲"
      : "地域別一覧を表示 ▼";
    if (isOpen) {
      map.invalidateSize();
    }
  });
}

// ---------------------
// 地域別テーブル描画
// ---------------------
function renderRegionTable() {
  const threshold = getThreshold();
  const content = document.getElementById("table-content");

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
