const slides = Array.from(document.querySelectorAll(".hero-slide"));
const dots = Array.from(document.querySelectorAll(".slide-dot"));
const menuToggle = document.querySelector(".menu-toggle");
const mainNav = document.querySelector(".main-nav");
const header = document.querySelector(".site-header");
const scrollRoot = document.body;
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const productModal = document.querySelector("#product-modal");
const productCards = Array.from(document.querySelectorAll("[data-product]"));
const productCloseButtons = Array.from(document.querySelectorAll("[data-modal-close]"));
const fullRangeButton = document.querySelector("[data-full-range]");
const palletPagination = document.querySelector(".pallet-pagination");
const truckModal = document.querySelector("#truck-modal");
const truckCards = Array.from(document.querySelectorAll("[data-truck]"));
const truckCloseButtons = Array.from(document.querySelectorAll("[data-truck-close]"));
const inventoryPagination = document.querySelector(".inventory-pagination");
const pageSizeSelect = document.querySelector("[data-page-size]");
let activeSlide = 0;
let slideTimer;
let lastKnownScrollTop = -1;
let lastHeaderScrollTop = 0;
const slideFadeDuration = 1600;
let activeProductImage = 0;
let palletRangeExpanded = false;
let activePalletPage = 1;
let activeInventoryPage = 1;

const palletProducts = {
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

const usedTruckProducts = {
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
  if (!slides.length) return;
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

productCards.forEach((card) => {
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

truckCards.forEach((card) => {
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
renderPalletRange(1);
renderInventoryPage(1);

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
