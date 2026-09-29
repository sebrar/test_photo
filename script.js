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

function prettyName(key) {
  if (CATEGORY_TITLES[key]) return CATEGORY_TITLES[key];
  const name = decodeURIComponent(key).replace(/[-_]+/g, " ").trim();
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
      download_url: `${path}/${name}`
    });
  });
  return entries;
}

async function listDirectory(path) {
  const { owner, repo } = repository();
  if (!owner || !repo) return listLocal(path);
  const branch = CONFIG.branch ? `?ref=${encodeURIComponent(CONFIG.branch)}` : "";
  const endpoint = `https://api.github.com/repos/${owner}/${repo}/contents/${path}${branch}`;
  const response = await fetch(endpoint, { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error(`Fotoğraf klasörü okunamadı (GitHub ${response.status}).`);
  return response.json();
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
    .sort((a, b) => a.label.localeCompare(b.label, "tr"));
}

function renderCategoryLinks(categories) {
  const nav = $("categoryList");
  nav.replaceChildren();
  if (!categories.length) {
    $("status").textContent = "Henüz kategori yok. Fotoğraflar klasörüne kategori klasörü ekleyin.";
    return;
  }
  categories.forEach((category, index) => {
    const link = document.createElement("a");
    link.className = "category-link";
    link.href = `galeri.html?tur=${encodeURIComponent(category.name)}`;
    const number = document.createElement("span");
    number.className = "category-index";
    number.textContent = String(index + 1).padStart(2, "0");
    const label = document.createElement("span");
    label.className = "category-name";
    label.textContent = category.label;
    const arrow = document.createElement("span");
    arrow.className = "category-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "→";
    link.append(number, label, arrow);
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
  button.append(image);
  button.addEventListener("click", () => openLightbox(index));
  return button;
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
  heading.append(name, count);

  const layout = document.createElement("div");
  layout.className = "project-layout";
  layout.append(photoButton(cover, `${title} kapak`, "project-cover"));
  const shelf = document.createElement("div");
  shelf.className = "project-shelf";
  sortedPhotos.forEach((photo) => shelf.append(photoButton(photo, title, "project-photo")));
  layout.append(shelf);
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
  for (const folder of projectEntries) {
    const photos = imageFiles(await listDirectory(folder.path));
    if (photos.length) projectList.push(createProject(prettyName(folder.name), photos));
  }

  const projects = $("projects");
  projects.replaceChildren(...projectList.filter(Boolean));
  $("status").textContent = projectList.some(Boolean)
    ? ""
    : "Bu kategoride henüz fotoğraf yok. Organizasyon klasörünü eklediğinizde galeri burada görünür.";
}

function openLightbox(index) {
  if (!lightboxPhotos.length) return;
  lightboxIndex = (index + lightboxPhotos.length) % lightboxPhotos.length;
  const photo = lightboxPhotos[lightboxIndex];
  $("lbImg").src = photo.src;
  $("lbImg").alt = photo.label;
  $("lbCap").textContent = `${photo.label} · ${lightboxIndex + 1} / ${lightboxPhotos.length}`;
  $("lightbox").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeLightbox() {
  $("lightbox").hidden = true;
  document.body.style.overflow = "";
}

function bindLightbox() {
  $("lbClose").addEventListener("click", closeLightbox);
  $("lbPrev").addEventListener("click", () => openLightbox(lightboxIndex - 1));
  $("lbNext").addEventListener("click", () => openLightbox(lightboxIndex + 1));
  $("lightbox").addEventListener("click", (event) => {
    if (event.target.id === "lightbox") closeLightbox();
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
  loadCategories().then(renderCategoryLinks).catch((error) => {
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
