// The work phone (Samsung XCover-style): Me (clock in/out, schedule), Pick (OGP), Ask Sam, Push-to-talk, GPS.
import { toast } from './util.js';
import { CAT } from './store.js';

const PTT = [
  'Tasha: can I get a picker to the front, spot 3 checked in.', 'Mike: frozen is backed up, who has the freezer batch?', 'Priya: reminder, scan the tote BEFORE you put the item in.',
  'Joe: chiller door is propped, close it on your way out.', 'Ana: we\'re out of bananas on the floor, nil pick or sub with the organic.', 'Kev: lunch in 10 for whoever started at 7.',
  'CSM: great pick rate today team, keep it up.', 'Tasha: dispense needs two carts at spots 5 and 6.',
];

export class Phone {
  constructor(game) {
    this.g = game; this.el = document.getElementById('phone'); this.sc = document.getElementById('ph-screen'); this.app = 'home'; this.open = false; this.ptt = []; this.pttT = 40;
    document.querySelectorAll('.ph-nav span').forEach(s => s.onclick = () => { const n = s.dataset.nav; if (n === 'home' || n === 'back') this.show('home'); });
  }
  toggle() { this.open = !this.open; this.el.classList.toggle('hidden', !this.open); if (this.open) { document.exitPointerLock?.(); this.refresh(); } }
  show(app) { this.app = app; this.refresh(); }
  tick(dt) {
    this.pttT -= dt;
    if (this.pttT < 0 && this.g.store.job.clocked) { this.pttT = 70 + Math.random() * 120; const m = PTT[(Math.random() * PTT.length) | 0]; this.ptt.unshift([this.g.clockStr(), m]); this.ptt = this.ptt.slice(0, 20); toast('📻 ' + m, 3500); this.g.audio?.chirp(); if (this.open && this.app === 'ptt') this.refresh(); }
    document.getElementById('ph-time').textContent = this.g.clockStr();
    if (this.open && this.app === 'pick') { const b = this.g.store.job.batch; const t = this.sc.querySelector('#pk-t'); if (t && b) t.textContent = fmt(this.g.store.job.pickT) + ' / ' + fmt(b.due); }
  }
  refresh() {
    if (!this.open) return;
    const S = this.g.store, J = S.job;
    const h = (s) => { this.sc.innerHTML = s; };
    if (this.app === 'home') {
      h(`<div style="background:linear-gradient(#123a7a,#0b2a5c);height:100%;color:#fff">
        <div style="padding:26px 18px 6px;font-size:38px;font-weight:300">${this.g.clockStr()}</div>
        <div style="padding:0 18px;opacity:.8;font-size:12px">${this.g.dateStr()}</div>
        <div class="app-grid">
          ${ic('me', 'Me', '#0071ce', '◉')}${ic('pick', 'Pick', '#f47321', '✓')}${ic('sam', 'Ask Sam', '#7b3fb3', '?')}
          ${ic('ptt', 'Push to talk', '#2e9e5b', '📻')}${ic('gps', 'Maps', '#d93a2b', '➤')}${ic('stats', 'My stats', '#555', '▤')}
        </div></div>`);
      this.sc.querySelectorAll('.app-ic').forEach(a => a.onclick = () => this.show(a.dataset.app));
    } else if (this.app === 'me') {
      h(`<div class="app-top">Me@Walmart<small>Store 1977 · Brick, NJ · OGP</small></div><div class="app-body">
        <div class="card"><b>${J.clocked ? 'On the clock' : 'Off the clock'}</b><br><small>${J.clocked ? 'Shift time ' + fmt(J.shift) : 'Clock in when you are at the store (geofenced).'}</small>
        <div class="btn ${J.clocked ? 'alt' : ''}" id="me-clock">${J.clocked ? 'Clock out' : 'Clock in'}</div></div>
        <div class="card"><b>Schedule</b><br><small>${schedule(this.g)}</small></div>
        <div class="card"><b>Team</b><br><small>OGP picking · Pickup room by the Grocery entrance</small></div></div>`);
      this.sc.querySelector('#me-clock').onclick = () => { S.clockIn(); this.refresh(); };
    } else if (this.app === 'pick') {
      if (!J.clocked) { h(`<div class="app-top">Pick<small>Online Grocery Pickup</small></div><div class="app-body"><div class="card">You are not clocked in.</div><div class="btn" id="go-me">Open Me</div></div>`); this.sc.querySelector('#go-me').onclick = () => this.show('me'); return; }
      if (!J.batch) {
        h(`<div class="app-top">Pick<small>${J.cart ? 'Cart ready · 6 totes' : 'Grab a cart in the Pickup room'}</small></div><div class="app-body">
          <div class="card"><b>Start a pick walk</b><br><small>Batches go by temperature. Ambient first, then chilled, then frozen last so it stays cold.</small>
          <div class="btn" data-t="amb"><span class="pill amb">AMBIENT</span> Start ambient batch</div>
          <div class="btn" data-t="chl"><span class="pill chl">CHILLED</span> Start chilled batch</div>
          <div class="btn" data-t="frz"><span class="pill frz">FROZEN</span> Start frozen batch</div></div>
          ${J.done.length ? `<div class="card"><b>Today</b><br><small>${J.done.length} walks · ${J.done.reduce((s, d) => s + d.units, 0)} units · avg ${Math.round(J.done.reduce((s, d) => s + d.rate, 0) / J.done.length)} UPH</small></div>` : ''}</div>`);
        this.sc.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { S.newBatch(b.dataset.t); });
        return;
      }
      const b = J.batch, it = b.items[b.i];
      if (!it) { const z = b.temp === 'amb' ? S.stage.amb[b.slot % S.stage.amb.length][2] : b.temp === 'chl' ? 'Chiller' : 'Freezer'; h(`<div class="app-top">Pick · Stage<small>${b.orders.length} orders done</small></div><div class="app-body"><div class="card"><div class="big">Stage at ${z}</div><small>Walk your cart back to the Pickup room and scan the totes into <span class="loc">${z}</span>.</small></div>${totes(b)}</div>`); return; }
      const o = b.orders[it.order];
      h(`<div class="app-top">Pick · ${b.i + 1}/${b.items.length}<small><span id="pk-t">${fmt(J.pickT)} / ${fmt(b.due)}</span> · ${b.temp.toUpperCase()}</small></div><div class="app-body">
        <div class="card"><div style="display:flex;gap:10px;align-items:center"><div style="width:54px;height:54px;border-radius:8px;background:${it.col};border:1px solid #ddd"></div>
        <div><b>${it.name}</b><br><small>$${it.price.toFixed(2)} · UPC …${it.upc.slice(-4)}</small></div></div>
        <div style="margin-top:8px" class="big">Qty ${it.got}/${it.qty}</div>
        <div>Location <span class="loc">${it.loc.aisle ? 'Aisle ' + it.loc.aisle + ' · Sec ' + it.loc.sec : it.dept}</span></div><small>${it.dept}</small>
        <div style="margin-top:6px">Tote <b class="loc">${it.tote}</b> · order ${o.id} · ${o.cust}${o.subsOK ? '' : ' · <b style="color:#c00">no subs</b>'}</div></div>
        <div class="card"><small>Walk to the location (it glows in the store) and press <b>E</b> to scan.</small></div>
        <div class="btn alt" id="pk-oos">Can't find it / out of stock</div>
        <div class="card"><small>Up next: ${b.items.slice(b.i + 1, b.i + 4).map(x => x.name).join(' · ') || '—'}</small></div></div>`);
      this.sc.querySelector('#pk-oos').onclick = () => this.oos(it);
    } else if (this.app === 'oos') {
      const it = this.oosItem; const o = J.batch.orders[it.order];
      const subs = CAT.filter(c => c[1] === it.dept && c[0] !== it.name).slice(0, 2);
      h(`<div class="app-top">Out of stock<small>${it.name}</small></div><div class="app-body"><div class="card">No stock at the location. ${o.subsOK ? 'The customer allows substitutions.' : '<b>This customer does not allow substitutions.</b>'}</div>
        ${o.subsOK ? subs.map(s => `<div class="btn warn" data-sub="1">Sub: ${s[0]}</div>`).join('') : ''}<div class="btn alt" id="nil">Nil pick (refund)</div></div>`);
      this.sc.querySelectorAll('[data-sub]').forEach(b => b.onclick = () => { S.resolveOOS(it, 'sub'); this.show('pick'); });
      this.sc.querySelector('#nil').onclick = () => { S.resolveOOS(it, 'nil'); this.show('pick'); };
    } else if (this.app === 'sam') {
      h(`<div class="app-top">Ask Sam<small>Find an item</small></div><div class="app-body"><input id="sam-q" placeholder="milk, eggs, chips…" style="width:100%;padding:9px;border-radius:8px;border:1px solid #ccc"><div id="sam-r"></div></div>`);
      const q = this.sc.querySelector('#sam-q'); q.focus();
      q.oninput = () => { const v = q.value.toLowerCase(); const r = CAT.filter(c => c[0].toLowerCase().includes(v)).slice(0, 6); this.sc.querySelector('#sam-r').innerHTML = r.map(c => { const l = (S.locs?.get(c[1]) || [])[0]; return `<div class="card"><b>${c[0]}</b><br><small>${c[1]} · ${l && l.aisle ? 'Aisle ' + l.aisle : c[1]} · $${c[3].toFixed(2)} · ${c[2] === 'amb' ? 'ambient' : c[2] === 'chl' ? 'chilled' : 'frozen'}</small></div>`; }).join(''); };
    } else if (this.app === 'ptt') {
      h(`<div class="app-top">Push to talk<small>OGP channel</small></div><div class="app-body">${this.ptt.map(([t, m]) => `<div class="card"><small>${t}</small><br>${m}</div>`).join('') || '<div class="card">Quiet so far.</div>'}</div>`);
    } else if (this.app === 'gps') {
      h(`<div class="app-top">Maps<small>Tap a place for directions</small></div><div class="app-body">${this.g.dests().map((d, i) => `<div class="btn alt" data-d="${i}">${d.name}<br><small>${d.sub}</small></div>`).join('')}</div>`);
      this.sc.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { const d = this.g.dests()[+b.dataset.d]; this.g.hud.route(d); this.toggle(); });
    } else if (this.app === 'stats') {
      const st = this.g.player.stats;
      h(`<div class="app-top">My stats<small>Today</small></div><div class="app-body"><div class="card">Rode ${(st.dist / 1609.34).toFixed(2)} mi · top ${(st.top / 0.44704).toFixed(1)} mph<br>Battery used ${st.wh.toFixed(0)} Wh of 275</div>
        <div class="card">Picks ${J.picks} · subs ${J.subs} · nil picks ${J.nils}</div></div>`);
    }
  }
  oos(it) { this.oosItem = it; if (!this.open) this.toggle(); this.show('oos'); }
}
function ic(app, label, col, sym) { return `<div class="app-ic" data-app="${app}"><i style="background:${col}">${sym}</i>${label}</div>`; }
function fmt(s) { s = Math.max(0, s | 0); return `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`; }
function totes(b) { return `<div class="card">${b.orders.map(o => `<div>Tote <b class="loc">${o.tote}</b> · ${o.id} · ${o.cust}</div>`).join('')}</div>`; }
function schedule(g) { const d = g.dateObj(); const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; const out = []; for (let k = 0; k < 7; k++) { const x = new Date(d.getTime() + k * 864e5); const wk = x.getDay(); out.push(`${days[wk]} ${x.getMonth() + 1}/${x.getDate()}: ${wk === 0 || wk === 6 ? '7:00a – 3:30p' : wk === 3 ? '4:00p – 9:00p' : wk === 5 ? '4:00p – 10:00p' : 'off'}`); } return out.join('<br>'); }
