# -*- coding: utf-8 -*-
"""
Google Places API でレンタルルームを検索しGeoJSON出力

使い方:
  python scripts/fetch_rentalrooms.py <API_KEY>
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
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "rentalrooms.geojson")

SEARCH_RADIUS = 1200
MIN_RIDERSHIP = 30000
KEYWORD = "レンタルルーム"
TARGET_PREFS = ["東京都", "大阪府", "愛知県"]

EXCLUDE_KEYWORDS = [
    "コワーキング", "会議室", "セミナー", "オフィス", "撮影",
    "スタジオ", "キッチン", "ダンス", "トランクルーム", "収納",
    "バーチャル", "シェアオフィス", "MID POINT", "ワーク",
    "貸し会議", "研修", "倉庫", "スペラボ", "加圧",
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
    if len(sys.argv) < 2:
        print("Usage: python fetch_rentalrooms.py <API_KEY>")
        sys.exit(1)

    api_key = sys.argv[1]

    with open(STATIONS_PATH, encoding="utf-8") as f:
        stations = json.load(f)

    # 対象駅を抽出・重複除去
    station_map = {}
    for feat in stations["features"]:
        p = feat["properties"]
        if p.get("prefecture") not in TARGET_PREFS or p.get("ridership", 0) < MIN_RIDERSHIP:
            continue
        name = p["station_name"]
        coords = feat["geometry"]["coordinates"]
        key = f"{name}_{round(coords[0], 3)}_{round(coords[1], 3)}"
        if key not in station_map or p["ridership"] > station_map[key]["properties"]["ridership"]:
            station_map[key] = feat

    target_stations = list(station_map.values())
    print(f"対象駅: {len(target_stations)}駅")

    all_rooms = {}
    api_calls = 0

    for i, feat in enumerate(target_stations):
        p = feat["properties"]
        coords = feat["geometry"]["coordinates"]
        lon, lat = coords[0], coords[1]

        print(f"  [{i + 1}/{len(target_stations)}] {p['station_name']}駅...", end="", flush=True)

        try:
            result = search_nearby(api_key, lat, lon)
            api_calls += 1
            rooms = result.get("results", [])
            added = 0

            for room in rooms:
                name = room.get("name", "")
                if is_excluded(name):
                    continue

                rloc = room.get("geometry", {}).get("location", {})
                r_lat, r_lon = rloc.get("lat", 0), rloc.get("lng", 0)
                dist = haversine(lat, lon, r_lat, r_lon)
                key = f"{round(r_lon, 6)}_{round(r_lat, 6)}"

                if key not in all_rooms:
                    all_rooms[key] = {
                        "type": "Feature",
                        "geometry": {"type": "Point", "coordinates": [round(r_lon, 6), round(r_lat, 6)]},
                        "properties": {
                            "name": name,
                            "address": room.get("vicinity", ""),
                            "rating": room.get("rating"),
                            "user_ratings_total": room.get("user_ratings_total", 0),
                            "nearest_station": p["station_name"],
                            "distance_m": round(dist),
                            "walk_min": round(dist / 80),
                            "all_nearby_stations": [p["station_name"]],
                        },
                    }
                    added += 1
                else:
                    props = all_rooms[key]["properties"]
                    if p["station_name"] not in props.get("all_nearby_stations", []):
                        props["all_nearby_stations"].append(p["station_name"])
                    if dist < props.get("distance_m", 99999):
                        props["nearest_station"] = p["station_name"]
                        props["distance_m"] = round(dist)
                        props["walk_min"] = round(dist / 80)

            print(f" {len(rooms)}件 (新規{added})")
            time.sleep(0.3)

        except Exception as e:
            print(f" エラー: {e}")

    output = {"type": "FeatureCollection", "features": list(all_rooms.values())}
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n完了! API: {api_calls}回, ユニーク: {len(all_rooms)}件")


if __name__ == "__main__":
    main()
