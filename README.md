# 駅別乗降客数マップ

鉄道駅の乗降客数を地図上に可視化する静的Webアプリケーションです。
HTML / CSS / JavaScript のみで動作し、GitHub Pages でそのまま公開できます。

**公開URL:** https://jim-auto.github.io/station-ridership-map/

## 機能

- 駅の乗降客数を円マーカーで地図上に表示（乗降客数に応じて円の大きさ・色が変化）
- 乗降客数の閾値フィルタ（すべて / 30,000人以上 / 100,000人以上）
- 駅名検索
- 駅クリックで詳細情報をポップアップ表示
- レスポンシブ対応（スマホ・タブレット）

## ファイル構成

```
station-ridership-map/
├── index.html
├── style.css
├── app.js
├── data/
│   └── stations.geojson
└── README.md
```

## GitHub Pages 公開手順

1. このリポジトリを GitHub にプッシュする
2. リポジトリの **Settings** → **Pages** を開く
3. **Source** で `Deploy from a branch` を選択
4. **Branch** で `main`（または `master`）、フォルダを `/ (root)` に設定
5. **Save** をクリック
6. 数分後に `https://<ユーザー名>.github.io/<リポジトリ名>/` で公開される

## data/stations.geojson のフォーマット

GeoJSON の `FeatureCollection` 形式で、各駅を `Point` ジオメトリとして記述します。

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [139.7671, 35.6812]
      },
      "properties": {
        "station_name": "東京",
        "line_name": "東海道本線",
        "operator_name": "JR東日本",
        "prefecture": "東京都",
        "ridership": 462000,
        "year": 2022
      }
    }
  ]
}
```

### 属性一覧

| 属性名 | 型 | 説明 |
|---|---|---|
| `station_name` | string | 駅名 |
| `line_name` | string | 路線名 |
| `operator_name` | string | 事業者名 |
| `prefecture` | string | 都道府県 |
| `ridership` | number | 1日あたり乗降客数（人） |
| `year` | number | データの年度 |

### 座標について

`coordinates` は `[経度, 緯度]` の順（GeoJSON 仕様準拠）です。

## 色と円サイズの凡例

| 乗降客数 | 色 | 円の大きさ |
|---|---|---|
| 500,000人以上 | 赤 | 最大 |
| 200,000人以上 | オレンジ | 大 |
| 100,000人以上 | 黄 | 中大 |
| 50,000人以上 | 青 | 中 |
| 30,000人以上 | 緑 | 小 |
| 30,000人未満 | グレー | 最小 |

## 使用ライブラリ

- [Leaflet](https://leafletjs.com/) v1.9.4（CDN 読み込み）
- [OpenStreetMap](https://www.openstreetmap.org/) タイル

## ライセンス

MIT
