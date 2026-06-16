const slides = Array.from(document.querySelectorAll(".hero-slide"));
const dots = Array.from(document.querySelectorAll(".slide-dot"));
const menuToggle = document.querySelector(".menu-toggle");
const mainNav = document.querySelector(".main-nav");
const header = document.querySelector(".site-header");
const scrollRoot = document.body;
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const productModal = document.querySelector("#product-modal");
let productCards = Array.from(document.querySelectorAll("[data-product]"));
const productCloseButtons = Array.from(document.querySelectorAll("[data-modal-close]"));
const fullRangeButton = document.querySelector("[data-full-range]");
const palletPagination = document.querySelector(".pallet-pagination");
const truckModal = document.querySelector("#truck-modal");
let truckCards = Array.from(document.querySelectorAll("[data-truck]"));
const truckCloseButtons = Array.from(document.querySelectorAll("[data-truck-close]"));
const inventoryPagination = document.querySelector(".inventory-pagination");
const pageSizeSelect = document.querySelector("[data-page-size]");
const liveStockSheetEndpoint = "https://docs.google.com/spreadsheets/d/1gdL5hFBBuuAu_J_5rspcL-OfxC6DCj-5v7snztSbzrc/gviz/tq?sheet=Forklift%20Stock";
let activeSlide = 0;
let slideTimer;
let lastKnownScrollTop = -1;
let lastHeaderScrollTop = 0;
const slideFadeDuration = 1600;
let activeProductImage = 0;
let palletRangeExpanded = false;
let activePalletPage = 1;
let activeInventoryPage = 1;
const siteRoot = new URL(".", document.querySelector('script[src*="script.js"]')?.src || window.location.href).href;

function initTmdReveals() {
  const tmdRevealTargets = Array.from(document.querySelectorAll(".tmd-category, .tmd-machine-card, .tmd-featured-benefits article, .tmd-footer article"));
  if (!tmdRevealTargets.length) return;
  document.body.classList.add("tmd-motion-ready");
  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    tmdRevealTargets.forEach((target) => target.classList.add("is-visible"));
    return;
  }

  const categoryItems = Array.from(document.querySelectorAll(".tmd-category"));
  const machineCards = Array.from(document.querySelectorAll(".tmd-machine-card"));
  const benefitItems = Array.from(document.querySelectorAll(".tmd-featured-benefits article"));
  const footerItems = Array.from(document.querySelectorAll(".tmd-footer article"));
  const revealDelay = (target) => {
    if (target.classList.contains("tmd-machine-card")) {
      return machineCards.indexOf(target) * 130;
    }
    if (target.classList.contains("tmd-category")) {
      return categoryItems.indexOf(target) * 90;
    }
    if (target.closest(".tmd-featured-benefits")) {
      return benefitItems.indexOf(target) * 90;
    }
    if (target.closest(".tmd-footer")) {
      return footerItems.indexOf(target) * 90;
    }
    return 0;
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -12% 0px", threshold: 0.18 });

  tmdRevealTargets.forEach((target) => {
    target.style.transitionDelay = `${revealDelay(target)}ms`;
    observer.observe(target);
  });
}

let palletProducts = {
  "aegis-at30-allterrain": {
    title: "AEGIS AT30 AllTerrain",
    type: "All-terrain Electric Pallet Truck",
    capacity: "3,000 kg",
    battery: "48V / 32Ah",
    radius: "Ask for details",
    fork: "1150 mm",
    weight: "Ask for details",
    price: "POA",
    description: "Heavy-duty all-terrain pallet truck for yards, construction sites, farms and outdoor material movement where standard pallet trucks struggle.",
    images: ["../assets/allterrain/at30-allterrain-main.jpeg", "../assets/allterrain/at30-yard.jpeg", "../assets/allterrain/at30-warehouse.jpeg"]
  },
  "ept20-15et2": {
    title: "EPT20-15ET2",
    type: "Electric Pallet Truck",
    capacity: "2,000 kg",
    battery: "24V / 150Ah",
    radius: "1,360 mm",
    fork: "1150 mm",
    weight: "540 kg",
    price: "£2,250.00",
    description: "Compact, reliable and easy to manoeuvre. The EPT20-15ET2 is ideal for moving pallets efficiently in tight spaces.",
    images: ["../assets/pallet-card.jpeg", "../assets/hero-pallet-truck.png", "../assets/pallet-features-strip.jpeg", "../assets/pallet-page-hero-reference.jpeg", "../assets/hero-pallet-truck-new.jpeg"]
  },
  "ept25-20et2": {
    title: "EPT25-20ET2",
    type: "Electric Pallet Truck",
    capacity: "2,500 kg",
    battery: "24V / 210Ah",
    radius: "1,520 mm",
    fork: "1150 mm",
    weight: "620 kg",
    price: "£2,750.00",
    description: "A stronger electric pallet truck for busy warehouses that need dependable lifting power and long battery life.",
    images: ["../assets/pallet-card.jpeg", "../assets/pallet-page-hero-reference.jpeg", "../assets/hero-pallet-truck.png", "../assets/pallet-features-strip.jpeg", "../assets/hero-pallet-truck-new.jpeg"]
  },
  "ept30-20et2": {
    title: "EPT30-20ET2",
    type: "Electric Pallet Truck",
    capacity: "3,000 kg",
    battery: "24V / 240Ah",
    radius: "1,640 mm",
    fork: "1220 mm",
    weight: "700 kg",
    price: "£3,250.00",
    description: "Heavy-duty pallet handling with electric drive, generous battery capacity and a work-ready build for demanding sites.",
    images: ["../assets/pallet-card.jpeg", "../assets/hero-pallet-truck-new.jpeg", "../assets/pallet-page-hero-reference.jpeg", "../assets/pallet-features-strip.jpeg", "../assets/hero-pallet-truck.png"]
  },
  "ept20-20et2": {
    title: "EPT20-20ET2",
    type: "Stand-on Electric Pallet Truck",
    capacity: "2,000 kg",
    battery: "24V / 210Ah",
    radius: "1,480 mm",
    fork: "1150 mm",
    weight: "760 kg",
    price: "£3,950.00",
    description: "A stand-on electric pallet truck for longer travel distances, regular loading work and efficient warehouse movement.",
    images: ["../assets/hero-pallet-truck.png", "../assets/pallet-card.jpeg", "../assets/hero-pallet-truck-new.jpeg", "../assets/pallet-features-strip.jpeg", "../assets/pallet-page-hero-reference.jpeg"]
  }
};

let usedTruckProducts = {
  "toyota-8fbe20u": {
    tag: "Great value",
    image: "../assets/hero-electric-forklift.png",
    title: "Toyota 8FBE20U",
    type: "Electric Forklift",
    capacity: "4,000 lbs",
    lift: "189 in",
    hours: "3,245 hrs",
    year: "2018",
    mast: "3 Stage",
    tyres: "Solid",
    powerLabel: "Battery",
    power: "48V",
    price: "£18,500",
    points: ["3-wheel electric counterbalance forklift", "Excellent condition - fully serviced", "Ideal for warehouse and indoor use", "Smooth operation and high efficiency", "Charger included"]
  },
  "hyster-j40xnt": {
    tag: "Certified used",
    image: "../assets/hero-used-forklift-lineup.png",
    title: "Hyster J40XNT",
    type: "Electric Forklift",
    capacity: "4,000 lbs",
    lift: "187 in",
    hours: "4,102 hrs",
    year: "2017",
    mast: "3 Stage",
    tyres: "Solid",
    powerLabel: "Battery",
    power: "48V",
    price: "£16,750",
    points: ["Electric counterbalance forklift", "Fully inspected and serviced", "Smooth indoor warehouse performance", "Battery and charger included"]
  },
  "crown-sc5340-40": {
    tag: "Ready to work",
    image: "../assets/hero-used-forklift.jpeg",
    title: "Crown SC5340-40",
    type: "Diesel Forklift",
    capacity: "4,000 lbs",
    lift: "187 in",
    hours: "2,876 hrs",
    year: "2019",
    mast: "Duplex",
    tyres: "Pneumatic",
    powerLabel: "Fuel",
    power: "Diesel",
    price: "£17,900",
    points: ["Diesel counterbalance forklift", "Ready for yard and industrial use", "Checked for safety and performance", "Strong lifting power and reliability"]
  },
  "yale-erc040vg": {
    tag: "In stock",
    image: "../assets/hero-electric-forklift.png",
    title: "Yale ERC040VG",
    type: "Electric Forklift",
    capacity: "4,000 lbs",
    lift: "181 in",
    hours: "5,210 hrs",
    year: "2016",
    mast: "3 Stage",
    tyres: "Solid",
    powerLabel: "Battery",
    power: "48V",
    price: "£13,950",
    points: ["Electric warehouse forklift", "Serviced and inspected before sale", "Compact turning and easy operation", "Excellent value for daily use"]
  },
  "clark-ecx25": {
    tag: "In stock",
    image: "../assets/hero-used-forklift-lineup.png",
    title: "Clark ECX25",
    type: "Electric Forklift",
    capacity: "5,000 lbs",
    lift: "189 in",
    hours: "3,615 hrs",
    year: "2019",
    mast: "3 Stage",
    tyres: "Solid",
    powerLabel: "Battery",
    power: "80V",
    price: "£21,900",
    points: ["Electric counterbalance forklift", "High-capacity warehouse machine", "Inspected, checked and work-ready", "Low operating costs and smooth drive"]
  },
  "toyota-8fbe25u": {
    tag: "Great value",
    image: "../assets/hero-used-forklift.jpeg",
    title: "Toyota 8FBE25U",
    type: "Diesel Forklift",
    capacity: "5,000 lbs",
    lift: "189 in",
    hours: "4,155 hrs",
    year: "2018",
    mast: "3 Stage",
    tyres: "Pneumatic",
    powerLabel: "Fuel",
    power: "Diesel",
    price: "£20,500",
    points: ["Heavy-duty diesel forklift", "Excellent yard and loading performance", "Fully checked before delivery", "Built for tougher outdoor work"]
  },
  "hyster-j50xn": {
    tag: "In stock",
    image: "../assets/hero-electric-forklift.png",
    title: "Hyster J50XN",
    type: "Electric Forklift",
    capacity: "4,000 lbs",
    lift: "187 in",
    hours: "6,235 hrs",
    year: "2016",
    mast: "Duplex",
    tyres: "Solid",
    powerLabel: "Battery",
    power: "48V",
    price: "£15,900",
    points: ["Electric forklift for regular warehouse work", "Reliable drive and lifting performance", "Serviced and prepared for sale", "Battery and charger included"]
  },
  "crown-fc4500-50": {
    tag: "Great value",
    image: "../assets/hero-used-forklift-lineup.png",
    title: "Crown FC4500-50",
    type: "Diesel Forklift",
    capacity: "5,000 lbs",
    lift: "188 in",
    hours: "4,889 hrs",
    year: "2017",
    mast: "3 Stage",
    tyres: "Pneumatic",
    powerLabel: "Fuel",
    power: "Diesel",
    price: "£18,450",
    points: ["Diesel counterbalance forklift", "Strong option for heavier loads", "Ready for yard and warehouse use", "Checked, tested and prepared"]
  }
};

function normaliseDriveImageUrl(value) {
  const rawValue = String(value || "").trim();
  const idMatch = rawValue.match(/drive\.google\.com\/(?:uc\?[^#]*\bid=([^&#]+)|open\?[^#]*\bid=([^&#]+)|file\/d\/([^/]+)|thumbnail\?[^#]*\bid=([^&#]+))/i);
  const fileId = idMatch && (idMatch[1] || idMatch[2] || idMatch[3] || idMatch[4]);
  if (!fileId) return rawValue;
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(decodeURIComponent(fileId))}&sz=w1600`;
}

function resolveSitePath(value, fallback) {
  const rawPath = normaliseDriveImageUrl(value || fallback);
  if (!rawPath) return "";
  if (/^(https?:|data:|\/|\.\.\/)/i.test(rawPath)) return rawPath;
  return new URL(rawPath.replace(/^\.?\//, ""), siteRoot).href;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMoney(value) {
  const text = String(value || "").trim();
  if (!text) return "POA";
  if (text.includes("£")) return text;
  const amount = text.replace(/[^\d.]/g, "");
  if (!amount) return text;
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return text;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0
  }).format(numeric);
}

function fallbackImageForCategory(category) {
  const clean = normaliseInventoryCategory(category);
  const fallbacks = {
    "pallet-truck": "assets/pallet-card.jpeg",
    "forklift-truck": "assets/tmd-featured-forklift.png",
    "industrial": "assets/tmd-category-industrial.jpeg",
    "agricultural": "assets/tmd-featured-tractor.png",
    "construction": "assets/tmd-featured-excavator.png",
    "commercial-vehicles": "assets/tmd-featured-van.png",
    "plant-equipment": "assets/tmd-category-plant-equipment.jpeg"
  };
  return resolveSitePath(fallbacks[clean] || "assets/tmd-featured-forklift.png", "assets/tmd-featured-forklift.png");
}

function normaliseInventoryCategory(value) {
  const clean = String(value || "").toLowerCase().trim();
  if (clean.includes("construction") || clean.includes("excavator") || clean.includes("digger") || clean.includes("dumper")) return "construction";
  if (clean.includes("agric") || clean.includes("tractor") || clean.includes("telehandler")) return "agricultural";
  if (clean.includes("commercial") || clean.includes("vehicle") || clean.includes("van") || clean.includes("tipper")) return "commercial-vehicles";
  if (clean.includes("plant") || clean.includes("equipment") || clean.includes("generator") || clean.includes("compressor")) return "plant-equipment";
  if (clean.includes("industrial") || clean.includes("warehouse")) return "industrial";
  if (clean.includes("pallet")) return "pallet-truck";
  if (clean.includes("forklift")) return "forklift-truck";
  return clean.replace(/\s+/g, "-");
}

function normaliseInventoryStatus(value) {
  const clean = String(value || "").toLowerCase().trim();
  if (!clean || clean === "in stock" || clean === "instock") return "in-stock";
  return clean.replace(/\s+/g, "-");
}

function splitInventoryList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value || "")
    .split(/\n|,|\|/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function slugFromText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normaliseInventoryItem(item) {
  const next = { ...item };
  next.id = String(next.id || slugFromText([next.brand, next.model].filter(Boolean).join(" "))).trim();
  next.category = normaliseInventoryCategory(next.category || next.type || "forklift-truck");
  next.status = normaliseInventoryStatus(next.status || "in-stock");
  next.featured = next.featured === true || /^yes|true|1$/i.test(String(next.featured || ""));
  next.galleryImages = splitInventoryList(next.galleryImages);
  if (next.imageMain && !next.galleryImages.includes(next.imageMain)) next.galleryImages.unshift(next.imageMain);
  return next;
}

async function loadLocalInventory() {
  const response = await fetch(resolveSitePath("data/inventory.json", ""));
  if (!response.ok) throw new Error(`Inventory fetch failed: ${response.status}`);
  return response.json();
}

function mergeInventoryItems(primaryItems, fallbackItems) {
  const merged = new Map();
  fallbackItems.forEach((item) => merged.set(item.id, item));
  primaryItems.forEach((item) => merged.set(item.id, item));
  return Array.from(merged.values());
}

function productFromInventoryItem(item) {
  const fallback = fallbackImageForCategory(item.category);
  const gallery = item.galleryImages && item.galleryImages.length ? item.galleryImages : [item.imageMain];
  return {
    title: [item.brand, item.model].filter(Boolean).join(" ") || item.model || "Trade Machinery Direct Stock",
    type: item.type || item.category,
    capacity: item.capacity || "Ask for details",
    battery: item.battery || item.fuel || item.power || "Ask for details",
    radius: "Ask for details",
    fork: item.liftHeight || "Ask for details",
    weight: item.hours || "Ask for details",
    price: formatMoney(item.price),
    description: item.description || "Reliable equipment supplied by Trade Machinery Direct.",
    images: gallery.map((image) => resolveSitePath(image, fallback))
  };
}

function truckFromInventoryItem(item) {
  const fallback = fallbackImageForCategory(item.category);
  return {
    tag: item.featured ? "Featured" : item.status || "In stock",
    image: resolveSitePath(item.imageMain, fallback),
    title: [item.brand, item.model].filter(Boolean).join(" ") || item.model || "Used Forklift",
    type: item.type || "Forklift Truck",
    capacity: item.capacity || "Ask for details",
    lift: item.liftHeight || "Ask for details",
    hours: item.hours || "Ask for details",
    year: item.year || "Ask",
    mast: item.mast || "Ask",
    tyres: item.tyres || "Ask",
    powerLabel: item.battery ? "Battery" : item.fuel ? "Fuel" : "Power",
    power: item.battery || item.fuel || item.power || "Ask",
    price: formatMoney(item.price),
    points: item.bullets && item.bullets.length ? item.bullets : [item.description || "Inspected, prepared and supplied by Trade Machinery Direct."]
  };
}

function labelForInventoryCategory(category) {
  const clean = normaliseInventoryCategory(category);
  const labels = {
    "pallet-truck": "Pallet truck",
    "forklift-truck": "Forklift",
    "industrial": "Industrial",
    "agricultural": "Agricultural",
    "construction": "Construction",
    "commercial-vehicles": "Van",
    "plant-equipment": "Plant"
  };
  return labels[clean] || String(category || "Machine").replace(/-/g, " ");
}

function linkForInventoryCategory(category) {
  const clean = normaliseInventoryCategory(category);
  if (clean === "pallet-truck") return "electric-pallet-trucks/index.html";
  if (clean === "forklift-truck" || clean === "industrial") return "used-forklifts/index.html";
  return `#${clean}`;
}

function imageForInventoryItem(item) {
  const fallback = fallbackImageForCategory(item.category);
  return resolveSitePath(item.imageMain || (item.galleryImages && item.galleryImages[0]), fallback);
}

function titleForInventoryItem(item) {
  return [item.brand, item.model].filter(Boolean).join(" ") || item.model || item.title || "Trade Machinery Direct stock";
}

function specTripletForInventoryItem(item) {
  const mileage = item.mileage || item.miles;
  return [
    [mileage ? "Mileage" : "Hours", mileage || item.hours || "Ask"],
    [item.fuel ? "Fuel" : item.battery ? "Battery" : "Power", item.fuel || item.battery || item.power || "Ask"],
    ["Location", item.location || "UK"]
  ];
}

function bindProductCards() {
  productCards.forEach((card) => {
    if (card.dataset.bound === "true") return;
    card.dataset.bound = "true";
    card.addEventListener("click", (event) => {
      event.preventDefault();
      openProductModal(card.dataset.product);
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openProductModal(card.dataset.product);
      }
    });
  });
}

function bindTruckCards() {
  truckCards.forEach((card) => {
    if (card.dataset.bound === "true") return;
    card.dataset.bound = "true";
    card.addEventListener("click", (event) => {
      event.preventDefault();
      openTruckModal(card.dataset.truck);
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openTruckModal(card.dataset.truck);
      }
    });
  });
}

function renderPalletCards(items) {
  const grid = document.querySelector(".model-grid");
  if (!grid || !items.length) return;

  palletProducts = Object.fromEntries(items.map((item) => [item.id, productFromInventoryItem(item)]));
  grid.innerHTML = items.map((item) => {
    const product = palletProducts[item.id];
    const image = product.images[0] || fallbackImageForCategory(item.category);
    return `
      <article class="product-card" data-product="${escapeHtml(item.id)}" tabindex="0">
        <img src="${escapeHtml(image)}" alt="${escapeHtml(product.title)}" onerror="this.onerror=null;this.src='${escapeHtml(fallbackImageForCategory(item.category))}'" />
        <h3>${escapeHtml([item.brand, item.model].filter(Boolean).join(" ") || item.model)}</h3>
        <p>${escapeHtml(item.type || "Electric Pallet Truck")}</p>
        <dl><div><dt>Capacity</dt><dd>${escapeHtml(item.capacity || "Ask")}</dd></div><div><dt>Battery</dt><dd>${escapeHtml(item.battery || item.power || "Ask")}</dd></div></dl>
        <a href="#" data-product-trigger>View details <span aria-hidden="true">-&gt;</span></a>
      </article>
    `;
  }).join("");

  productCards = Array.from(document.querySelectorAll("[data-product]"));
  bindProductCards();
  renderPalletRange(1);
}

function renderTruckCards(items) {
  const grid = document.querySelector(".used-grid");
  if (!grid || !items.length) return;

  usedTruckProducts = Object.fromEntries(items.map((item) => [item.id, truckFromInventoryItem(item)]));
  grid.innerHTML = items.map((item) => {
    const truck = usedTruckProducts[item.id];
    return `
      <article class="used-card" data-truck="${escapeHtml(item.id)}" tabindex="0">
        ${item.featured ? '<span class="tag">Featured</span>' : ""}
        <img src="${escapeHtml(truck.image)}" alt="${escapeHtml(truck.title)}" onerror="this.onerror=null;this.src='${escapeHtml(fallbackImageForCategory(item.category))}'" />
        <h3>${escapeHtml(truck.title)}</h3>
        <p>${escapeHtml(truck.type)}</p>
        <dl><div><dt>Capacity</dt><dd>${escapeHtml(truck.capacity)}</dd></div><div><dt>Lift height</dt><dd>${escapeHtml(truck.lift)}</dd></div></dl>
        <small>${escapeHtml([item.year, item.hours].filter(Boolean).join(" | ") || "Ask for details")}</small>
        <strong>${escapeHtml(truck.price)}</strong>
        <a href="#" data-truck-trigger>View details <span aria-hidden="true">-&gt;</span></a>
      </article>
    `;
  }).join("");

  const resultCount = document.querySelector(".results-heading p strong");
  if (resultCount) resultCount.textContent = `${items.length} results found`;
  truckCards = Array.from(document.querySelectorAll("[data-truck]"));
  bindTruckCards();
  renderInventoryPage(1);
}

function renderHomeInventory(items) {
  const grid = document.querySelector(".tmd-machine-grid");
  if (!grid || !items.length) return;

  const featured = items
    .filter((item) => item.status !== "sold" && item.status !== "draft")
    .slice()
    .sort((a, b) => {
      if (Boolean(b.featured) !== Boolean(a.featured)) return Number(Boolean(b.featured)) - Number(Boolean(a.featured));
      return (Number(a.sortOrder) || 9999) - (Number(b.sortOrder) || 9999);
    })
    .slice(0, 4);

  grid.innerHTML = featured.map((item) => {
    const title = titleForInventoryItem(item);
    const image = imageForInventoryItem(item);
    const specs = specTripletForInventoryItem(item);
    return `
      <article class="tmd-machine-card" data-stock-id="${escapeHtml(item.id)}">
        <div class="tmd-machine-image">
          <img src="${escapeHtml(image)}" alt="${escapeHtml(title)}" onerror="this.onerror=null;this.src='${escapeHtml(fallbackImageForCategory(item.category))}'" />
          <span>${escapeHtml(labelForInventoryCategory(item.category))}</span>
        </div>
        <div class="tmd-machine-details">
          <small>${escapeHtml(item.year || item.status || "In stock")}</small>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(item.type || item.capacity || labelForInventoryCategory(item.category))}</p>
          <dl>
            ${specs.map(([term, value]) => `<div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}
          </dl>
          <a href="${escapeHtml(linkForInventoryCategory(item.category))}">View details <span aria-hidden="true">-&gt;</span></a>
        </div>
      </article>
    `;
  }).join("");

  initTmdReveals();
}

async function loadInventoryFromJson() {
  if (!document.querySelector(".used-grid, .model-grid, .inventory-grid, .tmd-machine-grid")) return;
  try {
    const [sheetInventory, localInventory] = await Promise.all([
      loadInventoryFromGoogleSheet().catch(() => ({ items: [] })),
      loadLocalInventory().catch(() => ({ items: [] }))
    ]);
    const sheetItems = Array.isArray(sheetInventory.items)
      ? sheetInventory.items.map(normaliseInventoryItem).filter((item) => item.status !== "draft")
      : [];
    const localItems = Array.isArray(localInventory.items)
      ? localInventory.items.map(normaliseInventoryItem).filter((item) => item.status !== "draft")
      : [];
    const items = mergeInventoryItems(sheetItems, localItems);
    renderHomeInventory(items);
    renderPalletCards(items.filter((item) => item.category === "pallet-truck"));
    renderTruckCards(items.filter((item) => item.category === "forklift-truck"));
  } catch (error) {
    console.warn(error);
  }
}

let tmdChatInventoryPromise;

function tmdChatItemTitle(item) {
  return [item.brand, item.model].filter(Boolean).join(" ") || item.model || item.brand || "Machine";
}

function tmdChatFormatPrice(item) {
  const price = formatMoney(item.price);
  return price === "POA" ? "POA" : `${price}${item.vat === false ? "" : " + VAT"}`;
}

function tmdChatItemLine(item) {
  const details = [
    item.type,
    item.capacity,
    item.power || item.fuel || item.battery,
    item.year,
    tmdChatFormatPrice(item)
  ].filter(Boolean);
  return `${tmdChatItemTitle(item)} - ${details.join(" | ")}`;
}

function tmdChatFilterItems(items, message) {
  const clean = message.toLowerCase();
  return items.filter((item) => {
    const haystack = [
      item.id,
      item.category,
      item.status,
      item.brand,
      item.model,
      item.type,
      item.power,
      item.capacity,
      item.year,
      item.battery,
      item.fuel,
      item.description,
      ...(Array.isArray(item.bullets) ? item.bullets : [])
    ].join(" ").toLowerCase();

    if (clean.includes("forklift") && item.category !== "forklift-truck") return false;
    if ((clean.includes("pallet") || clean.includes("at30")) && item.category !== "pallet-truck") return false;
    if (clean.includes("electric") && !haystack.includes("electric")) return false;
    if (clean.includes("diesel") && !haystack.includes("diesel")) return false;
    if (clean.includes("toyota") && !haystack.includes("toyota")) return false;
    if (clean.includes("hyster") && !haystack.includes("hyster")) return false;
    if (clean.includes("aegis") && !haystack.includes("aegis")) return false;
    if (clean.includes("tianyu") && !haystack.includes("tianyu")) return false;
    if (clean.includes("at30") && !haystack.includes("at30")) return false;
    return true;
  });
}

function tmdChatBuildAnswer(message, items, source = "AEGIS Sales OS") {
  const stock = items.filter((item) => item.status !== "sold" && item.status !== "draft");
  const clean = message.toLowerCase();
  const matches = tmdChatFilterItems(stock, clean).slice(0, 5);
  const forkliftCount = stock.filter((item) => item.category === "forklift-truck").length;
  const palletCount = stock.filter((item) => item.category === "pallet-truck").length;

  if (!clean.trim()) {
    return `Ask me about current stock from ${source}.`;
  }

  if (clean.includes("how many") || clean.includes("stock") || clean.includes("available") || clean.includes("have")) {
    if (!matches.length) {
      return `I can see ${stock.length} machines in ${source}: ${forkliftCount} forklift trucks and ${palletCount} pallet trucks. Tell me the type, brand, capacity or power and I will narrow it down.`;
    }
    return `I found ${matches.length} relevant machine${matches.length === 1 ? "" : "s"} in ${source}:\n\n${matches.map(tmdChatItemLine).join("\n")}\n\nWant me to help choose the best one for your site?`;
  }

  if (clean.includes("capacity") || clean.includes("spec") || clean.includes("details") || clean.includes("price")) {
    if (!matches.length) {
      return "I could not match that exact machine in current stock. Try the brand/model, for example AT30, Toyota or Hyster.";
    }
    return matches.map((item) => {
      const bullets = Array.isArray(item.bullets) && item.bullets.length ? `\n${item.bullets.slice(0, 3).map((point) => `- ${point}`).join("\n")}` : "";
      return `${tmdChatItemTitle(item)}\nType: ${item.type || "Ask for details"}\nCapacity: ${item.capacity || "Ask"}\nPower: ${item.power || item.fuel || item.battery || "Ask"}\nPrice: ${tmdChatFormatPrice(item)}${bullets}`;
    }).join("\n\n");
  }

  if (matches.length) {
    return `Closest matches from ${source}:\n\n${matches.map(tmdChatItemLine).join("\n")}\n\nFor a proper quote, use the contact form and mention the machine name.`;
  }

  return `I can answer from ${source} stock. Try asking "What forklifts are in stock?", "Show pallet trucks", "Do you have electric trucks?" or "What is the AT30 capacity?".`;
}

async function tmdChatLoadInventory() {
  if (!tmdChatInventoryPromise) {
    tmdChatInventoryPromise = Promise.all([
      loadInventoryFromGoogleSheet().catch(() => ({ items: [] })),
      loadLocalInventory().catch(() => ({ items: [] }))
    ]).then(([sheetInventory, localInventory]) => {
      const sheetItems = Array.isArray(sheetInventory.items)
        ? sheetInventory.items.map(normaliseInventoryItem)
        : [];
      const localItems = Array.isArray(localInventory.items)
        ? localInventory.items.map(normaliseInventoryItem)
        : [];
      return mergeInventoryItems(sheetItems, localItems);
    });
  }
  return tmdChatInventoryPromise;
}

function tmdChatAddMessage(log, text, type) {
  const message = document.createElement("article");
  message.className = type;
  String(text || "")
    .split(/\n{2,}/)
    .filter(Boolean)
    .forEach((paragraph) => {
      const p = document.createElement("p");
      p.textContent = paragraph;
      message.appendChild(p);
    });
  log.appendChild(message);
  log.scrollTop = log.scrollHeight;
}

function initTmdChat() {
  const chat = document.querySelector(".tmd-chat");
  if (!chat) return;
  const toggle = chat.querySelector(".tmd-chat-toggle");
  const panel = chat.querySelector(".tmd-chat-panel");
  const close = chat.querySelector("[data-chat-close]");
  const form = chat.querySelector(".tmd-chat-form");
  const input = chat.querySelector("#tmd-chat-input");
  const log = chat.querySelector(".tmd-chat-log");
  const submit = form?.querySelector("button");
  const prompts = Array.from(chat.querySelectorAll(".tmd-chat-prompts button"));

  const setOpen = (open) => {
    chat.classList.toggle("is-open", open);
    toggle?.setAttribute("aria-expanded", String(open));
    panel?.setAttribute("aria-hidden", String(!open));
    if (open) window.setTimeout(() => input?.focus(), 120);
  };

  toggle?.addEventListener("click", () => setOpen(!chat.classList.contains("is-open")));
  close?.addEventListener("click", () => setOpen(false));

  async function sendMessage(text) {
    const message = text.trim();
    if (!message) return;
    setOpen(true);
    tmdChatAddMessage(log, message, "user");
    input.value = "";
    submit.disabled = true;
    try {
      let answer = "";
      if (window.location.protocol !== "file:") {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message })
        });
        if (response.ok) {
          const data = await response.json();
          answer = data.answer;
        }
      }
      if (!answer) {
        const items = await tmdChatLoadInventory();
        answer = tmdChatBuildAnswer(message, items);
      }
      tmdChatAddMessage(log, answer, "bot");
    } catch (error) {
      console.warn(error);
      tmdChatAddMessage(log, "I could not reach the stock feed just then. Please try again, or send a message through the contact form.", "bot");
    } finally {
      submit.disabled = false;
      input.focus();
    }
  }

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage(input.value);
  });

  prompts.forEach((button) => {
    button.addEventListener("click", () => sendMessage(button.textContent || ""));
  });
}

function loadInventoryFromGoogleSheet() {
  return new Promise((resolve, reject) => {
    const callback = `__forkliftStock_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const cleanup = () => {
      delete window[callback];
      script.remove();
    };

    window[callback] = (response) => {
      cleanup();
      if (!response || response.status !== "ok") {
        reject(new Error("Google Sheet stock feed did not return ok"));
        return;
      }
      resolve(gvizStockResponseToInventory(response));
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Google Sheet stock feed failed to load"));
    };
    script.src = `${liveStockSheetEndpoint}&tqx=${encodeURIComponent(`out:json;responseHandler:${callback}`)}&t=${Date.now()}`;
    document.head.appendChild(script);
  });
}

function gvizStockResponseToInventory(response) {
  const table = response.table || {};
  const headers = (table.cols || []).map((column) => normaliseSheetHeader(column.label));
  const rows = table.rows || [];
  const items = rows.map((row) => {
    const cells = row.c || [];
    const value = (name) => {
      const index = headers.indexOf(normaliseSheetHeader(name));
      const cell = index >= 0 ? cells[index] : null;
      if (!cell) return "";
      return String(cell.f || cell.v || "").trim();
    };

    return normaliseInventoryItem({
      id: value("ID"),
      category: value("Category"),
      status: value("Status"),
      featured: value("Featured"),
      brand: value("Brand"),
      model: value("Model"),
      type: value("Type"),
      power: value("Power"),
      capacity: value("Capacity"),
      liftHeight: value("Lift Height"),
      year: value("Year"),
      hours: value("Hours"),
      mast: value("Mast"),
      tyres: value("Tyres"),
      battery: value("Battery"),
      fuel: value("Fuel"),
      mileage: value("Mileage"),
      location: value("Location"),
      price: value("Price"),
      vat: value("VAT"),
      description: value("Description"),
      bullets: value("Bullets"),
      imageMain: value("Image Main"),
      galleryImages: value("Gallery Images"),
      sortOrder: value("Sort Order"),
      updatedAt: value("Updated At")
    });
  }).filter((item) => item.id || item.brand || item.model);

  items.sort((a, b) => {
    const aSort = Number(a.sortOrder) || 9999;
    const bSort = Number(b.sortOrder) || 9999;
    if (aSort !== bSort) return aSort - bSort;
    return `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`);
  });

  return { items, updatedAt: new Date().toISOString() };
}

function normaliseSheetHeader(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function showSlide(index) {
  if (!slides.length) return;
  const previousSlide = slides[activeSlide];
  activeSlide = (index + slides.length) % slides.length;
  slides.forEach((slide, slideIndex) => {
    const isActive = slideIndex === activeSlide;
    window.clearTimeout(slide._leaveTimer);
    if (slide === previousSlide && !isActive) {
      slide.classList.add("leaving");
      slide.classList.remove("active");
      slide._leaveTimer = window.setTimeout(() => {
        slide.classList.remove("leaving", "zoom-in", "zoom-out");
      }, slideFadeDuration);
      return;
    }
    if (isActive) {
      slide.classList.remove("leaving", "zoom-in", "zoom-out");
      slide.classList.add("active", activeSlide % 2 === 0 ? "zoom-in" : "zoom-out");
    } else {
      slide.classList.remove("active", "leaving", "zoom-in", "zoom-out");
    }
  });
  dots.forEach((dot, dotIndex) => {
    dot.classList.toggle("active", dotIndex === activeSlide);
  });
}

function startSlideshow() {
  if (slides.length <= 1) return;
  window.clearInterval(slideTimer);
  slideTimer = window.setInterval(() => {
    showSlide(activeSlide + 1);
  }, 7200);
}

dots.forEach((dot, index) => {
  dot.addEventListener("click", () => {
    showSlide(index);
    startSlideshow();
  });
});

if (menuToggle && mainNav) {
  menuToggle.addEventListener("click", () => {
    const isOpen = mainNav.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
  });

  mainNav.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      mainNav.classList.remove("open");
      menuToggle.setAttribute("aria-expanded", "false");
    }
  });
}

function setModalImage(product, index) {
  if (!productModal || !product) return;
  const mainImage = productModal.querySelector(".modal-main-image");
  const thumbs = Array.from(productModal.querySelectorAll(".modal-thumbs button"));
  activeProductImage = (index + product.images.length) % product.images.length;
  if (mainImage) {
    mainImage.onerror = () => {
      mainImage.onerror = null;
      mainImage.src = fallbackImageForCategory("pallet-truck");
    };
    mainImage.src = product.images[activeProductImage];
    mainImage.alt = `${product.title} ${product.type}`;
  }
  thumbs.forEach((thumb, thumbIndex) => {
    thumb.classList.toggle("active", thumbIndex === activeProductImage);
  });
}

function openProductModal(productId) {
  if (!productModal) return;
  const card = document.querySelector(`[data-product="${productId}"]`);
  const product = palletProducts[productId] || {
    title: card?.querySelector("h3")?.textContent.trim() || "Electric Pallet Truck",
    type: card?.querySelector("p")?.textContent.trim() || "Electric Pallet Truck",
    capacity: card?.querySelector("dd")?.textContent.trim() || "2,000 kg",
    battery: card?.querySelectorAll("dd")[1]?.textContent.trim() || "24V / 150Ah",
    radius: "Ask for details",
    fork: "1150 mm",
    weight: "Ask for details",
    price: "POA",
    description: "Reliable electric pallet truck options available for warehouse, retail and loading operations.",
    images: [card?.querySelector("img")?.getAttribute("src") || "../assets/pallet-card.jpeg", "../assets/pallet-card.jpeg", "../assets/hero-pallet-truck-new.jpeg"]
  };
  productModal.dataset.activeProduct = productId;
  productModal.querySelector("#modal-title").textContent = product.title;
  productModal.querySelector(".modal-type").textContent = product.type;
  productModal.querySelector('[data-spec="capacity"]').textContent = product.capacity;
  productModal.querySelector('[data-spec="battery"]').textContent = product.battery;
  productModal.querySelector('[data-spec="radius"]').textContent = product.radius;
  productModal.querySelector('[data-spec="fork"]').textContent = product.fork;
  productModal.querySelector('[data-spec="weight"]').textContent = product.weight;
  productModal.querySelector('[data-spec="price"]').textContent = product.price;
  productModal.querySelector(".modal-description").textContent = product.description;

  const thumbs = productModal.querySelector(".modal-thumbs");
  if (thumbs) {
    thumbs.innerHTML = product.images
      .map((image, index) => `<button type="button" aria-label="Show image ${index + 1}"><img src="${image}" alt="" /></button>`)
      .join("");
    thumbs.querySelectorAll("button").forEach((button, index) => {
      button.addEventListener("click", () => setModalImage(product, index));
    });
  }

  setModalImage(product, 0);
  productModal.classList.add("is-open");
  productModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  productModal.querySelector(".modal-close")?.focus();
}

function closeProductModal() {
  if (!productModal) return;
  productModal.classList.remove("is-open");
  productModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

bindProductCards();

productCloseButtons.forEach((button) => {
  button.addEventListener("click", closeProductModal);
});

if (productModal) {
  productModal.querySelector(".gallery-arrow.previous")?.addEventListener("click", () => {
    const product = palletProducts[productModal.dataset.activeProduct];
    setModalImage(product, activeProductImage - 1);
  });
  productModal.querySelector(".gallery-arrow.next")?.addEventListener("click", () => {
    const product = palletProducts[productModal.dataset.activeProduct];
    setModalImage(product, activeProductImage + 1);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && productModal.classList.contains("is-open")) {
      closeProductModal();
    }
  });
}

function renderPalletRange(page = 1) {
  if (!productCards.length) return;
  const pageSize = palletRangeExpanded ? 8 : 4;
  const totalPages = Math.max(1, Math.ceil(productCards.length / 8));
  activePalletPage = Math.min(Math.max(page, 1), totalPages);
  const start = palletRangeExpanded ? (activePalletPage - 1) * pageSize : 0;
  const end = start + pageSize;

  productCards.forEach((card, index) => {
    card.hidden = index < start || index >= end;
  });

  if (palletPagination) {
    palletPagination.hidden = !palletRangeExpanded;
    palletPagination.querySelectorAll("[data-pallet-page]").forEach((button) => {
      const buttonPage = Number(button.dataset.palletPage);
      button.hidden = buttonPage > totalPages;
      button.classList.toggle("active", buttonPage === activePalletPage);
    });
    const prev = palletPagination.querySelector("[data-pallet-prev]");
    const next = palletPagination.querySelector("[data-pallet-next]");
    if (prev) prev.disabled = activePalletPage === 1;
    if (next) next.disabled = activePalletPage === totalPages;
  }
}

if (fullRangeButton) {
  fullRangeButton.addEventListener("click", (event) => {
    event.preventDefault();
    palletRangeExpanded = true;
    fullRangeButton.innerHTML = 'Showing full range <span aria-hidden="true">-></span>';
    renderPalletRange(1);
    document.querySelector("#models")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

if (palletPagination) {
  palletPagination.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.palletPage) {
      renderPalletRange(Number(button.dataset.palletPage));
    } else if (button.hasAttribute("data-pallet-prev")) {
      renderPalletRange(activePalletPage - 1);
    } else if (button.hasAttribute("data-pallet-next")) {
      renderPalletRange(activePalletPage + 1);
    }
  });
}

function openTruckModal(truckId) {
  if (!truckModal || !usedTruckProducts[truckId]) return;
  const truck = usedTruckProducts[truckId];
  truckModal.querySelector("#truck-modal-title").textContent = truck.title;
  truckModal.querySelector(".truck-modal-type").textContent = truck.type;
  truckModal.querySelector(".truck-modal-image .tag").textContent = truck.tag;
  const image = truckModal.querySelector(".truck-modal-image img");
  if (image) {
    image.onerror = () => {
      image.onerror = null;
      image.src = fallbackImageForCategory("forklift-truck");
    };
    image.src = truck.image;
    image.alt = `${truck.title} ${truck.type}`;
  }
  truckModal.querySelector('[data-truck-spec="capacity"]').textContent = truck.capacity;
  truckModal.querySelector('[data-truck-spec="lift"]').textContent = truck.lift;
  truckModal.querySelector('[data-truck-spec="hours"]').textContent = truck.hours;
  truckModal.querySelector('[data-truck-spec="year"]').textContent = truck.year;
  truckModal.querySelector('[data-truck-spec="mast"]').textContent = truck.mast;
  truckModal.querySelector('[data-truck-spec="tyres"]').textContent = truck.tyres;
  truckModal.querySelector('[data-truck-spec="powerLabel"]').textContent = truck.powerLabel;
  truckModal.querySelector('[data-truck-spec="power"]').textContent = truck.power;
  truckModal.querySelector('[data-truck-spec="price"]').textContent = truck.price;
  truckModal.querySelector(".truck-modal-points").innerHTML = truck.points.map((point) => `<li>${point}</li>`).join("");
  truckModal.classList.add("is-open");
  truckModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  truckModal.querySelector(".truck-close")?.focus();
}

function closeTruckModal() {
  if (!truckModal) return;
  truckModal.classList.remove("is-open");
  truckModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

bindTruckCards();

truckCloseButtons.forEach((button) => {
  button.addEventListener("click", closeTruckModal);
});

if (truckModal) {
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && truckModal.classList.contains("is-open")) {
      closeTruckModal();
    }
  });
}

function getPageSize() {
  return pageSizeSelect ? Number(pageSizeSelect.value) : 4;
}

function renderInventoryPage(page) {
  if (!inventoryPagination || !truckCards.length) return;
  const pageSize = getPageSize();
  const totalPages = Math.max(1, Math.ceil(truckCards.length / pageSize));
  activeInventoryPage = Math.min(Math.max(page, 1), totalPages);
  const start = (activeInventoryPage - 1) * pageSize;
  const end = start + pageSize;

  truckCards.forEach((card, index) => {
    card.hidden = index < start || index >= end;
  });

  inventoryPagination.querySelectorAll("[data-page]").forEach((button) => {
    const buttonPage = Number(button.dataset.page);
    button.hidden = buttonPage > totalPages;
    button.classList.toggle("active", buttonPage === activeInventoryPage);
  });

  const ellipsis = inventoryPagination.querySelector("span");
  if (ellipsis) ellipsis.hidden = totalPages <= 4;

  const prev = inventoryPagination.querySelector("[data-page-prev]");
  const next = inventoryPagination.querySelector("[data-page-next]");
  if (prev) prev.disabled = activeInventoryPage === 1;
  if (next) next.disabled = activeInventoryPage === totalPages;
}

if (inventoryPagination) {
  inventoryPagination.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.page) {
      renderInventoryPage(Number(button.dataset.page));
    } else if (button.hasAttribute("data-page-prev")) {
      renderInventoryPage(activeInventoryPage - 1);
    } else if (button.hasAttribute("data-page-next")) {
      renderInventoryPage(activeInventoryPage + 1);
    }
  });
}

if (pageSizeSelect) {
  pageSizeSelect.addEventListener("change", () => renderInventoryPage(1));
}

function updateHeaderState() {
  if (!header) return;
  const scrollTop = document.body.scrollTop || document.documentElement.scrollTop || 0;
  const hasTopBenefits = document.body.classList.contains("has-top-benefits");
  const isAt30Page = document.body.classList.contains("at30-body");
  let isScrolled = scrollTop > 24;
  if (hasTopBenefits) {
    const coverDistance = window.innerWidth <= 760 ? 52 : 62;
    const progress = Math.min(Math.max(scrollTop / coverDistance, 0), 1);
    document.body.style.setProperty("--top-cover-offset", `${-coverDistance * progress}px`);
    isScrolled = progress >= 0.98;
  }
  header.classList.toggle("is-scrolled", isScrolled);
  document.body.classList.toggle("page-scrolled", isScrolled);
  if (isAt30Page) {
    const isScrollingDown = scrollTop > lastHeaderScrollTop + 8;
    const isScrollingUp = scrollTop < lastHeaderScrollTop - 8;
    header.classList.remove("is-scrolled");
    document.body.classList.remove("page-scrolled");
    if (scrollTop < 24 || isScrollingUp) {
      header.classList.remove("is-hidden");
    } else if (scrollTop > 28 && isScrollingDown && !mainNav?.classList.contains("open")) {
      header.classList.add("is-hidden");
    }
    lastHeaderScrollTop = Math.max(scrollTop, 0);
  }
}

function updateReveals() {
  revealTargets.forEach((target) => {
    if (target.classList.contains("is-visible")) return;
    const rect = target.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.88 && rect.bottom > 0) {
      target.classList.add("is-visible");
      target.querySelectorAll(".stats strong").forEach(animateCount);
    }
  });
}

function animateCount(element) {
  if (element.closest(".stats")) {
    element.dataset.counted = "true";
    return;
  }
  if (element.dataset.counted === "true" || prefersReducedMotion) return;
  const original = element.textContent.trim();
  const match = original.match(/^(\d+(?:\.\d+)?)(k)?([+%]*)$/i);
  if (!match || original.includes("/")) {
    element.dataset.counted = "true";
    return;
  }

  const target = Number(match[1]);
  const hasK = Boolean(match[2]);
  const suffix = `${match[2] || ""}${match[3] || ""}`;
  const duration = 1100;
  const start = performance.now();

  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(target * eased);
    element.textContent = `${value}${suffix}`;
    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      element.textContent = original;
      element.dataset.counted = "true";
    }
  }

  requestAnimationFrame(tick);
}

const revealTargets = document.querySelectorAll(
  [
    ".stats",
    ".notice-band",
    ".equipment-section",
    ".inventory-section",
    ".brand-strip",
    ".why-section",
    ".industries",
    ".cta-band",
    ".at30-trust-strip",
    ".at30-terrain",
    ".at30-lineup",
    ".at30-section-heading",
    ".at30-model-card",
    ".at30-forklift-grid article",
    ".at30-advantage-strip article",
    ".at30-visual-grid article",
    ".at30-spec-grid article",
    ".at30-model-specs",
    ".at30-safety-grid article",
    ".at30-story-intro",
    ".at30-story-proof article",
    ".at30-story-split",
    ".at30-support-grid article",
    ".at30-engineering-summary article",
    ".at30-engineering-grid article",
    ".at30-detail-gallery-grid article",
    ".at30-build-proof-grid article",
    ".at30-safety-explain article",
    ".at30-safety-visual-story",
    ".at30-safety-detail-grid article",
    ".at30-forklift-positioning",
    ".at30-forklift-reasons article",
    ".at30-forklift-messaging blockquote",
    ".at30-compliance-markers article",
    ".at30-compliance-grid article",
    ".at30-engineering-cta",
    ".at30-contact"
  ].join(", ")
);

revealTargets.forEach((target) => target.classList.add("reveal"));

if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        entry.target.querySelectorAll(".stats strong").forEach(animateCount);
        revealObserver.unobserve(entry.target);
      });
    },
    { threshold: 0.14 }
  );

  revealTargets.forEach((target) => revealObserver.observe(target));
} else {
  revealTargets.forEach((target) => target.classList.add("is-visible"));
}

function handleScrollState() {
  updateHeaderState();
  updateReveals();
}

scrollRoot.addEventListener("scroll", handleScrollState, { passive: true });
document.addEventListener("scroll", handleScrollState, { passive: true, capture: true });
window.addEventListener("scroll", handleScrollState, { passive: true });
window.addEventListener("resize", updateHeaderState);
handleScrollState();
window.setTimeout(handleScrollState, 250);
initTmdReveals();
initTmdChat();
renderPalletRange(1);
renderInventoryPage(1);
loadInventoryFromJson();

const at30Form = document.querySelector(".at30-form");
if (at30Form) {
  at30Form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(at30Form);
    const body = [
      "AEGIS AT30 Series quote request",
      "",
      `Full name: ${formData.get("name") || ""}`,
      `Company: ${formData.get("company") || ""}`,
      `Work email: ${formData.get("email") || ""}`,
      `Model interest: ${formData.get("model") || ""}`,
    ].join("\n");
    window.location.href = `mailto:brett@forkliftpro.co.uk?subject=${encodeURIComponent("AEGIS AT30 Series Quote Request")}&body=${encodeURIComponent(body)}`;
  });
}

function watchScrollPosition() {
  const currentScrollTop = document.body.scrollTop || document.documentElement.scrollTop || 0;
  if (currentScrollTop !== lastKnownScrollTop) {
    lastKnownScrollTop = currentScrollTop;
    handleScrollState();
  }
  window.requestAnimationFrame(watchScrollPosition);
}

window.requestAnimationFrame(watchScrollPosition);
showSlide(0);
startSlideshow();
