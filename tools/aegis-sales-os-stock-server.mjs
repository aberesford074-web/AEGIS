import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const aegisRoot = path.resolve(__dirname, "..");
const forkliftSiteRoot = process.env.FORKLIFT_SITE_DIR || path.join(aegisRoot, "Forklift Pro Solutions");
const uploadRoot = path.join(forkliftSiteRoot, "assets", "uploads", "trucks");
const inventoryPath = path.join(forkliftSiteRoot, "data", "inventory.json");
const port = Number(process.env.PORT || 4195);
const appsScriptUrl = process.env.AEGIS_STOCK_WEB_APP_URL || "";

createServer(async (request, response) => {
  try {
    if (request.method === "OPTIONS") {
      sendEmpty(response);
      return;
    }

    if (request.method === "GET" && request.url === "/") {
      sendHtml(response, renderPage());
      return;
    }

    if (request.method === "GET" && request.url.startsWith("/assets/")) {
      await sendStaticAsset(response, request.url);
      return;
    }

    if (request.method === "GET" && request.url === "/api/inventory") {
      sendJson(response, await readInventory());
      return;
    }

    if (request.method === "POST" && request.url === "/upload") {
      const result = await handleUpload(request);
      sendHtml(response, renderPage(result));
      return;
    }

    if (request.method === "POST" && request.url === "/save") {
      const result = await handleSave(request);
      sendJson(response, result);
      return;
    }

    response.writeHead(404);
    response.end("Not found");
  } catch (error) {
    if (request.url?.startsWith("/api") || request.url === "/save") {
      sendJson(response, { ok: false, error: error.message }, 500);
    } else {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(error.stack || String(error));
    }
  }
}).listen(port, () => {
  console.log(`AEGIS Sales OS stock media running at http://127.0.0.1:${port}`);
});

async function handleUpload(request) {
  const contentType = request.headers["content-type"] || "";
  const boundary = contentType.match(/boundary=(.+)$/)?.[1];
  if (!boundary) throw new Error("Missing multipart boundary.");

  const body = await readBody(request);
  const parts = parseMultipart(body, boundary);
  const truckId = safeSegment(parts.truckId?.value || "");
  const slot = safeSegment(parts.slot?.value || "main");
  const file = parts.photo;

  if (!truckId) throw new Error("Truck ID is required.");
  if (!file?.filename || !file.content.length) throw new Error("Choose an image to upload.");

  const extension = path.extname(file.filename).toLowerCase() || ".jpg";
  const filename = `${slot}${extension}`;
  const folder = path.join(uploadRoot, truckId);
  const absolutePath = path.join(folder, filename);
  const relativePath = `assets/uploads/trucks/${truckId}/${filename}`;

  await mkdir(folder, { recursive: true });
  await writeFile(absolutePath, file.content);

  return {
    truckId,
    relativePath,
    message: "Photo saved to the Forklift Pro website media folder."
  };
}

async function handleSave(request) {
  const contentType = request.headers["content-type"] || "";
  if (!contentType.includes("multipart/form-data")) {
    throw new Error("Stock saves must use multipart form data.");
  }

  const boundary = contentType.match(/boundary=(.+)$/)?.[1];
  if (!boundary) throw new Error("Missing multipart boundary.");

  const body = await readBody(request);
  const parts = parseMultipart(body, boundary);
  const fields = Object.fromEntries(
    Object.entries(parts)
      .filter(([, part]) => "value" in part)
      .map(([key, part]) => [key, part.value])
  );

  const id = safeSegment(fields.id || [fields.brand, fields.model].filter(Boolean).join("-"));
  if (!id) throw new Error("Truck ID, brand, or model is required.");

  let uploadedPath = "";
  if (parts.photo?.filename && parts.photo.content.length) {
    uploadedPath = await saveUploadedPhoto(id, fields.imageSlot || "main", parts.photo);
  }

  const inventory = await readInventory();
  const existing = inventory.items.find((item) => item.id === id) || {};
  const item = stockItemFromFields(fields, existing, id, uploadedPath);
  const nextItems = inventory.items.filter((entry) => entry.id !== id).concat(item);

  nextItems.sort((a, b) => (Number(a.sortOrder) || 9999) - (Number(b.sortOrder) || 9999) || String(a.model || "").localeCompare(String(b.model || "")));

  const nextInventory = {
    updatedAt: new Date().toISOString(),
    source: "AEGIS Sales OS",
    sheet: appsScriptUrl ? "Apps Script web app" : "Local inventory JSON",
    items: nextItems,
  };

  await writeInventory(nextInventory);

  let sheetResult = { ok: false, skipped: true, reason: "Set AEGIS_STOCK_WEB_APP_URL to push saves into Google Sheets automatically." };
  if (appsScriptUrl) {
    sheetResult = await pushStockItemToAppsScript(item);
  }

  return {
    ok: true,
    item,
    uploadedPath,
    inventoryPath: path.relative(aegisRoot, inventoryPath),
    sheet: sheetResult,
  };
}

async function saveUploadedPhoto(truckId, slot, file) {
  const safeSlot = safeSegment(slot || "main") || "main";
  const extension = path.extname(file.filename).toLowerCase() || ".jpg";
  const filename = `${safeSlot}${extension}`;
  const folder = path.join(uploadRoot, truckId);
  const absolutePath = path.join(folder, filename);
  const relativePath = `assets/uploads/trucks/${truckId}/${filename}`;

  await mkdir(folder, { recursive: true });
  await writeFile(absolutePath, file.content);
  return relativePath;
}

async function readInventory() {
  try {
    const raw = await readFile(inventoryPath, "utf8");
    const inventory = JSON.parse(raw);
    return {
      updatedAt: inventory.updatedAt || "",
      source: inventory.source || "",
      items: Array.isArray(inventory.items) ? inventory.items : [],
    };
  } catch (error) {
    if (error.code === "ENOENT") return { updatedAt: "", source: "", items: [] };
    throw error;
  }
}

async function writeInventory(inventory) {
  await mkdir(path.dirname(inventoryPath), { recursive: true });
  await writeFile(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
}

function stockItemFromFields(fields, existing, id, uploadedPath) {
  const gallery = toList(fields.galleryImages || existing.galleryImages);
  const imageMain = uploadedPath && (fields.imageSlot || "main") === "main"
    ? uploadedPath
    : fields.imageMain || existing.imageMain || uploadedPath || "";

  if (uploadedPath && !gallery.includes(uploadedPath)) gallery.push(uploadedPath);
  if (imageMain && !gallery.includes(imageMain)) gallery.unshift(imageMain);

  const item = {
    id,
    category: normaliseCategory(fields.category || existing.category || "forklift-truck"),
    status: normaliseStatus(fields.status || existing.status || "in-stock"),
    featured: toBoolean(fields.featured),
    brand: fields.brand || existing.brand || "",
    model: fields.model || existing.model || "",
    type: fields.type || existing.type || "",
    power: fields.power || existing.power || "",
    capacity: fields.capacity || existing.capacity || "",
    liftHeight: fields.liftHeight || existing.liftHeight || "",
    year: fields.year || existing.year || "",
    hours: fields.hours || existing.hours || "",
    mast: fields.mast || existing.mast || "",
    tyres: fields.tyres || existing.tyres || "",
    battery: fields.battery || existing.battery || "",
    fuel: fields.fuel || existing.fuel || "",
    price: fields.price || existing.price || "",
    vat: toBoolean(fields.vat),
    description: fields.description || existing.description || "",
    bullets: toList(fields.bullets || existing.bullets),
    imageMain,
    galleryImages: gallery,
    sortOrder: fields.sortOrder ? Number(fields.sortOrder) : existing.sortOrder,
  };

  return Object.fromEntries(
    Object.entries(item).filter(([, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      return value !== "" && value !== undefined && !Number.isNaN(value);
    })
  );
}

async function pushStockItemToAppsScript(item) {
  const response = await fetch(appsScriptUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "forkliftStockItem", item }),
  });
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: response.ok, status: response.status, body: text };
  }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function parseMultipart(body, boundary) {
  const delimiter = Buffer.from(`--${boundary}`);
  const fields = {};
  let start = body.indexOf(delimiter) + delimiter.length + 2;

  while (start > delimiter.length) {
    const end = body.indexOf(delimiter, start);
    if (end === -1) break;

    const part = body.subarray(start, end - 2);
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd !== -1) {
      const header = part.subarray(0, headerEnd).toString("utf8");
      const content = part.subarray(headerEnd + 4);
      const name = header.match(/name="([^"]+)"/)?.[1];
      const filename = header.match(/filename="([^"]*)"/)?.[1];

      if (name && filename) fields[name] = { filename, content };
      else if (name) fields[name] = { value: content.toString("utf8").trim() };
    }

    start = end + delimiter.length + 2;
  }

  return fields;
}

function safeSegment(value) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

function sendHtml(response, html) {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8", ...corsHeaders() });
  response.end(html);
}

function sendJson(response, payload, status = 200) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", ...corsHeaders() });
  response.end(JSON.stringify(payload, null, 2));
}

function sendEmpty(response) {
  response.writeHead(204, corsHeaders());
  response.end();
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

async function sendStaticAsset(response, url) {
  const pathname = decodeURIComponent(new URL(url, "http://127.0.0.1").pathname);
  const relativePath = pathname.replace(/^\/+/, "");
  const absolutePath = path.resolve(forkliftSiteRoot, relativePath);
  if (!absolutePath.startsWith(forkliftSiteRoot)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  const bytes = await readFile(absolutePath);
  response.writeHead(200, { "content-type": getMimeType(absolutePath), ...corsHeaders() });
  response.end(bytes);
}

function getMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if ([".jpg", ".jpeg"].includes(extension)) return "image/jpeg";
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".gif") return "image/gif";
  return "application/octet-stream";
}

function renderPage(result) {
  const uploaded = result
    ? `<section class="result"><strong>${escapeHtml(result.message)}</strong><span>Truck ID: ${escapeHtml(result.truckId)}</span><code>${escapeHtml(result.relativePath)}</code></section>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AEGIS Sales OS | Forklift Stock Media</title>
  <style>
    :root { color-scheme: dark; --green: #6fbe62; --line: rgba(255,255,255,.14); --panel: rgba(13,16,15,.96); }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; background: #030303; color: #f5f5f5; }
    main { max-width: 1280px; margin: 0 auto; padding: 36px 22px; }
    .shell { border: 1px solid var(--line); background: linear-gradient(135deg, rgba(20,20,22,.95), rgba(2,3,3,.95)); border-radius: 10px; overflow: hidden; box-shadow: 0 24px 80px rgba(0,0,0,.45); }
    .hero { padding: 34px; border-bottom: 1px solid var(--line); }
    .eyebrow { margin: 0 0 12px; color: var(--green); font-weight: 900; letter-spacing: .22em; text-transform: uppercase; font-size: 12px; }
    h1 { margin: 0 0 14px; font-size: clamp(36px, 5vw, 70px); text-transform: uppercase; line-height: .94; letter-spacing: -.05em; }
    h2 { margin: 0 0 16px; font-size: 22px; text-transform: uppercase; }
    p { color: #c7c7c7; line-height: 1.6; max-width: 720px; }
    .toolbar { display: flex; flex-wrap: wrap; gap: 12px; padding: 18px 34px; border-bottom: 1px solid var(--line); background: rgba(255,255,255,.03); }
    .toolbar a, button { padding: 13px 16px; border: 0; background: linear-gradient(135deg, #89c900, #4f8f00); color: #fff; font-weight: 950; text-transform: uppercase; cursor: pointer; text-decoration: none; font-size: 12px; letter-spacing: .04em; }
    .toolbar .secondary { background: #111; border: 1px solid var(--line); }
    .workspace { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 0; }
    .stock-list { padding: 28px 34px 34px; border-right: 1px solid var(--line); min-width: 0; }
    .editor { padding: 28px 34px 34px; background: rgba(255,255,255,.025); }
    form { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    label { display: grid; gap: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: .04em; font-size: 13px; }
    input, select { width: 100%; box-sizing: border-box; padding: 14px 15px; border-radius: 4px; border: 1px solid var(--line); background: #050607; color: #fff; font: inherit; }
    textarea { min-height: 96px; resize: vertical; width: 100%; padding: 14px 15px; border-radius: 4px; border: 1px solid var(--line); background: #050607; color: #fff; font: inherit; }
    .wide, .file, form button { grid-column: 1 / -1; }
    .result { margin: 0 34px 28px; padding: 18px; border: 1px solid rgba(111,190,98,.45); border-radius: 8px; background: rgba(111,190,98,.1); display: grid; gap: 8px; }
    code { display: block; padding: 13px; background: #000; border: 1px solid var(--line); color: #b9ff3a; overflow-wrap: anywhere; }
    .note { color: #9d9d9d; font-size: 13px; }
    .status { min-height: 22px; color: #b9ff3a; font-size: 13px; }
    .table-wrap { overflow: auto; border: 1px solid var(--line); border-radius: 8px; }
    table { width: 100%; border-collapse: collapse; min-width: 780px; }
    th, td { padding: 12px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: middle; }
    th { color: #9d9d9d; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; background: #080908; }
    td { color: #e8e8e8; font-size: 14px; }
    tr:last-child td { border-bottom: 0; }
    .thumb { width: 74px; height: 54px; object-fit: cover; background: #111; border: 1px solid var(--line); }
    .pill { display: inline-flex; padding: 5px 8px; border: 1px solid var(--line); border-radius: 999px; color: #cfcfcf; font-size: 11px; text-transform: uppercase; }
    .row-action { background: #161816; border: 1px solid var(--line); padding: 9px 11px; }
    @media (max-width: 980px) { .workspace { grid-template-columns: 1fr; } .stock-list { border-right: 0; border-bottom: 1px solid var(--line); } }
    @media (max-width: 720px) { form { grid-template-columns: 1fr; } .hero, .toolbar, .stock-list, .editor { padding-left: 20px; padding-right: 20px; } }
  </style>
</head>
<body>
  <main>
    <div class="shell">
      <section class="hero">
        <p class="eyebrow">AEGIS Sales OS</p>
        <h1>Forklift stock media</h1>
        <p>Add and edit Forklift Pro stock from one place. Saves update the website inventory JSON, photos are stored in the site media folder, and the same fields match the Google Sheet stock table.</p>
      </section>
      ${uploaded}
      <nav class="toolbar">
        <a href="https://docs.google.com/spreadsheets/d/1gdL5hFBBuuAu_J_5rspcL-OfxC6DCj-5v7snztSbzrc/edit#gid=2026052201" target="_blank" rel="noreferrer">Open stock sheet</a>
        <a class="secondary" href="${escapeHtml(pathToFileUrl(path.join(forkliftSiteRoot, "used-forklifts", "index.html")))}">Preview forklifts</a>
        <a class="secondary" href="${escapeHtml(pathToFileUrl(path.join(forkliftSiteRoot, "electric-pallet-trucks", "index.html")))}">Preview pallet trucks</a>
      </nav>
      <section class="workspace">
        <section class="stock-list">
          <h2>Website Stock</h2>
          <p class="note">Saves update <code>Forklift Pro Solutions/data/inventory.json</code>. Photos save into <code>assets/uploads/trucks/&lt;truck-id&gt;/</code>.</p>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Photo</th><th>Truck</th><th>Category</th><th>Status</th><th>Price</th><th></th></tr></thead>
              <tbody id="stock-rows"><tr><td colspan="6">Loading stock...</td></tr></tbody>
            </table>
          </div>
        </section>
        <aside class="editor">
          <h2>Add / Edit Truck</h2>
          <form id="stock-form" enctype="multipart/form-data">
            <label>Truck ID <input name="id" placeholder="toyota-8fbe20u" required /></label>
            <label>Category
              <select name="category">
                <option value="forklift-truck">Forklift truck</option>
                <option value="pallet-truck">Pallet truck</option>
              </select>
            </label>
            <label>Status
              <select name="status">
                <option value="in-stock">In stock</option>
                <option value="reserved">Reserved</option>
                <option value="sold">Sold</option>
                <option value="draft">Draft</option>
              </select>
            </label>
            <label>Featured
              <select name="featured">
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </label>
            <label>Brand <input name="brand" placeholder="Toyota" /></label>
            <label>Model <input name="model" placeholder="8FBE20U" /></label>
            <label>Type <input name="type" placeholder="Electric Forklift" /></label>
            <label>Power <input name="power" placeholder="Electric" /></label>
            <label>Capacity <input name="capacity" placeholder="2,000 kg" /></label>
            <label>Lift Height <input name="liftHeight" placeholder="189 in" /></label>
            <label>Year <input name="year" placeholder="2018" /></label>
            <label>Hours <input name="hours" placeholder="3,245 hrs" /></label>
            <label>Mast <input name="mast" placeholder="3 Stage" /></label>
            <label>Tyres <input name="tyres" placeholder="Solid" /></label>
            <label>Battery <input name="battery" placeholder="48V" /></label>
            <label>Fuel <input name="fuel" placeholder="Diesel" /></label>
            <label>Price <input name="price" placeholder="18500" /></label>
            <label>VAT
              <select name="vat">
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
            <label class="wide">Description <textarea name="description" placeholder="Short public description"></textarea></label>
            <label class="wide">Bullets <textarea name="bullets" placeholder="Fully serviced | Nationwide delivery | Finance available"></textarea></label>
            <label class="wide">Main image path <input name="imageMain" placeholder="assets/uploads/trucks/toyota-8fbe20u/main.jpg" /></label>
            <label class="wide">Gallery paths <textarea name="galleryImages" placeholder="assets/uploads/trucks/.../main.jpg | assets/uploads/trucks/.../side.jpg"></textarea></label>
            <label>Sort order <input name="sortOrder" placeholder="100" /></label>
            <label>New photo slot
              <select name="imageSlot">
                <option value="main">Main image</option>
                <option value="side">Side image</option>
                <option value="front">Front image</option>
                <option value="rear">Rear image</option>
                <option value="controls">Controls image</option>
                <option value="forks">Forks image</option>
              </select>
            </label>
            <label class="file">Upload photo <input name="photo" type="file" accept="image/*" /></label>
            <button type="submit">Save truck to website stock</button>
            <p class="status" id="save-status"></p>
          </form>
        </aside>
      </section>
    </div>
  </main>
  <script>
    const form = document.querySelector("#stock-form");
    const rows = document.querySelector("#stock-rows");
    const status = document.querySelector("#save-status");
    let inventory = [];

    const money = (value) => {
      const text = String(value || "").trim();
      if (!text) return "POA";
      if (text.includes("£")) return text;
      const numeric = Number(text.replace(/[^\\d.]/g, ""));
      return Number.isFinite(numeric) ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(numeric) : text;
    };

    const html = (value) => String(value || "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
    const imageSrc = (item) => item.imageMain ? "/" + item.imageMain : "/assets/hero-electric-forklift.png";

    function renderRows() {
      if (!inventory.length) {
        rows.innerHTML = '<tr><td colspan="6">No stock yet. Add the first truck on the right.</td></tr>';
        return;
      }
      rows.innerHTML = inventory.map((item) => \`
        <tr>
          <td><img class="thumb" src="\${html(imageSrc(item))}" alt="" onerror="this.onerror=null;this.src='/assets/hero-electric-forklift.png'"></td>
          <td><strong>\${html([item.brand, item.model].filter(Boolean).join(" ") || item.id)}</strong><br><span class="note">\${html(item.id)}</span></td>
          <td><span class="pill">\${html(item.category)}</span></td>
          <td><span class="pill">\${html(item.status || "in-stock")}</span></td>
          <td>\${html(money(item.price))}</td>
          <td><button class="row-action" type="button" data-edit="\${html(item.id)}">Edit</button></td>
        </tr>
      \`).join("");
    }

    function fillForm(item) {
      Object.entries(item).forEach(([key, value]) => {
        const field = form.elements[key];
        if (!field) return;
        field.value = Array.isArray(value) ? value.join(" | ") : value;
      });
      form.elements.featured.value = item.featured ? "yes" : "no";
      form.elements.vat.value = item.vat === false ? "no" : "yes";
      status.textContent = "Editing " + item.id;
    }

    async function loadInventory() {
      const response = await fetch("/api/inventory");
      const data = await response.json();
      inventory = Array.isArray(data.items) ? data.items : [];
      renderRows();
    }

    rows.addEventListener("click", (event) => {
      const button = event.target.closest("[data-edit]");
      if (!button) return;
      const item = inventory.find((entry) => entry.id === button.dataset.edit);
      if (item) fillForm(item);
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      status.textContent = "Saving...";
      const response = await fetch("/save", { method: "POST", body: new FormData(form) });
      const result = await response.json();
      if (!result.ok) {
        status.textContent = result.error || "Save failed.";
        return;
      }
      status.textContent = result.sheet?.ok ? "Saved to website stock and Google Sheet." : "Saved to website stock. Google Sheet auto-push needs the Apps Script web app URL.";
      form.reset();
      await loadInventory();
    });

    loadInventory().catch((error) => {
      rows.innerHTML = '<tr><td colspan="6">Could not load stock.</td></tr>';
      status.textContent = error.message;
    });
  </script>
</body>
</html>`;
}

function pathToFileUrl(filePath) {
  return `file://${filePath.split(path.sep).map(encodeURIComponent).join("/")}`;
}

function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function toBoolean(value) {
  return ["1", "true", "yes", "y", "on"].includes(String(value || "").trim().toLowerCase());
}

function toList(value) {
  if (Array.isArray(value)) return value.map(String).map((part) => part.trim()).filter(Boolean);
  return String(value || "")
    .split("|")
    .flatMap((part) => part.split("\n"))
    .map((part) => part.trim())
    .filter(Boolean);
}

function normaliseCategory(value) {
  const text = String(value || "").trim().toLowerCase();
  if (text.includes("pallet")) return "pallet-truck";
  if (text.includes("forklift")) return "forklift-truck";
  return safeSegment(text) || "forklift-truck";
}

function normaliseStatus(value) {
  const text = String(value || "").trim().toLowerCase();
  if (text === "in stock" || text === "instock") return "in-stock";
  if (["reserved", "sold", "draft"].includes(text)) return text;
  return safeSegment(text) || "in-stock";
}
