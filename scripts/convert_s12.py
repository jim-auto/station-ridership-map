# -*- coding: utf-8 -*-
"""
国土数値情報 S12（駅別乗降客数データ）を
アプリ用の stations.geojson に変換するスクリプト

使い方:
  python scripts/convert_s12.py
"""

import json
import sys
import os
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")

# --- 設定 ---
ZIP_PATH = os.path.join(os.path.dirname(__file__), "S12-24_GML.zip")
GEOJSON_ENTRY = "UTF-8/S12-24_NumberOfPassengers.geojson"
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "stations.geojson")

# 最新年度の乗降客数フィールド (2023年度 = S12_057)
RIDERSHIP_FIELD = "S12_057"
DATA_YEAR = 2023

# 都道府県コード → 名前
PREF_NAMES = {
    1: "北海道", 2: "青森県", 3: "岩手県", 4: "宮城県", 5: "秋田県",
    6: "山形県", 7: "福島県", 8: "茨城県", 9: "栃木県", 10: "群馬県",
    11: "埼玉県", 12: "千葉県", 13: "東京都", 14: "神奈川県", 15: "新潟県",
    16: "富山県", 17: "石川県", 18: "福井県", 19: "山梨県", 20: "長野県",
    21: "岐阜県", 22: "静岡県", 23: "愛知県", 24: "三重県", 25: "滋賀県",
    26: "京都府", 27: "大阪府", 28: "兵庫県", 29: "奈良県", 30: "和歌山県",
    31: "鳥取県", 32: "島根県", 33: "岡山県", 34: "広島県", 35: "山口県",
    36: "徳島県", 37: "香川県", 38: "愛媛県", 39: "高知県", 40: "福岡県",
    41: "佐賀県", 42: "長崎県", 43: "熊本県", 44: "大分県", 45: "宮崎県",
    46: "鹿児島県", 47: "沖縄県",
}

# 事業者名の短縮マッピング
OPERATOR_SHORT = {
    "東日本旅客鉄道": "JR東日本",
    "西日本旅客鉄道": "JR西日本",
    "東海旅客鉄道": "JR東海",
    "九州旅客鉄道": "JR九州",
    "北海道旅客鉄道": "JR北海道",
    "四国旅客鉄道": "JR四国",
    "東京地下鉄": "東京メトロ",
}


def load_s12_geojson():
    """ZIP内のGeoJSONを読み込む"""
    import zipfile

    with zipfile.ZipFile(ZIP_PATH, "r") as z:
        with z.open(GEOJSON_ENTRY) as f:
            return json.loads(f.read().decode("utf-8"))


def calc_centroid(coordinates):
    """LineString座標リストの重心を計算"""
    lons = [c[0] for c in coordinates]
    lats = [c[1] for c in coordinates]
    return [sum(lons) / len(lons), sum(lats) / len(lats)]


def reverse_geocode(lon, lat):
    """国土地理院APIで緯度経度から都道府県を取得"""
    url = f"https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lon={lon}&lat={lat}"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if "results" in data and "mupiCode" in data["results"]:
                pref_code = int(str(data["results"]["mupiCode"])[:2])
                return PREF_NAMES.get(pref_code, "")
    except Exception:
        pass
    return ""


def shorten_operator(name):
    """事業者名を短縮"""
    return OPERATOR_SHORT.get(name, name)


def simplify_line_name(name):
    """路線名から号線番号表記を整理"""
    import re
    # "4号線丸ノ内線" → "丸ノ内線"
    name = re.sub(r"^\d+号線", "", name)
    return name


def convert():
    print("S12データを読み込み中...")
    data = load_s12_geojson()
    features = data["features"]
    print(f"  全{len(features)}件のレコード")

    # 同一駅（駅コード+事業者）で乗降客数が最大のものを採用
    # ridership=0 のレコードは同一駅の別エントリ（重複）なのでスキップ
    station_map = {}
    for feat in features:
        props = feat["properties"]
        ridership = props.get(RIDERSHIP_FIELD)
        if ridership is None or ridership == 0:
            continue

        station_code = props.get("S12_001g", "")
        key = f"{station_code}_{props['S12_002']}"

        if key not in station_map or ridership > station_map[key]["ridership"]:
            centroid = calc_centroid(feat["geometry"]["coordinates"])
            station_map[key] = {
                "station_name": props["S12_001"],
                "line_name": simplify_line_name(props["S12_003"]),
                "operator_name": shorten_operator(props["S12_002"]),
                "ridership": ridership,
                "coordinates": centroid,
                "station_code": station_code,
            }

    print(f"  重複除去後: {len(station_map)}件")

    # 都道府県を逆ジオコーディングで付与
    entries = list(station_map.values())
    print(f"都道府県を逆ジオコーディング中... ({len(entries)}件)")

    # バッチ処理（キャッシュで同じ地域をまとめる）
    pref_cache = {}
    for i, entry in enumerate(entries):
        lon, lat = entry["coordinates"]
        # 小数点2桁で丸めてキャッシュキーにする（近い駅は同じ都道府県）
        cache_key = f"{round(lat, 1)}_{round(lon, 1)}"

        if cache_key in pref_cache:
            entry["prefecture"] = pref_cache[cache_key]
        else:
            pref = reverse_geocode(lon, lat)
            entry["prefecture"] = pref
            pref_cache[cache_key] = pref

        if (i + 1) % 100 == 0:
            print(f"  {i + 1}/{len(entries)} 完了")

    # GeoJSON出力
    output_features = []
    for entry in entries:
        output_features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [
                        round(entry["coordinates"][0], 4),
                        round(entry["coordinates"][1], 4),
                    ],
                },
                "properties": {
                    "station_name": entry["station_name"],
                    "line_name": entry["line_name"],
                    "operator_name": entry["operator_name"],
                    "prefecture": entry["prefecture"],
                    "ridership": entry["ridership"],
                    "year": DATA_YEAR,
                },
            }
        )

    # 乗降客数降順でソート
    output_features.sort(key=lambda f: f["properties"]["ridership"], reverse=True)

    output = {"type": "FeatureCollection", "features": output_features}

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n出力完了: {OUTPUT_PATH}")
    print(f"  全駅数: {len(output_features)}")

    # 統計
    over_100k = sum(1 for f in output_features if f["properties"]["ridership"] >= 100000)
    over_30k = sum(1 for f in output_features if f["properties"]["ridership"] >= 30000)
    print(f"  10万人以上: {over_100k}駅")
    print(f"  3万人以上: {over_30k}駅")
    print(f"  上位10駅:")
    for feat in output_features[:10]:
        p = feat["properties"]
        print(f"    {p['station_name']} ({p['operator_name']}/{p['line_name']}): {p['ridership']:,}人")


if __name__ == "__main__":
    convert()
