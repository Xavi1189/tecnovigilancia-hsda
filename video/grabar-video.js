/*
 * Graba el video informativo de la app de Tecnovigilancia HSDA.
 *
 * Abre la app real en Chromium (Playwright), la llena paso a paso con un caso de ejemplo,
 * muestra los errores de llenado más comunes y cómo corregirlos, y captura cada cuadro
 * de pantalla. Al final arma el MP4 con ffmpeg.
 *
 * Requisitos: node + playwright, ffmpeg, python3 con pymupdf (para mostrar el PDF generado),
 * y pdf-lib.min.js local (la CDN puede estar bloqueada). Ver video/README.md.
 *
 * Uso:  node video/grabar-video.js
 * Variables opcionales: FFMPEG, PDFLIB_JS, OUT (ruta del .mp4), WORK (carpeta temporal).
 *
 * Nada se envía por correo: el POST al Apps Script se intercepta y se responde localmente.
 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const { execFileSync } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

const ROOT = path.resolve(__dirname, '..');
const WORK = process.env.WORK || path.join(require('os').tmpdir(), 'tv-video');
const OUT = process.env.OUT || path.join(__dirname, 'guia-tecnovigilancia-hsda.mp4');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const PDFLIB_JS = process.env.PDFLIB_JS || require.resolve('pdf-lib/dist/pdf-lib.min.js');
const APP_URL = 'https://tecnovigilancia-hsda-reportes.vercel.app';
const W = 1280, H = 720, SCALE = 1.5;

fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(path.join(WORK, 'frames'), { recursive: true });

/* ---------- servidor local de la app ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg', '.pdf': 'application/pdf', '.svg': 'image/svg+xml', '.png': 'image/png' };
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const p = decodeURIComponent(req.url.split('?')[0]);
      const f = p.startsWith('/__work/') ? path.join(WORK, p.slice(8)) : path.join(ROOT, p === '/' ? 'index.html' : p);
      fs.readFile(f, (err, buf) => {
        if (err) { rsp.writeHead(404); rsp.end(); return; }
        rsp.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
        rsp.end(buf);
      });
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const readMs = t => Math.max(3200, t.split(/\s+/).length * 330 + 1200);

/* ---------- capa visual del video (panel lateral, cursor, tarjetas) ---------- */
const OVERLAY_CSS = `
.blob{animation:none!important}
body{justify-content:flex-end!important;padding-right:44px}
.app-container{zoom:.9}
.pro-modal{left:600px!important}
#tvPanel{position:fixed;left:0;top:0;bottom:0;width:600px;z-index:5000;padding:46px 44px 40px 52px;display:flex;flex-direction:column;
  background:linear-gradient(160deg,#2F4760 0%,#3C5775 60%,#4A6788 100%);color:#fff;font-family:"Jost",sans-serif}
#tvPanel .brand{display:flex;align-items:center;gap:14px;font-size:.95rem;letter-spacing:.12em;text-transform:uppercase;opacity:.85}
#tvPanel .brand img{width:46px;height:46px;border-radius:10px}
#tvPanel .chip{display:inline-block;margin-top:40px;padding:7px 16px;border-radius:999px;background:rgba(255,255,255,.14);font-size:.95rem;font-weight:600;letter-spacing:.04em;align-self:flex-start}
#tvPanel h2{font-family:"Bodoni Moda",Georgia,serif;font-size:2.35rem;line-height:1.15;margin-top:18px;font-weight:700}
#tvPanel .txt{font-size:1.45rem;line-height:1.45;margin-top:22px;color:#EEF2F7}
#tvPanel .txt b{color:#fff}
#tvPanel .badge{display:none;margin-top:26px;padding:14px 18px;border-radius:16px;font-size:1.2rem;font-weight:600;line-height:1.35}
#tvPanel .badge.bad{display:block;background:#FBE9E7;color:#8F1D13;border-left:6px solid #B42318}
#tvPanel .badge.ok{display:block;background:#E7F3EC;color:#1F5F3A;border-left:6px solid #2E8B57}
#tvPanel .badge.tip{display:block;background:rgba(255,255,255,.14);color:#fff;border-left:6px solid #A5B7CF}
#tvPanel .foot{margin-top:auto;font-size:.9rem;opacity:.7}
#tvPanel .fade{transition:opacity .35s ease}
#tvPanel.swap .fade{opacity:0}
#tvCursor{position:fixed;left:0;top:0;width:30px;height:30px;z-index:6000;pointer-events:none;transition:transform .7s cubic-bezier(.45,.05,.2,1);transform:translate(900px,650px)}
#tvCursor svg{filter:drop-shadow(0 3px 4px rgba(0,0,0,.35))}
.tvRipple{position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid #3C5775;z-index:5999;pointer-events:none;animation:tvRip .6s ease-out forwards}
@keyframes tvRip{from{transform:scale(.3);opacity:1}to{transform:scale(1.6);opacity:0}}
.tvHi{outline:4px solid #E5A023!important;outline-offset:4px;border-radius:14px;transition:outline-color .3s}
#tvCard{position:fixed;inset:0;z-index:7000;display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .6s ease;
  background:radial-gradient(circle at 20% 20%,#4A6788 0%,#2F4760 55%,#243649 100%);color:#fff;font-family:"Jost",sans-serif}
#tvCard.on{opacity:1}
#tvCard .in{width:1100px;display:flex;gap:56px;align-items:center}
#tvCard .col{flex:1}
#tvCard .kick{font-size:1.05rem;letter-spacing:.16em;text-transform:uppercase;opacity:.8}
#tvCard h1{font-family:"Bodoni Moda",Georgia,serif;font-size:3.4rem;line-height:1.1;margin:14px 0 18px}
#tvCard p{font-size:1.5rem;line-height:1.45;color:#E3E9F1}
#tvCard ul{list-style:none;margin-top:10px}
#tvCard li{font-size:1.4rem;line-height:1.35;padding:10px 0 10px 44px;position:relative;color:#EEF2F7}
#tvCard li::before{content:"✓";position:absolute;left:0;top:8px;width:30px;height:30px;border-radius:50%;background:#77857F;display:grid;place-items:center;font-size:1rem;font-weight:700}
#tvCard li.x::before{content:"✗";background:#B42318}
#tvCard .pair{display:grid;grid-template-columns:1fr 1fr;gap:10px 26px;margin-top:8px}
#tvCard .pair div{font-size:1.12rem;line-height:1.3;padding:12px 16px;border-radius:14px}
#tvCard .pair .x{background:rgba(180,35,24,.25);border-left:5px solid #E0624F}
#tvCard .pair .v{background:rgba(119,133,127,.35);border-left:5px solid #9FD0B0}
#tvCard .pair .hd{background:none;font-weight:700;letter-spacing:.12em;text-transform:uppercase;font-size:.95rem;padding:0 4px}
#tvCard .phone{width:300px;border-radius:40px;padding:12px;background:#111;box-shadow:0 30px 80px rgba(0,0,0,.45)}
#tvCard .phone img{width:100%;border-radius:30px;display:block}
#tvCard .logo{width:170px;border-radius:24px;box-shadow:0 20px 50px rgba(0,0,0,.3)}
#tvCard .url{display:inline-block;margin-top:18px;padding:12px 22px;border-radius:14px;background:#fff;color:#2F4760;font-weight:700;font-size:1.45rem}
#tvCard .qr{width:250px;background:#fff;padding:16px;border-radius:22px}
#tvCard .pdf{width:430px;border-radius:8px;box-shadow:0 30px 80px rgba(0,0,0,.45);background:#fff}
`;

async function setupOverlay(page) {
  await page.addStyleTag({ content: OVERLAY_CSS });
  await page.evaluate(() => {
    const panel = document.createElement('aside');
    panel.id = 'tvPanel';
    panel.innerHTML = `<div class="brand"><img src="hsda-logo.jpg" alt="">Guía rápida · Tecnovigilancia HSDA</div>
      <span class="chip fade"></span><h2 class="fade"></h2><div class="txt fade"></div><div class="badge fade"></div>
      <div class="foot">Datos de ejemplo · Caso ficticio con fines de capacitación</div>`;
    document.body.appendChild(panel);
    const cur = document.createElement('div');
    cur.id = 'tvCursor';
    cur.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24"><path d="M4 2l15 11-6.5 1.2L16 21l-3 1.4-3.3-6.9L4 20z" fill="#fff" stroke="#1d2533" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    document.body.appendChild(cur);
    const card = document.createElement('div');
    card.id = 'tvCard';
    document.body.appendChild(card);
  });
}

function makeDirector(page) {
  let cx = 900, cy = 650;
  const d = {
    async panel({ chip, title, text, badge, kind }) {
      await page.evaluate(async o => {
        const p = document.getElementById('tvPanel');
        p.classList.add('swap');
        await new Promise(r => setTimeout(r, 350));
        if (o.chip !== undefined) p.querySelector('.chip').textContent = o.chip;
        if (o.title !== undefined) p.querySelector('h2').textContent = o.title;
        if (o.text !== undefined) p.querySelector('.txt').innerHTML = o.text;
        const b = p.querySelector('.badge');
        b.className = 'badge fade' + (o.badge ? ' ' + (o.kind || 'tip') : '');
        b.innerHTML = o.badge || '';
        p.classList.remove('swap');
      }, { chip, title, text, badge, kind });
    },
    /* Cambia el panel y deja tiempo de lectura */
    async say(o, ms) {
      await d.panel(o);
      await sleep(ms || readMs([o.title, o.text, o.badge].filter(Boolean).join(' ').replace(/<[^>]+>/g, '')));
    },
    async badge(badge, kind, ms) {
      await page.evaluate(o => {
        const b = document.querySelector('#tvPanel .badge');
        b.className = 'badge fade' + (o.badge ? ' ' + o.kind : '');
        b.innerHTML = o.badge || '';
      }, { badge, kind });
      if (badge) await sleep(ms || readMs(badge.replace(/<[^>]+>/g, '')));
    },
    async card(html, ms) {
      await page.evaluate(h => { const c = document.getElementById('tvCard'); c.innerHTML = h; c.classList.add('on'); }, html);
      await sleep(ms);
    },
    async hideCard() {
      await page.evaluate(() => document.getElementById('tvCard').classList.remove('on'));
      await sleep(700);
    },
    async moveTo(loc) {
      await loc.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      await sleep(650);
      const b = await loc.boundingBox();
      cx = b.x + Math.min(b.width / 2, 60); cy = b.y + b.height / 2;
      await page.evaluate(([x, y]) => { document.getElementById('tvCursor').style.transform = `translate(${x - 4}px,${y - 2}px)`; }, [cx, cy]);
      await sleep(750);
    },
    async click(loc) {
      await d.moveTo(loc);
      await page.evaluate(([x, y]) => {
        const r = document.createElement('div'); r.className = 'tvRipple'; r.style.left = x + 'px'; r.style.top = y + 'px';
        document.body.appendChild(r); setTimeout(() => r.remove(), 700);
      }, [cx, cy]);
      await loc.click({ force: true });
      await sleep(450);
    },
    async type(loc, text, delay = 55) {
      await d.click(loc);
      await loc.pressSequentially(text, { delay });
      await sleep(400);
    },
    async clear(loc) {
      await loc.fill('');
      await sleep(300);
    },
    /* Oculta el aviso "Falta: ..." una vez corregido el error */
    async clearErr() {
      await page.evaluate(() => document.querySelectorAll('.form-step.active .step-error').forEach(e => { e.hidden = true; }));
    },
    async hi(loc, on = true) {
      await loc.evaluate((el, on) => el.classList.toggle('tvHi', on), on);
    }
  };
  return d;
}

/* ---------- captura de cuadros (CDP screencast) ---------- */
async function startCapture(page) {
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const f = path.join(WORK, 'frames', String(frames.length).padStart(6, '0') + '.jpg');
    fs.writeFileSync(f, Buffer.from(data, 'base64'));
    frames.push({ f, t: metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: W * SCALE, maxHeight: H * SCALE, everyNthFrame: 1 });
  return {
    async stop() {
      await sleep(500);
      await cdp.send('Page.stopScreencast');
      return frames;
    }
  };
}

function encode(frames, endTime) {
  const lines = [];
  frames.forEach((fr, i) => {
    const next = i + 1 < frames.length ? frames[i + 1].t : endTime;
    lines.push(`file '${fr.f}'`, `duration ${Math.max(0.001, next - fr.t).toFixed(4)}`);
  });
  lines.push(`file '${frames[frames.length - 1].f}'`);
  const list = path.join(WORK, 'frames.txt');
  fs.writeFileSync(list, lines.join('\n'));
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
    '-vf', `scale=${W * SCALE}:${H * SCALE}:force_original_aspect_ratio=decrease,pad=${W * SCALE}:${H * SCALE}:(ow-iw)/2:(oh-ih)/2:color=#2F4760,fps=30,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-movflags', '+faststart', OUT], { stdio: 'inherit' });
}

/* ---------- fechas del caso de ejemplo ---------- */
const hoy = new Date();
const ayer = new Date(hoy.getTime() - 86400000);
const iso = x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');

(async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--lang=es-MX'] });

  /* Captura en formato celular para la tarjeta de accesibilidad */
  const mob = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, locale: 'es-MX' });
  await mob.route('**/pdf-lib.min.js', r => r.fulfill({ path: PDFLIB_JS, contentType: 'text/javascript' }));
  await mob.goto(base, { waitUntil: 'networkidle' });
  await mob.addStyleTag({ content: '.blob{animation:none!important}' });
  await sleep(800);
  await mob.screenshot({ path: path.join(WORK, 'movil.png') });
  await mob.close();

  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE, locale: 'es-MX' });
  const page = await ctx.newPage();
  let pdfB64 = null;
  await page.route('**/pdf-lib.min.js', r => r.fulfill({ path: PDFLIB_JS, contentType: 'text/javascript' }));
  await page.route('https://script.google.com/**', async r => {
    try { pdfB64 = JSON.parse(r.request().postData()).pdfBase64; } catch (e) {}
    await sleep(1800);
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true }) });
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  await setupOverlay(page);
  await page.evaluate(() => document.fonts.ready);
  const d = makeDirector(page);
  const $ = s => page.locator(s).filter({ visible: true }).first();
  const pill = (name, value) => page.locator(`label.pill:has(input[name="${name}"][value="${value}"]) span`);
  const chk = (name, value) => page.locator(`.check label:has(input[name="${name}"][value="${value}"])`);
  const next = () => $('.form-step.active .next-step');

  const cap = await startCapture(page);
  const t0 = Date.now();

  /* ===== 1. Portada ===== */
  await d.card(`<div class="in"><img class="logo" src="hsda-logo.jpg" alt=""><div class="col">
    <div class="kick">Hospital San Diego de Alcalá · Unidad de Tecnovigilancia</div>
    <h1>Reportar un incidente con un dispositivo médico</h1>
    <p>Cómo llenar el reporte en la app, paso a paso, y los errores que debes evitar.</p></div></div>`, 6500);

  /* ===== 2. Por qué y qué tan fácil ===== */
  await d.card(`<div class="in"><div class="col">
    <div class="kick">¿Por qué es importante?</div>
    <h1>Si un dispositivo falla, se reporta</h1>
    <p>La NOM-240-SSA1-2012 pide notificar todo incidente o sospecha de incidente con un dispositivo médico: equipos, material de curación, insumos o instrumental.
    Tu reporte ayuda a que no le vuelva a pasar a otro paciente.</p></div></div>`, 9000);

  await d.card(`<div class="in"><div class="phone"><img src="/__work/movil.png" alt=""></div><div class="col">
    <div class="kick">Fácil y accesible</div>
    <h1>Lo reportas en minutos</h1>
    <ul>
      <li>Desde tu celular, tablet o cualquier computadora</li>
      <li>Sin usuario ni contraseña</li>
      <li>6 pasos guiados; la app te avisa si falta algo</li>
      <li>Puedes dictar la descripción por voz</li>
      <li>Llena por ti el formato oficial COFEPRIS y lo envía a Tecnovigilancia</li>
    </ul></div></div>`, 11500);

  await d.card(`<div class="in"><div class="col">
    <div class="kick">Caso de ejemplo</div>
    <h1>Bomba de infusión sin alarma</h1>
    <p>En UCI, una enfermera nota que la bomba de infusión no sonó la alarma de oclusión: el antibiótico dejó de pasar durante 40 minutos.
    Vamos a reportarlo juntos. En cada paso verás <b style="color:#F4A99E">✗ cómo NO llenarlo</b> y <b style="color:#9FD0B0">✓ cómo sí</b>.</p></div></div>`, 10000);
  await d.panel({ chip: 'Inicio', title: 'Abre la app', text: 'Entra desde el enlace o el código QR de tu servicio. La barra superior te muestra cuánto te falta.' });
  await d.hideCard();
  await sleep(3500);

  /* ===== Paso 1 ===== */
  await d.say({ chip: 'Paso 1 de 6', title: '¿Quién reporta?', text: 'Los campos con <b style="color:#F4A99E">*</b> son obligatorios. La fecha de notificación ya viene con el día de hoy.' });
  await d.say({ chip: 'Paso 1 de 6', title: '¿Quién reporta?', text: 'Veamos qué pasa si intentamos avanzar sin llenar lo obligatorio…' }, 3000);
  await d.click(next());
  await d.hi($('.form-step.active .step-error'));
  await d.badge('✗ <b>Incorrecto:</b> dejar campos obligatorios vacíos. La app no te deja avanzar, marca en rojo lo que falta y te dice exactamente qué es.', 'bad');
  await d.hi($('.form-step.active .step-error'), false);
  await d.say({ chip: 'Paso 1 de 6', title: 'Tus iniciales', text: 'Escribe tus iniciales <b>empezando por el apellido paterno</b>. Ej.: Ramírez Hernández Ana → <b>RHA</b>.' }, 4500);
  await d.type($('#nIniciales'), 'RHA', 160);
  await d.click($('#notifArea'));
  await $('#notifArea').selectOption('UCI');
  await sleep(700);
  await d.click($('#prof'));
  await $('#prof').selectOption('Enfermería');
  await sleep(700);
  await d.say({ chip: 'Paso 1 de 6', title: '¿Usted presentó el incidente?', text: 'Toca <b>Sí</b> si te pasó a ti; <b>No</b> si lo reportas por alguien más.' }, 3800);
  await d.click(pill('presento', 'si'));
  await d.clearErr();
  await d.badge('✓ <b>Correcto:</b> todo lo obligatorio está lleno. Ya puedes continuar.', 'ok', 3000);
  await d.click(next());

  /* ===== Paso 2 ===== */
  await d.say({ chip: 'Paso 2 de 6', title: 'Operador y paciente', text: '¿Quién usaba el dispositivo y a quién afectó?' }, 3200);
  await d.type($('#opIniciales'), 'RHA', 140);
  await d.click(pill('operador', 'enfermera'));
  await d.say({ chip: 'Paso 2 de 6', title: 'Datos del paciente', text: 'Aquí se protege la identidad del paciente.' }, 2600);
  await d.type($('#pacClave'), 'Juan Pérez López', 70);
  await d.badge('✗ <b>Incorrecto:</b> nunca escribas el nombre completo del paciente. Es un dato personal protegido y el formato viaja por correo.', 'bad');
  await d.clear($('#pacClave'));
  await d.type($('#pacClave'), 'PLJ', 160);
  await d.badge('✓ <b>Correcto:</b> solo iniciales (apellido paterno primero) o la clave del expediente.', 'ok', 3800);
  await d.click(pill('genero', 'M'));
  await d.type($('#pacEdad'), '67', 150);
  await d.type($('#pacPeso'), '72', 150);
  await d.type($('#pacEstatura'), '1.68', 150);
  await d.badge('✗ <b>Incorrecto:</b> la estatura va en <b>centímetros</b>, no en metros.', 'bad', 3600);
  await d.clear($('#pacEstatura'));
  await d.type($('#pacEstatura'), '168', 150);
  await d.badge('✓ <b>Correcto:</b> 168 cm. La app la convierte sola al formato COFEPRIS. Para bebés, cambia la edad a “meses”.', 'ok', 4500);
  await d.say({ chip: 'Paso 2 de 6', title: 'Resumen clínico', text: 'Breve: diagnóstico, qué se le estaba haciendo y antecedentes que tengan que ver con el incidente.', badge: '' }, 4200);
  await d.type($('#resumen'), 'Neumonía adquirida en la comunidad. En tratamiento con ceftriaxona IV por bomba de infusión. Sin alergias conocidas.', 22);
  await sleep(1200);
  await d.click(next());

  /* ===== Paso 3 ===== */
  await d.say({ chip: 'Paso 3 de 6', title: '¿Qué pasó con el dispositivo?', text: 'Primero la fecha del incidente y después marca todo lo que aplique.' }, 3600);
  await d.click(next());
  await d.badge('✗ <b>Incorrecto:</b> falta la fecha del incidente. Ojo: es el día en que <b>ocurrió</b>, no el día en que lo reportas.', 'bad');
  await d.click($('#fechaInc'));
  await $('#fechaInc').fill(iso(ayer));
  await d.clearErr();
  await sleep(900);
  await d.badge('✓ Fecha del día en que ocurrió.', 'ok', 2400);
  await d.click(chk('ev', 'alarma'));
  await d.click(chk('ev', 'noFunciona'));
  await d.say({ chip: 'Paso 3 de 6', title: 'La opción “Otros”', text: 'Si marcas <b>Otros</b> tienes que decir qué fue.' }, 2800);
  await d.click(chk('ev', 'otros'));
  await d.click(next());
  await d.badge('✗ <b>Incorrecto:</b> marcar “Otros” sin especificar. Escribe qué pasó o desmárcalo si no aplica.', 'bad');
  await d.click(chk('ev', 'otros'));
  await d.clearErr();
  await d.badge('✓ <b>Correcto:</b> solo quedan marcados los eventos que realmente ocurrieron.', 'ok', 3400);
  await d.click(next());

  /* ===== Paso 4 ===== */
  await d.say({ chip: 'Paso 4 de 6', title: 'Describe lo sucedido', text: 'Es la parte más importante del reporte. También puedes usar <b>Dictar por voz</b>.' }, 3800);
  await d.type($('#descripcion'), 'No sirvió la bomba.', 70);
  await d.badge('✗ <b>Incorrecto:</b> demasiado vaga. No dice qué se hacía, qué falló, cuándo, ni qué le pasó al paciente.', 'bad');
  await d.clear($('#descripcion'));
  await d.badge('✓ Responde: <b>¿qué se hacía? ¿qué falló? ¿qué se observó en el paciente? ¿qué se hizo?</b>', 'tip', 3800);
  await d.type($('#descripcion'), 'A las 14:30 h se inició ceftriaxona 1 g IV por bomba de infusión. A las 15:10 h se observó que la línea estaba acodada y el medicamento no había pasado; la bomba no activó la alarma de oclusión. Se retiró la bomba, se colocó otra y se completó la dosis. El paciente no presentó daño; se avisó al médico de guardia.', 16);
  await d.badge('✓ <b>Correcto:</b> clara, con horarios, la falla y la consecuencia para el paciente.', 'ok', 4200);
  await d.say({ chip: 'Paso 4 de 6', title: 'Consecuencia', text: 'Marca la consecuencia. Si no está en la lista, usa <b>Otro</b> y especifica.', badge: '' }, 3400);
  await d.click(chk('cons', 'otro'));
  await d.type($('#consOtroTxt'), 'Retraso en la dosis, sin daño', 45);
  await sleep(900);
  await d.click(next());

  /* ===== Paso 5 ===== */
  await d.say({ chip: 'Paso 5 de 6', title: 'El dispositivo médico', text: 'Copia los datos <b>tal como vienen en la etiqueta o el empaque</b>. El lote o la serie y el registro sanitario permiten rastrear el producto.' });
  await d.type($('#generica'), 'Bomba', 90);
  await d.badge('✗ <b>Incorrecto:</b> “Bomba” no basta. Escribe el nombre completo del dispositivo.', 'bad', 3600);
  await d.clear($('#generica'));
  await d.type($('#generica'), 'Bomba de infusión volumétrica', 45);
  await d.badge('✓ <b>Correcto.</b> Completa lo que tenga la etiqueta (datos de ejemplo).', 'ok', 2600);
  await d.type($('#marca'), 'Marca Ejemplo', 40);
  await d.type($('#modelo'), 'BI-200', 60);
  await d.type($('#serieLote'), 'SN-0045821', 50);
  await d.type($('#registro'), '1234E2020 SSA', 45);
  await d.type($('#fabricante'), 'Fabricante Ejemplo, S.A. de C.V.', 30);
  await d.click(pill('uso', 'tratamiento'));
  await d.click(pill('pob', 'adulto'));
  await d.badge('Si no encuentras un dato, déjalo en blanco: <b>es mejor reportar incompleto que no reportar</b>.', 'tip', 4200);
  await d.click(next());

  /* ===== Paso 6 ===== */
  await d.say({ chip: 'Paso 6 de 6', title: 'Finalizar reporte', text: '¿Dónde está hoy el dispositivo y qué se sabía de su uso?', badge: '' }, 3400);
  await d.click(pill('ubic', 'fuera'));
  await d.click(pill('leyo', 'si'));
  await d.click(pill('claro', 'si'));
  await d.click(pill('capacitado', 'si'));
  await d.moveTo($('.final-check'));
  await d.hi($('.final-check'));
  await d.say({ chip: 'Paso 6 de 6', title: 'No lo tires', text: 'Separa el dispositivo y su empaque, y etiquétalo con el folio que te dará la app.',
    badge: '✗ <b>Incorrecto:</b> desechar el dispositivo o el empaque. Sin él no se puede investigar la falla.', kind: 'bad' });
  await d.hi($('.final-check'), false);
  await d.say({ chip: 'Paso 6 de 6', title: 'Enviar', text: 'Si quieres revisar algo, usa <b>← Revisar</b>: tus respuestas no se pierden. Cuando esté listo, toca <b>Enviar Reporte</b>.', badge: '' }, 4200);
  await d.click($('#submitBtn'));
  await page.locator('#modalSuccess').waitFor({ state: 'visible', timeout: 30000 });
  const folio = await page.locator('#folioNum').textContent();
  await d.say({ chip: 'Listo', title: 'Reporte enviado', text: `Recibes un <b>folio</b> (${folio}). Anótalo en la etiqueta del dispositivo y entrégalo en Farmacia.`,
    badge: '✓ El reporte llegó por correo a la Unidad de Tecnovigilancia.', kind: 'ok' }, 7000);

  /* ===== Formato COFEPRIS generado ===== */
  if (pdfB64) {
    const pdfFile = path.join(WORK, 'reporte.pdf');
    fs.writeFileSync(pdfFile, Buffer.from(pdfB64, 'base64'));
    execFileSync('python3', ['-c', `import pymupdf,sys
doc=pymupdf.open(sys.argv[1]); doc[0].get_pixmap(dpi=170).save(sys.argv[2])`, pdfFile, path.join(WORK, 'pdf1.png')]);
    await d.card(`<div class="in"><img class="pdf" src="/__work/pdf1.png" alt=""><div class="col">
      <div class="kick">Sin papeleo extra</div>
      <h1>El formato oficial se llena solo</h1>
      <p>Con tus respuestas, la app llena el formato COFEPRIS de notificación, marca las casillas y lo envía a la Unidad de Tecnovigilancia.
      Si la descripción es larga, agrega una hoja anexa automáticamente.</p></div></div>`, 10000);
  }

  /* ===== Resumen de errores ===== */
  await d.card(`<div class="in"><div class="col">
    <div class="kick">Repaso</div>
    <h1 style="font-size:2.6rem;margin-bottom:10px">Errores comunes al llenar el reporte</h1>
    <div class="pair">
      <div class="hd" style="color:#F4A99E">✗ Evita</div><div class="hd" style="color:#9FD0B0">✓ Mejor</div>
      <div class="x">Nombre completo del paciente</div><div class="v">Iniciales (apellido paterno primero) o clave</div>
      <div class="x">Estatura en metros (1.68)</div><div class="v">Estatura en centímetros (168)</div>
      <div class="x">Fecha en que lo reportas</div><div class="v">Fecha en que ocurrió el incidente</div>
      <div class="x">“Otros” sin especificar</div><div class="v">Especificar o desmarcar</div>
      <div class="x">“No sirvió la bomba”</div><div class="v">Qué se hacía, qué falló, qué le pasó al paciente, qué se hizo</div>
      <div class="x">“Bomba” como nombre del equipo</div><div class="v">Nombre, lote o serie y registro de la etiqueta</div>
      <div class="x">Tirar el dispositivo o su empaque</div><div class="v">Separarlo y etiquetarlo con el folio</div>
    </div></div></div>`, 17000);

  /* ===== Cierre ===== */
  const qr = fs.readFileSync(path.join(__dirname, 'qr-app.svg'), 'utf8').replace(/<\?xml[^>]*\?>/, '');
  await d.card(`<div class="in"><div class="qr">${qr.replace('<svg ', '<svg style="width:100%;height:auto;display:block" ')}</div><div class="col">
    <div class="kick">Unidad de Tecnovigilancia · HSDA</div>
    <h1>Ante la duda, repórtalo</h1>
    <p>Reportar no es buscar culpables: es cuidar a nuestros pacientes. Escanea el código o entra a:</p>
    <span class="url">${APP_URL.replace('https://', '')}</span></div></div>`, 10000);

  const frames = await cap.stop();
  const endTime = frames[frames.length - 1].t + 0.5;
  await browser.close();
  srv.close();
  console.log(`Cuadros: ${frames.length} · duración ≈ ${Math.round((Date.now() - t0) / 1000)} s · codificando…`);
  encode(frames, endTime);
  console.log('Video listo:', OUT);
})().catch(e => { console.error(e); process.exit(1); });
