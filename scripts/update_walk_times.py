# -*- coding: utf-8 -*-
"""
Google Routes API で各ホテルの最寄り駅からの実際の徒歩時間を更新

使い方:
  python scripts/update_walk_times.py <API_KEY>
"""

import json
import sys
import os
import time
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")

HOTELS_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "lovehotels_tokyo.geojson")
STATIONS_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "stations.geojson")


def get_walking_route(api_key, origin_lat, origin_lon, dest_lat, dest_lon):
    url = "https://routes.googleapis.com/directions/v2:computeRoutes"
    body = json.dumps({
        "origin": {"location": {"latLng": {"latitude": origin_lat, "longitude": origin_lon}}},
        "destination": {"location": {"latLng": {"latitude": dest_lat, "longitude": dest_lon}}},
        "travelMode": "WALK",
    }).encode()
    req = urllib.request.Request(url, data=body, headers={
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    if len(sys.argv) < 2:
        print("Usage: python update_walk_times.py <API_KEY>")
        sys.exit(1)

    api_key = sys.argv[1]

    with open(STATIONS_PATH, encoding="utf-8") as f:
        stations = json.load(f)
    with open(HOTELS_PATH, encoding="utf-8") as f:
        hotels = json.load(f)

    # 駅名→座標のマップ（最大乗降客数のものを採用）
    station_coords = {}
    for feat in stations["features"]:
        p = feat["properties"]
        name = p["station_name"]
        coords = feat["geometry"]["coordinates"]
        if name not in station_coords or p["ridership"] > station_coords[name]["ridership"]:
            station_coords[name] = {
                "lat": coords[1],
                "lon": coords[0],
                "ridership": p["ridership"],
            }

    total = len(hotels["features"])
    updated = 0
    failed = 0

    for i, feat in enumerate(hotels["features"]):
        p = feat["properties"]
        station_name = p.get("nearest_station", "")
        hc = feat["geometry"]["coordinates"]

        if station_name not in station_coords:
            print(f"  [{i+1}/{total}] {p['name']} - 駅 '{station_name}' が見つからない、スキップ")
            failed += 1
            continue

        sc = station_coords[station_name]

        try:
            result = get_walking_route(api_key, sc["lat"], sc["lon"], hc[1], hc[0])
            route = result.get("routes", [{}])[0]
            dist = route.get("distanceMeters", 0)
            duration_str = route.get("duration", "0s")
            duration_sec = int(duration_str.replace("s", ""))
            walk_min = round(duration_sec / 60)

            old_dist = p.get("distance_m", 0)
            old_walk = p.get("walk_min", 0)
            p["distance_m"] = dist
            p["walk_min"] = walk_min
            updated += 1

            if (i + 1) % 50 == 0:
                print(f"  [{i+1}/{total}] 完了")

            time.sleep(0.05)

        except Exception as e:
            print(f"  [{i+1}/{total}] {p['name']} - エラー: {e}")
            failed += 1

    with open(HOTELS_PATH, "w", encoding="utf-8") as f:
        json.dump(hotels, f, ensure_ascii=False, indent=2)

    print(f"\n完了! 更新: {updated}件, 失敗: {failed}件")


if __name__ == "__main__":
    main()
