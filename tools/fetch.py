"""Fetch raw map data for Brick Township, NJ. Output dir arg. Prints only counts (public logs)."""
import sys, os, json, gzip, time, io, math
import requests, numpy as np
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
_log = open(os.path.join(OUT, "fetch-log.txt"), "a")
_print = print
def print(*a, **k):
    _print(*a, **k); _log.write(" ".join(str(x) for x in a) + "\n"); _log.flush()
EPS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter",
       "https://overpass.private.coffee/api/interpreter"]
UA = {"User-Agent": "brick-sim/0.1 (github.com/hinermandanny-dev/brick-sim)"}
def op(q, name):
    for attempt in range(6):
        ep = EPS[attempt % len(EPS)]
        try:
            r = requests.post(ep, data={"data": q}, headers=UA, timeout=900)
            if r.status_code == 200 and r.text.lstrip().startswith("{"):
                j = r.json()
                print(f"{name}: {len(j.get('elements', []))} elements via {ep.split('/')[2]}", flush=True)
                return j
            print(f"{name}: HTTP {r.status_code} via {ep.split('/')[2]}: {r.text[:200]!r}", flush=True)
        except Exception as e:
            print(f"{name}: {type(e).__name__}, retry", flush=True)
        time.sleep(15 + attempt * 10)
    print(f"{name} FAILED"); return None
def save(name, j):
    with gzip.open(os.path.join(OUT, name + ".json.gz"), "wt", encoding="utf-8") as f:
        json.dump(j, f, separators=(",", ":"))

# 1. boundary -> bbox
b = op('[out:json][timeout:180];rel["boundary"="administrative"]["admin_level"="8"]["name"~"^Brick( Township)?$"](39.9,-74.3,40.2,-73.9);out geom;', "boundary")
save("boundary", b)
lats, lons = [], []
for el in b["elements"]:
    for m in el.get("members", []):
        for p in m.get("geometry", []) or []:
            lats.append(p["lat"]); lons.append(p["lon"])
if not lats:
    lats, lons = [39.99, 40.12], [-74.19, -74.03]
pad = 0.004
S, N, W, E = min(lats) - pad, max(lats) + pad, min(lons) - pad, max(lons) + pad
bbox = f"{S:.5f},{W:.5f},{N:.5f},{E:.5f}"
json.dump({"S": S, "N": N, "W": W, "E": E}, open(os.path.join(OUT, "bbox.json"), "w"))
print("bbox", bbox, flush=True)
def quads(n):
    out = []
    for a in range(n):
        for b in range(n):
            s_ = S + (N - S) * a / n; n_ = S + (N - S) * (a + 1) / n; w_ = W + (E - W) * b / n; e_ = W + (E - W) * (b + 1) / n
            out.append(f"{s_:.5f},{w_:.5f},{n_:.5f},{e_:.5f}")
    return out
Q = {
  "highways": ('way["highway"];out geom;', 2),
  "buildings": ('(way["building"];rel["building"];way["building:part"];);out geom;', 3),
  "areas": ('(way["landuse"];rel["landuse"];way["natural"];rel["natural"];way["leisure"];rel["leisure"];way["amenity"];rel["amenity"];way["waterway"];way["water"];rel["water"];way["man_made"];way["place"];way["area:highway"];way["shop"];way["tourism"];);out geom;', 2),
  "lines": ('(way["barrier"];way["railway"];way["power"];way["natural"="coastline"];);out geom;', 2),
  "nodes": ('(node["natural"];node["highway"];node["amenity"];node["shop"];node["barrier"];node["man_made"];node["power"];node["leisure"];node["tourism"];node["entrance"];node["emergency"];node["advertising"];node["traffic_sign"];node["public_transport"];node["railway"];node["place"];node["office"];node["craft"];node["healthcare"];);out body;', 2),
  "addr": ('(node["addr:housenumber"];way["addr:housenumber"];);out center tags;', 2),
  "rels": ('(rel["type"="multipolygon"];rel["type"="route"]["route"~"bus|bicycle"];);out geom;', 1),
  "restr": ('rel["type"="restriction"];out body;', 1),
}
for k, (q, n) in Q.items():
    seen = {}; ok = True
    for qb in quads(n):
        j = op(f"[out:json][timeout:300][maxsize:1073741824][bbox:{qb}];" + q, f"{k}[{qb}]")
        if j is None: ok = False; continue
        for el in j.get("elements", []): seen[(el["type"], el["id"])] = el
        time.sleep(4)
    save(k, {"elements": list(seen.values())}); print(k, "total", len(seen), "complete" if ok else "PARTIAL")

# 2. elevation: USGS 3DEP exportImage (float32 tiff), tiled
def dem_usgs():
    import tifffile
    url = "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage"
    # ~2 m/px target; tile 4x4 of 2000px
    nx = ny = 4; px = 2000
    rows = []
    for j in range(ny):
        row = []
        for i in range(nx):
            w = W + (E - W) * i / nx; e = W + (E - W) * (i + 1) / nx
            n = N - (N - S) * j / ny; s = N - (N - S) * (j + 1) / ny
            params = {"bbox": f"{w},{s},{e},{n}", "bboxSR": 4326, "imageSR": 4326, "size": f"{px},{px}",
                      "format": "tiff", "pixelType": "F32", "noDataInterpretation": "esriNoDataMatchAny",
                      "interpolation": "RSP_BilinearInterpolation", "f": "image"}
            for a in range(6):
                try:
                    r = requests.get(url, params=params, headers=UA, timeout=300)
                    if r.status_code == 200 and r.content[:2] in (b"II", b"MM"):
                        row.append(tifffile.imread(io.BytesIO(r.content)).astype(np.float32)); break
                    print("usgs tile http", r.status_code, flush=True)
                except Exception as ex:
                    print("usgs tile", type(ex).__name__, flush=True)
                time.sleep(10)
            else:
                raise RuntimeError("usgs tile failed")
        rows.append(np.concatenate(row, axis=1))
    return np.concatenate(rows, axis=0)
def dem_terrarium():
    from PIL import Image
    z = 15
    def tx(lon): return (lon + 180) / 360 * 2 ** z
    def ty(lat): r = math.radians(lat); return (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2 ** z
    x0, x1, y0, y1 = int(tx(W)), int(tx(E)), int(ty(N)), int(ty(S))
    big = np.zeros(((y1 - y0 + 1) * 256, (x1 - x0 + 1) * 256), np.float32)
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            r = requests.get(f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png", timeout=60)
            a = np.asarray(Image.open(io.BytesIO(r.content)).convert("RGB")).astype(np.float32)
            big[(y - y0) * 256:(y - y0 + 1) * 256, (x - x0) * 256:(x - x0 + 1) * 256] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
    return big, {"z": z, "x0": x0, "y0": y0}
meta = {"S": S, "N": N, "W": W, "E": E}
try:
    d = dem_usgs(); meta["src"] = "usgs3dep"; meta["proj"] = "latlon"
except Exception as ex:
    print("usgs failed -> terrarium", type(ex).__name__, flush=True)
    d, t = dem_terrarium(); meta["src"] = "terrarium"; meta["proj"] = "webmercator"; meta.update(t)
d[~np.isfinite(d)] = 0; d[d < -100] = 0
meta["shape"] = list(d.shape); meta["min"] = float(d.min()); meta["max"] = float(d.max())
np.save(os.path.join(OUT, "dem.npy"), d.astype(np.float16) if d.max() < 60000 else d)
json.dump(meta, open(os.path.join(OUT, "dem.json"), "w"))
print("dem", meta["src"], meta["shape"], round(meta["min"], 1), round(meta["max"], 1), flush=True)
