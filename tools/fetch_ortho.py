"""Real ground cover from the NJ 2020 natural-colour orthophotos (NJ Office of GIS, free; attribution requested).
Downloads the Web-Mercator cache tiles over the region box and resamples them onto the game's local metre grid
(x east, z south, origin at the box centre, the same frame as bake.py) at 1 m per pixel, saved as ortho.jpg.
bake.py classifies it (pavement / grass / trees / sand / water) per 400 m tile, so lots, lawns, driveways and
roof colours come from what is really there (Dan, 25 Oct: "a lot of grass by the Walmart that isn't there irl").
Usage: python tools/fetch_ortho.py RAWDIR   (RAWDIR holds bbox.json; writes ortho.jpg + ortho.json there)"""
import sys, os, json, math, io, time, concurrent.futures as cf
import numpy as np, requests
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
RAW = sys.argv[1]; Z = int(os.environ.get("ORTHO_Z", "17"))
URL = "https://maps.nj.gov/arcgis/rest/services/Basemap/Orthos_Natural_2020_NJ_WM/MapServer/tile/{z}/{y}/{x}"
bb = json.load(open(os.path.join(RAW, "bbox.json")))
LAT0, LON0 = (bb["S"] + bb["N"]) / 2, (bb["W"] + bb["E"]) / 2
KX = 111320.0 * math.cos(math.radians(LAT0)); KZ = 110574.0
def tilexy(lat, lon, z):
    n = 2 ** z; x = (lon + 180) / 360 * n; y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    return x, y
x0f, y0f = tilexy(bb["N"], bb["W"], Z); x1f, y1f = tilexy(bb["S"], bb["E"], Z)
TX0, TY0, TX1, TY1 = int(x0f), int(y0f), int(x1f), int(y1f)
nx, ny = TX1 - TX0 + 1, TY1 - TY0 + 1
print("ortho z", Z, "tiles", nx, "x", ny, "=", nx * ny, flush=True)
mosaic = np.zeros((ny * 256, nx * 256, 3), np.uint8); got = 0; miss = 0
S = requests.Session(); S.headers["User-Agent"] = "brick-sim (github.com/hinermandanny-dev/brick-sim) ground-cover bake"
def get(t):
    tx, ty = t
    for k in range(4):
        try:
            r = S.get(URL.format(z=Z, y=ty, x=tx), timeout=30)
            if r.status_code == 200 and len(r.content) > 100: return t, np.asarray(Image.open(io.BytesIO(r.content)).convert("RGB"))
            if r.status_code == 404: return t, None
        except Exception as e: pass
        time.sleep(1 + k * 2)
    return t, None
with cf.ThreadPoolExecutor(8) as ex:
    for (tx, ty), im in ex.map(get, [(x, y) for y in range(TY0, TY1 + 1) for x in range(TX0, TX1 + 1)]):
        if im is None: miss += 1; continue
        got += 1; mosaic[(ty - TY0) * 256:(ty - TY0 + 1) * 256, (tx - TX0) * 256:(tx - TX0 + 1) * 256] = im[:256, :256]
print("ortho tiles got", got, "missing", miss, flush=True)
# resample onto the local metre grid (1 m), covering the same extent bake.py uses (rounded out to 400 m tiles)
TS = 400
X0, Z0 = (bb["W"] - LON0) * KX, (LAT0 - bb["N"]) * KZ; X1, Z1 = (bb["E"] - LON0) * KX, (LAT0 - bb["S"]) * KZ
gx0 = math.floor(X0 / TS) * TS; gz0 = math.floor(Z0 / TS) * TS; gx1 = math.ceil(X1 / TS) * TS; gz1 = math.ceil(Z1 / TS) * TS
W, H = int(gx1 - gx0), int(gz1 - gz0)
out = np.zeros((H, W, 3), np.uint8)
n = 2 ** Z; lon = LON0 + (gx0 + np.arange(W) + .5) / KX; px = ((lon + 180) / 360 * n - TX0) * 256
for r0 in range(0, H, 500):
    zz = gz0 + np.arange(r0, min(H, r0 + 500)) + .5; lat = np.radians(LAT0 - zz / KZ)
    py = ((1 - np.log(np.tan(lat) + 1 / np.cos(lat)) / math.pi) / 2 * n - TY0) * 256
    PX, PY = np.meshgrid(px, py); ix = np.clip(PX.astype(int), 0, mosaic.shape[1] - 1); iy = np.clip(PY.astype(int), 0, mosaic.shape[0] - 1)
    out[r0:r0 + len(zz)] = mosaic[iy, ix]
Image.fromarray(out).save(os.path.join(RAW, "ortho.jpg"), quality=82, optimize=True)
json.dump({"gx0": gx0, "gz0": gz0, "w": W, "h": H, "mpp": 1, "z": Z, "src": "NJ OGIS 2020 natural colour orthophotos", "got": got, "miss": miss}, open(os.path.join(RAW, "ortho.json"), "w"))
# previews for checking the classifier by eye: 600 m crops around named spots (local metres)
os.makedirs(os.path.join(RAW, "preview"), exist_ok=True)
for name, x, z in json.loads(os.environ.get("ORTHO_PREVIEW", "[]")):
    c0, r0 = int(x - gx0 - 300), int(z - gz0 - 300)
    if 0 <= c0 and 0 <= r0 and c0 + 600 <= W and r0 + 600 <= H: Image.fromarray(out[r0:r0 + 600, c0:c0 + 600]).save(os.path.join(RAW, "preview", name + ".jpg"), quality=80)
print("ortho.jpg", W, "x", H, os.path.getsize(os.path.join(RAW, "ortho.jpg")) // 1024, "KB", flush=True)
