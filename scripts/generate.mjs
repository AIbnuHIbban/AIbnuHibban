// Rebuilds assets/*.svg and README.md from data/facts.json.
// `node scripts/generate.mjs --live` refreshes public numbers first.
// No dependencies. All text is drawn as vector glyphs, so nothing depends on
// fonts being installed or loadable where the SVG is shown.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const p = (...a) => join(root, ...a);
const glyphs = JSON.parse(readFileSync(p('scripts/glyphs.json'), 'utf8'));
const facts = JSON.parse(readFileSync(p('data/facts.json'), 'utf8'));
const n = (v) => Number(v).toLocaleString('en-US');

// ---------- live refresh (public data only; a failed source keeps its old value)
async function refresh() {
  const json = async (url, init) => {
    const r = await fetch(url, init);
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.json();
  };
  try {
    const body = {
      filters: [{ criteria: [{ filterType: 10, value: 'aibnuhibban' }, { filterType: 8, value: 'Microsoft.VisualStudio.Code' }], pageSize: 50 }],
      flags: 914,
    };
    const j = await json('https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json;api-version=3.0-preview.1' },
      body: JSON.stringify(body),
    });
    for (const e of j.results[0].extensions) {
      const i = (e.statistics || []).find((s) => s.statisticName === 'install')?.value;
      if (i > 0) facts.vscode[e.extensionName] = i;
    }
  } catch (e) { console.warn('marketplace:', e.message); }
  try {
    const u = await json('https://api.github.com/users/AIbnuHIbban', { headers: { 'User-Agent': 'profile-readme' } });
    if (u.public_repos) facts.repos.public = u.public_repos;
  } catch (e) { console.warn('github:', e.message); }
  try {
    const o = await json('https://huggingface.co/api/users/AIbnuHibban/overview');
    facts.hf = { models: o.numModels, datasets: o.numDatasets, spaces: o.numSpaces };
  } catch (e) { console.warn('huggingface:', e.message); }
  facts.asOf = new Date().toISOString().slice(0, 10);
  writeFileSync(p('data/facts.json'), JSON.stringify(facts, null, 2) + '\n');
}

// ---------- svg kit
const C = { teal: '#008080', silver: '#C0C0C0', navy: '#000080', white: '#FFFFFF', black: '#000000', hi: '#DFDFDF', lo: '#808080', tip: '#FFFFE1', ink: '#1A1A1A', mute: '#5A5A5A' };

class Svg {
  constructor(w, h, title) { Object.assign(this, { w, h, title, used: new Set(), css: [], body: [], extraDefs: '' }); }
  text(s, x, y, { font = 'px', size = 16, fill = C.ink, anchor = 'start' } = {}) {
    // 'bold' is the bitmap face thickened with a stroke; the face has no bold cut.
    const bold = font === 'bold' ? ` stroke="${fill}" stroke-width="42"` : '';
    if (bold) font = 'px';
    const g = glyphs[font], k = size / 1000;
    let cx = 0; const uses = [];
    for (const ch of String(s)) {
      const gl = g[ch] ?? g['?'];
      if (gl.d) { this.used.add(`${font}|${ch}`); uses.push(`<use href="#${font}${ch.codePointAt(0)}" x="${cx}"/>`); }
      cx += gl.a;
    }
    const w = cx * k, dx = anchor === 'middle' ? -w / 2 : anchor === 'end' ? -w : 0;
    return `<g fill="${fill}"${bold} transform="translate(${(x + dx).toFixed(1)} ${y}) scale(${k})">${uses.join('')}</g>`;
  }
  rect(x, y, w, h, fill, extra = '') { return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`; }
  raised(x, y, w, h, fill = C.silver) {
    return this.rect(x, y, w, h, C.black) + this.rect(x, y, w - 1, h - 1, C.white) + this.rect(x + 1, y + 1, w - 2, h - 2, C.lo) + this.rect(x + 1, y + 1, w - 3, h - 3, C.hi) + this.rect(x + 2, y + 2, w - 4, h - 4, fill);
  }
  sunken(x, y, w, h, fill = C.white) {
    return this.rect(x, y, w, h, C.white) + this.rect(x, y, w - 1, h - 1, C.lo) + this.rect(x + 1, y + 1, w - 2, h - 2, C.hi) + this.rect(x + 1, y + 1, w - 3, h - 3, C.black) + this.rect(x + 2, y + 2, w - 4, h - 4, fill);
  }
  button(x, y, w, h, label, { size = 15 } = {}) {
    return this.raised(x, y, w, h) + this.text(label, x + w / 2, y + h / 2 + size * 0.34, { size, anchor: 'middle' });
  }
  win(x, y, w, h, title, { fill = C.silver, size = 18 } = {}) {
    const cap = this.rect(x + 4, y + 4, w - 8, 24, 'url(#cap)');
    const b = (bx, mark) => this.raised(bx, y + 7, 18, 16) + mark(bx);
    const ctl = b(x + w - 26, (bx) => `<path d="M${bx + 5} ${y + 11}l8 8m0-8l-8 8" stroke="#000" stroke-width="2"/>`)
      + b(x + w - 46, (bx) => `<rect x="${bx + 4}" y="${y + 10}" width="10" height="9" fill="none" stroke="#000" stroke-width="1.5"/>`)
      + b(x + w - 64, (bx) => `<rect x="${bx + 4}" y="${y + 18}" width="7" height="2" fill="#000"/>`);
    return this.raised(x, y, w, h, fill) + cap + this.text(title, x + 10, y + 22, { font: 'bold', size, fill: C.white }) + ctl;
  }
  render() {
    const defs = [...this.used].map((u) => {
      const i = u.indexOf('|'), font = u.slice(0, i), ch = u.slice(i + 1);
      return `<path id="${font}${ch.codePointAt(0)}" d="${glyphs[font][ch].d}"/>`;
    }).join('');
    const css = this.css.length ? `<style>${this.css.join('')}</style>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.w} ${this.h}" width="${this.w}" height="${this.h}" role="img"><title>${this.title}</title>${css}<defs><linearGradient id="cap"><stop offset="0" stop-color="#000080"/><stop offset="1" stop-color="#1084D0"/></linearGradient>${this.extraDefs}${defs}</defs>${this.body.join('')}</svg>`;
  }
}

// ---------- hero
function hero() {
  const T = 12, H = 360, s = new Svg(1000, H, 'A desktop fills with twelve agent windows, then an About box shows Abdullah Ibnu Hibban, Bandung, Indonesia');
  const pct = (t) => Math.min((t / T) * 100, 100).toFixed(3) + '%';
  let id = 0;
  const show = (t0) => {
    const c = 'v' + id++;
    s.css.push('@keyframes ' + c + '{0%,' + pct(t0) + '{opacity:0}' + pct(t0 + 0.001) + ',100%{opacity:1}}.' + c + '{opacity:0;animation:' + c + ' ' + T + 's linear infinite}');
    return c;
  };
  const add = (x) => s.body.push(x);
  add(s.rect(0, 0, 1000, H, C.teal));
  const tasks = ['cargo test --release', 'review the diff', 'train indopii-mini', 'flutter build apk', 'pnpm build', 'write the migration', 'hf upload', 'go vet ./...', 'score F1 on bench', 'dart analyze', 'cargo clippy', 'open the PR'];
  tasks.forEach((t, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = 12 + col * 306 + row * 22, y = 8 + col * 12 + row * 58, w = 296, h = 76;
    const a = s.win(x, y, w, h, 'agent-' + String(i + 1).padStart(2, '0')) + s.sunken(x + 8, y + 34, w - 16, 34, C.black) + s.text('> ' + t, x + 18, y + 57, { font: 'mono', size: 16, fill: '#55FF55' });
    add('<g class="' + show(0.3 + i * 0.25) + ' final">' + a + '</g>');
  });
  let about = s.win(190, 92, 620, 150, 'About');
  about += s.text('Abdullah Ibnu Hibban', 500, 178, { font: 'pxb', size: 52, anchor: 'middle' });
  about += s.text('Bandung, Indonesia', 500, 218, { size: 24, anchor: 'middle', fill: C.mute });
  add('<g class="' + show(3.6) + ' final">' + about + '</g>');
  add(s.raised(-2, H - 36, 1004, 38));
  add(s.button(6, H - 32, 76, 28, 'Start', { size: 20 }));
  add(s.sunken(92, H - 32, 240, 28, C.hi) + s.text('agents (12)', 102, H - 11, { size: 20 }));
  add(s.sunken(892, H - 32, 102, 28, C.silver) + s.text('??:??', 943, H - 11, { size: 20, anchor: 'middle' }));
  s.css.push('@media (prefers-reduced-motion:reduce){*{animation:none!important}.final{opacity:1!important}}');
  return s.render();
}

// ---------- checklist
const COMPONENTS = [
  'CTO', 'Tech Lead', 'Founder',
  'VS Code extension author', 'npm package author', 'Rust crate author',
  'Hugging Face model trainer', 'Dataset publisher', 'AI agent orchestrator',
  'Go + Rust backend', 'TypeScript + PHP web', 'Flutter mobile',
];
function checklist() {
  const s = new Svg(1000, 214, 'Checked components: ' + COMPONENTS.join(', ') + '.');
  s.body.push(s.win(0, 0, 1000, 214, 'Setup - Installed components'));
  s.body.push(s.sunken(14, 40, 972, 160));
  COMPONENTS.forEach((c, i) => {
    const x = [36, 380, 690][i % 3], y = 56 + Math.floor(i / 3) * 35;
    s.body.push(s.sunken(x, y, 22, 22));
    s.body.push('<path d="M' + (x + 5) + ' ' + (y + 11) + 'l4 4 8-9" fill="none" stroke="#000" stroke-width="3"/>');
    s.body.push(s.text(c, x + 32, y + 18, { font: i < 3 ? 'bold' : 'px', size: 22 }));
  });
  return s.render();
}

// ---------- strata
const SERIES = [['Other', '#9A9A9A'], ['PHP', '#6F5BD0'], ['Web', '#1E93B8'], ['JavaScript', '#B39200'], ['Dart', '#0E9E7A'], ['Go', '#3F63E0'], ['TypeScript', '#C0459A'], ['Rust', '#DD4A1A']];
function strata() {
  const s = new Svg(1000, 340, 'Stacked area chart of primary language share per year from 2017 to 2026. PHP and web dominate 2019 to 2021, Go appears in 2024, Rust and TypeScript take most of 2026. Before 2017 is an unrecorded Visual Basic period.');
  const years = Object.keys(facts.strata), x0 = 150, x1 = 950, top = 54, h = 206;
  const x = (i) => x0 + (i / (years.length - 1)) * (x1 - x0);
  const totals = years.map((y) => Object.values(facts.strata[y]).reduce((a, b) => a + b, 0));
  s.body.push(s.win(0, 0, 1000, 340, 'strata.exe - new repos by primary language'));
  s.body.push(s.sunken(14, 40, 972, 286));
  const base = years.map(() => 0);
  const bands = SERIES.map(([k, color]) => {
    const lo = [...base];
    years.forEach((y, i) => { base[i] += (facts.strata[y][k] ?? 0) / totals[i]; });
    return { k, color, lo, hi: [...base] };
  });
  const Y = (v) => top + h - v * h;
  const seg = (xs, vs, start) => vs.map((v, i) => {
    if (!i) return `${start}${xs[0]} ${Y(v).toFixed(1)}`;
    const mx = (xs[i - 1] + xs[i]) / 2;
    return `C${mx} ${Y(vs[i - 1]).toFixed(1)} ${mx} ${Y(v).toFixed(1)} ${xs[i]} ${Y(v).toFixed(1)}`;
  }).join('');
  const xs = years.map((_, i) => x(i));
  for (const b of bands) s.body.push(`<path d="${seg(xs, b.hi, 'M')}${seg([...xs].reverse(), [...b.lo].reverse(), 'L')}Z" fill="${b.color}" stroke="#fff" stroke-width="2"/>`);
  // Visual Basic was real but has no record to measure, so it gets texture, not a value.
  s.extraDefs += `<pattern id="hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#E8E8E8"/><rect width="4" height="10" fill="#C8C8C8"/></pattern>`;
  s.body.push(s.rect(30, top, x0 - 34, h, 'url(#hatch)'));
  const m = top + h / 2;
  s.body.push(s.text('Visual', 88, m - 22, { font: 'bold', size: 22, anchor: 'middle' }), s.text('Basic', 88, m + 2, { font: 'bold', size: 22, anchor: 'middle' }), s.text('year lost,', 88, m + 28, { size: 19, anchor: 'middle' }), s.text('no repo', 88, m + 48, { size: 19, anchor: 'middle' }));
  // direct labels at each band's thickest year
  for (const b of bands) {
    let best = 0, t = 0;
    b.hi.forEach((v, i) => { const d = v - b.lo[i]; if (d > t) { t = d; best = i; } });
    if (t * h < 24) continue;
    const last = best === years.length - 1, first = best === 0;
    const label = b.k === 'TypeScript' ? 'TS' : b.k;
    const ly = first ? top + h - 22 : Y((b.hi[best] + b.lo[best]) / 2) + 7;
    s.body.push(s.text(label, last ? x(best) - 10 : first ? x(best) + 8 : x(best), ly, { font: 'bold', size: 22, fill: '#fff', anchor: last ? 'end' : first ? 'start' : 'middle' }));
  }
  years.forEach((y, i) => s.body.push(s.text(y, x(i), top + h + 24, { size: 20, fill: C.mute, anchor: i === 0 ? 'start' : i === years.length - 1 ? 'end' : 'middle' })));
  let lx = 40;
  SERIES.forEach(([k, color]) => { s.body.push(s.rect(lx, 302, 14, 14, color), s.text(k, lx + 20, 315, { size: 20 })); lx += 46 + k.length * 10; });
  return s.render();
}

// ---------- stats: iceberg and clock side by side
function stats() {
  const H = 270, { total, private: priv } = facts.contributions.last12, pub = total - priv;
  const share = ((priv / total) * 100).toFixed(1);
  const a = facts.agents, hrs = a.hoursWIB, max = Math.max(...hrs), peak = hrs.indexOf(max);
  const s = new Svg(1000, H, 'Left: an iceberg of ' + total + ' squares, one per contribution in the last 12 months, ' + pub + ' public above the waterline and ' + priv + ' private below. Right: a 24-hour radial chart of ' + n(a.prompts) + ' prompts with activity in every hour.');

  // Iceberg is a unit chart: one square per contribution, to scale.
  s.body.push(s.win(0, 0, 494, H, 'iceberg.exe'), s.sunken(10, 36, 474, H - 46));
  const L = 12, R = 262, step = 6, cell = 5, waterY = 84, bottom = H - 12, cx = (L + R) / 2;
  s.body.push(s.rect(L, 38, R - L, waterY - 38, '#8FD3D3'), s.rect(L, waterY, R - L, bottom - waterY, C.navy));
  const taper = (count, shape) => {
    const sum = shape.reduce((x, y) => x + y, 0), out = shape.map((r) => Math.round((r * count) / sum));
    let d = count - out.reduce((x, y) => x + y, 0), i = 0;
    while (d !== 0) { out[i % out.length] += Math.sign(d); d -= Math.sign(d); i++; }
    return out;
  };
  const up = taper(pub, [1, 2, 3, 4, 6]);
  const down = taper(priv, [24, 30, 34, 36, 36, 34, 33, 32, 30, 28, 26, 24, 22, 20, 18, 16, 14, 12, 10, 8, 6, 4]);
  const row = (count, y, fill) => { let o = ''; const x = cx - (count * step) / 2; for (let i = 0; i < count; i++) o += '<rect x="' + (x + i * step) + '" y="' + y + '" width="' + cell + '" height="' + cell + '" fill="' + fill + '"/>'; return o; };
  up.forEach((c, i) => s.body.push(row(c, waterY - (up.length - i) * step, '#FFFFFF')));
  down.forEach((c, i) => s.body.push(row(c, waterY + 4 + i * step, '#7FB2FF')));
  s.body.push(s.rect(L, waterY, R - L, 2, '#FFFFFF'));
  const panel = (tx, big, sub, rows) => {
    s.body.push(s.text(big, tx, 104, { font: 'pxb', size: 52 }), s.text(sub, tx, 136, { size: 21 }), s.rect(tx, 152, 196, 2, C.silver));
    rows.forEach(([x, y], i) => { const Yp = 188 + i * 36; s.body.push(s.text(x, tx + 92, Yp, { font: 'bold', size: 25, anchor: 'end' }), s.text(y, tx + 102, Yp, { size: 21 })); });
  };
  panel(278, share + '%', 'private, 12 months', [[n(pub), 'public'], [n(priv), 'private']]);

  // Clock
  s.body.push(s.win(506, 0, 494, H, 'clock.exe'), s.sunken(516, 36, 474, H - 46));
  const ox = 628, oy = 152, r0 = 40, r1 = 84;
  s.body.push('<circle cx="' + ox + '" cy="' + oy + '" r="' + r1 + '" fill="none" stroke="#E2E2E2"/>');
  hrs.forEach((v, i) => {
    const ang = (i / 24) * Math.PI * 2 - Math.PI / 2, wid = 0.1, r = r0 + ((r1 - r0) * v) / max;
    const pt = (rad, t) => (ox + rad * Math.cos(t)).toFixed(1) + ' ' + (oy + rad * Math.sin(t)).toFixed(1);
    s.body.push('<path d="M' + pt(r0, ang - wid) + 'L' + pt(r, ang - wid) + 'L' + pt(r, ang + wid) + 'L' + pt(r0, ang + wid) + 'Z" fill="' + (i === peak ? C.navy : C.teal) + '"/>');
  });
  [[0, '00'], [6, '06'], [12, '12'], [18, '18']].forEach(([h, l]) => {
    const ang = (h / 24) * Math.PI * 2 - Math.PI / 2;
    s.body.push(s.text(l, ox + 100 * Math.cos(ang), oy + 100 * Math.sin(ang) + 7, { size: 19, fill: C.mute, anchor: 'middle' }));
  });
  s.body.push(s.text('WIB', ox, oy + 6, { size: 18, fill: C.mute, anchor: 'middle' }));
  panel(750, n(a.prompts), 'prompts since ' + a.since.replace('November', 'Nov'), [[a.activeDays + '/' + a.spanDays, 'days'], ['0', 'empty hours']]);
  return s.render();
}

// ---------- README
function readme() {
  const v = facts.vscode;
  // The existing dev.to workflow rewrites this block, so keep whatever it wrote last.
  const blog = existsSync(p('README.md')) ? readFileSync(p('README.md'), 'utf8').match(/<!-- BLOG-POST-LIST:START -->[\s\S]*<!-- BLOG-POST-LIST:END -->/)?.[0] : null;
  const years = Object.keys(facts.strata);
  const table = [`| Year | ${SERIES.map(([k]) => k).join(' | ')} |`, `|---|${SERIES.map(() => '--:').join('|')}|`,
    ...years.map((y) => `| ${y} | ${SERIES.map(([k]) => facts.strata[y][k] ?? 0).join(' | ')} |`)].join('\n');
  const vars = {
    SPARK: n(v['codeigniter-spark']), LARAVEL: n(v['laravel-smart-command']),
    LUMEN: n(v['lumen-smart-command']), PACK: n(v['laravel-full-extension-pack']), STRATA_TABLE: table,
    BLOG: blog ?? DEFAULT_BLOG,
  };
  return readFileSync(p('scripts/readme.template.md'), 'utf8').replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k]);
}

const DEFAULT_BLOG = `<!-- BLOG-POST-LIST:START -->
- [Create Your Own Lumen Installer (2020)](https://dev.to/aibnuhibban/create-your-own-lumen-installer-2020-10p8)
- [Membuat Lumen Installer Sendiri (2020)](https://dev.to/aibnuhibban/membuat-lumen-installer-sendiri-2020-4nbn)
- [Login Customization in Laravel 8](https://dev.to/aibnuhibban/login-customization-in-laravel-8-2gc8)
- [Kustomisasi Login di Laravel 8 (2020)](https://dev.to/aibnuhibban/kustomisasi-login-di-laravel-8-1jin)
- [Konfigurasi Email di Lumen 7  (2020)](https://dev.to/aibnuhibban/konfigurasi-email-di-lumen-7-2020-g1e)
<!-- BLOG-POST-LIST:END -->`;

if (process.argv.includes('--live')) await refresh();
const out = { 'assets/hero.svg': hero(), 'assets/checklist.svg': checklist(), 'assets/stats.svg': stats(), 'assets/strata.svg': strata() };
for (const [f, c] of Object.entries(out)) { writeFileSync(p(f), c); console.log(f, (c.length / 1024).toFixed(1) + ' KB'); }
writeFileSync(p('README.md'), readme());
