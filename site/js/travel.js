// Getting around New Jersey without an hour of driving: real routes, real distances, a time-lapse, then you are there.
// Region data lives in site/regions/<id>/ (same bake as Brick). Distances are road miles on the usual route.
const ROUTES = {
  'brick>ac': { mi: 60, via: 'Garden State Parkway South', min: 66 }, 'brick>mates': { mi: 26, via: 'Garden State Parkway South to Exit 63', min: 33 },
  'brick>ibsp': { mi: 22, via: 'Route 37 East, Route 35 South through Seaside', min: 38 }, 'ac>mates': { mi: 36, via: 'Garden State Parkway North', min: 40 },
  'ac>ibsp': { mi: 62, via: 'Garden State Parkway North, Route 37 East', min: 75 }, 'mates>ibsp': { mi: 33, via: 'GSP North, Route 37 East, Route 35 South', min: 47 },
};
export function route(a, b) { return ROUTES[a + '>' + b] || ROUTES[b + '>' + a] || { mi: 30, via: 'the Parkway', min: 40 }; }
export function travel(game, to) {
  const from = game.region.id; if (from === to.id) return;
  const r = route(from, to.id);
  const ov = document.createElement('div'); ov.className = 'travel';
  ov.innerHTML = `<div class="travel-card"><div class="tr-to">Driving to ${to.name}</div><div class="tr-via">${r.via} · ${r.mi} mi · about ${Math.floor(r.min / 60) ? Math.floor(r.min / 60) + ' h ' : ''}${r.min % 60} min</div><div class="tr-road"><i></i><b>🚗</b></div><div class="tr-clock"></div></div>`;
  document.body.appendChild(ov);
  const t0 = performance.now(), dur = 4200, start = game.t; const bar = ov.querySelector('i'), car = ov.querySelector('b'), clock = ov.querySelector('.tr-clock');
  const step = () => {
    const f = Math.min(1, (performance.now() - t0) / dur);
    bar.style.width = (f * 100) + '%'; car.style.left = (f * 100) + '%'; game.t = start + r.min * 60 * f; clock.textContent = game.clockStr() + ' · ' + Math.round(r.mi * f) + ' of ' + r.mi + ' mi';
    if (f < 1) requestAnimationFrame(step);
    else { try { sessionStorage.setItem('bricksim.arrive', JSON.stringify({ t: game.t, car: true, outfit: game.player.body.o })); } catch (e) { } location.search = '?region=' + to.id + (new URLSearchParams(location.search).has('low') ? '&low' : ''); }
  };
  requestAnimationFrame(step);
}
