# Brick Sim: hand-off for the next session

Read this first. It says what exists, how it is built, what Dan asked for, and what comes next.
Started 25 Oct 2026, overnight. Dan is asleep and asked that the next session is started automatically.

## What it is
Brick Township, NJ, rebuilt as a game from real data: OpenStreetMap (every road with its lanes, speed limits, one-ways,
turn restrictions, signals and stop signs; every building footprint; land use, water, parks, fences, power lines,
addresses) plus USGS 3DEP elevation. You ride Dan's Segway Ninebot E2 Pro (real power, drag, battery and kick-to-start
model), walk, go into his house at 172 Taft Ave (mirror = outfit changer), and work an OGP shift at Walmart #1977
(1872 Route 88) on the work phone.

Look: stylized, slightly blocky, flat-shaded, warm palette ("claudish"), but true to the real place: footprints,
heights, roads, lanes and signs come from the data, never invented where data exists.

## Where things are
- Repo: `hinermandanny-dev/brick-sim` (public; created 25 Oct). Pages: https://hinermandanny-dev.github.io/brick-sim/
- Dan's copy: `C:\Users\hiner\Downloads\Projects\brick-sim` (Syncthing'd). Double-click `PLAY.cmd` (needs Node, which he has).
- `local/home.json` (git-ignored, never pushed): `{"addr":"172 Taft Ave"}`. The public site has no home in it; you can
  set one in game with **B**. Do not put the address anywhere public (repo, Actions logs, Pages).
- Branch `data`: raw inputs, written by `.github/workflows/fetch-pbf.yml`: the Geofabrik New Jersey extract (164 MB .pbf)
  cut to the box with pyosmium (`tools/fetch_pbf.py`), USGS 3DEP elevation (`tools/fetch.py --dem-only`, 4000 px grid,
  kept under GitHub's 100 MB file limit), NJ statewide address points (NJOGIS ArcGIS service, 62,976 in the box) and
  Microsoft US building footprints (55,836; 49,673 added where OSM has no building) (`tools/fetch_extra.py`).
  `fetch.yml` (Overpass) is a manual fallback only: Overpass returns 504 on big queries from GitHub runners.
  Logs land in `fetch-log.txt` / `stderr.txt` on that branch, because Actions logs are not readable from Dan's network.
- `tools/bake.py RAW OUT` turns raw data into `site/data/` (400 m tiles, `roads.json` graph, `addr.json`, `meta.json`).
  `.github/workflows/site.yml` bakes and deploys Pages after every fetch and every push to `site/`.
- `tools/check.mjs site`: JS syntax, imports, no private file in site/, data sanity (tiles, roads, Walmart footprint,
  named schools). The site workflow runs it before every publish; it must stay green.
- Pushing: Dan's fine-grained token in `_secrets/github-token.txt` cannot write this repo; `_secrets/mirror-token.txt`
  (classic PAT, repo+workflow) can. `.github/` cannot be written through the remote file tools: write it with device_bash.
  Git inside the synced folder breaks (no delete permission): keep the git clone in the VM home (`~/bsgit`) and copy files.

## Code map (site/js)
| file | what |
|---|---|
| main.js | boot, renderer, loop, keys, destinations, address lookup, closet |
| roads.js | road graph from OSM (junction nodes, edges, lanes incl. centre turn lanes, restrictions, spatial index) |
| world.js | tile streaming; terrain painted with land use, parking stalls; roads with markings (per lane layout), curbs, stop bars, crosswalks, junction boxes; sidewalks; buildings (window shader, gable/hip roofs, chimneys, rooftop units); driveways, mailboxes, doors, garage doors; trees (pitch pine / oak / shrub); poles, lamps, signs, street-name blades, speed-limit signs; fences, power lines |
| traffic.js | IDM car following; junction connectors; signals (grouped approaches, actuated main-street hold, protected left arrows, yellow/all-red); stop / all-way FCFS / yield / minor-road priority; right on red; permissive lefts yield to oncoming; lane changes for turns and passing; curve speeds; blinkers, brake lights, headlights + beams; parked cars in driveways and lots; honks at you |
| cars.js | sedan, compact, SUV, pickup, minivan, box truck, NJ Transit-style bus |
| player.js | walking/running/jumping, E2 Pro physics (350 W / 750 W, modes 9.3 / 12.4 / 18.6 mph, kick to 3 km/h first, 275 Wh battery, drag, rolling resistance by surface, grade), curbs (jolt / fall), crashes, collisions, first/third person camera |
| character.js | Dan's jointed body + procedural animation (walk, run, ride, kick, crouch, fall); outfits (sweater / tee / Walmart vest; shorts / long / pajama pants); the scooter model with his velcro drink holder |
| home.js | enterable house at the home address: rooms, furniture, Reflector mirror, closet UI, charger |
| store.js | Walmart interior fitted to the real footprint + OGP job (clock in, cart, batches by temperature, pick walk, scan, out-of-stock subs/nil picks, staging, rates) |
| phone.js | work phone: Me (clock, schedule), Pick, Ask Sam, Push-to-talk, Maps, stats |
| hud.js | street-name sign, speedo, battery, minimap, full map (M), A* GPS with turn-by-turn |
| sky.js | real sun position for Brick (lat 40.06), equation of time, DST; fog, stars |
| audio.js | WebAudio synth: motor, wind, tyres, traffic, horns, beeps, birds, crickets |

## State at the end of the 25 Oct night session
- Live on Pages with real Brick: 20,784 road edges, 560 turn restrictions, 56,468 buildings, 64,206 addresses, 917 named
  places, 1,079 bus-route ways, 242k trees; `tools/check.mjs` green (it fails if BMHS, BTHS, VMMS, Lake Riviera MS,
  Midstreams Elementary or Walmart stop resolving).
- 172 Taft Ave resolves exactly from the NJ address points; the house there (Microsoft footprint) is enterable.
- Walmart: OSM has loading docks on the SW side, so the store faces NE onto its main lot (verified in a screenshot).
- Traffic soak on the real network around Route 88 (300 s simulated, 95 cars): no car waits on a red more than 100 s,
  no gridlock; queues build at the Route 88 signals at 5 pm as they should.
- Headless testing: Chromium + SwiftShader runs ~2 fps, so step the sim inside `page.evaluate` (call
  `game.traffic.update(.05, ...)` in a loop after `await game.world.loadAround(x, z, r)`), and take screenshots with
  `?low` at 960x540. Place the player BEFORE loading tiles or the loop's `world.update` drops them.
- Not found anywhere: "Frede park" (no OSM name like it; ask Dan), the store's real floor plan (ask Dan).

## Standing rulings from Dan (25 Oct)
- Stylized/blocky but "not overwhelmingly fake"; accuracy to real life is the point. Take the nitty gritty seriously.
- Traffic must be "genuinely amazing". He wants to be blown away by accuracy.
- First person by default, you see your legs and feet; animations get extra attention.
- Places he named: his house (172 Taft Ave), Walmart, BMHS (Brick Memorial HS), Brick Township HS, VMMS (Veterans
  Memorial MS), Midstreams Elementary, Lake Riviera + its park, "Frede park" (find it in the data; spelling unsure),
  Sedge Island with its building, MATES, Resorts + Caesars in Atlantic City.
- Work phones exist at his Walmart; the store layout should be the real one (no public floor plan was found:
  `STORE_LAYOUT` in store.js is the standard Supercenter plan fitted to the footprint. Ask Dan to correct which end is
  grocery, where the OGP room is, aisle numbers).
- Everything free (OSM, USGS, GitHub free tier). Everything off his PC where possible (Actions do the data work).

## Credentials for a headless session (brain VM)
The brain's launch environment has `MIRROR_TOKEN` (a classic PAT with repo+workflow scope): it can push this repo and
dispatch its workflows: `git clone https://x-access-token:$MIRROR_TOKEN@github.com/hinermandanny-dev/brick-sim.git`.
Never print it. `GH_TOKEN` there is fine-grained and can NOT write this repo.

## NEXT SESSION (started automatically): New Jersey
Dan's words: "extend the project from brick to the entirety of nj. With mechanics of travel everywhere, notable
locations are MATES, resorts and caesars in AC. Obviously add a car and a way to get from place to place that doesn't
take an hour. More locations: BMHS, VMMS, Midstreams school. Sedge island with the building on it."
Plan:
1. Data at state scale: `fetch-pbf.yml` already reads the whole NJ extract; it takes an optional `bbox` input. Make a
   matrix job (one job per county or per 0.25° cell) that runs `fetch_pbf.py` + DEM + extras per cell and commits to the
   data branch under `cells/<id>/` (keep every file < 100 MB; the Microsoft NJ zip downloads once per job, so cache it
   with actions/cache). Elevation outside towns: 10 m is enough.
2. Coordinates: switch from one local origin to a statewide frame (NJ State Plane / EPSG:3424 or keep equirectangular per
   region with re-centering) so float precision stays fine; tile names become `z/x/y`.
3. LOD: towns at full detail near you; far tiles only roads + building blocks; highways (GSP, Turnpike, I-195, Rt 9,
   Rt 70, Rt 72, Rt 37, Rt 35) everywhere so long drives look right.
4. Travel: a drivable car (his family car; ask Dan which), proper highway traffic (on-ramps, merges, GSP tolls/E-ZPass
   gantries), and fast travel: (a) time-compressed highway driving (x8 sim speed while on a motorway with a cinematic cam)
   and (b) a map jump between unlocked places.
5. Hand-built set pieces where the data has only footprints: Resorts and Caesars (AC boardwalk), MATES (Marine Academy of
   Technology and Environmental Science, Stafford/Manahawkin), Sedge Island (Island Beach State Park; the house there),
   the schools' fronts, the boardwalk.
6. Keep `tools/check.mjs` green and extend it (every named place must resolve).

## Known gaps / ideas queued for Brick
- Pedestrians, school buses at the schools at bell times, NJ Transit buses on their real routes (rels route=bus are fetched).
- Jughandles work only where OSM has the turn restrictions; verify on Route 88 / Route 70 junctions.
- Store: real layout from Dan; more product detail; customers; dispense to cars at the Pickup spots.
- House interiors are generic except the layout logic; Dan's real room could be modelled from his description.
