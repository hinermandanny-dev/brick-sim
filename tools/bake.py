"""Bake raw OSM + DEM (data branch) into game tiles for site/data.
usage: python3 tools/bake.py RAW_DIR OUT_DIR
Coordinates: local metres, x east, z south (three.js: -z is north), origin at bbox centre.
Ints are decimetres to keep the JSON small."""
import sys, os, json, gzip, math, base64, random, hashlib, re
import numpy as np
from PIL import Image, ImageDraw
RAW, OUT = sys.argv[1], sys.argv[2]
os.makedirs(os.path.join(OUT, "tiles"), exist_ok=True)
TS = 400.0                      # tile size, m
DS = 8.0                        # dem spacing in tiles, m
def L(n):
    with gzip.open(os.path.join(RAW, n + ".json.gz"), "rt", encoding="utf-8") as f:
        return json.load(f)["elements"]
bb = json.load(open(os.path.join(RAW, "bbox.json")))
LAT0, LON0 = (bb["S"] + bb["N"]) / 2, (bb["W"] + bb["E"]) / 2
KX = 111320.0 * math.cos(math.radians(LAT0)); KZ = 110574.0
def P(lat, lon): return ((lon - LON0) * KX, (LAT0 - lat) * KZ)
X0, Z0 = P(bb["N"], bb["W"]); X1, Z1 = P(bb["S"], bb["E"])
def D(v): return int(round(v * 10))
def tkey(x, z): return (int(math.floor(x / TS)), int(math.floor(z / TS)))
tiles = {}
TI0, TJ0 = int(math.floor(X0 / TS)), int(math.floor(Z0 / TS)); TI1, TJ1 = int(math.floor(X1 / TS)), int(math.floor(Z1 / TS))
class _Sink(dict):
    def __getitem__(self, k): return []
_sink = {"roads": [], "foot": [], "bld": [], "areas": [], "props": [], "trees": [], "lines": [], "labels": []}
def T(k):
    if not (TI0 <= k[0] <= TI1 and TJ0 <= k[1] <= TJ1): return {kk: [] for kk in _sink}
    if k not in tiles:
        tiles[k] = {"roads": [], "foot": [], "bld": [], "areas": [], "props": [], "trees": [], "lines": [], "labels": []}
    return tiles[k]
def h32(s): return int(hashlib.md5(str(s).encode()).hexdigest()[:8], 16)

# ---------------- DEM ----------------
dm = json.load(open(os.path.join(RAW, "dem.json")))
dem = np.load(os.path.join(RAW, "dem.npy")).astype(np.float32)
H, W = dem.shape
if dm.get("proj") == "latlon":
    def dem_ij(lat, lon): return ((dm["N"] - lat) / (dm["N"] - dm["S"]) * (H - 1), (lon - dm["W"]) / (dm["E"] - dm["W"]) * (W - 1))
else:
    z = dm["z"]
    def dem_ij(lat, lon):
        r = math.radians(lat)
        tx = (lon + 180) / 360 * 2 ** z; ty = (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2 ** z
        return ((ty - dm["y0"]) * 256, (tx - dm["x0"]) * 256)
def XtoLL(x, z): return (LAT0 - z / KZ, LON0 + x / KX)

# ---------------- ways ----------------
DRIVE = {"motorway": (65, 2, 3.7), "trunk": (55, 2, 3.6), "primary": (50, 2, 3.6), "secondary": (40, 1, 3.5), "tertiary": (35, 1, 3.4),
         "unclassified": (25, 1, 3.2), "residential": (25, 1, 3.1), "living_street": (15, 1, 3.0), "service": (15, 1, 2.9),
         "motorway_link": (40, 1, 3.7), "trunk_link": (35, 1, 3.6), "primary_link": (30, 1, 3.6), "secondary_link": (30, 1, 3.5),
         "tertiary_link": (25, 1, 3.4)}
FOOT = {"footway", "path", "cycleway", "pedestrian", "steps", "track", "bridleway", "corridor"}
def mph(v, d):
    if not v: return d
    m = re.match(r"(\d+)\s*(mph)?", v)
    if not m: return d
    return int(m.group(1)) if m.group(2) or True else d
hw = L("highways")
nodeuse = {}
for w in hw:
    t = w.get("tags", {}).get("highway")
    if t in DRIVE:
        for n in w["nodes"]: nodeuse[n] = nodeuse.get(n, 0) + 1
# graph nodes = ends + shared
gnodes = {}; gn = []
def gnode(nid, lat, lon):
    if nid not in gnodes:
        x, z = P(lat, lon); gnodes[nid] = len(gn); gn.append([D(x), D(z), 0])
    return gnodes[nid]
ways = []; edges = []
names = {}
for w in hw:
    tg = w.get("tags", {}); t = tg.get("highway")
    geom = w.get("geometry")
    if not geom: continue
    pts = [P(p["lat"], p["lon"]) for p in geom]
    if t in DRIVE:
        sp, ln, lw = DRIVE[t]
        if t == "service" and tg.get("service") in ("parking_aisle",): sp = 10
        if t == "service" and tg.get("service") == "driveway": sp = 8
        lanes = tg.get("lanes")
        try: lanes = int(float(lanes.split(";")[0]))
        except Exception: lanes = None
        ow = tg.get("oneway"); rb = tg.get("junction") in ("roundabout", "circular")
        oneway = 1 if (ow in ("yes", "true", "1") or rb or (t in ("motorway", "motorway_link") and ow != "no")) else (-1 if ow == "-1" else 0)
        if lanes is None: lanes = ln * (1 if oneway else 2)
        lf = tg.get("lanes:forward"); lb = tg.get("lanes:backward")
        try: lf = int(lf); lb = int(lb)
        except Exception:
            if oneway: lf, lb = lanes, 0
            else: lf = max(1, lanes // 2); lb = max(1, lanes - lf)
        if oneway == -1: lf, lb = lb, lf
        width = float(tg.get("width", "0").split()[0] or 0) if re.match(r"^[\d.]+", tg.get("width", "")) else 0
        if not width: width = (lf + lb) * lw + (1.0 if t in ("residential", "unclassified", "service", "living_street") else 2.4)
        sw = tg.get("sidewalk") or tg.get("sidewalk:both") or ""
        if not sw:
            l_ = tg.get("sidewalk:left"); r_ = tg.get("sidewalk:right")
            sw = "both" if (l_ == "yes" and r_ == "yes") else "left" if l_ == "yes" else "right" if r_ == "yes" else ""
        if not sw: sw = "both" if t in ("primary", "secondary") and tg.get("ref", "").startswith("") and False else "?"
        name = tg.get("name", ""); ref = tg.get("ref", "")
        wi = len(ways)
        ways.append({"t": t, "n": name, "r": ref, "lf": lf, "lb": lb, "o": 1 if oneway else 0, "s": mph(tg.get("maxspeed"), sp),
                     "w": round(width, 1), "sw": sw, "br": 1 if tg.get("bridge") not in (None, "no") else 0,
                     "tl": tg.get("turn:lanes:forward") or tg.get("turn:lanes") or "", "sv": tg.get("service", ""),
                     "id": w["id"], "rb": 1 if rb else 0})
        if name: names.setdefault(name, 0); names[name] += 1
        # split into edges at graph nodes
        nds = w["nodes"]; cur = [0]
        for i in range(1, len(nds)):
            cur.append(i)
            if i == len(nds) - 1 or nodeuse.get(nds[i], 0) > 1:
                a = gnode(nds[cur[0]], geom[cur[0]]["lat"], geom[cur[0]]["lon"])
                b = gnode(nds[cur[-1]], geom[cur[-1]]["lat"], geom[cur[-1]]["lon"])
                poly = []
                for c in cur: poly += [D(pts[c][0]), D(pts[c][1])]
                ei = len(edges); edges.append([a, b, wi, poly, nds[cur[0]], nds[cur[-1]]])
                mx = sum(poly[0::2]) / len(cur) / 10; mz = sum(poly[1::2]) / len(cur) / 10
                T(tkey(mx, mz))["roads"].append(ei)
                cur = [i]
    elif t in FOOT or (t == "footway"):
        fw = tg.get("footway", "")
        poly = []
        for x, z in pts: poly += [D(x), D(z)]
        kind = "sw" if fw == "sidewalk" else "cx" if fw == "crossing" else t
        mx = sum(p[0] for p in pts) / len(pts); mz = sum(p[1] for p in pts) / len(pts)
        T(tkey(mx, mz))["foot"].append({"k": kind, "p": poly, "br": 1 if tg.get("bridge") not in (None, "no") else 0,
                                         "s": tg.get("surface", "")})
print("ways", len(ways), "edges", len(edges), "gnodes", len(gn))

# ---------------- nodes (controls/props) ----------------
nodes = L("nodes")
osm2g = gnodes
PROPK = []
for n in nodes:
    tg = n.get("tags", {}); x, z = P(n["lat"], n["lon"])
    k = None; extra = {}
    hwt = tg.get("highway")
    if hwt == "traffic_signals": k = "signal"
    elif hwt == "stop": k = "stop"; extra["all"] = 1 if tg.get("stop") == "all" else 0
    elif hwt == "give_way": k = "yield"
    elif hwt == "crossing": k = "crosswalk"
    elif hwt == "street_lamp": k = "lamp"
    elif hwt == "bus_stop": k = "busstop"; extra["n"] = tg.get("name", "")
    elif hwt == "speed_camera": k = None
    elif tg.get("power") in ("pole", "tower"): k = "pole"
    elif tg.get("emergency") == "fire_hydrant": k = "hydrant"
    elif tg.get("amenity") in ("bench",): k = "bench"
    elif tg.get("amenity") in ("waste_basket", "recycling"): k = "bin"
    elif tg.get("amenity") == "bicycle_parking": k = "bikerack"
    elif tg.get("amenity") == "fuel": k = None
    elif tg.get("natural") == "tree": k = "tree"
    elif tg.get("man_made") == "flagpole": k = "flag"
    elif tg.get("entrance") or tg.get("amenity") == "loading_dock": k = "door_service" if (tg.get("entrance") in ("service", "emergency", "exit") or tg.get("amenity") == "loading_dock") else "door_main"
    elif tg.get("barrier") in ("bollard",): k = "bollard"
    elif tg.get("amenity") == "post_box": k = "postbox"
    elif tg.get("traffic_sign"): k = None
    if k:
        g = osm2g.get(n["id"])
        if g is not None:
            fl = {"signal": 1, "stop": 2, "yield": 4, "crosswalk": 8}.get(k, 0)
            if k == "stop" and extra.get("all"): fl |= 16
            gn[g][2] |= fl
        if k == "tree":
            T(tkey(x, z))["trees"].append([D(x), D(z), 1 + (h32(n["id"]) % 3)]); continue
        pr = [k, D(x), D(z)]
        if extra.get("n"): pr.append(extra["n"])
        T(tkey(x, z))["props"].append(pr)
    nm = tg.get("name")
    if nm and (tg.get("shop") or tg.get("amenity") or tg.get("place") or tg.get("leisure") or tg.get("tourism") or tg.get("office") or tg.get("healthcare")):
        T(tkey(x, z))["labels"].append([nm, D(x), D(z), tg.get("shop") or tg.get("amenity") or tg.get("place") or tg.get("leisure") or tg.get("tourism") or "poi"])

# signals are often mapped on approach nodes, not the junction: attach to nearest gnode within 25 m
gxz = np.array([[g[0] / 10, g[1] / 10] for g in gn]) if gn else np.zeros((0, 2))
for n in nodes:
    tg = n.get("tags", {})
    if tg.get("highway") in ("traffic_signals", "stop") and n["id"] not in osm2g and len(gxz):
        x, z = P(n["lat"], n["lon"]); d = np.hypot(gxz[:, 0] - x, gxz[:, 1] - z); i = int(d.argmin())
        if d[i] < 25:
            if tg["highway"] == "traffic_signals": gn[i][2] |= 32   # signal nearby (approach-mapped)
            else: gn[i][2] |= 64                                     # stop on an approach

# ---------------- restrictions (optional file) ----------------
restr = []
if os.path.exists(os.path.join(RAW, "restr.json.gz")):
    wayidx = {}
    for i, w in enumerate(ways): wayidx[w["id"]] = i
    for r in L("restr"):
        tg = r.get("tags", {}); rr = tg.get("restriction") or tg.get("restriction:motorcar")
        if not rr: continue
        fr = [m for m in r["members"] if m["role"] == "from" and m["type"] == "way"]
        to = [m for m in r["members"] if m["role"] == "to" and m["type"] == "way"]
        via = [m for m in r["members"] if m["role"] == "via" and m["type"] == "node"]
        if fr and to and via and fr[0]["ref"] in wayidx and to[0]["ref"] in wayidx and via[0]["ref"] in osm2g:
            restr.append([wayidx[fr[0]["ref"]], osm2g[via[0]["ref"]], wayidx[to[0]["ref"]], 1 if rr.startswith("only") else 0, rr])
print("restrictions", len(restr))

# ---------------- buildings ----------------
def rings_of(el):
    if el["type"] == "way":
        g = el.get("geometry") or []
        return [[P(p["lat"], p["lon"]) for p in g]], []
    outs, ins = [], []
    for m in el.get("members", []):
        g = m.get("geometry") or []
        if len(g) < 3: continue
        r = [P(p["lat"], p["lon"]) for p in g]
        (outs if m.get("role") != "inner" else ins).append(r)
    return outs, ins
def area(r):
    a = 0
    for i in range(len(r)):
        x1, z1 = r[i]; x2, z2 = r[(i + 1) % len(r)]; a += x1 * z2 - x2 * z1
    return a / 2
def num(v):
    try: return float(str(v).split()[0].replace(",", "."))
    except Exception: return None
RES = {"house", "detached", "residential", "semidetached_house", "bungalow", "terrace", "yes", "garage", "shed", "cabin", "static_caravan"}
blds = L("buildings"); walmart = None; nb = 0; bpolys = []
# Microsoft footprints fill the houses OSM has not mapped yet (dropped where an OSM building already stands)
if os.path.exists(os.path.join(RAW, "msbuildings.json.gz")):
    cell = {}
    def ckey(x, z): return (int(x // 20), int(z // 20))
    for el in blds:
        if el.get("type") != "way" or not el.get("geometry"): continue
        r = [P(p["lat"], p["lon"]) for p in el["geometry"]]
        xs = [p[0] for p in r]; zs = [p[1] for p in r]
        for i in range(int(min(xs) // 20), int(max(xs) // 20) + 1):
            for j in range(int(min(zs) // 20), int(max(zs) // 20) + 1): cell.setdefault((i, j), []).append(r)
    def inside(x, z, r):
        c = False; n = len(r)
        for i in range(n):
            x1, z1 = r[i]; x2, z2 = r[i - 1]
            if (z1 > z) != (z2 > z) and x < (x2 - x1) * (z - z1) / (z2 - z1) + x1: c = not c
        return c
    added = 0
    for el in L("msbuildings"):
        r = [P(p["lat"], p["lon"]) for p in el["geometry"]]
        cx = sum(p[0] for p in r) / len(r); cz = sum(p[1] for p in r) / len(r)
        if any(inside(cx, cz, o) for o in cell.get(ckey(cx, cz), [])): continue
        if any(inside(px, pz, o) for px, pz in r[:-1] for o in cell.get(ckey(px, pz), [])): continue
        blds.append(el); added += 1
    print("microsoft buildings added", added)
for el in blds:
    tg = el.get("tags", {}); outs, ins = rings_of(el)
    for r in outs:
        if len(r) < 4: continue
        if r[0] == r[-1]: r = r[:-1]
        a = abs(area(r))
        if a < 6: continue
        bt = tg.get("building", tg.get("building:part", "yes"))
        lv = num(tg.get("building:levels")); h = num(tg.get("height"))
        roof = tg.get("roof:shape", "")
        kind = "res" if bt in RES and a < 450 else "com"
        if bt in ("garage", "shed", "carport") or (bt == "yes" and a < 40): kind = "small"
        if bt in ("school", "church", "retail", "commercial", "industrial", "warehouse", "supermarket", "office", "hospital", "public", "civic", "apartments", "hotel", "university", "college", "kindergarten"): kind = bt if bt != "yes" else kind
        if h is None:
            if lv: h = lv * 3.0 + (0.4 if kind == "res" else 1.0)
            elif kind == "res":
                rnd = h32(el["id"]) % 100
                h = 3.0 if a < 120 or rnd < 45 else 5.6       # ranch vs two-storey
            elif kind == "small": h = 2.6
            elif kind == "apartments": h = 9.0
            elif kind in ("church",): h = 9.0
            elif kind in ("school",): h = 7.0 if a > 3000 else 4.5
            elif a > 9000: h = 8.5
            else: h = 5.0 + min(2.5, a / 2000)
        if a > 3000 and kind not in ("res", "small") and h < 7.5: h = 7.5 + min(2.0, a / 20000)   # one-storey big boxes are still 8-9 m tall
        if not roof:
            roof = "gable" if kind in ("res",) and a < 450 else ("gable" if kind == "small" and a < 60 else "flat")
            if kind == "church": roof = "gable"
        cx = sum(p[0] for p in r) / len(r); cz = sum(p[1] for p in r) / len(r)
        poly = []
        for x, z in r: poly += [D(x), D(z)]
        b = {"p": poly, "h": round(h, 1), "r": roof, "k": kind, "id": el["id"] % 100000}
        nm = tg.get("name") or ""
        if nm: b["n"] = nm
        hs = tg.get("addr:housenumber");
        if hs: b["a"] = hs + " " + tg.get("addr:street", "")
        T(tkey(cx, cz))["bld"].append(b); nb += 1
        bpolys.append((r, h, kind))
        brand = (tg.get("brand") or "") + (tg.get("name") or "")
        if "Walmart" in brand and a > 8000:
            walmart = {"poly": poly, "a": a, "name": nm}
print("buildings", nb, "walmart" if walmart else "NO walmart footprint")

# ---------------- areas ----------------
AK = {
 ("natural", "water"): "water", ("natural", "bay"): "water", ("water", None): "water", ("waterway", "riverbank"): "water", ("landuse", "reservoir"): "water", ("landuse", "basin"): "water",
 ("natural", "wetland"): "wetland", ("natural", "wood"): "wood", ("landuse", "forest"): "wood", ("natural", "scrub"): "scrub", ("natural", "heath"): "scrub",
 ("natural", "beach"): "sand", ("natural", "sand"): "sand", ("leisure", "park"): "park", ("leisure", "pitch"): "pitch", ("leisure", "golf_course"): "golf",
 ("leisure", "playground"): "play", ("leisure", "sports_centre"): "park", ("leisure", "nature_reserve"): None, ("leisure", "marina"): None,
 ("landuse", "grass"): "grass", ("landuse", "meadow"): "grass", ("landuse", "recreation_ground"): "grass", ("landuse", "cemetery"): "cemetery",
 ("amenity", "parking"): "parking", ("amenity", "school"): "school", ("landuse", "residential"): "res", ("landuse", "commercial"): "com", ("landuse", "retail"): "com",
 ("landuse", "industrial"): "ind", ("leisure", "track"): "track", ("amenity", "fuel"): "fuel", ("landuse", "farmland"): "farm", ("natural", "grassland"): "grass",
 ("leisure", "swimming_pool"): "pool", ("man_made", "pier"): "pier", ("landuse", "construction"): "dirt", ("area:highway", None): "asphalt", ("leisure", "garden"): "grass",
 ("landuse", "village_green"): "grass", ("amenity", "grave_yard"): "cemetery", ("natural", "coastline"): None, ("leisure", "dog_park"): "grass", ("landuse", "brownfield"): "dirt"}
def akind(tg):
    for (k, v), kd in AK.items():
        if k in tg and (v is None or tg[k] == v): return kd
    return None
ORDER = {"res": 0, "com": 0, "ind": 0, "school": 1, "farm": 1, "wood": 2, "scrub": 2, "grass": 3, "park": 3, "golf": 3, "cemetery": 3, "wetland": 4, "sand": 4, "dirt": 4,
         "pitch": 5, "track": 5, "play": 5, "fuel": 6, "parking": 6, "asphalt": 6, "water": 7, "pool": 8, "pier": 9}
def clip(poly, x0, z0, x1, z1):
    def cl(pts, inside, inter):
        out = []
        for i in range(len(pts)):
            a, b = pts[i - 1], pts[i]
            ia, ib = inside(a), inside(b)
            if ib:
                if not ia: out.append(inter(a, b))
                out.append(b)
            elif ia: out.append(inter(a, b))
        return out
    def ix(a, b, x): t = (x - a[0]) / (b[0] - a[0]); return (x, a[1] + t * (b[1] - a[1]))
    def iz(a, b, z): t = (z - a[1]) / (b[1] - a[1]); return (a[0] + t * (b[0] - a[0]), z)
    p = poly
    p = cl(p, lambda q: q[0] >= x0, lambda a, b: ix(a, b, x0)) if p else p
    p = cl(p, lambda q: q[0] <= x1, lambda a, b: ix(a, b, x1)) if p else p
    p = cl(p, lambda q: q[1] >= z0, lambda a, b: iz(a, b, z0)) if p else p
    p = cl(p, lambda q: q[1] <= z1, lambda a, b: iz(a, b, z1)) if p else p
    return p
water_polys = []; area_polys = []; area_labels = []
for el in L("areas") + L("rels"):
    tg = el.get("tags", {}); kd = akind(tg)
    if not kd: continue
    outs, ins = rings_of(el)
    nm = tg.get("name")
    if nm and outs and len(outs[0]) >= 3 and kd not in ("res", "com", "ind"):
        r0 = outs[0]; cx_ = sum(p[0] for p in r0) / len(r0); cz_ = sum(p[1] for p in r0) / len(r0)
        area_labels.append([nm, D(cx_), D(cz_), tg.get("amenity") or tg.get("leisure") or tg.get("natural") or tg.get("landuse") or kd])
    for r in outs:
        if len(r) < 3: continue
        if kd == "water": water_polys.append(r)
        area_polys.append((kd, r, [h for h in ins]))
print("areas", len(area_polys))
for kd, r, ins in area_polys:
    xs = [p[0] for p in r]; zs = [p[1] for p in r]
    i0, j0 = tkey(min(xs), min(zs)); i1, j1 = tkey(max(xs), max(zs))
    big = (i0 != i1 or j0 != j1)
    i0 = max(i0, TI0); j0 = max(j0, TJ0); i1 = min(i1, TI1); j1 = min(j1, TJ1)   # never build tiles outside the map box
    for i in range(i0, i1 + 1):
        for j in range(j0, j1 + 1):
            x0, z0 = i * TS, j * TS
            c = clip(r, x0, z0, x0 + TS, z0 + TS) if big else r
            if len(c) < 3 or abs(area(c)) < 1: continue
            holes = []
            for hr in ins:
                hc = clip(hr, x0, z0, x0 + TS, z0 + TS) if big else hr
                if len(hc) >= 3: holes.append([v for q in hc for v in (D(q[0]), D(q[1]))])
            T((i, j))["areas"].append({"k": kd, "o": ORDER.get(kd, 0), "p": [v for q in c for v in (D(q[0]), D(q[1]))], "h": holes})

# ---------------- lines (fences, rails, power) ----------------
for el in L("lines"):
    tg = el.get("tags", {}); g = el.get("geometry") or []
    if len(g) < 2: continue
    k = None
    b = tg.get("barrier")
    if b in ("fence", "wall", "hedge", "guard_rail", "retaining_wall", "jersey_barrier", "kerb"): k = b
    elif tg.get("railway") in ("rail", "abandoned", "disused"): k = "rail"
    elif tg.get("power") in ("line", "minor_line"): k = "power"
    elif tg.get("natural") == "coastline": k = "coast"
    if not k: continue
    pts = [P(p["lat"], p["lon"]) for p in g]
    # split long lines per tile by segment midpoint chunks
    chunk = [pts[0]]; ck = tkey(*pts[0])
    for q in pts[1:]:
        chunk.append(q); kq = tkey(*q)
        if kq != ck or len(chunk) > 40:
            T(ck)["lines"].append([k, [v for c in chunk for v in (D(c[0]), D(c[1]))]]); chunk = [q]; ck = kq
    if len(chunk) > 1: T(ck)["lines"].append([k, [v for c in chunk for v in (D(c[0]), D(c[1]))]])

# ---------------- carve water into DEM grid used for tiles ----------------
gx0 = math.floor(X0 / TS) * TS; gz0 = math.floor(Z0 / TS) * TS
gx1 = math.ceil(X1 / TS) * TS; gz1 = math.ceil(Z1 / TS) * TS
NX = int((gx1 - gx0) / DS) + 1; NZ = int((gz1 - gz0) / DS) + 1
xs = gx0 + np.arange(NX) * DS; zs = gz0 + np.arange(NZ) * DS
LAT = LAT0 - zs / KZ; LON = LON0 + xs / KX
def sample_grid():
    out = np.zeros((NZ, NX), np.float32)
    for jj in range(NZ):
        ii_r = [dem_ij(LAT[jj], lo) for lo in LON]
        r = np.array([a for a, b in ii_r]); c = np.array([b for a, b in ii_r])
        r = np.clip(r, 0, H - 1.001); c = np.clip(c, 0, W - 1.001)
        r0 = r.astype(int); c0 = c.astype(int); fr = r - r0; fc = c - c0
        v = (dem[r0, c0] * (1 - fr) * (1 - fc) + dem[r0 + 1, c0] * fr * (1 - fc) + dem[r0, c0 + 1] * (1 - fr) * fc + dem[r0 + 1, c0 + 1] * fr * fc)
        out[jj] = v
    return out
G = sample_grid()
G = np.nan_to_num(G, nan=0.0)
img = Image.new("L", (NX, NZ), 0); dr = ImageDraw.Draw(img)
for r in water_polys:
    dr.polygon([((x - gx0) / DS, (z - gz0) / DS) for x, z in r], fill=255)
wm = np.asarray(img) > 0
# land islands inside water: buildings / non-water areas punched back (holes are handled by area polys visually)
G = np.where(wm, np.minimum(G, -1.2), np.maximum(G, 0.25))
# smooth small DEM noise (1 pass 3x3) on land only
Gs = G.copy(); Gs[1:-1, 1:-1] = (G[:-2, :-2] + G[:-2, 1:-1] + G[:-2, 2:] + G[1:-1, :-2] + G[1:-1, 1:-1] * 2 + G[1:-1, 2:] + G[2:, :-2] + G[2:, 1:-1] + G[2:, 2:]) / 10
G = np.where(wm, G, Gs)
print("dem grid", NX, NZ, round(float(G.min()), 1), round(float(G.max()), 1))
# flatten under roads a touch: handled client-side by draping

# ---------------- procedural trees (masks) ----------------
rng = random.Random(1977)
TREE_DENS = {"wood": 1 / 45, "scrub": 1 / 90, "wetland": 1 / 220, "res": 1 / 330, "park": 1 / 300, "cemetery": 1 / 400, "school": 1 / 1500, "golf": 1 / 700, "grass": 1 / 1200, "com": 1 / 2500, "ind": 1 / 3000, "farm": 1 / 6000}
for k, t in list(tiles.items()):
    x0, z0 = k[0] * TS, k[1] * TS
    m = Image.new("L", (400, 400), 0); d = ImageDraw.Draw(m)          # 1 m mask: 0 free, 255 blocked
    lu = Image.new("L", (400, 400), 0); dl = ImageDraw.Draw(lu)        # landuse code
    codes = {kd: i + 1 for i, kd in enumerate(TREE_DENS)}
    for a in sorted(t["areas"], key=lambda a: a["o"]):
        pts = [((a["p"][i] / 10 - x0), (a["p"][i + 1] / 10 - z0)) for i in range(0, len(a["p"]), 2)]
        if a["k"] in codes: dl.polygon(pts, fill=codes[a["k"]])
        if a["k"] in ("water", "parking", "asphalt", "pitch", "track", "fuel", "pool", "sand", "pier", "play"): d.polygon(pts, fill=255)
    for b in t["bld"]:
        pts = [((b["p"][i] / 10 - x0), (b["p"][i + 1] / 10 - z0)) for i in range(0, len(b["p"]), 2)]
        d.polygon(pts, fill=255, outline=255); 
        cx = sum(p[0] for p in pts) / len(pts); cz = sum(p[1] for p in pts) / len(pts)
        d.polygon([(cx + (p[0] - cx) * 1.25, cz + (p[1] - cz) * 1.25) for p in pts], fill=255)
    for ei in t["roads"]:
        e = edges[ei]; w = ways[e[2]]["w"]
        pts = [((e[3][i] / 10 - x0), (e[3][i + 1] / 10 - z0)) for i in range(0, len(e[3]), 2)]
        d.line(pts, fill=255, width=int(w + 5))
    for f in t["foot"]:
        pts = [((f["p"][i] / 10 - x0), (f["p"][i + 1] / 10 - z0)) for i in range(0, len(f["p"]), 2)]
        d.line(pts, fill=255, width=3)
    M = np.asarray(m); LU = np.asarray(lu)
    inv = {v: k2 for k2, v in codes.items()}
    tries = 900
    for _ in range(tries):
        px, pz = rng.random() * 399, rng.random() * 399
        if M[int(pz), int(px)]: continue
        code = LU[int(pz), int(px)]
        kd = inv.get(code)
        dens = TREE_DENS.get(kd, 1 / 4000)
        if rng.random() < dens * (TS * TS / tries):
            gx = (x0 + px - gx0) / DS; gz = (z0 + pz - gz0) / DS
            if 0 <= gz < NZ and 0 <= gx < NX and wm[int(gz), int(gx)]: continue
            sp = 1 if (kd in ("wood", "scrub", "wetland") and rng.random() < 0.65) else (2 if rng.random() < 0.7 else 3)  # 1 pitch pine, 2 oak/maple, 3 small
            t["trees"].append([D(x0 + px), D(z0 + pz), sp])
# make sure every land tile exists (terrain everywhere)
for i in range(int(gx0 / TS), int(gx1 / TS)):
    for j in range(int(gz0 / TS), int(gz1 / TS)): T((i, j))

# ---------------- write tiles ----------------
n = int(TS / DS) + 1
for (i, j), t in tiles.items():
    ox = int(round((i * TS - gx0) / DS)); oz = int(round((j * TS - gz0) / DS))
    rows = np.clip(oz + np.arange(n), 0, NZ - 1); cols = np.clip(ox + np.arange(n), 0, NX - 1)  # edge tiles repeat the border
    sub = G[np.ix_(rows, cols)]
    t["dem"] = base64.b64encode(np.round(sub * 10).astype("<i2").tobytes()).decode()
    t["water"] = 1 if wm[np.ix_(rows, cols)].any() else 0
    with open(os.path.join(OUT, "tiles", f"{i}_{j}.json"), "w") as f:
        json.dump(t, f, separators=(",", ":"))
# ---------------- addresses (public OSM data; used to find a home by street address) ----------------
addr = []
try:
    for el in L("addr"):
        tg = el.get("tags", {}); n = tg.get("addr:housenumber"); st = tg.get("addr:street")
        if not n or not st: continue
        if el["type"] == "node": lat, lon = el["lat"], el["lon"]
        elif "center" in el: lat, lon = el["center"]["lat"], el["center"]["lon"]
        else: continue
        x, z = P(lat, lon); addr.append([n, st, D(x), D(z)])
except Exception as ex:
    print("addr skipped", ex)
if os.path.exists(os.path.join(RAW, "addrpoints.json.gz")):
    with gzip.open(os.path.join(RAW, "addrpoints.json.gz"), "rt") as f: ap = json.load(f)
    for num, st, lat, lon, muni in ap:
        x, z = P(lat, lon); addr.append([num, st.title(), D(x), D(z)])
    print("nj address points merged", len(ap))
json.dump(addr, open(os.path.join(OUT, "addr.json"), "w"), separators=(",", ":"))
print("addresses", len(addr))
# ---------------- bus routes: tag the ways NJ Transit buses run on ----------------
try:
    wid = {w["id"]: i for i, w in enumerate(ways)}; nbus = 0
    for r in L("rels"):
        tg = r.get("tags", {})
        if tg.get("type") == "route" and tg.get("route") == "bus":
            ref = tg.get("ref") or tg.get("name", "bus")
            for m in r.get("members", []):
                if m.get("type") == "way" and m.get("ref") in wid: ways[wid[m["ref"]]]["bus"] = ref[:12]; nbus += 1
    print("bus route ways", nbus)
except Exception as ex:
    print("bus routes skipped", ex)
# ---------------- graph + meta ----------------
json.dump({"nodes": gn, "edges": [e[:4] for e in edges], "ways": ways, "restr": restr}, open(os.path.join(OUT, "roads.json"), "w"), separators=(",", ":"))
pois = []
for (i, j), t in tiles.items():
    for b in t["bld"]:
        if b.get("n"):
            cx = sum(b["p"][0::2]) / len(b["p"]) * 2 / 10; cz = sum(b["p"][1::2]) / len(b["p"]) * 2 / 10
            pois.append([b["n"], D(cx), D(cz), b["k"]])
    for l in t["labels"]: pois.append(l)
for l in area_labels:
    if X0 <= l[1] / 10 <= X1 and Z0 <= l[2] / 10 <= Z1: pois.append(l)
np.round(G * 10).astype("<i2").tofile(os.path.join(OUT, "dem.bin"))   # the whole 8 m grid: heights never depend on which tiles are loaded
json.dump({"demNX": NX, "demNZ": NZ, "lat0": LAT0, "lon0": LON0, "kx": KX, "kz": KZ, "ts": TS, "ds": DS, "gx0": gx0, "gz0": gz0, "gx1": gx1, "gz1": gz1,
           "tiles": sorted([f"{i}_{j}" for (i, j) in tiles]), "walmart": walmart, "pois": pois, "demsrc": dm.get("src")},
          open(os.path.join(OUT, "meta.json"), "w"), separators=(",", ":"))
tot = sum(os.path.getsize(os.path.join(OUT, "tiles", f)) for f in os.listdir(os.path.join(OUT, "tiles")))
print("tiles", len(tiles), "bytes", tot, "pois", len(pois))
