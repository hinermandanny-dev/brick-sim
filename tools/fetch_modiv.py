"""NJ MOD-IV tax parcels (NJOGIS, free): per parcel the building description (BLDG_DESC, e.g. '2SF2G'), year built,
property class and the lot polygon, for every parcel in the box of bbox.json. usage: python tools/fetch_modiv.py RAWDIR
writes RAWDIR/parcels.json.gz = [[pin, location, class, bldg_desc, year, acres, land_desc, [[lat,lon,...] ring], ...]]"""
import sys, os, json, gzip, time
import requests
RAW = sys.argv[1]; bb = json.load(open(os.path.join(RAW, "bbox.json"))); S, N, W, E = bb["S"], bb["N"], bb["W"], bb["E"]
UA = {"User-Agent": "brick-sim/0.1 (github.com/hinermandanny-dev/brick-sim)"}
URL = "https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/Parcels_MODIV_NJ_WM/FeatureServer/0/query"
log = open(os.path.join(RAW, "modiv-log.txt"), "w")
def say(*a): print(*a, flush=True); log.write(" ".join(map(str, a)) + "\n"); log.flush()
out = []; off = 0; fields = "PAMS_PIN,PROP_LOC,PROP_CLASS,BLDG_DESC,YR_CONSTR,CALC_ACRE,LAND_DESC,BLDG_CLASS,DWELL"
while True:
    p = {"where": "1=1", "geometry": f"{W},{S},{E},{N}", "geometryType": "esriGeometryEnvelope", "inSR": 4326, "spatialRel": "esriSpatialRelIntersects",
         "outFields": fields, "outSR": 4326, "f": "json", "resultOffset": off, "resultRecordCount": 1000, "orderByFields": "OBJECTID", "maxAllowableOffset": 0.000004, "geometryPrecision": 6}
    j = None
    for a in range(5):
        try: j = requests.get(URL, params=p, headers=UA, timeout=180).json(); break
        except Exception as ex: say("retry", type(ex).__name__); time.sleep(6)
    if j is None or "features" not in j: say("failed at offset", off, str(j)[:300]); break
    fs = j["features"]
    for f in fs:
        at = f["attributes"]; g = f.get("geometry") or {}
        rings = []
        for r in g.get("rings", [])[:1]:  # outer ring only
            rings.append([c for xy in r for c in (xy[1], xy[0])])
        out.append([at.get("PAMS_PIN"), (at.get("PROP_LOC") or "").strip(), at.get("PROP_CLASS"), (at.get("BLDG_DESC") or "").strip(), at.get("YR_CONSTR"), at.get("CALC_ACRE"), (at.get("LAND_DESC") or "").strip(), rings[0] if rings else []])
    off += len(fs); say("parcels", len(out))
    if not fs or not j.get("exceededTransferLimit"): break
with gzip.open(os.path.join(RAW, "parcels.json.gz"), "wt") as f: json.dump(out, f, separators=(",", ":"))
say("done", len(out), os.path.getsize(os.path.join(RAW, "parcels.json.gz")), "bytes")
