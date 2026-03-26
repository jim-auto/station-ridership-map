# -*- coding: utf-8 -*-
"""
Google Places API で東京都の3万人以上の駅周辺のラブホテルを検索し、
GeoJSONとして出力するスクリプト

使い方:
  python scripts/fetch_lovehotels.py <API_KEY>
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

SEARCH_RADIUS = 1200  # meters (~15 min walk)
MIN_RIDERSHIP = 30000
TARGET_PREFECTURE = "東京都"
KEYWORD = "ラブホテル"


def search_nearby(api_key, lat, lon, keyword, radius):
    """Google Places nearby searchでホテルを検索"""
    encoded_keyword = urllib.parse.quote(keyword)
    url = (
        f"https://maps.googleapis.com/maps/api/place/nearbysearch/json"
        f"?location={lat},{lon}&radius={radius}"
        f"&keyword={encoded_keyword}&language=ja&key={api_key}"
    )
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def haversine(lat1, lon1, lat2, lon2):
    """2点間の距離（メートル）"""
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def main():
    if len(sys.argv) < 2:
        print("Usage: python fetch_lovehotels.py <API_KEY>")
        sys.exit(1)

    api_key = sys.argv[1]

    # 駅データ読み込み
    with open(STATIONS_PATH, encoding="utf-8") as f:
        stations = json.load(f)

    # 東京都の3万人以上の駅を抽出
    target_stations = []
    for feat in stations["features"]:
        p = feat["properties"]
        if p.get("prefecture") == TARGET_PREFECTURE and (p.get("ridership", 0) >= MIN_RIDERSHIP):
            target_stations.append(feat)

    # 同名駅の重複を除去（最大乗降客数のものを採用）
    station_map = {}
    for feat in target_stations:
        name = feat["properties"]["station_name"]
        coords = feat["geometry"]["coordinates"]
        key = f"{name}_{round(coords[0], 3)}_{round(coords[1], 3)}"
        if key not in station_map or feat["properties"]["ridership"] > station_map[key]["properties"]["ridership"]:
            station_map[key] = feat

    target_stations = list(station_map.values())
    print(f"対象駅: {len(target_stations)}駅 (東京都, {MIN_RIDERSHIP:,}人以上)")

    # 各駅周辺のラブホテルを検索
    all_hotels = {}  # place_id -> hotel data
    station_hotels = {}  # station_name -> [hotel place_ids]
    api_calls = 0

    for i, feat in enumerate(target_stations):
        p = feat["properties"]
        coords = feat["geometry"]["coordinates"]
        lon, lat = coords[0], coords[1]
        station_name = p["station_name"]

        print(f"  [{i + 1}/{len(target_stations)}] {station_name}駅 ({p['ridership']:,}人)...", end="", flush=True)

        try:
            result = search_nearby(api_key, lat, lon, KEYWORD, SEARCH_RADIUS)
            api_calls += 1
            hotels = result.get("results", [])
            print(f" {len(hotels)}件")

            hotel_ids = []
            for hotel in hotels:
                place_id = hotel.get("place_id", "")
                hotel_loc = hotel.get("geometry", {}).get("location", {})
                hotel_lat = hotel_loc.get("lat", 0)
                hotel_lon = hotel_loc.get("lng", 0)

                dist = haversine(lat, lon, hotel_lat, hotel_lon)

                if place_id not in all_hotels:
                    all_hotels[place_id] = {
                        "name": hotel.get("name", ""),
                        "lat": hotel_lat,
                        "lon": hotel_lon,
                        "address": hotel.get("vicinity", ""),
                        "rating": hotel.get("rating"),
                        "user_ratings_total": hotel.get("user_ratings_total", 0),
                        "nearest_stations": [],
                    }

                all_hotels[place_id]["nearest_stations"].append({
                    "station_name": station_name,
                    "distance_m": round(dist),
                    "walk_min": round(dist / 80),  # 80m/min
                })

                hotel_ids.append(place_id)

            station_hotels[station_name] = hotel_ids

            # API rate limit対策
            time.sleep(0.3)

        except Exception as e:
            print(f" エラー: {e}")

    # GeoJSON出力
    features = []
    for place_id, hotel in all_hotels.items():
        # 最寄り駅を距離順にソート
        hotel["nearest_stations"].sort(key=lambda x: x["distance_m"])
        nearest = hotel["nearest_stations"][0]

        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [round(hotel["lon"], 6), round(hotel["lat"], 6)],
            },
            "properties": {
                "name": hotel["name"],
                "address": hotel["address"],
                "rating": hotel["rating"],
                "user_ratings_total": hotel["user_ratings_total"],
                "nearest_station": nearest["station_name"],
                "distance_m": nearest["distance_m"],
                "walk_min": nearest["walk_min"],
                "all_nearby_stations": [s["station_name"] for s in hotel["nearest_stations"]],
            },
        })

    output = {"type": "FeatureCollection", "features": features}

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n完了!")
    print(f"  API呼び出し: {api_calls}回")
    print(f"  ユニークホテル数: {len(all_hotels)}")
    print(f"  出力: {OUTPUT_PATH}")

    # 駅別サマリ
    print(f"\n=== 駅別ラブホテル数 TOP20 ===")
    ranking = [(name, len(ids)) for name, ids in station_hotels.items()]
    ranking.sort(key=lambda x: -x[1])
    for name, count in ranking[:20]:
        print(f"  {name}: {count}件")


if __name__ == "__main__":
    main()
