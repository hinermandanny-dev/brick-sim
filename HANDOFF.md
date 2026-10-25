# Brick Sim: hand-off for the next session

Read this first. It says what exists, how it is built, what Dan asked for, and what comes next.
Started 25 Oct 2026, overnight. Dan is asleep and asked that the next session is started automatically.

## What it is
Brick Township, NJ, rebuilt as a game from real data: OpenStreetMap (every road with its lanes, speed limits, one-ways,
turn restrictions, signals and stop signs; every building footprint; land use, water, parks, fences, power lines,
addresses) plus USGS 3DEP elevation. You ride Dan's Segway Ninebot E2 Pro (real power, drag, battery and kick-to-start
model), walk, go into his house (his address lives only in local/home.json; mirror = outfit changer), and work an OGP shift at Walmart #1977
(1872 Route 88) on the work phone.

Look: stylized, slightly blocky, flat-shaded, warm palette ("claudish"), but true to the real place: footprints,
heights, roads, lanes and signs come from the data, never invented where data exists.

## Where things are
- Repo: `hinermandanny-dev/brick-sim` (public; created 25 Oct). Pages: https://hinermandanny-dev.github.io/brick-sim/
- Dan's copy: `C:\Users\hiner\Downloads\Projects\brick-sim` (Syncthing'd). Double-click `PLAY.cmd` (needs Node, which he has).
- `local/home.json` (git-ignored, never pushed): `{"addr":"<his street address>"}`. The public site has no home in it; you can
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
- His home address resolves exactly from the NJ address points; the house there (Microsoft footprint) is enterable.
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
- Places he named: his house, Walmart, BMHS (Brick Memorial HS), Brick Township HS, VMMS (Veterans
  Memorial MS), Midstreams Elementary, Lake Riviera + its park, "Frede park" (find it in the data; spelling unsure),
  Sedge Island with its building, MATES, Resorts + Caesars in Atlantic City.
- Work phones exist at his Walmart; the store layout should be the real one (no public floor plan was found:
  `STORE_LAYOUT` in store.js is the standard Supercenter plan fitted to the footprint. Ask Dan to correct which end is
  grocery, where the OGP room is, aisle numbers).
- Everything free (OSM, USGS, GitHub free tier). Everything off his PC where possible (Actions do the data work).

## NEXT PASS (Dan, 25 Oct 13:03): the huge polish pass - do this BEFORE more NJ
Dan's words: "a huge polish pass, making houses look actually like the real houses, moving incorrectly placed things,
fixing the scooter model and adding a screen, and making the scooter riding experience much better, and improving
infrastructure overall and fixing the sometimes corrupted map". As a list:
**Dan's answers (25 Oct 13:15) - these settle the scope, do not re-ask:**
- Run it in a fresh session (Opus), from this file.
- The "corrupted map" is **scrambled textures, general flickering and texture laziness** (textures loading late / low
  res). Suspects, in order: the per-tile 768 px canvas ground texture (~30 live tiles, never mip-limited, disposed and
  re-created as you move: GPU memory churn and late uploads); z-fighting between terrain paint, road strips (+0.06),
  junction boxes (+0.065), curbs, bars and crosswalks (polygonOffset fights); far tiles appearing before their texture
  is drawn; anisotropy 8 on every canvas texture. Fix the class: a texture budget/atlas, stable layer offsets, no
  visible tile before it is complete, and a headless check that renders fixed views and fails on flicker (two frames
  of a static camera must be identical) and on untextured tiles.
- Real house looks come from **street photos: Mapillary** (free API, CC-BY-SA, needs a free client token that Dan
  creates; keep it in `_secrets/`, never in the repo). Plan: per house, find Mapillary images within ~40 m facing it,
  read siding colour (dominant facade colour), storeys and roof shape (vision pass, cheapest model that can do it),
  garage side; bake into per-building tags; houses without coverage keep the improved guesses. Process it on GitHub
  Actions, not Dan's PC.
- The family car is a **2005 Nissan Pathfinder** (R51: mid-size body-on-frame SUV, 4.0 V6 ~270 hp, 5-speed auto,
  ~2,000 kg, tall seating). Model that one. But Dan says **the important thing is the driving and the interior view**:
  a convincing first-person cabin (2005 Pathfinder dash, gauges with live needles, wheel turning with the steering,
  hands on the wheel, mirrors, A-pillars, hood visible) and driving feel (gears/RPM, weight transfer, body roll,
  grip/understeer, brake curve, return-to-centre steering, engine/road/wind sound).

1. **Houses that look like the real ones.** Today every house is a random siding colour, a 45/55 ranch-vs-two-storey
   guess, a gable roof on the oriented box, and a door/garage guess. Needs per-house truth: storeys, roof shape,
   siding colour, garage side, porch. Free sources to evaluate: OSM tags where mapped (building:levels, roof:shape,
   building:colour), Mapillary street-level imagery (free API, CC-BY-SA) for colour/storeys, Ocean County / NJ
   MOD-IV tax data (year built, style, storeys) if openly downloadable. Dan can correct his own street by eye.
2. **Move incorrectly placed things.** Audit placement classes, not single cases: driveways on the wrong side /
   through houses, mailboxes in driveways, parked cars overlapping houses or each other, trees in roads/driveways/
   houses, street-name posts in the road, lamps over houses, pickup signs / store pieces outside lots, the player car
   spawn. Build a check that measures each class on the baked data (counts of overlaps) and fails when it regresses.
3. **Scooter model + screen.** Rebuild the E2 Pro to its real proportions (stem, folding latch, deck shape, rear
   fender with brake, front light, the dashboard). Add the dashboard screen: live speed, battery bars, mode
   (ECO/D/S), headlight icon, Bluetooth/lock icon, as on the real E2 Pro display; readable in first person.
4. **Much better riding.** Feel: acceleration curve per mode, regen braking, coasting, weight shift / lean into turns,
   handlebar steering visible, bumps from road texture, curb-cut logic, honest top speed per mode, kick animation,
   sound, camera bob, tyre noise per surface. Tune against real E2 Pro numbers.
5. **Infrastructure overall.** Faster bake (per-tile parallel), CI screenshot checks (headless render of fixed
   viewpoints, compare against stored references), the check covering every region, a single double-click
   PLAY-UPDATE.cmd that pulls the latest data + code onto Dan's PC.
7. **The car is "crappy and low quality, both visually and feeling-wise" (Dan, 13:04).** Visual: a real interior
   (dash, gauges with live needles, wheel that turns with the steering, mirrors that reflect, A-pillars, seats, hands
   on the wheel), a better exterior model of the family car (ask Dan the make/model/colour). Feel: engine/gear model
   with RPM and shifts, weight transfer and body roll/pitch, tyre grip with understeer, proper brake curve, steering
   ratio and return-to-centre, engine/road/wind sound, head-bob and camera lean.
8. **Teleport** (added 25 Oct 13:10): map (M) right-click teleports there; "⤴ go" next to a place teleports to it.
   Polish: a fade, and keep it working for the car/scooter/walking cases (tested in that pass).
6. **Fix the "sometimes corrupted map".** Dan sees it intermittently. Likely causes to test first: tiles that fail
   to fetch or parse (load() deletes the key and never retries -> permanent holes), tiles built while the DEM was
   still loading, drop/reload races when moving fast (a tile dropped while its build is pending), texture budget on
   his GPU (768 px canvas per tile x ~30 tiles), z-fighting between road/curb/junction layers. Get Dan's description
   or a screenshot, reproduce, fix the cause, and add a check that fails on it.

## POLISH PASS, part 1 (25 Oct afternoon session) - what landed, what is measured, what is left
Commits 0324483, de53863 and the ortho commit after them. Every claim below was measured headless in the cloud container
(bake from the `data` branch + Chromium/SwiftShader); nothing ran on Dan's PC.

**Map flicker / "corrupted map" (item 6) - fixed at the causes found, one cause not reproducible headless:**
- Depth precision: camera near 0.05 / far 3500 on a 24-bit depth buffer resolves only ~0.1 m at 300 m, while the
  ground layers are mm-cm apart (terrain, road +0.06, junction box +0.065, bars +0.012 over road). Fix: renderer
  `logarithmicDepthBuffer` (resolution ~0.2 mm at 500 m). Junction boxes moved to +0.072, bars to +0.018.
  Note: with log depth, polygonOffset no longer does anything (gl_FragDepth): layers must stay geometrically apart.
  `?nolog` turns the fix off for comparison.
- Tiles that failed to fetch were deleted from `have` for good (a permanent hole): now retried with backoff (2,4,8,16,32 s).
  A tile was registered before it was built (a throw left a half tile): now built first, textures uploaded with
  `renderer.initTexture` at build time (no late upload on first sight).
- Ground textures: 768 px canvas per tile was created and disposed on every tile move (GPU churn). Now pooled
  (same-size canvases and textures reused), anisotropy 8 -> 4, plus a shared world-space detail texture in the ground
  shader (`groundMat`), so the ground is crisp up close.
- `tools/render-check.mjs` (runs in the site workflow): fixed viewpoints (Walmart lot, an arterial, a side street, a
  Walmart aerial screenshot); fails if >0.4 % of pixels flip between two renders 2 mm apart (z-fighting), on missing or
  untextured tiles, and on page errors. It renders into a 24-bit fixed depth target because SwiftShader's default depth is
  float and hides z-fighting. HONEST LIMIT: even at 24 bit the headless views did not show the flicker before the fix
  (0.01-0.04 % both ways), so the check guards holes/regressions but has not reproduced Dan's flicker. If Dan still sees
  it: get a screenshot or a description of where (distance, which surface), and check the shadow map next
  (sky.js: 140 m box, bias -0.0006 = ~0.24 m, PCFSoft; shadows are off in `?low`, so the check never saw them).

**Grass by the Walmart that isn't there (Dan, 25 Oct 13:17) - fixed for the whole map with real ground cover:**
- Cause: land with no OSM landuse was painted as lawn. At Walmart the truth (2020 orthophoto) is: the paved lot NE,
  leaf-off WOODS around the store and along Route 88, a retention pond W, mowed strips by the store and E of the lot.
- `tools/fetch_ortho.py` + `.github/workflows/ortho.yml`: NJ Office of GIS 2020 natural-colour orthophotos
  (maps.nj.gov `Basemap/Orthos_Natural_2020_NJ_WM/MapServer/tile/{z}/{y}/{x}`, free, attribution requested), z17,
  3,036 tiles, resampled onto the game grid at 1 m -> `ortho.jpg` (45 MB) on the `data` branch, plus `preview/*.jpg`
  crops. Dispatch per region with input `region` (data-<region> branches: ac, mates, ibsp still need it).
- `tools/ortho_classify.py`: classes 1 paved, 2 lawn, 3 woods, 4 water, 5 sand, 6 dirt, 7 roof/bright, by colour +
  9 m luminance texture, then a 7x7 majority filter. Measured on the Walmart crop: woods lum 100-118 sat .10-.12 sd 11-13;
  lawn sd 4-5, r-b 16 (straw) or g-r 14; concrete lot lum 160 sd 22 (cars); pond b>r by 28. Leaf-off woods and asphalt
  have nearly the same colour: texture is what separates them. Roads/buildings come from OSM anyway.
  Brick-wide: woods 61 %, paved 14 %, water 17 %, lawn 7 %.
- bake.py writes `site/data/ground/<tile>.png` (400x400 palette PNG, 9 MB total) and the client draws it under the OSM
  layers; park/wood/landuse outlines no longer overpaint it (`PHOTO_WINS`). Trees follow the photo: woods get forest
  density (414k trees, was 233k), lots/water/roofs get none. Regions without ortho fall back to `paintPaved` (stall rows
  either side of OSM parking aisles, lot lanes and 5 m aprons around big buildings).
- Tuning more: `python tools/ortho_classify.py crop.jpg out.jpg` prints class shares and writes photo|classes side by side.

**Scooter (items 3, 4) - done:** `js/vehicles.js` `makeScooter`: E2 Pro at real size (deck, fender + brake pad, tail
light, folding latch, 13° rake), the bar/stem/fork/front wheel TURN with steering, drink holder on the stem, 10" wheels.
Live dashboard screen on the bar (`drawScooterScreen`): speed digits, 5 battery bars, ECO/D/S, headlight, Bluetooth, lock.
Riding: throttle ramps (softer in ECO), progressive brake (4.6 m/s²), KERS drag when coasting (+ a little charge back),
sidewalk slab joints every 1.5 m (thump + sound), surface vibration and a small bob in first person, steering eases back.
`tools/vehicle-check.mjs` measured: ECO 9.2 / D 12.2 / S 18.3 mph (spec 9.3 / 12.4 / 18.6).

**Car (item 7) - the 2005 Pathfinder, done to a first standard:** R51 body (raked glasshouse, tall tail lamps, roof
rails, flares, 6-spoke 265/70R16), white like the family one (Dan, 25 Oct; `localStorage carColor` overrides).
Cabin from the driver's seat (eye 1.43 m): dash, binnacle with LIVE tach / speedo / fuel / temp / PRND4321 / odometer,
4-spoke wheel that turns with your hands on it, A-pillars, hood, seats, headliner, door cards, three mirrors that really
reflect (render targets, one per frame, round-robin, off in `?low`). `PathfinderDrive`: VQ40DE torque curve, torque
converter, RE5R05A ratios with throttle-based shift schedule + kickdown, idle creep, hold S at a stop for reverse,
brakes ~1 g on asphalt, understeer gradient + grip cap with squeal, roll ~4° at 0.5 g, brake dive, head sway,
V6 firing-frequency engine sound. Measured: 0-60 mph 8.4 s, 60-0 in 44.6 m, wheel returns to centre on release.
Left for later: exterior detail (door seams, badges, fog lights), interior door handles, rear seat detail, turn-signal
stalk animation, an exit animation, wipers, night dash glow.

**(Part 1's 'not started' list; items 1, 2 and 3 were DONE in part 2 below, see there)**
1. Item 2, placement audit: measure each class on the baked data (driveway through a house, mailbox in a driveway,
   tree in a road/driveway/house, parked car overlaps, sign posts in the road, lamps over houses), fix, add to check.mjs.
   The ortho classes now give a real-world signal for driveways (paved pixels between a house and its road).
2. Item 1, houses: roof colour per house can be read from ortho.jpg (median of the footprint's pixels) right now.
   Storeys/garages: NJ MOD-IV parcel data (BLDG_DESC like "2SF2G", YR_CONSTR) is the free source to try before Mapillary;
   Mapillary still needs Dan's free client token in `_secrets/`.
3. Item 5: PLAY-UPDATE.cmd (Dan's local copy has the OLD bake: no ortho ground; the site/data on Pages is current),
   faster parallel bake, render checks per region.
4. (done 25 Oct: teleport fades, loads, puts the car in the travel lane and keeps you on the scooter; tested walk/scooter/car headless)

## POLISH PASS, part 2 (25 Oct afternoon, Sonnet session) - what landed, what is measured, what is left
All of it is pushed (commits 8b84fe0 .. 54ef387) and the `site` workflow is green on 54ef387 (syntax, data, render, vehicles,
placement audit, region checks, deploy). Dan's folder got the same build (see "Shipping to Dan's PC" below).

**Dan's own house, hand-built (Dan, 14:16: "look up pictures of it and handmake it ... including the garage").**
- Source: Google Maps Street View of his address (capture Jul 2013): 2-storey colonial, brick centre bay with a front
  pediment, grey vinyl siding on the wings, maroon louvred shutters, dark grey roof, white double-door unit with a sidelight
  and 3 steps with white rails, a 2-car garage on the LEFT standing ~2 m proud of the main front, wide concrete drive, a
  tall arborvitae by the left wing, a red Japanese maple at right, a yellow-green shrub by the steps, white vinyl fence.
- MOD-IV says the same: `2SF2G 2207`, built 1999, 0.2244 acres (so 2 storeys, frame, 2-car garage). Two independent sources agree.
- `site/js/handhouse.js` (public, GENERIC, no address in it): `fitHouse()` reads a 6-corner footprint, finds the short "jog"
  edge (garage front vs main front), takes the outward normal from it, checks that the front faces the nearest road and the
  garage is on the side the spec says, and returns a frame (u right / v out). `buildHandHouse()` models it in that frame and
  returns the group + `door` + `drive` records the rest of the game already uses (interior, car spawn, parking). Anything that
  does not fit returns null and the generated house is used (console warning).
- The spec is `local/house.json` (git-ignored, Dan's folder only; the container copy is just `{"garage":"left"}`): colours and
  `garage: left`. The public site has no home and no spec, so Pages shows a generic house there. Do NOT commit the spec or the address.
- Wiring: main.js loads `local/house.json` -> `world.handSpec`; `world.buildBuildings` skips the generated walls/roof for the
  residential building whose centroid is < 8 m from `homeXZ` and records `h.custom = frame`; `buildDriveways` builds the model,
  the drive (garage-wide, ends at the road edge) and the mailbox.
- Verified headless (street view, left oblique, aerial): garage left, bay centred, pediment, shutters, garage doors, steps,
  arborvitae, maple, fence all read like the photo. The house is on a road curve (corner-ish lot), as on the map.
- NOT known / guessed: side and rear walls (only plain windows), the fence's exact run (placed from the right wall, 8.5 m across,
  then 6 m towards the street), the garage interior (the interior is still the generic 2-room layout; the garage space behind
  the doors is not modelled), the real room layout. Dan can correct these by eye; colours live in `local/house.json`.

**Placement audit (item 2) - measured, fixed at the causes, locked in CI.** `tools/audit.mjs` boots the game headless, builds
real tiles at seeded residential sites (12 sites, 33 tiles, ~3,000 houses, ~12k trees, ~2,700 parked cars) and counts each
class AS THE PLAYER SEES IT. `tools/audit-limits.json` holds the limits; CI runs `audit.mjs site --sites 6 --check`.
| class | before | after | cause and fix |
|---|---|---|---|
| mailbox in the road | 82 % | 0 | offset was +0.4 m INTO the road edge; now behind the curb, tries both sides and 1.8 m out, never in road/house/another drive (no mailbox if nothing fits) |
| driveway through a neighbour's house | 2.1 % | 0.03 % | the straight line to the nearest road crossed another footprint; such a drive is dropped |
| tree in a driveway | 4.3 % | 0 | `buildTrees` skips trees within drive half-width + 1.4 m |
| tree in the road | 2.6 % | 0 | trunk >= 1.5 m from the carriageway (client) and the bake mask now includes the NEIGHBOUR tiles' roads |
| tree in a house | 0.9 % | 0.02 % | >= 1.6 m from any wall (client) and the bake mask includes neighbour tiles' buildings |
| parked car in a house | 2.7 % | 0.04 % | `Traffic.spotOk` checks the 4 corners + centre against footprints; drives shorter than 5.6 m get no car |
| parked car on the carriageway | 3.1 % | 0 | same check against the road edge (all corners) |
| parked cars overlapping | 1.1 % | 0 | same check, 2.1 m between centres |
| post/pole in the road | 19 % | 0 | OSM mapped them on the centreline: nudged to half-width + 0.7 m (3 passes, so a second road also clears) |
Residual 0.03-0.3 % are tile-edge cases (the neighbour tile's colliders were not loaded when this tile was built). Not measured
because no signal exists: lamp heads over houses (needs the lamp arm geometry), pickup signs/store pieces outside lots.

**Houses from data (item 1).**
- MOD-IV: the NJOGIS-org layer `Parcels_MODIV_NJ_WM` needs a token; the PUBLIC one is
  `https://maps.nj.gov/arcgis/rest/services/Framework/Cadastral/MapServer/0` (statewide parcels + MOD-IV attributes, max 1000 per
  page, query with `outSR=4326`). `tools/fetch_modiv.py` probes both and `fetch-modiv.yml` appends `parcels.json.gz` (87,779
  parcels, 4 MB) and `modiv-log.txt` to a data branch WITHOUT touching its other files (`gh api -X POST
  repos/hinermandanny-dev/brick-sim/actions/workflows/fetch-modiv.yml/dispatches -f ref=main [-f inputs[region]=ac]`).
- `BLDG_DESC` formats seen: `2SF2G 2207` (storeys, S, exterior letters, garage "2G" or "G2", then sq ft), `1F 1072`, `1.5SF-CAPE`,
  `RANCH`, `COLONIAL`, `BI LEVEL`, `SPLIT LEVEL`, `COND ...`, `TOWNHOUSE`. `bake.py parse_bldg` reads storeys (`st`), garages
  (`g`, 0 when the description clearly has none), brick (`bf`, a "B" among the exterior letters: 551 houses only, so unsure) and sq ft (`sf`).
  Parcel -> house: the largest residential footprint whose centroid is inside the parcel. 41,202 of 56,773 parcels matched;
  `st` on 38.5k houses, `g` on 33k, `yr` on 41k, `sf` on 32k.
- Used by the client: height from storeys (3.0 / 4.3 / 5.6 / 6.4 / 8.4 m), garage door and drive width from `g` (2 -> 5.4 m, 1 -> 3.3 m,
  0 -> no door, 2.8 m), brick walls when `bf`. NOT used yet: `yr` (era -> siding/roof style), `sf` (footprint sanity, interior size),
  the parcel polygons (lot lines: fences, yards, a better driveway side than "nearest road").
- Roof colour: median RGB of the 2020 orthophoto inside each house footprint (green-dominant pixels dropped as tree canopy,
  saturation x0.7, clamped 40..175): `b.rc` on 53k buildings; used for every residential/small roof. Siding colour is still random
  (the photo shows roofs, not walls).
- MAPILLARY NOT DONE: it needs Dan's free client token (`_secrets/mapillary-token.txt`) and I cannot create one. When it exists:
  (1) a repo secret on `hinermandanny-dev/brick-sim` (the classic PAT in `_secrets/mirror-token.txt` can set secrets through the REST API with
  PyNaCl), (2) a `fetch-mapillary.yml` that lists images within ~40 m of each house front facing it (bbox query on
  `graph.mapillary.com/images`, `compass_angle`, `computed_geometry`), (3) a cheap colour read of the facade (no model needed for siding:
  cluster the pixels in the strip below the roofline) written as `b.sc`, (4) the client uses `b.sc` over the random siding. Do not start
  (3) before Dan's token exists: it cannot be tested without it.

**Infrastructure (item 5).**
- `PLAY-UPDATE.cmd` -> `tools/update.mjs`: downloads only changed files (size + sha1 from `site/manifest.json`, written by
  `tools/manifest.mjs` in the site workflow) from https://hinermandanny-dev.github.io/brick-sim/ into `site/`, never touches `local/`,
  then starts the game (`PLAY.cmd`). Tested against a local mock: stale file replaced, second run 0 downloads, checksum-verified, `.part` files renamed atomically.
- Parallel bake: ortho classification (69 s) and tile writing (43 s) run in forked worker processes (`BAKE_JOBS`, default = CPUs;
  serial on Windows). Brick bake 155 s -> 97 s on 2 cores, output byte-identical (diffed). CI runners have 4 cores.
- `tools/check.mjs` now also checks EVERY region in regions.json (tiles, DEM size, roads, named start place resolves);
  `tools/region-check.mjs` boots each non-home region headless and fails on page errors, holes, untextured tiles, flicker.
  Both are in the site workflow, together with `audit.mjs --check` and `manifest.mjs`.
- `.gitignore` now ignores `site/data/`, `site/regions/` (CI bakes them; never commit them), `local/`, `node_modules/`.

**Working notes for the next session (things that cost time today).**
- In the cloud container the repo clone is `/root/bsgit`; the Write/Edit/Read tools act on `/home/claude/...`, a DIFFERENT tree:
  write files with Bash (heredoc/python) or Write to a `/root/bsgit/...` absolute path.
- Pushing: `mcp__claude-code-remote__add_repo` (access "push") once, then plain `git push origin main` with the https URL (no token in it).
  `gh workflow run` fails (GraphQL blocked): use `gh api -X POST .../workflows/<file>/dispatches -f ref=main`.
- Dan's PC shell (device_bash) CANNOT reach github.io, so `update.mjs` cannot be run from there. To put a build on his PC: tar the
  repo (minus .git/local/HANDOFF.md) into `/mnt/user-data/outputs`, `device_commit_files` it into `brick-sim/_incoming/`, then extract with
  `device_bash`. Overwriting needs `device_request_delete_permission` (granted once this session). Remove the tgz afterwards.
- Headless tests: `tools/audit.mjs` takes ~3 min for 12 sites; screenshots of the hand-built house need `local/home.json` + `local/house.json`
  served at `/local/` (see how audit.mjs's `BS_LOCAL` env works; Dan's real address is only in Dan's folder).

### Still open from the polish list
1. Mapillary siding colours (blocked on Dan's token, plan above).
2. Neighbour houses are still generic gable boxes: use `yr`/`st`/`sf`/`g` to vary roof shape (hip/gable/cross-gable), porch, garage position; MOD-IV `COLONIAL`/`RANCH`/`CAPE` names are style hints.
3. The garage INTERIOR and a truer room layout in Dan's house (ask Dan; he can describe it).
4. Exterior detail on the Pathfinder (door seams, badges, fog lights), wipers, turn-signal stalk, exit animation (from part 1's list).
5. NJ: the statewide road skeleton and more regions (list below), which Dan wants AFTER this polish pass.

## New Jersey: what exists (25 Oct, ~05:20 ET, same night session)
The separate session could not be started automatically (the brain commander rightly refused an unverifiable bus
order; the scheduled-task tool was denied by the permission system), so the first NJ steps were done in the Brick session.
- **Regions.** `site/regions.json` lists them; each region is baked exactly like Brick into `site/regions/<id>/` from
  branch `data-<id>` (fetch with `fetch-pbf.yml` inputs `region` + `bbox "S W N E"`; the site workflow bakes every
  `data-*` branch it knows: edit the `for r in ac mates ibsp` loop when you add one, and add the region to regions.json).
  Live: `brick` (data/), `ac` Atlantic City (39.340-39.392 N, 74.475-74.398 W), `mates` Manahawkin/Stafford
  (39.672-39.728, 74.320-74.215), `ibsp` Island Beach SP + Sedge Islands (39.760-39.845, 74.125-74.065).
  Open one directly with `?region=ac`.
- **Travel** (`js/travel.js`): map (M) -> "Drive somewhere else in NJ" -> a time-lapse along the real route (GSP, Rt 37,
  Rt 35; real miles and minutes; the game clock advances) -> you arrive in your car on the nearest road. The outfit and
  the clock carry over (sessionStorage). The scooter stays home.
- **The family car** (`player.js` drive/enterCar/makeCar): F at the driver's door (left side), W gas, S brake then
  reverse, Space horn, V driver's-seat / chase camera. ~140 kW, 1,550 kg, drag, rolling resistance by surface,
  bicycle steering with speed-dependent lock, crashes on buildings/cars. It parks nose-in in your driveway at home.
- **Set pieces** (`js/setpieces.js`): CAESARS and RESORTS signs on the real casino buildings (AC towers come from OSM
  with real heights: Ocean 218 m, Hard Rock, MGM Tower, Bally's, Claridge, Caesars' Centurion/Ocean towers); the
  Boardwalk drawn 18 m wide in planks; a MATES monument sign at the school's road; the Sedge Island house (no dataset
  has it: hand-built, cedar on pilings with a porch, dock and kayaks, placed on the nearest dry ground to the "Sedge
  Islands" label: its exact spot and look are approximate; ask Dan / check aerials).
- **Water fixes** (bake.py): islands stay land (multipolygon holes + place=island polygons), and the ocean, which OSM
  has no polygon for and 3DEP has no data for (stored as exactly 0), becomes sea.

### NJ: what is left, in order
1. A statewide road skeleton (motorway/trunk/primary from the NJ extract, simplified) so you can actually DRIVE between
   regions on the Parkway with traffic and a time-compression control, instead of only the time-lapse.
2. More regions (each is one fetch-pbf dispatch + a regions.json line): Point Pleasant / Jenkinson's, Seaside Heights,
   Toms River, Lakewood, the rest of Ocean County; then by county.
3. AC detail: casino podiums, the Boardwalk's shops, Steel Pier, the beach and ocean.
4. MATES: the building front, the marine lab, the bus loop.
5. The check should cover every region (named places per region must resolve).

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
