const CONFIG = {
  photosDir: "photos",
  owner: "",
  repo: "",
  branch: ""
};

const CATEGORY_TITLES = {
  dugun: "Düğün",
  is: "İş"
};
const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif|avif)$/i;
const COVER_NAME = /^(kapak|cover)([-_.]|$)/i;
const page = document.body.dataset.page || "home";
const $ = (id) => document.getElementById(id);
let lightboxPhotos = [];
let lightboxIndex = 0;
let lastFocus = null;

function prettyName(key) {
  if (CATEGORY_TITLES[key]) return CATEGORY_TITLES[key];
  const name = decodeURIComponent(key).replace(/^\d+[-_.\s]+/, "").replace(/[-_]+/g, " ").trim();
  return name.charAt(0).toLocaleUpperCase("tr") + name.slice(1);
}

function repository() {
  let { owner, repo } = CONFIG;
  const host = location.hostname;
  if (host.endsWith(".github.io")) {
    owner ||= host.split(".")[0];
    repo ||= location.pathname.split("/").filter(Boolean)[0] || `${owner}.github.io`;
  }
  return { owner, repo };
}

async function listLocal(path) {
  const base = new URL(`${path.replace(/\/$/, "")}/`, location.href);
  const response = await fetch(base);
  if (!response.ok) throw new Error(`"${path}" klasörü açılamadı (${response.status}).`);
  const documentListing = new DOMParser().parseFromString(await response.text(), "text/html");
  const entries = [];
  documentListing.querySelectorAll("a[href]").forEach((anchor) => {
    const url = new URL(anchor.getAttribute("href"), base);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname) || url.pathname === base.pathname) return;
    const name = decodeURIComponent(url.pathname.slice(base.pathname.length)).replace(/\/$/, "");
    if (!name || name.includes("/")) return;
    const isImage = IMAGE_EXTENSIONS.test(name);
    const isDirectory = !isImage && !name.includes(".");
    if (!isImage && !isDirectory) return;
    entries.push({
      type: isDirectory ? "dir" : "file",
      name,
      path: `${path}/${name}`,
      download_url: `${path}/${encodeURIComponent(name)}`
    });
  });
  return entries;
}

async function listDirectory(path) {
  const { owner, repo } = repository();
  if (!owner || !repo) return listLocal(path);
  const cacheKey = `pl:${owner}/${repo}/${path}`;
  try {
    const hit = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
    if (hit && Date.now() - hit.t < 10 * 60 * 1000) return hit.d;
  } catch {}
  const branch = CONFIG.branch ? `?ref=${encodeURIComponent(CONFIG.branch)}` : "";
  const endpoint = `https://api.github.com/repos/${owner}/${repo}/contents/${path}${branch}`;
  const response = await fetch(endpoint, { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error(`Fotoğraf klasörü okunamadı (GitHub ${response.status}).`);
  const data = await response.json();
  try { sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), d: data })); } catch {}
  return data;
}

function imageFiles(entries) {
  return entries
    .filter((entry) => entry.type === "file" && IMAGE_EXTENSIONS.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name, "tr", { numeric: true }));
}

function imageSource(entry) {
  return entry.download_url || entry.path;
}

async function loadCategories() {
  const entries = await listDirectory(CONFIG.photosDir);
  return entries
    .filter((entry) => entry.type === "dir" && !entry.name.startsWith(".") && entry.name !== "kapak")
    .map((entry) => ({ ...entry, label: prettyName(entry.name) }))
    .sort((a, b) => a.name.localeCompare(b.name, "tr", { numeric: true }));
}

async function loadCovers() {
  try {
    const map = {};
    imageFiles(await listDirectory(`${CONFIG.photosDir}/kapak`)).forEach((f) => { map[f.name.replace(/\.[^.]+$/, "").toLowerCase()] = imageSource(f); });
    return map;
  } catch { return {}; }
}

function renderCategoryLinks(categories, covers = {}) {
  const nav = $("categoryList");
  nav.replaceChildren();
  if (!categories.length) {
    nav.append(Object.assign(document.createElement("p"), { className: "loading-note", textContent: "Henüz kategori yok. Fotoğraflar klasörüne kategori klasörü ekleyin." }));
    return;
  }
  categories.forEach((category) => {
    const link = document.createElement("a");
    link.className = "category-link";
    link.href = `galeri.html?tur=${encodeURIComponent(category.name)}`;
    const src = covers[category.name.toLowerCase()];
    if (src) {
      const img = document.createElement("img");
      img.className = "category-cover";
      img.src = src;
      img.alt = "";
      link.append(img);
    }
    const label = document.createElement("span");
    label.className = "category-name";
    label.textContent = category.label;
    const cta = document.createElement("span");
    cta.className = "category-cta";
    cta.textContent = "Galeriyi aç";
    link.append(label, cta);
    nav.append(link);
  });
}

function addToLightbox(photo, label) {
  const index = lightboxPhotos.length;
  lightboxPhotos.push({ src: imageSource(photo), label });
  return index;
}

function photoButton(photo, label, className) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `photo-button ${className}`;
  button.setAttribute("aria-label", `${label} fotoğrafını büyüt`);
  const index = addToLightbox(photo, label);
  const image = document.createElement("img");
  image.src = imageSource(photo);
  image.alt = label;
  image.loading = "lazy";
  image.decoding = "async";
  const reveal = () => image.classList.add("loaded");
  image.addEventListener("load", reveal);
  image.addEventListener("error", reveal);
  if (image.complete) reveal();
  const badge = document.createElement("span");
  badge.className = "expand-badge";
  badge.setAttribute("aria-hidden", "true");
  badge.textContent = "\u2922";
  button.append(image, badge);
  button.addEventListener("click", () => openLightbox(index));
  return button;
}

function shelfControls(shelf) {
  const nav = document.createElement("div");
  nav.className = "shelf-nav";
  const make = (text, label, dir) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "shelf-btn"; b.textContent = text; b.setAttribute("aria-label", label);
    b.addEventListener("click", () => shelf.scrollBy({ left: dir * shelf.clientWidth * 0.8, behavior: "smooth" }));
    return b;
  };
  const prev = make("\u2190", "Önceki fotoğraflar", -1), next = make("\u2192", "Sonraki fotoğraflar", 1);
  const update = () => {
    const end = shelf.scrollLeft + shelf.clientWidth >= shelf.scrollWidth - 4;
    prev.disabled = shelf.scrollLeft < 4; next.disabled = end; shelf.classList.toggle("at-end", end);
  };
  shelf.addEventListener("scroll", update, { passive: true });
  shelf.addEventListener("load", update, true);
  addEventListener("resize", update);
  requestAnimationFrame(update);
  nav.append(prev, next);
  return nav;
}

function createProject(title, photos) {
  if (!photos.length) return null;
  const sortedPhotos = [...photos].sort((a, b) => a.name.localeCompare(b.name, "tr", { numeric: true }));
  const coverIndex = sortedPhotos.findIndex((photo) => COVER_NAME.test(photo.name));
  const cover = coverIndex >= 0 ? sortedPhotos.splice(coverIndex, 1)[0] : sortedPhotos.shift();
  const project = document.createElement("article");
  project.className = "project";
  const heading = document.createElement("div");
  heading.className = "project-heading";
  const name = document.createElement("h2");
  name.textContent = title;
  const count = document.createElement("p");
  count.textContent = `${sortedPhotos.length + 1} fotoğraf`;
  const side = document.createElement("div");
  side.className = "heading-side";
  side.append(count);
  heading.append(name, side);

  const layout = document.createElement("div");
  layout.className = "project-layout";
  layout.append(photoButton(cover, `${title} kapak`, "project-cover"));
  const shelf = document.createElement("div");
  shelf.className = "project-shelf";
  sortedPhotos.forEach((photo) => shelf.append(photoButton(photo, title, "project-photo")));
  layout.append(shelf);
  if (sortedPhotos.length) side.append(shelfControls(shelf));
  project.append(heading, layout);
  return project;
}

async function renderGallery() {
  const categoryKey = new URLSearchParams(location.search).get("tur");
  if (!categoryKey || categoryKey.includes("/") || categoryKey.includes("\\")) {
    $("categoryTitle").textContent = "Kategori bulunamadı";
    $("status").textContent = "Bir galeri seçmek için ana sayfaya dönün.";
    return;
  }

  const categories = await loadCategories();
  const category = categories.find((item) => item.name === categoryKey);
  if (!category) {
    $("categoryTitle").textContent = "Kategori bulunamadı";
    $("status").textContent = "Bu kategori henüz yüklenmemiş. Ana sayfaya dönüp başka bir kategori seçin.";
    return;
  }

  document.title = `${category.label} | pozelook`;
  $("categoryTitle").textContent = category.label;
  const entries = await listDirectory(category.path);
  const projectEntries = entries.filter((entry) => entry.type === "dir").sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const projectList = [];
  const loosePhotos = imageFiles(entries);
  if (loosePhotos.length) projectList.push(createProject("Genel seçki", loosePhotos));
  const folderPhotos = await Promise.all(projectEntries.map(async (folder) => imageFiles(await listDirectory(folder.path))));
  projectEntries.forEach((folder, i) => {
    if (folderPhotos[i].length) projectList.push(createProject(prettyName(folder.name), folderPhotos[i]));
  });

  const projects = $("projects");
  projects.replaceChildren(...projectList.filter(Boolean));
  $("status").textContent = projectList.some(Boolean)
    ? "Büyütmek için bir fotoğrafa tıklayın; sağdaki sıra oklarla veya kaydırarak gezilir."
    : "Bu kategoride henüz fotoğraf yok. Organizasyon klasörünü eklediğinizde galeri burada görünür.";
}

function openLightbox(index) {
  if (!lightboxPhotos.length) return;
  lightboxIndex = (index + lightboxPhotos.length) % lightboxPhotos.length;
  const photo = lightboxPhotos[lightboxIndex];
  $("lbImg").src = photo.src;
  $("lbImg").alt = photo.label;
  $("lbCap").textContent = `${photo.label} · ${lightboxIndex + 1} / ${lightboxPhotos.length}`;
  if ($("lightbox").hidden) { lastFocus = document.activeElement; $("lightbox").hidden = false; $("lbClose").focus(); }
  document.body.style.overflow = "hidden";
  [lightboxIndex - 1, lightboxIndex + 1].forEach((n) => { new Image().src = lightboxPhotos[(n + lightboxPhotos.length) % lightboxPhotos.length].src; });
}

function closeLightbox() {
  $("lightbox").hidden = true;
  document.body.style.overflow = "";
  if (lastFocus) lastFocus.focus();
}

function bindLightbox() {
  $("lbClose").addEventListener("click", closeLightbox);
  $("lbPrev").addEventListener("click", () => openLightbox(lightboxIndex - 1));
  $("lbNext").addEventListener("click", () => openLightbox(lightboxIndex + 1));
  $("lightbox").addEventListener("click", (event) => {
    if (event.target.id === "lightbox") closeLightbox();
  });
  let startX = 0;
  $("lightbox").addEventListener("touchstart", (e) => { startX = e.touches[0].clientX; }, { passive: true });
  $("lightbox").addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 50) openLightbox(lightboxIndex + (dx < 0 ? 1 : -1));
  });
  document.addEventListener("keydown", (event) => {
    if ($("lightbox").hidden) return;
    if (event.key === "Escape") closeLightbox();
    if (event.key === "ArrowLeft") openLightbox(lightboxIndex - 1);
    if (event.key === "ArrowRight") openLightbox(lightboxIndex + 1);
  });
}

$("year").textContent = new Date().getFullYear();
if (page === "home") {
  Promise.all([loadCategories(), loadCovers()]).then(([c, covers]) => renderCategoryLinks(c, covers)).catch((error) => {
    console.error(error);
    $("status").textContent = `Kategoriler yüklenemedi: ${error.message}`;
  });
} else {
  bindLightbox();
  renderGallery().catch((error) => {
    console.error(error);
    $("status").textContent = `Fotoğraflar yüklenemedi: ${error.message}`;
  });
}
