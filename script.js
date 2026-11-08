// ===== INTRO 3D : portail doré (Three.js) =====
// Le terminal s'écrit, le portail s'ouvre, la caméra traverse le cercle,
// puis les points se rassemblent en globe: exactement le globe du fond du site.
(function () {
  let fini; window.__introDone = new Promise((r) => (fini = r));   // le site attend la fin de l'intro pour animer son texte
  const el = document.getElementById("intro");
  if (!el) { fini(); return; }
  const root = document.documentElement;
  // mouvement réduit, adresse avec ?intro=0, ou Three.js absent: pas d'intro
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || /[?&]intro=0/.test(location.search) || !window.THREE) { el.remove(); fini(); return; }

  const q = (s) => el.querySelector(s);
  const term = q(".intro-term"), flash = q(".intro-flash"), bar = q(".intro-bar i"), pct = q(".intro-pct");
  const rnd = Math.random, PI2 = Math.PI * 2, golden = Math.PI * (3 - Math.sqrt(5));
  const clamp = (x) => Math.min(1, Math.max(0, x));
  const out3 = (x) => 1 - Math.pow(1 - x, 3);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ✏️ Les lignes du terminal: ["sys", texte gris] · ["cmd", commande] · ["out", réponse] · ["ok", message final]
  const LINES = [
    ["sys", "[ OK ] noyau 3D chargé"],
    ["cmd", "whoami"],
    ["out", "Saad Bou Ouicha"],
    ["cmd", "cat profil.txt"],
    ["out", "Étudiant ingénieur · Cybersécurité · Web"],
    ["cmd", "./ouvrir_portfolio.sh"],
    ["ok",  "ACCESS GRANTED ✓"]
  ];

  let done = false, skipped = false, removed = false, closing = false, raf = 0;
  let phase = "type", tStart = 0, flyT0 = 0, globeT0 = 0, open = 0;
  let renderer, scene, camera, world, gWorld, globe, vortex, ringBody, g1, g2, g3, dust;
  let portrait = false, mx = 0, my = 0, cx = 0, cy = 0;
  let vR, vA, vZ, gStart, gTarget, NV = 2600;

  function finir() {
    if (done) return;
    done = true; skipped = true;
    el.classList.add("out"); root.classList.remove("intro-lock");
    fini();
    setTimeout(nettoyer, 800);
  }
  function nettoyer() {
    if (removed) return;
    removed = true; cancelAnimationFrame(raf);
    try { renderer.dispose(); renderer.forceContextLoss(); } catch (e) {}
    el.remove();
  }

  function init() {
    root.classList.add("intro-lock");
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    scrollTo(0, 0);

    renderer = new THREE.WebGLRenderer({ canvas: q(".intro-gl"), antialias: false, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 1);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(55, 1, 0.1, 120);
    world = new THREE.Group(); gWorld = new THREE.Group();
    scene.add(world); scene.add(gWorld);

    // point rond lumineux (comme le fond du site)
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(.5, "rgba(255,255,255,.9)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const dot = new THREE.CanvasTexture(c);

    function pts(n, fn, size, opacity) {
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const r = fn(i); pos.set(r[0], i * 3); col.set(r[1], i * 3); }
      const geo = new THREE.BufferGeometry(), pa = new THREE.BufferAttribute(pos, 3);
      geo.setAttribute("position", pa); geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const mat = new THREE.PointsMaterial({ size: size, map: dot, vertexColors: true, transparent: true, opacity: opacity, depthWrite: false, blending: THREE.AdditiveBlending });
      const p = new THREE.Points(geo, mat); p.frustumCulled = false;
      p.userData.pos = pos; p.userData.attr = pa;
      return p;
    }

    // 1) l'anneau doré: motif gravé, bord intérieur plus lumineux
    ringBody = pts(6000, () => {
      const u = rnd() * PI2, v = rnd() * PI2, r = .2 * (1 + .22 * Math.sin(u * 28)), rr = 2.6 + r * Math.cos(v);
      const k = .45 + .55 * (.5 - .5 * Math.cos(v));
      return [[Math.cos(u) * rr, Math.sin(u) * rr, r * Math.sin(v) * .8], [k, k * .78 * (.85 + .15 * rnd()), k * .3]];
    }, .05, .9);
    const neon = pts(1400, () => {
      const u = rnd() * PI2, rr = 2.4 + (rnd() - .5) * .03;
      return [[Math.cos(u) * rr, Math.sin(u) * rr, (rnd() - .5) * .05], [1, .93, .7]];
    }, .075, 1);
    // 2) trois anneaux de gyroscope (vert et bleu du site)
    const cercle = (R, n, col) => pts(n, () => {
      const a = rnd() * PI2;
      return [[Math.cos(a) * R + (rnd() - .5) * .03, Math.sin(a) * R + (rnd() - .5) * .03, (rnd() - .5) * .03], col];
    }, .035, .75);
    g1 = cercle(3.4, 900, [.24, .86, .59]); g2 = cercle(4.1, 1100, [.22, .74, .97]); g3 = cercle(4.8, 1300, [.24, .86, .59]);
    // 3) le vortex dans le cercle
    vR = new Float32Array(NV); vA = new Float32Array(NV); vZ = new Float32Array(NV);
    vortex = pts(NV, (i) => {
      vR[i] = Math.sqrt(rnd()) * 2.2 + .05; vA[i] = rnd() * PI2; vZ[i] = (rnd() - .5) * .25;
      const k = vR[i] / 2.3, b = .35 + .65 * (1 - k);
      return [[0, 0, 0], [(1 - k) * b + .24 * k * b, (.78 * (1 - k) + .86 * k) * b, (.35 * (1 - k) + .59 * k) * b]];
    }, .04, .3);
    // 4) poussière lointaine: donne la profondeur pendant la traversée
    dust = pts(innerWidth < 700 ? 1000 : 1700, () => {
      const b = .25 + rnd() * .5, m = rnd() < .5;
      return [[(rnd() - .5) * 30, (rnd() - .5) * 18, -34 + rnd() * 52], m ? [b, b * .8, b * .4] : [b * .3, b * .9, b * .6]];
    }, .035, .7);
    world.add(ringBody, neon, g1, g2, g3, vortex, dust);

    // 5) le globe final: mêmes formules et mêmes couleurs que le fond du site
    const N = innerWidth < 700 ? 1800 : 3200;
    gStart = new Float32Array(N * 3); gTarget = new Float32Array(N * 3);
    globe = pts(N, (i) => {
      const y = 1 - 2 * (i / (N - 1)), r = Math.sqrt(1 - y * y), th = golden * i;
      gTarget.set([Math.cos(th) * r * 2.4, y * 2.4, Math.sin(th) * r * 2.4], i * 3);
      const a = rnd() * PI2, b2 = 2 * rnd() - 1, rad = 9 + rnd() * 8, s = Math.sqrt(1 - b2 * b2);
      gStart.set([Math.cos(a) * s * rad, b2 * rad, Math.sin(a) * s * rad], i * 3);
      const k = rnd(), b = .6 + rnd() * .4;
      return [[0, 0, 0], [(.239 + (.22 - .239) * k) * b, (.863 + (.74 - .863) * k) * b, (.592 + (.97 - .592) * k) * b]];
    }, .06, .95);
    globe.userData.pos.set(gStart);
    gWorld.add(globe); gWorld.visible = false;

    resize();
    addEventListener("resize", resize);
    addEventListener("pointermove", (e) => { mx = e.clientX / innerWidth - .5; my = -(e.clientY / innerHeight - .5); });
    raf = requestAnimationFrame(frame);
  }

  function resize() {
    if (removed) return;
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    portrait = w / h < 1.2;
    el.classList.toggle("portrait", portrait);
    world.position.set(0, portrait ? -2 : 0, 0);
    if (w < 700) { gWorld.position.set(0, .6, 0); gWorld.scale.setScalar(.75); globe.material.opacity = .6; }
    else { gWorld.position.set(2.6, 0, 0); gWorld.scale.setScalar(1); globe.material.opacity = .95; }
  }

  function frame(now) {
    if (removed) return;
    raf = requestAnimationFrame(frame);
    if (!tStart) tStart = now;
    const t = (now - tStart) * .001, T = performance.now() * .001;
    cx += (mx * .9 - cx) * .05; cy += (my * .6 - cy) * .05;
    const cy0 = portrait ? -2 : 0, zEnd = portrait ? 13.5 : 9.5;

    if (phase === "type") {
      camera.position.set(cx, cy, zEnd + 6 * (1 - out3(clamp(t / 4.5))));
      camera.lookAt(0, 0, 0);
      vortex.material.opacity = .28 + .1 * Math.sin(t * 3);
    } else if (phase === "fly") {
      const f = clamp((now - flyT0) / 2300), e = .15 * f + .85 * f * f * f, m = 1 - (f < .5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2);
      const z = zEnd - (zEnd + 10) * e;
      camera.position.set(cx * m, cy * m + cy0 * (1 - m), z);
      camera.fov = 55 + 55 * f * f; camera.updateProjectionMatrix();
      camera.lookAt(0, cy0 * (1 - m), z - 10);
      open = out3(clamp(f * 1.6));
      vortex.material.opacity = .35 + .65 * open;
      flash.style.opacity = clamp((f - .62) / .33);
      if (f >= 1) versGlobe();
    }

    if (phase !== "globe") {
      ringBody.rotation.z = t * .12;
      g1.rotation.set(1.2, 0, t * .3); g2.rotation.set(t * .25, 1.1, 0); g3.rotation.set(.5, .5, -t * .2);
      dust.rotation.z = t * .02;
      const p = vortex.userData.pos;
      for (let i = 0; i < NV; i++) {
        const a = vA[i] + t * (1.4 / (vR[i] + .4)), o = i * 3;
        p[o] = Math.cos(a) * vR[i]; p[o + 1] = Math.sin(a) * vR[i]; p[o + 2] = vZ[i] - (1 - vR[i] / 2.3) * .9 * open;
      }
      vortex.userData.attr.needsUpdate = true;
    } else {
      const g = clamp((now - globeT0) / 1500), e = out3(g), a = (1 - e) * 2.2, ca = Math.cos(a), sa = Math.sin(a);
      const p = globe.userData.pos, n = p.length;
      for (let o = 0; o < n; o += 3) {
        const x = gStart[o] + (gTarget[o] - gStart[o]) * e, y = gStart[o + 1] + (gTarget[o + 1] - gStart[o + 1]) * e, z = gStart[o + 2] + (gTarget[o + 2] - gStart[o + 2]) * e;
        p[o] = x * ca + z * sa; p[o + 1] = y; p[o + 2] = -x * sa + z * ca;
      }
      globe.userData.attr.needsUpdate = true;
      gWorld.rotation.y = Math.sin(T * .35) * .55;
      if (g >= 1 && !closing) { closing = true; setTimeout(finir, 350); }
    }
    renderer.render(scene, camera);
  }

  function versGlobe() {
    phase = "globe"; globeT0 = performance.now();
    world.visible = false; gWorld.visible = true;
    camera.fov = 55; camera.updateProjectionMatrix();
    camera.position.set(0, 0, innerWidth < 700 ? 11 : 9); camera.lookAt(0, 0, 0);
    flash.style.transition = "opacity .8s ease"; flash.style.opacity = 0;
  }

  async function ecrire() {
    const total = LINES.reduce((s, l) => s + l[1].length, 0); let n = 0;
    const cur = document.createElement("span"); cur.className = "cur";
    for (const [kind, text] of LINES) {
      if (skipped) return;
      const ln = document.createElement("div"); ln.className = "ln " + kind;
      const pre = document.createElement("span"); pre.className = "p"; pre.textContent = kind === "cmd" ? "$ " : kind === "sys" ? "" : "> ";
      const tx = document.createElement("span");
      ln.append(pre, tx, cur); term.append(ln);
      for (const ch of text) {
        if (skipped) return;
        tx.textContent += ch; n++;
        const p = Math.round(n / total * 100); bar.style.width = p + "%"; pct.textContent = "SYSTEM BOOT " + p + "%";
        await sleep(kind === "cmd" ? 30 : 10);
      }
      await sleep(kind === "cmd" ? 200 : 100);
    }
  }

  try {
    init();
    q(".intro-skip").addEventListener("click", finir);
    addEventListener("keydown", (e) => { if (e.key === "Escape" || e.key === "Enter") finir(); });
    setTimeout(finir, 20000);
    (async () => {
      await sleep(600); await ecrire();
      if (skipped) return;
      await sleep(500); if (skipped) return;
      term.classList.add("hide"); phase = "fly"; flyT0 = performance.now();
    })();
  } catch (err) { finir(); }
})();

// ===== Portfolio : scripts (fond 3D, animations, formulaire) =====
const canvas = document.getElementById("bg");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
camera.position.z = 9;

// point rond
const c = document.createElement("canvas"); c.width = c.height = 64;
const g = c.getContext("2d");
const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(.5, "rgba(255,255,255,.9)"); gr.addColorStop(1, "rgba(255,255,255,0)");
g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
const dot = new THREE.CanvasTexture(c);

const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
const N = innerWidth < 700 ? 1800 : 3200;
const rnd = Math.random, PI2 = Math.PI * 2, golden = Math.PI * (3 - Math.sqrt(5));

// --- les 7 formes ---
function forme(fn) {
  const a = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { const p = fn(i); a[i*3] = p[0]; a[i*3+1] = p[1]; a[i*3+2] = p[2]; }
  return a;
}
function incliner(p, a) { const ca = Math.cos(a), sa = Math.sin(a); return [p[0], p[1] * ca - p[2] * sa, p[1] * sa + p[2] * ca]; }

// lettres "SB"
const TEXTE = "SB";
const tc = document.createElement("canvas"); tc.width = 400; tc.height = 200;
const tg = tc.getContext("2d");
tg.fillStyle = "#fff"; tg.font = "800 170px system-ui, Arial, sans-serif";
tg.textAlign = "center"; tg.textBaseline = "middle"; tg.fillText(TEXTE, 200, 108);
const px = tg.getImageData(0, 0, 400, 200).data, lettres = [];
for (let y = 0; y < 200; y++) for (let x = 0; x < 400; x++) if (px[(y * 400 + x) * 4 + 3] > 128) lettres.push(x, y);

function bord(a, b, k) { return a + (b - a) * k; }
const RAIN = 4;

// ===== Carte des menaces: la Terre en points =====
const TM_MASK = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgP9/APD//wMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD8//////////8HAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD+//////////8HAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD///////////8HAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD+//////////8HAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD+//v///////8HAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAD8HwD+//////8HAAAAAAAAAAAA/wEAAPj/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/P////8DAAAAAAAAAADAPwAA8P//PwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+P////8BAAAAAAAAAADwBwAA/P//PwAAAAAAAAAAAAAAAAAAAAAAAAD4DwAA8P////8AAAAAAAAAAAD8AAAA//////8PAAAAAAAAAAAAAAAAAIB/AADw/x8A8P////8AAAAAAAAAAAA+APz///////8fwA8AAAAAAAAAAQAAAMD/BwDA/38A4P///38AAAAAAAAAAIAPAP7///////9/+P8HAAAAAADA/wAABOD/fwCA//8BAP///38AAAAAAPwHAAACgP//////////////AAAAAAD4/////5//fwAA4P8DgP///z8AAAAAwP8/AAAA8P////////////////8DAAD+//////8DgOAHBP8PwP///w8AAAAA8P//Af//////////////////////AID/////////////B/wfwP///wcAAAAA/P//////////////////////////AMD/////////////D/5/wP//D8APAAAA/v//////////////////////////APD///////////+/j/8/gP//AfA/AAAA////////////////////////////AAD4//////////8P3v8fAP4/AOB/AACA////////////////////////////AAD8//////////8DGOEPAPwPAOAHAADw//3///////////////////////9/AAD///////////8A8IcAAPgHAAAAAAD8//7///////////////////////8/AID//////////z8AwB8AAPADAAAAAAD8P/7///////////////////////8HAAD+/////////z8AwH8AAOADAAAAAAD+P/7///////////////////9/8P8BAAD8f4D//////x8AwP8PAAABAAAAAAD+f/z///////////////////8f+D8AAADwHwD4/////z8AgP8fAAAAAAAAgAH8f/D//////////////////wMA/gAAAAD4AwDg/////38AgP8/AAAAAAAAwAfAH/L//////////////////wEA/wAAAAB8AACA//////8AgP9/AAAAAAAA4ANwH/7/////////////////fwCAfwAAAAAGAAAA/v////8/wP//AAAAAAAA0AdwB/7/////////////////PwCAfwAAAAABAAAA/P////9/wP//AQAAAAAA/A9w8v//////////////////DwCAPwAAAAAAAAAA+P//////8f//BwAAAAAAvB/8/////////////////////w0ADwAAAAAAAAAA+P//////+///DwAAAAAA/D///////////////////////w0ABwAAAAAAAAAA8P//////////HwAAAAAAzr///////////////////////w8AAQAAAAAAAAAA8P//////////GwAAAAAAgOP//////////////////////w8AAAAAAAAAAAAAgP//////////HAAAAAAAQPz//////////////////////w0AAAAAAAAAAAAAAP7///////8PPgAAAAAAAP///////////////////////w0AAAAAAAAAAAAAAP7///////8P/wAAAAAAgP///////////////////////wwAAAAAAAAAAAAAAP////////8fQAAAAAAAAPz////v8x//////////////fwQAAAAAAAAAAAAAAP//////////AQAAAAAAAPz///8D+A/8////////////PwQAAAAAAAAAAAAAAP////////8HAAAAAAAAAPz/+/8B+Af/////////////HwAAAAAAAAAAAAAAAP///////38AAAAAAAAA/P/P8/8A4Af/////////////Dz4AAAAAAAAAAAAAAP///////z8AAAAAAAAA+P+Ax/8A4Af+////////////Ax4AAAAAAAAAAAAAAP///////z8AAAAAAAAA+P8An/8AwD/+//////////8/AA8AAAAAAAAAAAAAAP///////wcAAAAAAAAA/B8w/P///x/8//////////8/AAMAAAAAAAAAAAAAAP///////wMAAAAAAAAA/A8wOMf//x/8/////////+8fAAMAAAAAAAAAAAAAAP7//////wMAAAAAAAAA+A8QP47//x/8/////////yMegAMAAAAAAAAAAAAAAP7//////wEAAAAAAAAA+A9AHJ7//z/4/////////38O4AMAAAAAAAAAAAAAAPz//////wEAAAAAAAAA6IN/CA7//z/8/////////x8c4AMAAAAAAAAAAAAAAPz//////wEAAAAAAAAAwP9/AHiA/////////////w88/gEAAAAAAAAAAAAAAPj//////wEAAAAAAAAAwP//ACAA/////////////w8EfwAAAAAAAAAAAAAAAOD/////fwAAAAAAAAAA+P//AACA/////////////x/gHgAAAAAAAAAAAAAAAMD/////HwAAAAAAAAAA/P///w+A/////////////z/AAQAAAAAAAAAAAAAAAID/////DwAAAAAAAAAA/P///z/w/////////////z/AAAAAAAAAAAAAAAAAAAD/////DwAAAAAAAAAA/P///////////////////z8AAAAAAAAAAAAAAAAAAAD///8HDwAAAAAAAAAA/P///////8///////////z8AAAAAAAAAAAAAAAAAAAD+/x8AHgAAAAAAAAAA/v///////5///////////z8AAAAAAAAAAAAAAAAAAAD+/w8AHgAAAAAAAACA/////////z///////////x8AAAAAAAAAAAAAAAAAAADc/w8AHAAAAAAAAADA//////8//3/0/////////x8AAAAAAAAAAAAAAAAAAAC4/wcACAAAAAAAAADA//////9//3/Y/////////y8AAAAAAAAAAAAAAAAAAAAw/wcAAAAAAAAAAADg//////9//v8fgP///////2cAAAAAAAAAAAAAAAAAAABA/gcAAgAAAAAAAADw/////////P9/AP///////3MAAAAAAAAAAAAAAAAAAAAA/AcAHwAAAAAAAADw/////////f//AP7/////fzAAAAAAAAAAAAAAAAAAAAAA/Aeg8AAAAAAAAAD4////////+f9/APz/P///ByAAAAAAAAAAAAAAAAAAAAAA/A8+4AMAAAAAAAD4////////8/9/APz/B/9/BAAAAAAAAAAAAAAAAAAAAAAA/A8eQHgAAAAAAAD4////////8/8/APD/A/4/DwAAAAAAAAAAAAAAAAAAAAAA4P8fAP4AAAAAAAD4////////4/8fAPD/Afw/AnAAAAAAAAAAAAAAAAAAAAAAgP8fABAAAAAAAAD4////////5/8PAPD/APx/AHAAAAAAAAAAAAAAAAAAAAAAAP4PAAAAAAAAAAD8////////x/8DAOB/APz/ADAAAAAAAAAAAAAAAAAAAAAAAPj/AQAAAAAAAAD8////////z/8BAOAfAOT/ADAAAAAAAAAAAAAAAAAAAAAAAAD/AQAAAAAAAAD8////////3z8AAMAfAMD/AXAAAAAAAAAAAAAAAAAAAAAAAADwAQAAAAAAAAD4/////////w8AAMAfAMD/AeABAAAAAAAAAAAAAAAAAAAAAADgAQAAAAAAAAD4/////////wMAAIAfAMD9AQAAAAAAAAAAAAAAAAAAAAAAAADgATAAAAAAAADw//////////8AAIAPAMD5AwAAAAAAAAAAAAAAAAAAAAAAAADAAfz/AAAAAADw/////////38AAAAPAMD4AAAAAAAAAAAAAAAAAAAAAAAAAAAAE///AAAAAADg/////////38AAAAPAMBgAAACAAAAAAAAAAAAAAAAAAAAAAAA/v//AQAAAADA/////////z8AAAAeAMAgAAADAAAAAAAAAAAAAAAAAAAAAAAA8P//AwAAAACA/////////z8AAAAwAMABAMAHAAAAAAAAAAAAAAAAAAAAAAAAwP//BwAAAAAA/v///////x8AAAAwAIADAAIHAAAAAAAAAAAAAAAAAAAAAAAAwP//fwAAAAAA/D/+/////x8AAAAwADgDAA8CAAAAAAAAAAAAAAAAAAAAAAAAwP///wEAAAAAEAT8/////w8AAAAAAHAHgAcAAAAAAAAAAAAAAAAAAAAAAAAAwP///wMAAAAAAADg/////wcAAAAAAOAO4AMAAAAAAAAAAAAAAAAAAAAAAAAAwP///wMAAAAAAADg/////wcAAAAAAOAP9AMAAAAAAAAAAAAAAAAAAAAAAAAA4P///wcAAAAAAADg/////wMAAAAAAMAL/uMBAAAAAAAAAAAAAAAAAAAAAAAA8P///w8AAAAAAADg/////wEAAAAAAIAH/vMAAAAAAAAAAAAAAAAAAAAAAAAA8P///x8AAAAAAADg/////wAAAAAAAAAP/HmABwAAAAAAAAAAAAAAAAAAAAAA+P///z8AAAAAAADg////fwAAAAAAAAAe/PmAfwAAAAAAAAAAAAAAAAAAAAAA+P////8fAAAAAADA////PwAAAAAAAAA8+HkA/wMAAAAAAAAAAAAAAAAAAAAA+P////8/AAAAAADA////HwAAAAAAAAB8+DkA/w8AAAAAAAAAAAAAAAAAAAAA+P//////AAAAAACA////HwAAAAAAAAA4AHgA/D8AAAAAAAAAAAAAAAAAAAAA+P//////AQAAAACA////DwAAAAAAAAAgABgA4H8AAAAAAAAAAAAAAAAAAAAA8P//////AQAAAAAA////DwAAAAAAAADgDwAA4P8AAAAAAAAAAAAAAAAAAAAA8P//////AwAAAAAA/v//DwAAAAAAAADAfwAAwP8AAAAAAAAAAAAAAAAAAAAA4P//////AwAAAAAA/v//DwAAAAAAAAAAfAAAwP8AAAAAAAAAAAAAAAAAAAAAwP//////AQAAAAAA/v//HwAAAAAAAAAAAAAAAIIBAAAAAAAAAAAAAAAAAAAAwP//////AQAAAAAA/v//HwAAAAAAAAAAAAAAAAQEAAAAAAAAAAAAAAAAAAAAgP//////AAAAAAAA/v//HwAAAAAAAAAAAAAAAQQAAAAAAAAAAAAAAAAAAAAAgP////9/AAAAAAAA/v//HyAAAAAAAAAAAADAHwYAAAAAAAAAAAAAAAAAAAAAAP////9/AAAAAAAA/v//HzAAAAAAAAAAAADADw4AAAAAAAAAAAAAAAAAAAAAAP////8/AAAAAAAA/v//H3AAAAAAAAAAAAD+Dw4AAAAAAAAAAAAAAAAAAAAAAP7///8/AAAAAAAA/v//H3gAAAAAAAAAAAD/Hz4AAAAAAAAAAAAAAAAAAAAAAPj///8/AAAAAAAA////D38AAAAAAAAAAAD/Pz4AAAAAAAAAAAAAAAAAAAAAAPD///8/AAAAAAAA////Bz8AAAAAAAAAAID//38AAAAAAAAAAAAAAAAAAAAAAPD///8/AAAAAAAA////Az8AAAAAAAAAAMD//38AAAAAAAAAAAAAAAAAAAAAAOD///8fAAAAAAAA////AT8AAAAAAAAAAOD///8AAAAAAAAAAAAAAAAAAAAAAOD///8fAAAAAAAA/v//AB8AAAAAAAAAAP////8DAAAAAAAAAAAAAAAAAAAAAOD///8PAAAAAAAA/v//AB8AAAAAAAAAwP////8DAAAAAAAAAAAAAAAAAAAAAOD///8PAAAAAAAA/P//gB8AAAAAAAAA4P////8HAAAAAAAAAAAAAAAAAAAAAOD///8BAAAAAAAA/P//gA8AAAAAAAAA4P////8PAAAAAAAAAAAAAAAAAAAAAOD//z8AAAAAAAAA/P//AA8AAAAAAAAAwP////8fAAAAAAAAAAAAAAAAAAAAAOD//x8AAAAAAAAA+P8/AAIAAAAAAAAAwP////8/AAAAAAAAAAAAAAAAAAAAAOD//x8AAAAAAAAA+P8fAAAAAAAAAAAAwP////8/AAAAAAAAAAAAAAAAAAAAAOD//w8AAAAAAAAA8P8fAAAAAAAAAAAAwP////8/AAAAAAAAAAAAAAAAAAAAAOD//w8AAAAAAAAA8P8fAAAAAAAAAAAAwP////8/AAAAAAAAAAAAAAAAAAAAAOD//w8AAAAAAAAA8P8PAAAAAAAAAAAAwP////8/AAAAAAAAAAAAAAAAAAAAAPD//wcAAAAAAAAA4P8PAAAAAAAAAAAAgP////8/AAAAAAAAAAAAAAAAAAAAAPD//wcAAAAAAAAA4P8HAAAAAAAAAAAAgP////8fAAAAAAAAAAAAAAAAAAAAAPD//wMAAAAAAAAA4P8BAAAAAAAAAAAAgP8H/P8fAAAAAAAAAAAAAAAAAAAAAPD//wEAAAAAAAAAwP8AAAAAAAAAAAAAgP8A+P8PAAAAAAAAAAAAAAAAAAAAAPj//wAAAAAAAAAAwD8AAAAAAAAAAAAAgA8AyP8PAAABAAAAAAAAAAAAAAAAAPj/DwAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAwP8PAAACAAAAAAAAAAAAAAAAAPz/DwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgP8HAAAGAAAAAAAAAAAAAAAAAPz/BwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP8HAAB8AAAAAAAAAAAAAAAAAPz/BwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP8AAAA8AAAAAAAAAAAAAAAAAPx/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAA+AAAAAAAAAAAAAAAAAPwfAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOABAAAZAAAAAAAAAAAAAAAAAPwPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOABAIAPAAAAAAAAAAAAAAAAAPwfAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOABAIAHAAAAAAAAAAAAAAAAAPwPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMABAMABAAAAAAAAAAAAAAAAAPwPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPAAAAAAAAAAAAAAAAAAAPwHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHwAAAAAAAAAAAAAAAAAAP4BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAP4DAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP4HAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPwDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPwBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const thBits = Uint8Array.from(atob(TM_MASK), (ch) => ch.charCodeAt(0));
const thLand = (lat, lon) => { const i = Math.min(359, Math.max(0, Math.floor(lon + 180))), j = Math.min(179, Math.max(0, Math.floor(90 - lat))), k = j * 360 + i; return (thBits[k >> 3] >> (k & 7)) & 1; };
const TM_TILT = .32;
function thTilt(p) { const c = Math.cos(TM_TILT), s = Math.sin(TM_TILT); return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]; }
function earthForme() {
  let M = Math.round(N / .27), pts = [];
  for (let essai = 0; essai < 6; essai++) {
    pts = [];
    for (let i = 0; i < M; i++) {
      const y = 1 - 2 * (i + .5) / M, r = Math.sqrt(1 - y * y), th = golden * i, x = Math.sin(th) * r, z = Math.cos(th) * r;
      if (thLand(Math.asin(y) * 180 / Math.PI, Math.atan2(x, z) * 180 / Math.PI)) pts.push([x, y, z]);
    }
    if (pts.length >= N) break;
    M = Math.round(M * N / Math.max(1, pts.length) * 1.05);
  }
  while (pts.length > N) pts.splice(Math.floor(rnd() * pts.length), 1);
  while (pts.length < N) { const p = pts[Math.floor(rnd() * pts.length)]; pts.push([p[0] + (rnd() - .5) * .02, p[1] + (rnd() - .5) * .02, p[2] + (rnd() - .5) * .02]); }
  return forme((i) => thTilt(pts[i]).map((v) => v * 2.4));
}
const formes = [
  earthForme(),
  forme(() => { const k = Math.floor(rnd() * (lettres.length / 2)) * 2; return [(lettres[k] - 200) / 400 * 6.6 + (rnd() - .5) * .03, -(lettres[k + 1] - 100) / 200 * 3.3 + (rnd() - .5) * .03, (rnd() - .5) * .35]; }),
  forme(() => {
    const hw = (y) => y > .3 ? 1.9 : 1.9 * Math.sqrt(Math.max(0, (y + 2.7) / 3)), r = rnd();
    if (r < .14) {
      const s = rnd() < .35, k = rnd();
      return s ? [bord(-.8, -.2, k), bord(-.05, -.75, k), (rnd() - .5) * .2] : [bord(-.2, .9, k), bord(-.75, .85, k), (rnd() - .5) * .2];
    }
    const y = -2.7 + rnd() * 5.1;
    if (r < .5) return [(rnd() < .5 ? -1 : 1) * hw(y) * (.96 + rnd() * .04), y, (rnd() - .5) * .3];
    if (r < .56) return [(rnd() * 2 - 1) * 1.9, 2.4, (rnd() - .5) * .3];
    return [(rnd() * 2 - 1) * hw(y) * .96, y, (rnd() - .5) * .3];
  }),
  forme(() => {
    const r = rnd();
    if (r < .3) { const an = rnd() * Math.PI; return [Math.cos(an) * 1.05, .55 + Math.sin(an) * 1.15, (rnd() - .5) * .3]; }
    if (r < .36) return [rnd() < .5 ? -1.05 : 1.05, .55 - rnd() * .5, (rnd() - .5) * .3];
    for (;;) {
      let x, y;
      if (rnd() < .45) {
        if (rnd() < .5) { x = bord(-1.6, 1.6, rnd()); y = rnd() < .5 ? -1.9 : .1; }
        else { x = rnd() < .5 ? -1.6 : 1.6; y = bord(-1.9, .1, rnd()); }
      } else { x = bord(-1.6, 1.6, rnd()); y = bord(-1.9, .1, rnd()); }
      const trou = Math.hypot(x, y + .6) < .34 || (Math.abs(x) < .12 && y < -.6 && y > -1.3);
      if (!trou) return [x, y + .2, (rnd() - .5) * .3];
    }
  }),
  forme((i) => [((i % 40) / 39 - .5) * 8, (rnd() - .5) * 7.2, (rnd() - .5) * 1.2]),
  forme(() => {
    const r = rnd();
    if (r < .4) { const an = rnd() * PI2; return [-1.8 + Math.cos(an) * .95, Math.sin(an) * .95, (rnd() - .5) * .3]; }
    if (r < .45) { const an = rnd() * PI2; return [-1.8 + Math.cos(an) * .35, Math.sin(an) * .35, (rnd() - .5) * .3]; }
    if (r < .8) return [bord(-.85, 3, rnd()), (rnd() - .5) * .16, (rnd() - .5) * .3];
    const d = Math.floor(rnd() * 3);
    return [[1.8, 2.4, 3][d] + (rnd() - .5) * .1, -rnd() * [.8, .55, .8][d], (rnd() - .5) * .3];
  }),
  forme(() => {
    for (;;) {
      const k = 1 + Math.floor(rnd() * 9), an = rnd() * PI2;
      if (Math.sin(an * 2 + k * 1.7) > .8) continue;
      const rad = k * .3 + Math.sin(an * 3 + k) * .05;
      return [Math.cos(an) * rad * .85, Math.sin(an) * rad * 1.15 + .2, (rnd() - .5) * .25];
    }
  })
];

// --- points, couleurs ---
const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), phase = new Float32Array(N), vit = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const k = rnd(), b = .6 + rnd() * .4;
  col[i*3] = (.239 + (.22 - .239) * k) * b; col[i*3+1] = (.863 + (.74 - .863) * k) * b; col[i*3+2] = (.592 + (.97 - .592) * k) * b;
  phase[i] = rnd() * PI2;
  vit[i] = .5 + (((i % 40) * 37) % 17) / 17 * 1.3;
}
const pAttr = new THREE.BufferAttribute(pos, 3);
const geo = new THREE.BufferGeometry();
geo.setAttribute("position", pAttr); geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
const mat = new THREE.PointsMaterial({ size: .06, map: dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const nuage = new THREE.Points(geo, mat); nuage.frustumCulled = false;
const groupe = new THREE.Group(); groupe.add(nuage); scene.add(groupe);

// ===== Threat Map =====
const TM_R = 2.4, TM_MAX = 9, TM_K = 24, TM_RP = 28;
const TM_HOME = ["Tétouan", 35.6, -5.4];
const TM_CITIES = [["New York", 40.7, -74], ["Los Angeles", 34, -118.2], ["Mexico", 19.4, -99.1], ["São Paulo", -23.5, -46.6], ["Buenos Aires", -34.6, -58.4], ["Londres", 51.5, -.1], ["Berlin", 52.5, 13.4], ["Moscou", 55.7, 37.6], ["Istanbul", 41, 29], ["Le Caire", 30, 31.2], ["Lagos", 6.5, 3.4], ["Johannesburg", -26.2, 28], ["Dubaï", 25.2, 55.3], ["Mumbai", 19.1, 72.9], ["Pékin", 39.9, 116.4], ["Séoul", 37.5, 127], ["Tokyo", 35.7, 139.7], ["Singapour", 1.35, 103.8], ["Sydney", -33.9, 151.2]];
const TM_TYPES = ["DDoS", "Phishing", "Injection SQL", "Brute force", "XSS", "Ransomware", "Scan de ports", "Zero-day"];
const TM_ROUGE = [1, .25, .3], TM_VERT = [.24, .86, .59];
function thLL(lat, lon) { const la = lat * Math.PI / 180, lo = lon * Math.PI / 180; return thTilt([Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)]); }

const thOcc = new THREE.Mesh(new THREE.SphereGeometry(TM_R - .06, 48, 32), new THREE.MeshBasicMaterial({ color: 0x070b18 }));
const thAtm = new THREE.Mesh(new THREE.SphereGeometry(TM_R + .26, 48, 32), new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color(0x3ddc97) } }, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: "varying vec3 vN; varying vec3 vV;\nvoid main() {\n  vN = normalize(normalMatrix * normal);\n  vec4 mv = modelViewMatrix * vec4(position, 1.0);\n  vV = normalize(-mv.xyz);\n  gl_Position = projectionMatrix * mv;\n}\n",
  fragmentShader: "varying vec3 vN; varying vec3 vV; uniform vec3 uColor;\nvoid main() {\n  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));\n  float a = pow(f, 3.2);\n  gl_FragColor = vec4(uColor * a * 0.9, a);\n}\n"
}));
groupe.add(thOcc); groupe.add(thAtm);

function thPoints(n, size) {
  const g = new THREE.BufferGeometry(), p = new Float32Array(n * 3), c = new Float32Array(n * 3);
  g.setAttribute("position", new THREE.BufferAttribute(p, 3)); g.setAttribute("color", new THREE.BufferAttribute(c, 3));
  const m = new THREE.PointsMaterial({ size: size, map: dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const o = new THREE.Points(g, m); o.frustumCulled = false; o.userData = { p: p, c: c, g: g };
  return o;
}
const thArcs = thPoints(TM_MAX * TM_K, .075), thRings = thPoints(TM_MAX * 2 * TM_RP, .05);
groupe.add(thArcs); groupe.add(thRings);

const thHud = { total: document.getElementById("thTotal"), blocked: document.getElementById("thBlocked"), feed: document.getElementById("thFeed") };
let thAct = [], thNext = 0, thTotal = 0, thBlocked = 0;
function thLog(src, dst, type, ok) {
  if (!thHud.feed) return;
  const d = new Date(), h = [d.getHours(), d.getMinutes(), d.getSeconds()].map((v) => String(v).padStart(2, "0")).join(":");
  const li = document.createElement("li");
  li.className = ok ? "ok" : "bad";
  li.textContent = "[" + h + "] " + src + " → " + dst + " · " + type + " · " + (ok ? "BLOQUÉE" : "DÉTECTÉE");
  thHud.feed.prepend(li);
  while (thHud.feed.children.length > 4) thHud.feed.lastChild.remove();
}
function thSpawn(t) {
  const versMaison = rnd() < .7, s = TM_CITIES[Math.floor(rnd() * TM_CITIES.length)];
  let d = TM_HOME;
  if (!versMaison) { do { d = TM_CITIES[Math.floor(rnd() * TM_CITIES.length)]; } while (d === s); }
  const a = thLL(s[1], s[2]), b = thLL(d[1], d[2]);
  const w = Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
  let e1 = [-b[2], 0, b[0]]; const l = Math.hypot(e1[0], e1[2]) || 1; e1 = [e1[0] / l, 0, e1[2] / l];
  const e2 = [b[1] * e1[2] - b[2] * e1[1], b[2] * e1[0] - b[0] * e1[2], b[0] * e1[1] - b[1] * e1[0]];
  thAct.push({ a: a, b: b, w: w, e1: e1, e2: e2, t0: t, dur: 1.4 + w * .8, home: versMaison });
  thTotal++; if (thHud.total) thHud.total.textContent = thTotal.toLocaleString("fr-FR");
  thLog(s[0], d[0], TM_TYPES[Math.floor(rnd() * TM_TYPES.length)], versMaison);
}
function thArcPos(at, tt, out, o) {
  const s = Math.sin(at.w) || 1e-4, k1 = Math.sin((1 - tt) * at.w) / s, k2 = Math.sin(tt * at.w) / s;
  const x = at.a[0] * k1 + at.b[0] * k2, y = at.a[1] * k1 + at.b[1] * k2, z = at.a[2] * k1 + at.b[2] * k2, L = Math.hypot(x, y, z) || 1;
  const r = TM_R + .03 + TM_R * (.08 + .3 * (at.w / Math.PI)) * Math.sin(Math.PI * tt);
  out[o] = x / L * r; out[o + 1] = y / L * r; out[o + 2] = z / L * r;
}
function thUpdate(t, cur) {
  const on = cur < .03 && !calm;
  thOcc.visible = thAtm.visible = cur < .03;
  thArcs.visible = thRings.visible = on;
  if (!on) return;
  if (t > thNext && thAct.length < TM_MAX) { thSpawn(t); thNext = t + .5 + rnd() * .9; }
  const ap = thArcs.userData.p, ac = thArcs.userData.c, rp = thRings.userData.p, rc = thRings.userData.c;
  ac.fill(0); rc.fill(0);
  thArcs.material.opacity = thRings.material.opacity = mat.opacity;
  for (let n = thAct.length - 1; n >= 0; n--) {
    const at = thAct[n], u = (t - at.t0) / at.dur, fin = at.t0 + at.dur;
    if (t - fin > 1.2) { thAct.splice(n, 1); continue; }
    if (u >= 1 && !at.fait) { at.fait = true; if (at.home) { thBlocked++; if (thHud.blocked) thHud.blocked.textContent = thBlocked.toLocaleString("fr-FR"); } }
    const col = at.home && u >= 1 ? TM_VERT : TM_ROUGE, head = Math.min(1, u), fade = u <= 1 ? 1 : Math.max(0, 1 - (u - 1) * 4);
    for (let j = 0; j < TM_K; j++) {
      const tj = head - j * .022, o = (n * TM_K + j) * 3;
      if (tj < 0) continue;
      thArcPos(at, tj, ap, o);
      const b = Math.pow(1 - j / TM_K, 1.6) * fade;
      ac[o] = col[0] * b; ac[o + 1] = col[1] * b; ac[o + 2] = col[2] * b;
    }
    if (u >= 1) {
      for (let r = 0; r < (at.home ? 2 : 1); r++) {
        const e = Math.min(1, Math.max(0, (t - fin - r * .18) / 1.1));
        if (e <= 0 || e >= 1) continue;
        const rho = .04 + .38 * e, b = Math.pow(1 - e, 1.4);
        for (let k = 0; k < TM_RP; k++) {
          const ph = k / TM_RP * PI2, c1 = Math.cos(ph) * rho, s1 = Math.sin(ph) * rho, o = ((n * 2 + r) * TM_RP + k) * 3;
          rp[o] = at.b[0] * (TM_R + .03) + at.e1[0] * c1 + at.e2[0] * s1; rp[o + 1] = at.b[1] * (TM_R + .03) + at.e1[1] * c1 + at.e2[1] * s1; rp[o + 2] = at.b[2] * (TM_R + .03) + at.e1[2] * c1 + at.e2[2] * s1;
          rc[o] = col[0] * b; rc[o + 1] = col[1] * b; rc[o + 2] = col[2] * b;
        }
      }
    }
  }
  thArcs.userData.g.attributes.position.needsUpdate = true; thArcs.userData.g.attributes.color.needsUpdate = true;
  thRings.userData.g.attributes.position.needsUpdate = true; thRings.userData.g.attributes.color.needsUpdate = true;
}

// --- taille / position ---
let base = .95;
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  if (w < 700) { camera.position.z = 11; groupe.position.set(0, .6, 0); groupe.scale.setScalar(.75); base = .6; }
  else { camera.position.z = 9; groupe.position.set(2.6, 0, 0); groupe.scale.setScalar(1); base = .95; }
  mesurer();
}

const secs = [...document.querySelectorAll("main section")];
let tops = [];
function mesurer() { tops = secs.map((s) => s.offsetTop); }
function cible() {
  if (!tops.length) return 0;
  const y = scrollY + innerHeight * .5;
  let i = 0; for (let k = 0; k < tops.length; k++) if (y >= tops[k]) i = k;
  if (i >= tops.length - 1) return i;
  const frac = (y - tops[i]) / (tops[i + 1] - tops[i]);
  return i + Math.min(1, Math.max(0, (frac - .6) / .4));
}
addEventListener("resize", resize); addEventListener("load", mesurer); resize();

let tx = 0, ty = 0, sy = 0, rx = 0, ry = 0, cur = 0;
addEventListener("pointermove", (e) => { tx = (e.clientX / innerWidth - .5) * .8; ty = (e.clientY / innerHeight - .5) * .8; });
addEventListener("scroll", () => { sy = scrollY; }, { passive: true });

(function loop() {
  requestAnimationFrame(loop);
  const t = performance.now() * .001;
  cur += (cible() - cur) * .07;
  const a = Math.floor(cur + 1e-4), mm = cur - a, m = mm * mm * (3 - 2 * mm);
  const A = formes[a % formes.length], B = formes[(a + 1) % formes.length];
  const w5 = calm ? 0 : ((a % formes.length === RAIN ? 1 - m : 0) + ((a + 1) % formes.length === RAIN ? m : 0));
  for (let i = 0; i < N; i++) {
    const o = i * 3, ph = phase[i];
    let x = A[o] + (B[o] - A[o]) * m, y = A[o+1] + (B[o+1] - A[o+1]) * m, z = A[o+2] + (B[o+2] - A[o+2]) * m;
    if (w5 > 0) { const yy = (((y + 3.6 - t * vit[i]) % 7.2) + 7.2) % 7.2 - 3.6; y = y * (1 - w5) + yy * w5; }
    if (!calm) { x += Math.sin(t * 1.1 + ph) * .03; y += Math.cos(t * .9 + ph * 1.3) * .03; z += Math.sin(t * .8 + ph * .7) * .03; }
    pos[o] = x; pos[o+1] = y; pos[o+2] = z;
  }
  pAttr.needsUpdate = true;
  rx += (ty - rx) * .05; ry += (tx - ry) * .05;
  groupe.rotation.y = (calm ? 0 : Math.sin(t * .35) * .55) + ry * .5;
  groupe.rotation.x = rx * .3;
  thUpdate(t, cur);
  mat.opacity = base * (1 - .4 * Math.min(1, sy / innerHeight));
  renderer.render(scene, camera);
})();

// ===== Menu mobile =====
const nav = document.getElementById("nav"), burger = document.getElementById("burger");
burger.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  burger.setAttribute("aria-expanded", open);
});
nav.addEventListener("click", (e) => { if (e.target.tagName === "A") { nav.classList.remove("open"); burger.setAttribute("aria-expanded", "false"); } });

// ===== Lien actif =====
const links = document.querySelectorAll("nav a");
const io = new IntersectionObserver((list) => {
  list.forEach((en) => { if (en.isIntersecting) links.forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#" + en.target.id)); });
}, { threshold: .5 });
document.querySelectorAll("section").forEach((s) => io.observe(s));

// ===== Compteurs et barres de pourcentage =====
function animer(node, to, suffixe) {
  if (calm) { node.textContent = to + suffixe; return; }
  const t0 = performance.now(), d = 1200;
  (function f(now) {
    const k = Math.min(1, (now - t0) / d);
    node.textContent = Math.round(to * k) + suffixe;
    if (k < 1) requestAnimationFrame(f);
  })(t0);
}
function remplir(el) {
  const v = Math.max(0, Math.min(100, +el.dataset.level));
  el.querySelector(".fill").style.width = v + "%";
  animer(el.querySelector(".pct"), v, "%");
}
function compter(n) { animer(n, +n.dataset.count, n.dataset.suffix || ""); }

// ===== Filtres des projets =====
const boutons = document.querySelectorAll(".filters button");
boutons.forEach((b) => b.addEventListener("click", () => {
  boutons.forEach((x) => x.setAttribute("aria-pressed", x === b));
  document.querySelectorAll("#projets article.card").forEach((c) => { c.hidden = b.dataset.f !== "all" && c.dataset.cat !== b.dataset.f; });
}));

// ===== Formulaire de contact =====
const CLE_WEB3FORMS = "TA_CLE_ICI";
const EMAIL = "saadbououicha@gmail.com";
const formulaire = document.getElementById("form"), statut = document.getElementById("statut");
formulaire.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(formulaire);
  if (CLE_WEB3FORMS === "TA_CLE_ICI") {
    const sujet = encodeURIComponent("Contact depuis le portfolio - " + f.get("nom"));
    const corps = encodeURIComponent(f.get("message") + "\n\n" + f.get("nom") + " (" + f.get("email") + ")");
    location.href = "mailto:" + EMAIL + "?subject=" + sujet + "&body=" + corps;
    return;
  }
  const bouton = formulaire.querySelector("button[type=submit]");
  bouton.disabled = true; statut.textContent = "Envoi en cours...";
  f.append("access_key", CLE_WEB3FORMS);
  f.append("subject", "Nouveau message depuis ton portfolio");
  f.append("from_name", "Portfolio");
  try {
    const r = await fetch("https://api.web3forms.com/submit", { method: "POST", body: f });
    const j = await r.json();
    if (!j.success) throw new Error("echec");
    statut.textContent = "Message envoyé. Merci, je te réponds vite.";
    formulaire.reset();
  } catch (err) {
    statut.textContent = "L'envoi a échoué. Écris-moi directement à " + EMAIL;
  }
  bouton.disabled = false;
});

// ===== Bouton retour en haut =====
const haut = document.getElementById("top");
addEventListener("scroll", () => haut.classList.toggle("vis", scrollY > 600), { passive: true });

// ===== Texte qui s'écrit (style terminal) =====
const MOTS = ["whoami", "Étudiant ingénieur en informatique", "Cybersécurité", "Robotique"];
const zoneTexte = document.getElementById("typed");
if (calm) { zoneTexte.textContent = MOTS[1]; }
else {
  let mot = 0, lettre = 0, efface = false;
  (function tape() {
    const m = MOTS[mot];
    lettre += efface ? -1 : 1;
    zoneTexte.textContent = m.slice(0, lettre);
    let d = efface ? 35 : 70;
    if (!efface && lettre === m.length) { efface = true; d = 1500; }
    else if (efface && lettre === 0) { efface = false; mot = (mot + 1) % MOTS.length; d = 350; }
    setTimeout(tape, d);
  })();
}

// ===== Apparition au scroll =====
const aAnimer = document.querySelectorAll("section h1, section h2, section > p, .about-text > p, .photo, .btns, .card, .skills, .bar, .step, .stats, .filters, .coltitle, .term");
const ro = new IntersectionObserver((list) => {
  list.forEach((en) => {
    if (!en.isIntersecting) return;
    const el = en.target;
    el.classList.add("show"); ro.unobserve(el);
    if (el.dataset.level) remplir(el);
    el.querySelectorAll("[data-count]").forEach((n) => compter(n));
  });
}, { threshold: .15 });
aAnimer.forEach((el) => {
  el.classList.add("reveal");
  const rang = [...el.parentElement.children].indexOf(el);
  el.style.transitionDelay = Math.min(rang, 5) * 90 + "ms";
  (window.__introDone || Promise.resolve()).then(() => ro.observe(el));
});

document.getElementById("annee").textContent = new Date().getFullYear();
