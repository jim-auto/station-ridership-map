# 駅別乗降客数マップ - 開発計画書

## プロジェクト概要

駅の乗降客数を地図上に可視化する静的Webアプリ。GitHub Pages で公開中。
メインのユースケースは「PUA（ナンパ）界隈向けのスポット選定ツール」で、乗降客数の多い駅×ラブホ/レンタルルームの近さをスコア化した「おすすめ駅ランキング」が目玉機能。

**公開URL:** https://jim-auto.github.io/station-ridership-map/
**リポジトリ:** https://github.com/jim-auto/station-ridership-map

---

## 技術スタック

- **フロントエンド:** HTML / CSS / JavaScript（フレームワークなし）
- **地図ライブラリ:** Leaflet v1.9.4（CDN読み込み）
- **タイル:** OpenStreetMap
- **ホスティング:** GitHub Pages（legacy deploy、mainブランチ直接）
- **データ形式:** GeoJSON（静的ファイル）
- **外部API（データ取得時のみ）:**
  - 国土数値情報 S12（駅別乗降客数） → `scripts/convert_s12.py`
  - 国土地理院 逆ジオコーディングAPI → 都道府県付与
  - Google Places API（nearby search） → ラブホテル/レンタルルーム取得

---

## ファイル構成

```
station-ridership-map/
├── index.html                          # メインHTML（69行）
├── style.css                           # スタイル（605行）レスポンシブ対応
├── app.js                              # アプリケーションロジック（918行）
├── data/
│   ├── stations.geojson                # 全国8,087駅の乗降客数データ（3.3MB）
│   ├── lovehotels_tokyo.geojson        # ラブホテル741件（東京・大阪・名古屋）（471KB）
│   └── rentalrooms.geojson             # レンタルルーム1,789件（東京・大阪・名古屋）（1.1MB）
├── scripts/
│   ├── S12-24_GML.zip                  # 国土数値情報の元データ（6.2MB、.gitignore推奨）
│   ├── convert_s12.py                  # S12 → stations.geojson 変換スクリプト
│   ├── fetch_lovehotels.py             # ラブホテル取得（東京単体版）
│   ├── fetch_lovehotels_multi.py       # ラブホテル取得（複数都道府県対応版）
│   ├── fetch_rentalrooms.py            # レンタルルーム取得
│   ├── ssl_bypass.js                   # Frida用SSL pinningバイパス（未使用）
│   ├── apk/                            # Happy Hotel APK解析の残骸（未使用）
│   └── capture/                        # mitmproxyキャプチャの残骸（未使用）
└── README.md                           # 公開向けドキュメント
```

---

## app.js のアーキテクチャ

### グローバル状態
```javascript
let map;              // Leaflet Map インスタンス
let stationLayer;     // 駅の円マーカーレイヤー（GeoJSON）
let allFeatures = []; // 全駅データ（フィルタ前）
let lovehotelLayer;   // ラブホマーカーレイヤー
let lovehotelData;    // ラブホGeoJSONキャッシュ
let rentalroomLayer;  // レンタルルームマーカーレイヤー
let rentalroomData;   // レンタルルームGeoJSONキャッシュ
let routeLines = [];  // 駅→ラブホの接続線（一時的）
```

### 関数一覧と依存関係

#### 初期化
- `initApp()` → `initMap()`, `initControls()`, `initTablePanel()`, `loadStationData()`
- `initMap()` → タイル設定、`addLegend()`、zoomstartイベントで`clearRouteLines()`
- `initControls()` → 閾値select、検索input、ラブホtoggle、レンタルルームtoggle、徒歩フィルタ
- `initTablePanel()` → 一覧の開閉、タブ切り替え、全画面切り替え

#### データ読み込み
- `loadStationData()` → fetch → `allFeatures`に格納 → `renderStations()`, `renderRegionTable()`, `renderCapitalRanking()`, `renderSpotRanking()`

#### 駅表示
- `renderStations()` → 閾値でフィルタ → `L.geoJSON` で円マーカー描画
- `calcRadius(ridership)` → 乗降客数→円半径（4〜16px、6段階）
- `getColor(ridership)` → 乗降客数→色（グレー〜赤、6段階）
- `buildPopupContent(props)` → 駅クリック時のポップアップHTML

#### 検索
- `handleSearch(query)` → 駅名インクリメンタルサーチ、候補20件表示
- `flyToStation(feature)` → 地図フライ移動＋ポップアップ表示

#### テーブル: 地域別一覧
- `renderRegionTable()` → 8地方×都道府県でグループ化、乗降客数降順
- 閾値フィルタと連動、行クリックで地図移動
- `REGION_MAP` (都道府県→地方マッピング), `REGION_ORDER` (地方の表示順)

#### テーブル: 都道府県代表駅ランキング
- `renderCapitalRanking()` → 各県の県庁所在地 or 人口最大都市の駅を検索
- 乗降客数の少ない順に表示、バーチャート付き
- `CAPITAL_STATIONS` → 各県の候補駅名（配列、複数候補から最大を採用）

#### テーブル: おすすめ駅ランキング
- `renderSpotRanking()` → ラブホGeoJSONを読み込み、各駅1.2km以内のラブホ数をカウント
- `haversine()` で距離計算
- 東京/大阪/名古屋のサブタブで都市切り替え
- スコア = (乗降客数 / 10000) × ラブホ数（ソート用、非表示）
- 行クリック → 地図移動 + ラブホ表示ON + `showRoutesToNearbyHotels()`

#### 経路表示
- `showRoutesToNearbyHotels(stationFeature, hotelsGeoJson)` → 1.2km以内のラブホへ点線描画＋徒歩分数ラベル
- `clearRouteLines()` → 経路線をすべて削除（ズーム変更時にも呼ばれる）

#### ラブホ/レンタルルーム表示
- `loadAndShowLovehotels()` → fetch＋キャッシュ → `showLovehotels()`
- `showLovehotels()` → 徒歩フィルタ適用 → ピンク「H」マーカー描画
- `hideLovehotels()` → レイヤー削除
- `loadAndShowRentalrooms()` / `showRentalrooms()` / `hideRentalrooms()` → 同様、紫「R」マーカー

#### ユーティリティ
- `getThreshold()` → 閾値select値取得
- `getWalkFilter()` → 徒歩フィルタ値取得
- `escapeHtml(str)` → XSS防止

---

## データ仕様

### stations.geojson
- **ソース:** 国土数値情報 S12（2023年度版）
- **レコード数:** 8,087駅
- **生成方法:** `scripts/convert_s12.py` → LineString→Point変換（centroid）、逆ジオコーディングで都道府県付与
- **属性:** station_name, line_name, operator_name, prefecture, ridership, year
- **注意点:**
  - 乗降客数はS12_057フィールド（2023年度の最新値）
  - 同一駅コード+事業者で最大ridership のものを採用
  - ridership=0 のレコードは別エントリの重複なのでスキップ
  - JRは「乗車人員」で報告する場合があり、乗降客数と一致しないケースがある（金沢駅等）
  - 事業者名は短縮マッピングあり（東日本旅客鉄道→JR東日本）
  - 路線名は号線番号表記を除去（4号線丸ノ内線→丸ノ内線）

### lovehotels_tokyo.geojson
- **ソース:** Google Places API（nearby search、keyword=「ラブホテル」）
- **レコード数:** 741件（東京479 + 大阪194 + 名古屋49 + その他）
- **対象:** 東京都・大阪府・愛知県の3万人以上の駅から半径1,200m以内
- **生成方法:** `scripts/fetch_lovehotels.py`（東京初回）、`scripts/fetch_lovehotels_multi.py`（追加分マージ）
- **クリーニング:** ビジネスホテル（アパ、東横イン等）・探偵事務所等を除外済み（EXCLUDE_KEYWORDS）
- **属性:** name, address, rating, user_ratings_total, nearest_station, distance_m, walk_min, all_nearby_stations
- **ファイル名の注意:** `lovehotels_tokyo.geojson` だが実際は東京+大阪+名古屋が含まれる（リネーム推奨）

### rentalrooms.geojson
- **ソース:** Google Places API（nearby search、keyword=「レンタルルーム」）
- **レコード数:** 1,789件
- **対象:** 同上
- **クリーニング:** コワーキング、会議室、撮影スタジオ、トランクルーム等を除外済み
- **属性:** lovehotels と同一構造

---

## UI構成

### ヘッダー（コントロールバー）
- アプリタイトル
- 表示閾値セレクト（すべて / 3万以上 / 10万以上）、デフォルト3万
- ラブホ表示チェックボックス
- レンタルルーム表示チェックボックス
- 徒歩フィルタセレクト（チェックON時に表示、15分/10分/5分）
- 駅検索ボックス（インクリメンタルサーチ）

### 地図
- Leaflet、OpenStreetMapタイル
- 駅: 円マーカー（サイズ/色が乗降客数に連動）
- ラブホ: ピンク「H」マーカー（divIcon）
- レンタルルーム: 紫「R」マーカー（divIcon）
- 経路線: ピンク点線＋徒歩分数ラベル（おすすめ駅クリック時）
- 凡例: 右下に色/サイズの説明

### フッター
- データ出典（国土数値情報、OpenStreetMap）

### テーブルパネル（下部、開閉式）
- **地域別一覧:** 8地方でグループ化、閾値連動、行クリックで地図移動
- **都道府県代表駅ランキング:** 県庁所在地or人口最大都市の駅、少ない順
- **おすすめ駅:** 東京/大阪/名古屋タブ切り替え、乗降客数×ラブホ数
- **全画面表示ボタン:** 地図を隠してテーブルをフルスクリーン表示

### レスポンシブ対応（600px以下）
- コントロールバーのラベル非表示、要素全幅化
- テーブルの事業者列・スコア列を非表示（`.hide-sp`クラス）
- `100dvh` でモバイルブラウザのアドレスバー対応

---

## データ取得スクリプトの使い方

### 駅データ更新
```bash
# 国土数値情報からS12データをダウンロード済みの場合
python scripts/convert_s12.py
# → data/stations.geojson が生成される
# ※ 逆ジオコーディングで8,000件以上のAPIコールが走る（数十分かかる）
```

### ラブホテルデータ取得
```bash
# 東京のみ（初回）
python scripts/fetch_lovehotels.py <GOOGLE_PLACES_API_KEY>

# 追加の都道府県（既存データにマージ）
python scripts/fetch_lovehotels_multi.py <GOOGLE_PLACES_API_KEY> 大阪府 愛知県
# → data/lovehotels_tokyo.geojson に追記マージ
```

### レンタルルームデータ取得
```bash
python scripts/fetch_rentalrooms.py <GOOGLE_PLACES_API_KEY>
# → data/rentalrooms.geojson が生成される
```

### 注意事項
- **Google Places APIキーは絶対にコミットしない**（コマンドライン引数で渡す設計）
- APIの月$200無料枠内で収まる（各スクリプト数百コール程度）
- `scripts/S12-24_GML.zip`, `scripts/apk/`, `scripts/capture/` は .gitignore に追加推奨

---

## 既知の問題・制約

1. **乗降客数の精度:** JRの一部駅は「乗車人員」（片方向）で報告。金沢駅（15,725人）等、実際の乗降客数の半分程度になっているケースがある
2. **Google Places APIの精度:** 「ラブホテル」キーワード検索のため、ビジネスホテルが混入する。EXCLUDE_KEYWORDSで除外しているが完全ではない。レンタルルームも同様にコワーキング等が混入し得る
3. **nearby searchの上限:** 1回のAPIコールで最大20件。実際にはそれ以上ある地域でも20件で打ち切り
4. **ファイル名の不整合:** `lovehotels_tokyo.geojson` に大阪・名古屋のデータも含まれている。リネームが望ましい（`lovehotels.geojson`）
5. **同名駅の問題:** おすすめ駅ランキングは都道府県で区別しているが、地域別一覧の行クリック等では同名駅が別都市に飛ぶ可能性が残っている
6. **データの鮮度:** 駅データは2023年度、ラブホ/レンタルルームは2026年3月時点。定期更新の仕組みはない

---

## 今後の拡張案（議論済み・未実装）

### データ拡張
- [ ] 神奈川・千葉・埼玉・兵庫・京都・福岡のラブホ/レンタルルームデータ追加
- [ ] ファイル名を `lovehotels.geojson` にリネーム
- [ ] `scripts/` 内の不要ファイル（apk/, capture/, ssl_bypass.js）を削除 or .gitignore
- [ ] Google Places APIの `next_page_token` を使って20件制限を突破

### 機能
- [ ] 年度推移グラフ（S12に2011〜2023年の全データあり、コロナ前後の変化を可視化）
- [ ] 前年比増減ランキング
- [ ] 路線別・事業者別の集計
- [ ] URL共有（閾値や表示位置をURLパラメータに保存）
- [ ] 都道府県フィルタ（特定の県だけ表示）
- [ ] ヒートマップモード
- [ ] 価格フィルタ（ラブホ/レンタルルームの料金帯で絞り込み）→ Google Places APIでは取得困難

### UI改善
- [ ] 凡例にラブホ(H)/レンタルルーム(R)のマーカー説明を追加
- [ ] おすすめ駅ランキングでレンタルルーム数も表示
- [ ] 地域別一覧で駅クリック時の同名駅問題を修正（都道府県+路線で完全一致）

---

## デプロイ

- GitHub Pages は legacy deploy モード（mainブランチ push で自動デプロイ）
- `gh api repos/jim-auto/station-ridership-map/pages/builds -X POST` で手動ビルドトリガーも可能
- キャッシュが残る場合はブラウザで Ctrl+Shift+R / シークレットタブで確認

---

## 開発メモ

- Windows 11 + Git Bash 環境
- Python 3.14（geopandas, shapely インストール済み）
- adb は Pixel 6a（root化済み、Android 16）に接続可能だがUSB接続が不安定。WiFi adb推奨
- mitmproxy, frida-tools, objection インストール済みだが、Happy Hotel アプリはシステムプロキシを無視するため通信傍受に失敗。アプリからのデータ取得は断念し Google Places API に切り替えた
