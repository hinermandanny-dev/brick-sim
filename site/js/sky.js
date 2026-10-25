// Sun, sky, fog and street lighting from the clock. Brick is at ~40.06 N, 74.11 W (US Eastern time).
import * as THREE from '../vendor/three.module.js';
import { clamp, lerp } from './util.js';

export class Sky {
  constructor(scene, renderer) {
    this.scene = scene;
    this.hemi = new THREE.HemisphereLight('#dfe8f0', '#7a6e55', .85); scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff3dd', 2.2); this.sun.castShadow = true;
    const s = this.sun.shadow; s.mapSize.set(2048, 2048); s.camera.left = -70; s.camera.right = 70; s.camera.top = 70; s.camera.bottom = -70; s.camera.near = 1; s.camera.far = 400; s.bias = -0.0006; s.normalBias = .04;
    scene.add(this.sun); scene.add(this.sun.target);
    this.fog = new THREE.Fog('#cfd8de', 250, 1150); scene.fog = this.fog;
    // sky dome with a vertical gradient
    const g = new THREE.SphereGeometry(3000, 24, 12);
    this.skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { top: { value: new THREE.Color('#6fa3d0') }, bot: { value: new THREE.Color('#dfe6ea') }, sunDir: { value: new THREE.Vector3() }, sunCol: { value: new THREE.Color('#fff2d0') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform vec3 top,bot,sunCol,sunDir; varying vec3 vP; void main(){ float h=clamp(vP.y*1.6+.12,0.,1.); vec3 c=mix(bot,top,pow(h,.7)); float s=max(dot(normalize(vP),sunDir),0.); c+=sunCol*pow(s,600.)*2.+sunCol*pow(s,8.)*.18; gl_FragColor=vec4(c,1.); }' });
    this.dome = new THREE.Mesh(g, this.skyMat); this.dome.renderOrder = -1; scene.add(this.dome);
    this.stars = makeStars(); scene.add(this.stars);
    this.night = 0;
  }
  // hour (0-24 local), day of year
  update(hour, doy, cam) {
    // solar position (simplified NOAA)
    const lat = 40.06 * Math.PI / 180;
    const decl = 23.44 * Math.PI / 180 * Math.sin(2 * Math.PI * (284 + doy) / 365);
    const dst = doy > 68 && doy < 307 ? 1 : 0; // EDT roughly mid-Mar..early Nov
    const B = 2 * Math.PI * (doy - 81) / 365, eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B); // equation of time, minutes
    const solarNoon = 12 + dst - (75 - 74.11) / 15 - eot / 60; // Brick sits 0.89 deg east of the Eastern-time meridian
    const ha = (hour - solarNoon) * 15 * Math.PI / 180;
    const el = Math.asin(Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha));
    const az = Math.atan2(-Math.sin(ha), Math.tan(decl) * Math.cos(lat) - Math.sin(lat) * Math.cos(ha)); // from north, clockwise
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)); // x east, z south
    const day = clamp((el * 180 / Math.PI + 6) / 12, 0, 1); // civil twilight blend
    this.night = 1 - day;
    const warm = clamp(1 - Math.abs(el * 180 / Math.PI - 4) / 10, 0, 1);
    this.sun.intensity = 2.4 * clamp(el * 180 / Math.PI / 8, 0, 1);
    this.sun.color.setRGB(1, lerp(.95, .72, warm), lerp(.86, .5, warm));
    this.hemi.intensity = lerp(.32, .9, day); // moonlit suburb, not a black void
    this.hemi.color.setRGB(lerp(.35, .88, day), lerp(.42, .91, day), lerp(.62, .94, day));
    const top = new THREE.Color().setRGB(lerp(.02, .43, day), lerp(.04, .64, day), lerp(.1, .82, day));
    const bot = new THREE.Color().setRGB(lerp(.06, .87, day) + warm * .15, lerp(.07, .88, day) + warm * .05, lerp(.12, .9, day) - warm * .1);
    this.skyMat.uniforms.top.value.copy(top); this.skyMat.uniforms.bot.value.copy(bot); this.skyMat.uniforms.sunDir.value.copy(dir);
    this.fog.color.copy(bot);
    this.stars.material.opacity = clamp((this.night - .6) * 2.5, 0, 1);
    if (cam) {
      this.dome.position.copy(cam.position); this.stars.position.copy(cam.position);
      const c = cam.position; this.sun.position.set(c.x + dir.x * 200, c.y + Math.max(dir.y, .05) * 200, c.z + dir.z * 200); this.sun.target.position.set(c.x, c.y, c.z);
      // snap the shadow camera to texels to stop shimmering
      this.sun.target.updateMatrixWorld();
    }
    return { el, day, night: this.night };
  }
}
function makeStars() {
  const p = []; for (let i = 0; i < 1500; i++) { const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, r = 2800; const y = Math.abs(u); p.push(Math.sqrt(1 - u * u) * Math.cos(t) * r, y * r, Math.sqrt(1 - u * u) * Math.sin(t) * r); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ color: '#fff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
}
