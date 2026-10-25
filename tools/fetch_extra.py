"""Extra free data on top of OSM: NJ statewide address points (NJOGIS) and Microsoft US building footprints.
usage: python tools/fetch_extra.py OUT   (OUT already has bbox.json from fetch_pbf.py). Logs counts only."""
import sys, os, json, gzip, io, zipfile, time
import requests
OUT = sys.argv[1]; bb = json.load(open(os.path.join(OUT, "bbox.json"))); S, N, W, E = bb["S"], bb["N"], bb["W"], bb["E"]
log = open(os.path.join(OUT, "fetch-log.txt"), "a")
def say(*a): print(*a, flush=True); log.write(" ".join(map(str, a)) + "\n"); log.flush()
UA = {"User-Agent": "brick-sim/0.1 (github.com/hinermandanny-dev/brick-sim)"}
# 1. NJ address points (every address in the box; public)
try:
    url = "https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/AddressPoints/FeatureServer/0/query"
    pts = []; off = 0
    while True:
        p = {"where": "1=1", "geometry": f"{W},{S},{E},{N}", "geometryType": "esriGeometryEnvelope", "inSR": 4326, "spatialRel": "esriSpatialRelIntersects",
             "outFields": "ADD_NUMBER,ADDNUM_SUF,ST_PREMOD,ST_PREDIR,ST_PRETYP,ST_NAME,ST_POSTYP,ST_POSDIR,INC_MUNI,POST_COMM", "outSR": 4326, "f": "json", "resultOffset": off, "resultRecordCount": 2000, "orderByFields": "OBJECTID"}
        for a in range(4):
            try: r = requests.get(url, params=p, headers=UA, timeout=120); j = r.json(); break
            except Exception as ex: say("addrpoints retry", type(ex).__name__); time.sleep(5)
        fs = j.get("features", [])
        for f in fs:
            at = f["attributes"]; g = f.get("geometry") or {}
            if "x" not in g: continue
            st = " ".join(str(at.get(k) or "").strip() for k in ("ST_PREMOD", "ST_PREDIR", "ST_PRETYP", "ST_NAME", "ST_POSTYP", "ST_POSDIR")).split()
            num = str(at.get("ADD_NUMBER") or "") + str(at.get("ADDNUM_SUF") or "")
            if num and st: pts.append([num, " ".join(st), round(g["y"], 7), round(g["x"], 7), at.get("INC_MUNI") or at.get("POST_COMM") or ""])
        off += len(fs)
        if not fs or not j.get("exceededTransferLimit"): break
    with gzip.open(os.path.join(OUT, "addrpoints.json.gz"), "wt") as f: json.dump(pts, f, separators=(",", ":"))
    say("nj address points", len(pts))
except Exception as ex:
    say("address points skipped", type(ex).__name__, str(ex)[:200])
# 2. Microsoft building footprints for New Jersey (fills buildings OSM has not mapped yet)
try:
    r = None
    for url in ("https://minedbuildings.z5.web.core.windows.net/legacy/usbuildings-v2/NewJersey.geojson.zip",
                "https://usbuildingdataset.blob.core.windows.net/usbuildings-v2/NewJersey.geojson.zip"):
        try:
            if os.path.exists("ms-nj.zip"): r = type("R", (), {"content": open("ms-nj.zip", "rb").read()})(); say("ms source", "cache"); break
            r = requests.get(url, headers=UA, timeout=600); r.raise_for_status(); open("ms-nj.zip", "wb").write(r.content); say("ms source", url.split("/")[2]); break
        except Exception as ex: say("ms try failed", url.split("/")[2], type(ex).__name__); r = None
    if r is None: raise RuntimeError("no Microsoft source reachable")
    buf = io.BytesIO(r.content); z = zipfile.ZipFile(buf); name = [n for n in z.namelist() if n.endswith("json")][0]
    out = []; i = 0
    with z.open(name) as fh:
        for raw in io.TextIOWrapper(fh, encoding="utf-8"):
            line = raw.strip().rstrip(",")
            if not line.startswith('{"type":"Feature"') and not line.startswith('{ "type": "Feature"'): continue
            ft = json.loads(line); ring = ft["geometry"]["coordinates"][0]
            lo, la = ring[0][0], ring[0][1]
            if not (S <= la <= N and W <= lo <= E): continue
            i += 1
            out.append({"type": "way", "id": -i, "geometry": [{"lat": round(p[1], 7), "lon": round(p[0], 7)} for p in ring], "tags": {"building": "yes", "source": "microsoft"}})
    with gzip.open(os.path.join(OUT, "msbuildings.json.gz"), "wt") as f: json.dump({"elements": out}, f, separators=(",", ":"))
    say("microsoft buildings", len(out))
except Exception as ex:
    say("microsoft buildings skipped", type(ex).__name__, str(ex)[:200])
