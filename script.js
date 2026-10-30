const FRAME_COUNT = 200;
const FRAME_PATH = "/assets/frames/frame_";
const FRAME_DIGITS = 4;

const PROVINCE_ORDER = ["on", "ab", "bc", "sk"];
const FALLBACK_MAIN = { phone: "REPLACE_ME", whatsapp: "REPLACE_ME", facebook: "REPLACE_ME", email: "REPLACE_ME" };
let siteData = { main: FALLBACK_MAIN, locations: [] };
let activeLocation = null;
let queryRouting = false;
let frameImages = new Map();
let loadedFrameNumbers = [];
let targetFrame = 1;
let currentFrame = 1;
let animationFrame = 0;
let lastDrawnFrame = 0;
let frameLoopRunning = false;
let frameFailed = false;

const byId = (id) => document.getElementById(id);
const heroWrapper = byId("hero-scroll");
const heroStage = byId("hero-stage");
const canvas = byId("hero-canvas");
const canvasContext = canvas.getContext("2d");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const navigationEntry = performance.getEntriesByType("navigation")[0];
const isPageReload = navigationEntry?.type === "reload";

if ("scrollRestoration" in history) history.scrollRestoration = "manual";

function isSet(value) {
  return typeof value === "string" && value.trim() !== "" && value.trim().toUpperCase() !== "REPLACE_ME";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function locationUrl(location) {
  return `/${location.province}${location.slug ? `/${location.slug}` : ""}`;
}

function isLocalHost() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function locationHref(location) {
  if (isLocalHost()) {
    return `/?city=${encodeURIComponent(location.province)}${location.slug ? `&loc=${encodeURIComponent(location.slug)}` : ""}`;
  }
  return locationUrl(location);
}

function servingBadgeContent(locationName) {
  return `<span>Serving ${escapeHtml(locationName)}</span><a class="serving-home-link" href="/" aria-label="Close location and return to home page" title="Return to home page"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg></a>`;
}

function findLocation(province, slug) {
  return siteData.locations.find((item) => item.province === province && (item.slug || "") === (slug || ""));
}

function findDefault(province) {
  return siteData.locations.find((item) => item.province === province && item.default === true);
}

function detectLocation() {
  const url = new URL(window.location.href);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  queryRouting = path === "/" && (url.searchParams.has("city") || isLocalHost());

  if (queryRouting) {
    const province = url.searchParams.get("city") || "";
    const slug = url.searchParams.get("loc") || "";
    return slug ? findLocation(province, slug) || null : findDefault(province) || null;
  }

  const parts = path.split("/").filter(Boolean);
  if (parts.length === 1) return findDefault(parts[0]) || null;
  if (parts.length === 2) return findLocation(parts[0], parts[1]) || null;
  return null;
}

function navigateTo(location) {
  window.location.assign(locationHref(location));
}

function makeSelectOptions() {
  return `<option value="">Choose your city</option>${PROVINCE_ORDER.map((province) => {
    const locations = siteData.locations.filter((location) => location.province === province);
    if (!locations.length) return "";
    const provinceName = locations[0].provinceName;
    return `<optgroup label="${escapeHtml(provinceName)}">${locations.map((location) =>
      `<option value="${escapeHtml(location.id)}">${escapeHtml(location.name)}</option>`
    ).join("")}</optgroup>`;
  }).join("")}`;
}

function configureCitySelects() {
  document.querySelectorAll("[data-city-select]").forEach((select) => {
    select.innerHTML = makeSelectOptions();
    select.value = "";
    select.addEventListener("change", () => {
      const selectedLocation = siteData.locations.find((location) => location.id === select.value);
      if (selectedLocation) navigateTo(selectedLocation);
    });
  });
}

function validFacebook(value) {
  if (!isSet(value)) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}

function contactButtons(contact, locationName, options = {}) {
  const className = options.className || "";
  const result = [];
  if (isSet(contact.phone)) {
    const phoneHref = contact.phone.replace(/[^0-9+]/g, "");
    if (phoneHref.replace(/\+/g, "").length) {
      result.push(`<a class="button ${className}" href="tel:${phoneHref}">Call${options.labelLocation ? ` ${escapeHtml(locationName)}` : ""}</a>`);
    }
  }
  if (isSet(contact.whatsapp)) {
    const digits = contact.whatsapp.replace(/\D/g, "");
    if (digits) {
      const text = encodeURIComponent(`Hi Duct Doctorz, I need duct cleaning in ${locationName}`);
      result.push(`<a class="button button-secondary ${className}" href="https://wa.me/${digits}?text=${text}" target="_blank" rel="noopener noreferrer">WhatsApp</a>`);
    }
  }
  const facebookUrl = validFacebook(contact.facebook);
  if (facebookUrl) {
    const label = isSet(contact.facebookName) ? contact.facebookName : "Facebook";
    result.push(`<a class="button button-outline ${className}" href="${escapeHtml(facebookUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`);
  }
  return result.join("");
}

function renderLocationCards() {
  const container = byId("location-grid");
  if (activeLocation || !siteData.locations.length) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }
  container.hidden = false;
  container.innerHTML = siteData.locations.map((location) =>
    `<a class="location-card reveal" href="${escapeHtml(locationHref(location))}"><small>${escapeHtml(location.provinceName)}</small><strong>${escapeHtml(location.name)}</strong><span>Explore location <span aria-hidden="true">→</span></span></a>`
  ).join("");
}

function renderCoverage() {
  const heading = byId("coverage-title");
  const eyebrow = byId("coverage-eyebrow");
  const description = byId("coverage-description");
  const pills = byId("area-pills");
  const imageWrap = byId("coverage-image-wrap");
  const image = byId("coverage-image");
  const isMain = !activeLocation;

  document.querySelectorAll("[data-areas-nav]").forEach((link) => {
    link.hidden = Boolean(activeLocation && (!Array.isArray(activeLocation.areas) || activeLocation.areas.length === 0));
  });

  if (isMain) {
    byId("service-areas").setAttribute("aria-label", "Find your city");
    eyebrow.textContent = "Find your city";
    heading.textContent = "Local care, one connected team";
    description.textContent = "Choose the service area that works for your home.";
    pills.hidden = true;
    imageWrap.hidden = true;
    renderLocationCards();
    return;
  }

  byId("service-areas").setAttribute("aria-label", "Service areas");
  heading.textContent = `Service areas near ${activeLocation.name}`;
  eyebrow.textContent = "Your local service area";
  description.textContent = `Ask your local team about air duct and HVAC cleaning in ${activeLocation.name}.`;
  renderLocationCards();

  const areas = Array.isArray(activeLocation.areas) ? activeLocation.areas : [];
  if (!areas.length) {
    byId("service-areas").hidden = true;
    return;
  }
  byId("service-areas").hidden = false;
  pills.innerHTML = areas.map((area) => `<span class="area-pill">${escapeHtml(area)}</span>`).join("");
  pills.hidden = false;

  if (isSet(activeLocation.cover) && activeLocation.cover.startsWith("/assets/")) {
    image.alt = `${activeLocation.name} service area`;
    image.hidden = true;
    image.onload = () => { image.hidden = false; imageWrap.hidden = false; };
    image.onerror = () => { image.hidden = true; imageWrap.hidden = true; };
    image.src = activeLocation.cover;
  } else {
    image.removeAttribute("src");
    image.hidden = true;
    imageWrap.hidden = true;
  }
}

function renderFooter() {
  const groups = byId("footer-location-groups");
  groups.innerHTML = PROVINCE_ORDER.map((province) => {
    const locations = siteData.locations.filter((location) => location.province === province);
    if (!locations.length) return "";
    return `<section class="footer-location-group"><h3>${escapeHtml(locations[0].provinceName)}</h3><ul>${locations.map((location) =>
      `<li><a href="${escapeHtml(locationHref(location))}">${escapeHtml(location.name)}</a></li>`
    ).join("")}</ul></section>`;
  }).join("");

  const footerContact = byId("footer-contact");
  const contact = activeLocation || siteData.main;
  const contactName = activeLocation ? activeLocation.name : "Canada";
  footerContact.innerHTML = contactButtons(contact, contactName);
  if (isSet(contact.email) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) {
    footerContact.insertAdjacentHTML("beforeend", `<a href="mailto:${escapeHtml(contact.email)}">${escapeHtml(contact.email)}</a>`);
  }
}

function focusCitySelect() {
  const select = byId("contact-city");
  byId("contact").scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "start" });
  window.setTimeout(() => select.focus(), reducedMotion.matches ? 0 : 350);
}

function makeChooseCityButton(className = "") {
  return `<button type="button" class="button ${className}" data-choose-city>Choose your city</button>`;
}

function renderActions() {
  const contact = activeLocation || siteData.main;
  const displayName = activeLocation ? activeLocation.name : "Canada";
  const actions = contactButtons(contact, displayName);
  const isMain = !activeLocation;
  const heroActions = byId("hero-actions");
  const headerActions = byId("header-actions");
  const mobileMenuActions = byId("mobile-menu-actions");
  const contactActions = byId("contact-actions");
  const mobileBar = byId("mobile-action-bar");

  if (isMain) {
    const choose = makeChooseCityButton();
    const mainButtons = actions || choose;
    heroActions.innerHTML = mainButtons;
    headerActions.innerHTML = "";
    byId("header-serving-badge").hidden = true;
    byId("mobile-serving-badge").hidden = true;
    byId("contact-serving-badge").hidden = true;
    mobileMenuActions.innerHTML = "";
    contactActions.innerHTML = mainButtons;
    mobileBar.innerHTML = "";
    byId("hero-cta-title").textContent = actions ? "Talk with Duct Doctorz" : "Find your local Duct Doctorz";
    byId("hero-cta-description").textContent = actions ? "Reach out and tell us what your home needs." : "Choose your city to see local contact options and service areas.";
    byId("contact-title").textContent = actions ? "Talk with Duct Doctorz" : "Choose your city to get started";
    byId("contact-description").textContent = actions ? "Reach out and ask about an air duct and HVAC checkup." : "Find your local Duct Doctorz team and ask about a home checkup.";
    byId("contact-note").textContent = actions ? "" : "Select a service area to see available contact options.";
  } else {
    heroActions.innerHTML = actions;
    headerActions.innerHTML = contactButtons(activeLocation, displayName);
    byId("header-serving-badge").innerHTML = servingBadgeContent(activeLocation.name);
    byId("header-serving-badge").hidden = false;
    byId("mobile-serving-badge").innerHTML = servingBadgeContent(activeLocation.name);
    byId("mobile-serving-badge").hidden = false;
    byId("contact-serving-badge").innerHTML = servingBadgeContent(activeLocation.name);
    byId("contact-serving-badge").hidden = false;
    mobileMenuActions.innerHTML = actions;
    contactActions.innerHTML = actions;
    mobileBar.innerHTML = actions;
    byId("hero-cta-title").textContent = `Contact Duct Doctorz ${activeLocation.name}`;
    byId("hero-cta-description").textContent = "Tell us what you’ve noticed, and we’ll help you plan the next step.";
    byId("contact-title").textContent = `Book a checkup in ${activeLocation.name}`;
    byId("contact-description").textContent = "Choose how you’d like to connect with your local team.";
    byId("contact-note").textContent = actions ? "" : "Contact options for this location will be added soon.";
  }

  document.querySelectorAll("[data-choose-city]").forEach((button) => button.addEventListener("click", focusCitySelect));
}

function setPageMetadata() {
  const description = activeLocation
    ? `Looking for air duct cleaning in ${activeLocation.name}? Duct Doctorz also offers dryer vent, furnace and HVAC cleaning. Contact your local team.`
    : "Duct Doctorz provides air duct cleaning, dryer vent cleaning, furnace cleaning and HVAC cleaning across selected Canadian service areas.";
  const title = activeLocation
    ? `Air Duct Cleaning ${activeLocation.name} | Duct Doctorz`
    : "Duct Doctorz | Air Duct & HVAC Cleaning in Canada";
  document.title = title;
  document.querySelector('meta[name="description"]').setAttribute("content", description);
  document.querySelector('meta[property="og:title"]').setAttribute("content", title);
  document.querySelector('meta[property="og:description"]').setAttribute("content", description);
  const canonicalUrl = `https://ductdoctorz.com${activeLocation ? locationUrl(activeLocation) : "/"}`;
  document.querySelector('meta[property="og:url"]').setAttribute("content", canonicalUrl);

  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.append(canonical);
  }
  canonical.href = canonicalUrl;

  const services = [
    "Air duct cleaning",
    "Dryer vent cleaning",
    "Furnace cleaning",
    "HVAC system cleaning"
  ];
  const areaServed = activeLocation
    ? [{ "@type": "Place", name: activeLocation.name }]
    : siteData.locations.map((location) => ({ "@type": "Place", name: location.name }));
  const business = {
    "@context": "https://schema.org",
    "@type": "HomeAndConstructionBusiness",
    name: "Duct Doctorz",
    url: canonicalUrl,
    image: new URL("/assets/logo/logo.png", window.location.origin).href,
    description,
    areaServed,
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Air duct and HVAC cleaning services",
      itemListElement: services.map((name) => ({
        "@type": "Offer",
        itemOffered: { "@type": "Service", name }
      }))
    }
  };
  const contact = activeLocation || siteData.main;
  if (isSet(contact.phone)) business.telephone = contact.phone;
  if (isSet(contact.email)) business.email = contact.email;
  const facebook = validFacebook(contact.facebook);
  if (facebook) business.sameAs = [facebook];
  byId("business-schema").textContent = JSON.stringify(business);

  byId("services-intro").textContent = activeLocation
    ? `Duct Doctorz offers air duct cleaning in ${activeLocation.name}, along with dryer vent cleaning, furnace cleaning and HVAC system cleaning. Ask your local team about a home checkup.`
    : "Explore air duct cleaning, dryer vent cleaning, furnace cleaning and HVAC system cleaning in your local Duct Doctorz service area.";
}

function setupFaq() {
  document.querySelectorAll(".faq-question").forEach((button) => {
    button.addEventListener("click", () => {
      const expanded = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!expanded));
      const answer = byId(button.getAttribute("aria-controls"));
      answer.hidden = expanded;
      button.querySelector("span").textContent = expanded ? "+" : "−";
    });
  });
}

function setupNavigation() {
  const menuButton = byId("menu-toggle");
  const menu = byId("mobile-menu");
  menuButton.addEventListener("click", () => {
    const expanded = menuButton.getAttribute("aria-expanded") === "true";
    menuButton.setAttribute("aria-expanded", String(!expanded));
    menuButton.setAttribute("aria-label", expanded ? "Open menu" : "Close menu");
    menu.hidden = expanded;
  });
  menu.querySelectorAll('a[href^="#"]').forEach((link) => link.addEventListener("click", () => {
    menu.hidden = true;
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "Open menu");
  }));
  window.addEventListener("scroll", () => {
    byId("site-header").classList.toggle("is-scrolled", window.scrollY > 24);
  }, { passive: true });
}

function setupReveal() {
  if (reducedMotion.matches || !("IntersectionObserver" in window)) return;
  document.documentElement.classList.add("js-reveal");
  const observer = new IntersectionObserver((entries, currentObserver) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        currentObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));
}

function updateHeroCopy(progress) {
  let visibleCopy = "one";
  if (progress >= 0.35 && progress <= 0.65) visibleCopy = "two";
  else if (progress >= 0.7) visibleCopy = "three";
  document.querySelectorAll("[data-hero-copy]").forEach((copy) => {
    copy.hidden = copy.dataset.heroCopy !== visibleCopy;
  });
  byId("scroll-hint").style.opacity = window.scrollY > 30 ? "0" : "1";
}

function getProgress() {
  const rect = heroWrapper.getBoundingClientRect();
  const availableScroll = Math.max(1, rect.height - window.innerHeight);
  return Math.max(0, Math.min(1, -rect.top / availableScroll));
}

function nearestLoadedFrame(number) {
  if (!loadedFrameNumbers.length) return null;
  let nearest = loadedFrameNumbers[0];
  for (const candidate of loadedFrameNumbers) {
    if (Math.abs(candidate - number) < Math.abs(nearest - number)) nearest = candidate;
  }
  return nearest;
}

function drawFrame(number) {
  const nearest = nearestLoadedFrame(number);
  if (!nearest || nearest === lastDrawnFrame) return;
  const image = frameImages.get(nearest);
  if (!image || !canvasContext) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const x = (width - drawWidth) / 2;
  const y = (height - drawHeight) / 2;
  canvasContext.clearRect(0, 0, width, height);
  canvasContext.fillStyle = "#0F2D52";
  canvasContext.fillRect(0, 0, width, height);
  canvasContext.drawImage(image, x, y, drawWidth, drawHeight);
  lastDrawnFrame = nearest;
}

function animateFrames() {
  frameLoopRunning = false;
  currentFrame += (targetFrame - currentFrame) * 0.2;
  if (Math.abs(targetFrame - currentFrame) < 0.5) currentFrame = targetFrame;
  drawFrame(Math.round(currentFrame));
  if (Math.abs(targetFrame - currentFrame) >= 0.5) {
    frameLoopRunning = true;
    animationFrame = window.requestAnimationFrame(animateFrames);
  }
}

function requestFrameRender() {
  if (heroStage.classList.contains("is-static")) return;
  if (!frameLoopRunning) {
    frameLoopRunning = true;
    animationFrame = window.requestAnimationFrame(animateFrames);
  }
}

function resizeCanvas() {
  if (!canvasContext || heroStage.classList.contains("is-static")) return;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(window.innerWidth * pixelRatio);
  canvas.height = Math.round(window.innerHeight * pixelRatio);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  canvasContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  lastDrawnFrame = 0;
  requestFrameRender();
}

function showStaticHero() {
  if (frameFailed || heroStage.classList.contains("is-static")) return;
  frameFailed = true;
  window.cancelAnimationFrame(animationFrame);
  heroStage.classList.add("is-static");
  heroWrapper.classList.add("is-static");
  canvas.hidden = true;
  const image = byId("hero-static-image");
  image.onerror = () => {
    image.hidden = true;
    heroStage.classList.remove("has-static-image");
  };
  image.onload = () => heroStage.classList.add("has-static-image");
}

function setFrameProgress(progress) {
  if (heroStage.classList.contains("is-static")) return;
  const rawIndex = 1 + progress * (FRAME_COUNT - 1);
  const selectedIndex = window.innerWidth < 768
    ? 1 + Math.round((rawIndex - 1) / 2) * 2
    : Math.round(rawIndex);
  targetFrame = Math.max(1, Math.min(FRAME_COUNT, selectedIndex));
  requestFrameRender();
}

function onHeroScroll() {
  const progress = getProgress();
  updateHeroCopy(progress);
  setFrameProgress(progress);
}

function preloadFrames() {
  if (reducedMotion.matches) {
    showStaticHero();
    return;
  }
  const frameNumbers = [];
  const step = window.innerWidth < 768 ? 2 : 1;
  for (let frame = 1; frame <= FRAME_COUNT; frame += step) frameNumbers.push(frame);
  if (step === 2 && frameNumbers[frameNumbers.length - 1] !== FRAME_COUNT) frameNumbers.push(FRAME_COUNT);
  const readyTarget = Math.ceil(frameNumbers.length * 0.3);
  let completed = 0;
  let loaded = 0;
  let firstFrameReady = false;
  const loader = byId("hero-loader");
  const percent = byId("loader-percent");

  frameNumbers.forEach((frameNumber) => {
    const image = new Image();
    const fileName = `${String(frameNumber).padStart(FRAME_DIGITS, "0")}.jpg`;
    image.onload = () => {
      frameImages.set(frameNumber, image);
      loadedFrameNumbers.push(frameNumber);
      loadedFrameNumbers.sort((a, b) => a - b);
      loaded += 1;
      completed += 1;
      if (frameNumber === 1) {
        firstFrameReady = true;
        resizeCanvas();
        drawFrame(1);
      }
      percent.textContent = `${Math.round((completed / frameNumbers.length) * 100)}%`;
      if (firstFrameReady && (loaded >= readyTarget || completed === frameNumbers.length)) {
        heroStage.classList.add("has-loaded");
        loader.hidden = true;
      }
      if (firstFrameReady) requestFrameRender();
    };
    image.onerror = () => {
      completed += 1;
      percent.textContent = `${Math.round((completed / frameNumbers.length) * 100)}%`;
      if (frameNumber === 1) showStaticHero();
      if (firstFrameReady && completed === frameNumbers.length) {
        heroStage.classList.add("has-loaded");
        loader.hidden = true;
      }
    };
    image.src = `${FRAME_PATH}${fileName}`;
  });
}

async function loadSiteData() {
  try {
    const response = await fetch("/cities.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`Unable to load locations (${response.status})`);
    const data = await response.json();
    if (!data || !Array.isArray(data.locations) || !data.main) throw new Error("Location data is incomplete");
    siteData = data;
  } catch (error) {
    siteData = { main: FALLBACK_MAIN, locations: [] };
    byId("site-message").textContent = "We couldn’t load the location list right now. Please refresh the page or try again shortly.";
    byId("site-message").hidden = false;
  }

  activeLocation = detectLocation();
  if (isPageReload && activeLocation) {
    window.location.replace("/");
    return;
  }

  if (activeLocation && (!Array.isArray(activeLocation.areas) || activeLocation.areas.length === 0)) {
    byId("service-areas").hidden = true;
  }
  configureCitySelects();
  setPageMetadata();
  renderCoverage();
  renderActions();
  renderFooter();
  byId("copyright-year").textContent = String(new Date().getFullYear());

  if (!activeLocation && !siteData.locations.length && byId("site-message").hidden) {
    byId("site-message").textContent = "Our location information is temporarily unavailable. Please try again shortly.";
    byId("site-message").hidden = false;
  }

  setupFaq();
  setupNavigation();
  setupReveal();
  updateHeroCopy(0);
  onHeroScroll();
  resizeCanvas();
  preloadFrames();
  window.addEventListener("scroll", onHeroScroll, { passive: true });
  window.addEventListener("resize", () => {
    resizeCanvas();
    onHeroScroll();
  }, { passive: true });

  if (isPageReload && !window.location.hash) {
    const returnToTop = () => {
      const previousBehavior = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = "auto";
      window.scrollTo(0, 0);
      window.requestAnimationFrame(() => {
        document.documentElement.style.scrollBehavior = previousBehavior;
      });
    };
    returnToTop();
    window.addEventListener("load", returnToTop, { once: true });
    window.setTimeout(returnToTop, 100);
  }
}

loadSiteData();