import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const aegisRoot = path.resolve(__dirname, "..");
const forkliftSiteRoot = process.env.FORKLIFT_SITE_DIR || path.join(aegisRoot, "Forklift Pro Solutions");
const source = process.argv[2] || process.env.FORKLIFT_STOCK_CSV_URL;
const outputPath = path.join(forkliftSiteRoot, "data", "inventory.json");

if (!source) {
  console.error("Usage: node tools/sync-forklift-stock-from-sheet.mjs <published-google-sheet-csv-url-or-local-csv>");
  console.error("Or set FORKLIFT_STOCK_CSV_URL before running the script.");
  process.exit(1);
}

const csvText = await loadCsv(source);
const [headers, ...rows] = parseCsv(csvText).filter((row) => row.some(Boolean));
const items = rows
  .map((row) => rowToItem(headers, row))
  .filter((item) => item.id && item.status !== "draft")
  .sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) || a.model.localeCompare(b.model));

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({ updatedAt: new Date().toISOString(), source, items }, null, 2)}\n`);

console.log(`Synced ${items.length} stock items to ${path.relative(aegisRoot, outputPath)}`);

async function loadCsv(csvSource) {
  if (/^https?:\/\//i.test(csvSource)) {
    const response = await fetch(csvSource);
    if (!response.ok) throw new Error(`Could not fetch sheet CSV: ${response.status} ${response.statusText}`);
    return response.text();
  }

  return readFile(path.resolve(aegisRoot, csvSource), "utf8");
}

function rowToItem(headers, row) {
  const raw = Object.fromEntries(headers.map((header, index) => [normaliseHeader(header), (row[index] || "").trim()]));
  const item = {
    id: raw.id,
    category: raw.category,
    status: raw.status || "in-stock",
    featured: toBoolean(raw.featured),
    brand: raw.brand,
    model: raw.model,
    type: raw.type,
    power: raw.power,
    capacity: raw.capacity,
    liftHeight: raw.liftHeight,
    year: raw.year,
    hours: raw.hours,
    mast: raw.mast,
    tyres: raw.tyres,
    battery: raw.battery,
    fuel: raw.fuel,
    price: raw.price,
    vat: toBoolean(raw.vat),
    description: raw.description,
    bullets: toList(raw.bullets),
    imageMain: raw.imageMain,
    galleryImages: toList(raw.galleryImages),
    sortOrder: raw.sortOrder ? Number(raw.sortOrder) : undefined
  };

  return Object.fromEntries(
    Object.entries(item).filter(([, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      return value !== "" && value !== undefined && !Number.isNaN(value);
    })
  );
}

function normaliseHeader(header) {
  return String(header)
    .trim()
    .replace(/\s+([a-z])/gi, (_, letter) => letter.toUpperCase())
    .replace(/^[A-Z]/, (letter) => letter.toLowerCase());
}

function toBoolean(value) {
  return ["1", "true", "yes", "y"].includes(String(value || "").trim().toLowerCase());
}

function toList(value) {
  return String(value || "").split("|").map((part) => part.trim()).filter(Boolean);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      row.push(value);
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  row.push(value);
  rows.push(row);
  return rows;
}
