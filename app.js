/* Καλά Νέα — frontend logic */

const CATEGORY_LABELS = {
  environment: { label: "Περιβάλλον", emoji: "🌿" },
  animals: { label: "Ζώα", emoji: "🐾" },
  science: { label: "Επιστήμη & Υγεία", emoji: "🔬" },
  technology: { label: "Τεχνολογία", emoji: "💡" },
  sports: { label: "Αθλητισμός", emoji: "🏆" },
  culture: { label: "Πολιτισμός & Τέχνη", emoji: "🎨" },
  society: { label: "Κοινωνία & Ανθρωπιά", emoji: "❤️" },
  world: { label: "Κόσμος", emoji: "🌍" },
};

const state = {
  items: [],
  category: "all",
  query: "",
  sort: "newest",
};

const els = {
  grid: document.getElementById("news-grid"),
  categories: document.getElementById("categories"),
  status: document.getElementById("status"),
  empty: document.getElementById("empty"),
  search: document.getElementById("search-input"),
  sort: document.getElementById("sort-select"),
  refresh: document.getElementById("refresh-btn"),
  meta: document.getElementById("meta-info"),
};

const GREEK_LETTERS = /[\u0370-\u03FF\u1F00-\u1FFF]/g;

function isGreekText(s) {
  const text = String(s || "");
  const greek = (text.match(GREEK_LETTERS) || []).length;
  if (!greek) return false;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  return greek >= (greek + latin) * 0.25;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function relativeTime(iso) {
  if (!iso) return "";
  const then = new Date(iso);
  if (isNaN(then)) return "";
  const diffMs = Date.now() - then.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "μόλις τώρα";
  if (mins < 60) return `πριν ${mins} λεπτά`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `πριν ${hours} ώρ${hours === 1 ? "α" : "ες"}`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "χθες";
  if (days < 7) return `πριν ${days} ημέρες`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `πριν ${weeks} εβδομάδ${weeks === 1 ? "α" : "ες"}`;
  return then.toLocaleDateString("el-GR", { day: "numeric", month: "short", year: "numeric" });
}

/** Μεταφρασμένη σελίδα μέσω επίσημου redirect του Google Translate (μόνο για μη-ελληνικά) */
function translatedUrl(link, lang) {
  if (lang === "el") return link;
  try {
    // Έλεγχος ότι είναι έγκυρος https URL
    const u = new URL(link);
    if (u.protocol !== "https:" && u.protocol !== "http:") return link;
    return `https://translate.google.com/translate?sl=auto&tl=el&u=${encodeURIComponent(link)}`;
  } catch {
    return link;
  }
}

function getFiltered() {
  let items = state.items.slice();
  if (state.category !== "all") {
    items = items.filter((i) => i.category === state.category);
  }
  if (state.query) {
    const q = state.query.toLowerCase();
    items = items.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        (i.titleOriginal && i.titleOriginal.toLowerCase().includes(q)) ||
        (i.description && i.description.toLowerCase().includes(q)) ||
        i.source.toLowerCase().includes(q)
    );
  }
  if (state.sort === "random") {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
  } else {
    // Ελληνικά άρθρα με προτεραιότητα, μετά νεότερα πρώτα
    items.sort((a, b) => {
      const ga = a.lang === "el" ? 0 : 1;
      const gb = b.lang === "el" ? 0 : 1;
      if (ga !== gb) return ga - gb;
      return new Date(b.date || 0) - new Date(a.date || 0);
    });
  }
  return items;
}

function renderCategories() {
  const counts = { all: state.items.length };
  for (const item of state.items) {
    counts[item.category] = (counts[item.category] || 0) + 1;
  }
  const order = ["all", ...Object.keys(CATEGORY_LABELS).filter((k) => counts[k])];
  els.categories.innerHTML = order
    .map((key) => {
      const meta = key === "all" ? { label: "Όλα", emoji: "✨" } : CATEGORY_LABELS[key];
      const active = state.category === key ? " active" : "";
      return `<button type="button" class="chip${active}" data-cat="${key}">${meta.emoji} ${escapeHtml(meta.label)}<span class="count">${counts[key] || 0}</span></button>`;
    })
    .join("");
}

function renderCards() {
  const items = getFiltered();
  els.empty.classList.toggle("hidden", items.length > 0);
  els.status.textContent =
    items.length > 0
      ? `Εμφανίζονται ${items.length} ειδήσεις${state.category !== "all" ? " στην κατηγορία " + CATEGORY_LABELS[state.category].label : ""}`
      : "";
  els.grid.innerHTML = items
    .map((item) => {
      const cat = CATEGORY_LABELS[item.category] || CATEGORY_LABELS.world;
      const flag = item.flag || "🌍";
      const sourceLang = item.langOriginal || item.lang;
      const inGreek = item.lang === "el";
      const primary = translatedUrl(item.link, sourceLang);
      const showOriginal =
        !inGreek &&
        item.titleOriginal &&
        item.titleOriginal.toLowerCase() !== item.title.toLowerCase();
      const description = isGreekText(item.description) ? item.description : "";
      const img = item.image
        ? `<img src="${escapeHtml(item.image)}" alt="" loading="lazy" onerror="this.closest('.card-media').innerHTML='<div class=&quot;placeholder no-img&quot;>${cat.emoji}</div>'">`
        : `<div class="placeholder no-img">${cat.emoji}</div>`;
      return `
        <article class="card${item.lang === "el" ? " card-greek" : ""}">
          <div class="card-media">${img}</div>
          <div class="card-body">
            <div class="card-meta">
              <span class="card-flag" title="Χώρα προέλευσης">${escapeHtml(flag)}</span>
              <span class="card-source">${escapeHtml(item.source)}</span>
              <span class="card-cat">${cat.emoji} ${escapeHtml(cat.label)}</span>
              <span>${escapeHtml(relativeTime(item.date))}</span>
              ${inGreek && sourceLang !== "el" ? `<span class="card-translated" title="Ο τίτλος μεταφράστηκε αυτόματα">Μεταφρασμένο</span>` : ""}
            </div>
            <h2 class="card-title">
              <a href="${escapeHtml(primary)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>
            </h2>
            ${showOriginal ? `<p class="card-title-original" title="Αρχικός τίτλος">${escapeHtml(item.titleOriginal)}</p>` : ""}
            ${description ? `<p class="card-desc">${escapeHtml(description)}</p>` : ""}
            <div class="card-actions">
              <a class="card-link" href="${escapeHtml(primary)}" target="_blank" rel="noopener noreferrer">Διαβάστε περισσότερα →</a>
              ${sourceLang !== "el" ? `<a class="card-link-original" href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer" title="Πρωτότυπο στα αγγλικά">Πρωτότυπο ↗</a>` : ""}
            </div>
          </div>
        </article>`;
    })
    .join("");
}

async function loadData(bustCache = false) {
  els.refresh.disabled = true;
  els.refresh.classList.add("is-spinning");
  els.status.classList.remove("error");
  els.status.textContent = "Φόρτωση ειδήσεων…";
  try {
    const url = bustCache ? `data/data.json?t=${Date.now()}` : "data/data.json";
    const res = await fetch(url, { cache: bustCache ? "no-store" : "default" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.items = Array.isArray(data.items) ? data.items : [];
    if (data.meta?.generatedAt) {
      const d = new Date(data.meta.generatedAt);
      const greekPart = data.meta.greek ? ` · ${data.meta.greek} ελληνικά` : "";
      els.meta.textContent = `Τελευταία ενημέρωση: ${d.toLocaleString("el-GR")} · Πηγές: ${data.meta.sources?.length || 0}${greekPart}`;
    }
    renderCategories();
    renderCards();
  } catch (err) {
    console.error(err);
    els.status.classList.add("error");
    els.status.textContent = "Αποτυχία φόρτωσης ειδήσεων. Δοκιμάστε ξανά σε λίγο.";
    els.empty.classList.add("hidden");
  } finally {
    els.refresh.disabled = false;
    els.refresh.classList.remove("is-spinning");
  }
}

/* events */
els.categories.addEventListener("click", (e) => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  state.category = btn.dataset.cat;
  renderCategories();
  renderCards();
});

els.search.addEventListener("input", () => {
  state.query = els.search.value.trim();
  renderCards();
});

els.sort.addEventListener("change", () => {
  state.sort = els.sort.value;
  renderCards();
});

els.refresh.addEventListener("click", () => loadData(true));

loadData();
