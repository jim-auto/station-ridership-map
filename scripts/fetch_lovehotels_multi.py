# -*- coding: utf-8 -*-
"""
Google Places API で複数都道府県の3万人以上の駅周辺ラブホテルを検索し、
既存データにマージして出力するスクリプト

使い方:
  python scripts/fetch_lovehotels_multi.py <API_KEY> <都道府県名1> <都道府県名2> ...
  例: python scripts/fetch_lovehotels_multi.py <KEY> 大阪府 愛知県
"""

import json
import sys
import os
import time
import urllib.request
import urllib.parse
import math

sys.stdout.reconfigure(encoding="utf-8")

STATIONS_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "stations.geojson")
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "lovehotels_tokyo.geojson")

SEARCH_RADIUS = 1200
MIN_RIDERSHIP = 30000
KEYWORD = "ラブホテル"

EXCLUDE_KEYWORDS = [
    "東横イン", "アパホテル", "ドーミーイン", "コンフォート", "ルートイン",
    "スーパーホテル", "ダイワロイネット", "ヒルトン", "マリオット", "プリンス",
    "帝国", "リッチモンド", "ワシントン", "相鉄フレッサ", "ベッセル",
    "ニューオータニ", "JRホテル", "三井ガーデン", "東急ステイ", "東急REI",
    "ヴィアイン", "コートホテル", "リブマックス", "探偵", "リサーチ",
    "ビジネスホテル", "カプセル", "ゲストハウス", "ホステル", "commun",
    "rakuna", "Inn ", "プラザホテル",
]


def search_nearby(api_key, lat, lon):
    encoded = urllib.parse.quote(KEYWORD)
    url = (
        f"https://maps.googleapis.com/maps/api/place/nearbysearch/json"
        f"?location={lat},{lon}&radius={SEARCH_RADIUS}"
        f"&keyword={encoded}&language=ja&key={api_key}"
    )
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def haversine(lat1, lon1, lat2, lon2):
    R = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def is_excluded(name):
    return any(kw in name for kw in EXCLUDE_KEYWORDS)


def main():
    if len(sys.argv) < 3:
        print("Usage: python fetch_lovehotels_multi.py <API_KEY> <都道府県名> ...")
        sys.exit(1)

    api_key = sys.argv[1]
    target_prefs = sys.argv[2:]

    # 既存データ読み込み
    existing_hotels = {}
    if os.path.exists(OUTPUT_PATH):
        with open(OUTPUT_PATH, encoding="utf-8") as f:
            existing = json.load(f)
        for feat in existing["features"]:
            key = f"{feat['geometry']['coordinates'][0]}_{feat['geometry']['coordinates'][1]}"
            existing_hotels[key] = feat
        print(f"既存データ: {len(existing_hotels)}件")

    # 駅データ読み込み
    with open(STATIONS_PATH, encoding="utf-8") as f:
        stations = json.load(f)

    # 対象駅を抽出
    target_stations = []
    for feat in stations["features"]:
        p = feat["properties"]
        if p.get("prefecture") in target_prefs and p.get("ridership", 0) >= MIN_RIDERSHIP:
            target_stations.append(feat)

    # 重複除去
    station_map = {}
    for feat in target_stations:
        name = feat["properties"]["station_name"]
        coords = feat["geometry"]["coordinates"]
        key = f"{name}_{round(coords[0], 3)}_{round(coords[1], 3)}"
        if key not in station_map or feat["properties"]["ridership"] > station_map[key]["properties"]["ridership"]:
            station_map[key] = feat
    target_stations = list(station_map.values())

    print(f"対象駅: {len(target_stations)}駅 ({', '.join(target_prefs)}, {MIN_RIDERSHIP:,}人以上)")

    all_hotels = dict(existing_hotels)
    api_calls = 0
    new_count = 0

    for i, feat in enumerate(target_stations):
        p = feat["properties"]
        coords = feat["geometry"]["coordinates"]
        lon, lat = coords[0], coords[1]

        print(f"  [{i + 1}/{len(target_stations)}] {p['station_name']}駅...", end="", flush=True)

        try:
            result = search_nearby(api_key, lat, lon)
            api_calls += 1
            hotels = result.get("results", [])
            added = 0

            for hotel in hotels:
                name = hotel.get("name", "")
                if is_excluded(name):
                    continue

                hotel_loc = hotel.get("geometry", {}).get("location", {})
                h_lat = hotel_loc.get("lat", 0)
                h_lon = hotel_loc.get("lng", 0)
                dist = haversine(lat, lon, h_lat, h_lon)
                key = f"{round(h_lon, 6)}_{round(h_lat, 6)}"

                if key not in all_hotels:
                    all_hotels[key] = {
                        "type": "Feature",
                        "geometry": {"type": "Point", "coordinates": [round(h_lon, 6), round(h_lat, 6)]},
                        "properties": {
                            "name": name,
                            "address": hotel.get("vicinity", ""),
                            "rating": hotel.get("rating"),
                            "user_ratings_total": hotel.get("user_ratings_total", 0),
                            "nearest_station": p["station_name"],
                            "distance_m": round(dist),
                            "walk_min": round(dist / 80),
                            "all_nearby_stations": [p["station_name"]],
                        },
                    }
                    added += 1
                    new_count += 1
                else:
                    props = all_hotels[key]["properties"]
                    if p["station_name"] not in props.get("all_nearby_stations", []):
                        props["all_nearby_stations"].append(p["station_name"])
                    if dist < props.get("distance_m", 99999):
                        props["nearest_station"] = p["station_name"]
                        props["distance_m"] = round(dist)
                        props["walk_min"] = round(dist / 80)

            print(f" {len(hotels)}件 (新規{added})")
            time.sleep(0.3)

        except Exception as e:
            print(f" エラー: {e}")

    # 保存
    output = {"type": "FeatureCollection", "features": list(all_hotels.values())}
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n完了!")
    print(f"  API呼び出し: {api_calls}回")
    print(f"  新規追加: {new_count}件")
    print(f"  合計ホテル数: {len(all_hotels)}件")


if __name__ == "__main__":
    main()
