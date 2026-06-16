const fs = require("fs");
const path = require("path");

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10000) {
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function normaliseStatus(value) {
  const clean = String(value || "").toLowerCase().trim();
  if (!clean || clean === "in stock" || clean === "instock") return "in-stock";
  return clean.replace(/\s+/g, "-");
}

function normaliseCategory(value) {
  const clean = String(value || "").toLowerCase().trim();
  if (clean.includes("pallet")) return "pallet-truck";
  if (clean.includes("forklift") || clean.includes("truck")) return "forklift-truck";
  return clean.replace(/\s+/g, "-");
}

function normaliseItem(item) {
  return {
    ...item,
    category: normaliseCategory(item.category || "forklift-truck"),
    status: normaliseStatus(item.status || "in-stock")
  };
}

function loadInventory() {
  const file = path.join(process.cwd(), "data", "inventory.json");
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const items = Array.isArray(json.items) ? json.items.map(normaliseItem) : [];
  return { ...json, items };
}

function titleFor(item) {
  return [item.brand, item.model].filter(Boolean).join(" ") || item.model || item.brand || "Machine";
}

function priceFor(item) {
  if (!item.price || String(item.price).toUpperCase() === "POA") return "POA";
  const numeric = Number(String(item.price).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(numeric)) return String(item.price);
  return `${new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0
  }).format(numeric)}${item.vat === false ? "" : " + VAT"}`;
}

function itemLine(item) {
  return `${titleFor(item)} - ${[
    item.type,
    item.capacity,
    item.power || item.fuel || item.battery,
    item.year,
    priceFor(item)
  ].filter(Boolean).join(" | ")}`;
}

function filterItems(items, message) {
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

function buildAnswer(message, inventory) {
  const source = inventory.source || "AEGIS Sales OS";
  const stock = inventory.items.filter((item) => item.status !== "sold" && item.status !== "draft");
  const clean = message.toLowerCase();
  const matches = filterItems(stock, clean).slice(0, 5);
  const forkliftCount = stock.filter((item) => item.category === "forklift-truck").length;
  const palletCount = stock.filter((item) => item.category === "pallet-truck").length;

  if (!clean.trim()) {
    return `Ask me about current stock from ${source}.`;
  }

  if (clean.includes("how many") || clean.includes("stock") || clean.includes("available") || clean.includes("have")) {
    if (!matches.length) {
      return `I can see ${stock.length} machines in ${source}: ${forkliftCount} forklift trucks and ${palletCount} pallet trucks. Tell me the type, brand, capacity or power and I will narrow it down.`;
    }
    return `I found ${matches.length} relevant machine${matches.length === 1 ? "" : "s"} in ${source}:\n\n${matches.map(itemLine).join("\n")}\n\nWant me to help choose the best one for your site?`;
  }

  if (clean.includes("capacity") || clean.includes("spec") || clean.includes("details") || clean.includes("price")) {
    if (!matches.length) {
      return "I could not match that exact machine in current stock. Try the brand/model, for example AT30, Toyota or Hyster.";
    }
    return matches.map((item) => {
      const bullets = Array.isArray(item.bullets) && item.bullets.length
        ? `\n${item.bullets.slice(0, 3).map((point) => `- ${point}`).join("\n")}`
        : "";
      return `${titleFor(item)}\nType: ${item.type || "Ask for details"}\nCapacity: ${item.capacity || "Ask"}\nPower: ${item.power || item.fuel || item.battery || "Ask"}\nPrice: ${priceFor(item)}${bullets}`;
    }).join("\n\n");
  }

  if (matches.length) {
    return `Closest matches from ${source}:\n\n${matches.map(itemLine).join("\n")}\n\nFor a proper quote, use the contact form and mention the machine name.`;
  }

  return `I can answer from ${source} stock. Try asking "What forklifts are in stock?", "Show pallet trucks", "Do you have electric trucks?" or "What is the AT30 capacity?".`;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Use POST" }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const message = String(body.message || "").slice(0, 500);
    const inventory = loadInventory();
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      answer: buildAnswer(message, inventory),
      source: inventory.source || "AEGIS Sales OS",
      updatedAt: inventory.updatedAt || null
    }));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Chat service unavailable" }));
  }
};
