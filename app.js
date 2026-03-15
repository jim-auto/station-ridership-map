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
