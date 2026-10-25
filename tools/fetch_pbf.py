"""Build the same raw files as fetch.py from the Geofabrik New Jersey extract (no Overpass).
usage: python tools/fetch_pbf.py nj.osm.pbf OUT [S W N E]   (bbox optional; default = Brick Township boundary from OSM)
Writes OUT/{boundary,highways,buildings,areas,lines,nodes,addr,rels,restr}.json.gz in Overpass JSON shape, bbox.json, fetch-log.txt.
The DEM step is shared with fetch.py (run fetch.py --dem-only afterwards)."""
import sys, os, json, gzip
import osmium
PBF, OUT = sys.argv[1], sys.argv[2]; os.makedirs(OUT, exist_ok=True)
log = open(os.path.join(OUT, "fetch-log.txt"), "a")
def say(*a): print(*a, flush=True); log.write(" ".join(map(str, a)) + "\n"); log.flush()
bbox = [float(x) for x in sys.argv[3:7]] if len(sys.argv) >= 7 else None

# pass 1: find Brick's boundary relation (if no bbox given)
if not bbox:
    class B(osmium.SimpleHandler):
        def __init__(s): super().__init__(); s.ways = None
        def area(s, a):
            t = a.tags
            if t.get("boundary") == "administrative" and t.get("admin_level") == "8" and t.get("name") in ("Brick Township", "Brick"):
                lats, lons = [], []
                for r in a.outer_rings():
                    for n in r: lats.append(n.lat); lons.append(n.lon)
                s.ways = (min(lats), min(lons), max(lats), max(lons))
    b = B(); b.apply_file(PBF, locations=True)
    if not b.ways: raise SystemExit("Brick boundary not found")
    pad = .004; bbox = [b.ways[0] - pad, b.ways[1] - pad, b.ways[2] + pad, b.ways[3] + pad]
S, W, N, E = bbox
json.dump({"S": S, "W": W, "N": N, "E": E}, open(os.path.join(OUT, "bbox.json"), "w")); say("bbox", bbox)
inb = lambda lat, lon: S <= lat <= N and W <= lon <= E
DRIVE_OR_FOOT = True
out = {k: [] for k in ("highways", "buildings", "areas", "lines", "nodes", "addr", "rels", "restr")}
AREA_KEYS = ("landuse", "natural", "leisure", "amenity", "waterway", "water", "man_made", "place", "area:highway", "shop", "tourism")
LINE_KEYS = ("barrier", "railway", "power")
class H(osmium.SimpleHandler):
    def __init__(s): super().__init__()
    def node(s, n):
        if not n.location.valid() or not inb(n.location.lat, n.location.lon): return
        t = dict(n.tags)
        if not t: return
        el = {"type": "node", "id": n.id, "lat": n.location.lat, "lon": n.location.lon, "tags": t}
        if "addr:housenumber" in t: out["addr"].append(el)
        if any(k in t for k in ("natural", "highway", "amenity", "shop", "barrier", "man_made", "power", "leisure", "tourism", "entrance", "emergency", "advertising", "traffic_sign", "public_transport", "railway", "place", "office", "craft", "healthcare")): out["nodes"].append(el)
    def way(s, w):
        t = dict(w.tags)
        if not t: return
        try: geom = [{"lat": n.location.lat, "lon": n.location.lon} for n in w.nodes]
        except osmium.InvalidLocationError: return
        if not any(inb(g["lat"], g["lon"]) for g in geom): return
        el = {"type": "way", "id": w.id, "nodes": [n.ref for n in w.nodes], "geometry": geom, "tags": t}
        if "highway" in t: out["highways"].append(el)
        if "building" in t or "building:part" in t: out["buildings"].append(el)
        elif any(k in t for k in AREA_KEYS): out["areas"].append(el)
        if any(k in t for k in LINE_KEYS) or t.get("natural") == "coastline": out["lines"].append(el)
        if "addr:housenumber" in t:
            la = sum(g["lat"] for g in geom) / len(geom); lo = sum(g["lon"] for g in geom) / len(geom)
            out["addr"].append({"type": "way", "id": w.id, "center": {"lat": la, "lon": lo}, "tags": t})
    def relation(s, r):
        t = dict(r.tags)
        if t.get("type") == "restriction":
            out["restr"].append({"type": "relation", "id": r.id, "members": [{"type": {"n": "node", "w": "way", "r": "relation"}[m.type], "ref": m.ref, "role": m.role} for m in r.members], "tags": t})
        elif t.get("type") == "route" and t.get("route") in ("bus", "bicycle"):
            out["rels"].append({"type": "relation", "id": r.id, "members": [{"type": {"n": "node", "w": "way", "r": "relation"}[m.type], "ref": m.ref, "role": m.role} for m in r.members], "tags": t})
    def area(s, a):  # multipolygon relations only (closed ways are handled in way())
        if a.from_way(): return
        t = dict(a.tags)
        if not any(k in t for k in AREA_KEYS + ("building",)): return
        mem = []
        for o in a.outer_rings():
            g = [{"lat": n.lat, "lon": n.lon} for n in o]
            if any(inb(p["lat"], p["lon"]) for p in g) or True: mem.append({"type": "way", "role": "outer", "geometry": g})
            for i in a.inner_rings(o): mem.append({"type": "way", "role": "inner", "geometry": [{"lat": n.lat, "lon": n.lon} for n in i]})
        # keep only multipolygons that touch the box
        if not any(inb(p["lat"], p["lon"]) for m in mem for p in m["geometry"][:: max(1, len(m["geometry"]) // 50)]):
            lat0 = min(p["lat"] for m in mem for p in m["geometry"]); lat1 = max(p["lat"] for m in mem for p in m["geometry"])
            lon0 = min(p["lon"] for m in mem for p in m["geometry"]); lon1 = max(p["lon"] for m in mem for p in m["geometry"])
            if lat1 < S or lat0 > N or lon1 < W or lon0 > E: return
        el = {"type": "relation", "id": a.orig_id(), "members": mem, "tags": t}
        (out["buildings"] if "building" in t else out["rels"]).append(el)
H().apply_file(PBF, locations=True)
for k, v in out.items():
    with gzip.open(os.path.join(OUT, k + ".json.gz"), "wt", encoding="utf-8") as f: json.dump({"elements": v}, f, separators=(",", ":"))
    say(k, len(v))
with gzip.open(os.path.join(OUT, "boundary.json.gz"), "wt") as f: json.dump({"elements": []}, f)
