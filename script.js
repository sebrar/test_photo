/* ============================================================
   AYARLAR - sadece bu bölümü düzenlemeniz yeterli
   ============================================================ */
const CONFIG = {
  name: "Deniz Bey",
  tagline: "Düğün, iş ve portre fotoğrafçısı",
  about: "Fotoğrafçılık serüvenim, anların duygusal değerini yakalamaya odaklanır. Düğünlerde, kurumsal çekimlerde ve portrelerde samimi, modern ve dikkatli bir anlatım sunarım.\n\nHer çekimde doğal ışık, sade kompozisyon ve kişiye özel yaklaşım ön plandadır; böylece görseller sadece görüntü değil, hafıza olur.",
  aboutPhoto: "",
  contactText: "Randevu, paketler ve fiyat bilgisi için benimle iletişime geçebilirsiniz. Çekim tarihlerinizi birlikte planlayalım.",
  email: "hello@denizbeyfoto.com",
  phone: "+90 555 123 45 67",
  instagram: "https://instagram.com/denizbeyfoto",

  photosDir: "photos",
  heroFolder: "kapak",

  owner: "sebrar",
  repo: "test_photo",
  branch: "main"
};

const TITLES = {
  dugun: "Düğün",
  is: "İş Çekimi",
  kapak: "Kapak"
};

/* ============================================================ */
const IMG = /\.(jpe?g|png|webp|gif|avif)$/i;
const $ = (id) => document.getElementById(id);
let cats = [], photos = [], visible = [], current = 0;

function repoInfo() {
  let { owner, repo } = CONFIG;
  const h = location.hostname;
  if (h.endsWith(".github.io")) {
    owner = owner || h.split(".")[0];
    repo = repo || location.pathname.split("/")[1] || `${owner}.github.io`;
  }
  return { owner, repo };
}
function pretty(key) {
  if (TITLES[key]) return TITLES[key];
  const t = decodeURIComponent(key).replace(/[-_]+/g, " ").trim();
  return t.charAt(0).toLocaleUpperCase("tr") + t.slice(1);
}
/* Yerel test: GitHub yerine yerel sunucunun klasör listesini okur */
async function listLocal(path) {
  const base = new URL(path.replace(/\/?$/, "/"), location.href);
  const r = await fetch(base);
  if (!r.ok) throw new Error(`"${path}" klasörü bulunamadı (${r.status})`);
  const doc = new DOMParser().parseFromString(await r.text(), "text/html");
  const out = [];
  doc.querySelectorAll("a[href]").forEach((a) => {
    const u = new URL(a.getAttribute("href"), base);
    if (u.origin !== base.origin || !u.pathname.startsWith(base.pathname) || u.pathname === base.pathname) return;
    const rel = decodeURIComponent(u.pathname.slice(base.pathname.length)).replace(/\/$/, "");
    if (!rel || rel.includes("/")) return;
    const isFile = IMG.test(rel);
    const isDir = !isFile && !rel.includes(".");
    if (isFile || isDir) out.push({ type: isDir ? "dir" : "file", name: rel, path: `${path}/${rel}`, download_url: `${path}/${rel}` });
  });
  return out;
}
async function list(owner, repo, path) {
  if (!owner || !repo) return listLocal(path);
  const ref = CONFIG.branch ? `?ref=${encodeURIComponent(CONFIG.branch)}` : "";
  const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}${ref}`, { headers: { Accept: "application/vnd.github+json" } });
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  return r.json();
}
async function load() {
  const { owner, repo } = repoInfo();
  const dirs = (await list(owner, repo, CONFIG.photosDir)).filter((e) => e.type === "dir");
  const all = await Promise.all(dirs.map(async (d) => ({
    key: d.name,
    items: (await list(owner, repo, d.path))
      .filter((e) => e.type === "file" && IMG.test(e.name))
      .sort((a, b) => a.name.localeCompare(b.name, "tr", { numeric: true }))
      .map((e) => e.download_url)
  })));
  const hero = (all.find((c) => c.key === CONFIG.heroFolder) || { items: [] }).items;
  cats = all.filter((c) => c.key !== CONFIG.heroFolder && c.items.length).map((c) => ({ ...c, label: pretty(c.key) }));
  photos = cats.flatMap((c) => c.items.map((src) => ({ src, label: c.label, key: c.key })));
  return hero.length ? hero : photos.slice(0, 5).map((p) => p.src);
}

/* Hero slideshow */
function startHero(srcs) {
  const box = $("slides");
  const slides = srcs.slice(0, 6).map((s) => {
    const d = document.createElement("div");
    d.className = "slide";
    d.style.backgroundImage = `url("${s}")`;
    box.appendChild(d);
    return d;
  });
  if (!slides.length) return;
  let i = 0;
  slides[0].classList.add("on");
  if (slides.length > 1 && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    setInterval(() => {
      slides[i].classList.remove("on");
      i = (i + 1) % slides.length;
      slides[i].classList.add("on");
    }, 6000);
  }
}

/* Category tiles and filters */
function renderTiles() {
  const t = $("tiles");
  t.classList.toggle("many", cats.length > 3);
  cats.forEach((c) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tile";
    b.innerHTML = `<img loading="lazy" alt=""><span class="label"><span class="name"></span><span class="count"></span></span>`;
    b.querySelector("img").src = c.items[0];
    b.querySelector(".name").textContent = c.label;
    b.querySelector(".count").textContent = `${c.items.length} fotoğraf`;
    b.addEventListener("click", () => { applyFilter(c.key); $("galleryWrap").scrollIntoView(); });
    t.appendChild(b);
  });
}
function renderFilters() {
  const f = $("filters");
  [["*", "Tümü"], ...cats.map((c) => [c.key, c.label])].forEach(([key, text]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.key = key;
    b.textContent = text;
    b.addEventListener("click", () => applyFilter(key));
    f.appendChild(b);
  });
}
function applyFilter(key) {
  document.querySelectorAll("#filters button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.key === key)));
  visible = key === "*" ? photos : photos.filter((p) => p.key === key);
  $("galTitle").textContent = key === "*" ? "Tüm fotoğraflar" : pretty(key);
  const g = $("gallery");
  g.innerHTML = "";
  visible.forEach((p, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-label", `${p.label} fotoğrafını büyüt`);
    const img = new Image();
    img.loading = "lazy";
    img.alt = p.label;
    img.src = p.src;
    img.onload = () => img.classList.add("loaded");
    b.appendChild(img);
    b.onclick = () => openBox(i);
    g.appendChild(b);
  });
  $("status").textContent = visible.length ? "" : "Bu kategoride henüz fotoğraf yok.";
}

/* Lightbox */
function openBox(i) {
  current = (i + visible.length) % visible.length;
  const p = visible[current];
  $("lbImg").src = p.src;
  $("lbImg").alt = p.label;
  $("lbCap").textContent = `${p.label}  ${current + 1} / ${visible.length}`;
  $("lightbox").hidden = false;
  document.body.style.overflow = "hidden";
  new Image().src = visible[(current + 1) % visible.length].src;
}
function closeBox() { $("lightbox").hidden = true; document.body.style.overflow = ""; }

/* Page text */
function fillPage() {
  document.title = `${CONFIG.name} | Fotoğraf portfolyosu`;
  $("brand").textContent = CONFIG.name;
  $("heroName").textContent = CONFIG.name;
  $("heroTag").textContent = CONFIG.tagline;
  $("aboutText").textContent = CONFIG.about;
  $("contactText").textContent = CONFIG.contactText;
  $("footText").textContent = `© ${new Date().getFullYear()} ${CONFIG.name}`;
  if (CONFIG.aboutPhoto) { $("aboutImg").src = CONFIG.aboutPhoto; $("aboutImg").hidden = false; }
  const l = $("contactLinks");
  const add = (href, text, ext) => l.insertAdjacentHTML("beforeend", `<a href="${href}"${ext ? ' target="_blank" rel="noopener"' : ""}>${text}</a>`);
  if (CONFIG.email) add(`mailto:${CONFIG.email}`, CONFIG.email);
  if (CONFIG.phone) add(`tel:${CONFIG.phone.replace(/\s/g, "")}`, CONFIG.phone);
  if (CONFIG.instagram) add(CONFIG.instagram, "Instagram", true);
}

function bind() {
  const header = $("header");
  const onScroll = () => header.classList.toggle("solid", scrollY > innerHeight * 0.7);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  $("lbClose").onclick = closeBox;
  $("lbPrev").onclick = () => openBox(current - 1);
  $("lbNext").onclick = () => openBox(current + 1);
  $("lightbox").onclick = (e) => { if (e.target.id === "lightbox") closeBox(); };
  document.addEventListener("keydown", (e) => {
    if ($("lightbox").hidden) return;
    if (e.key === "Escape") closeBox();
    if (e.key === "ArrowLeft") openBox(current - 1);
    if (e.key === "ArrowRight") openBox(current + 1);
  });
  let x0 = 0;
  $("lightbox").addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  $("lightbox").addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 50) openBox(current + (dx < 0 ? 1 : -1));
  });
}

(async function init() {
  fillPage();
  bind();
  try {
    const hero = await load();
    if (!photos.length) { $("status").textContent = `Henüz fotoğraf yok. "${CONFIG.photosDir}" içinde bir klasör açıp fotoğraf yükleyin.`; return; }
    startHero(hero);
    renderTiles();
    renderFilters();
    applyFilter("*");
  } catch (err) {
    console.error(err);
    $("status").textContent = `Fotoğraflar yüklenemedi: ${err.message}`;
  }
})();
