import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("."));

const WEARS = [
  "Factory New",
  "Minimal Wear",
  "Field-Tested",
  "Well-Worn",
  "Battle-Scarred"
];

function getCollectionName(item) {
  if (!item) return "Unknown Collection";

  if (Array.isArray(item.collections) && item.collections.length > 0) {
    const first = item.collections[0];

    if (typeof first === "object" && first?.name) {
      return String(first.name).trim();
    }

    if (typeof first === "string" && first.trim()) {
      return first.trim();
    }
  }

  if (item.collection && typeof item.collection === "object" && item.collection?.name) {
    return String(item.collection.name).trim();
  }

  if (typeof item.collection === "string" && item.collection.trim()) {
    return item.collection.trim();
  }

  return "Unknown Collection";
}

function stripWearSuffix(name = "") {
  return String(name)
    .replace(/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/, "")
    .trim();
}

function buildMarketHashName(item, wearName) {
  const rawName = item.market_hash_name || item.name || "";
  const cleanedName = stripWearSuffix(rawName);

  if (!cleanedName || !wearName) return null;

  if (cleanedName.includes(" | ")) {
    return `${cleanedName} (${wearName})`;
  }

  const weaponName =
    item.weapon?.name ||
    item.weapon_name ||
    item.weapon ||
    "";

  if (!weaponName) return null;

  return `${weaponName} | ${cleanedName} (${wearName})`;
}

function parseSteamHistoryDate(value) {
  if (!value) return null;

  let text = String(value).trim();

  text = text.replace(/\s+\+\d+$/, "");
  text = text.replace(/\s+[A-Z]{2,5}$/, "");
  text = text.replace(/,\s*/g, " ");
  text = text.replace(/\s+/g, " ").trim();

  const match = text.match(
    /^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})\s+(\d{1,2}):(\d{2})$/
  );

  if (!match) return null;

  const [, mon, day, year, hour, minute] = match;

  const months = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11
  };

  const monthIndex = months[mon];
  if (monthIndex === undefined) return null;

  const date = new Date(
    Number(year),
    monthIndex,
    Number(day),
    Number(hour),
    Number(minute),
    0,
    0
  );

  return Number.isNaN(date.getTime()) ? null : date;
}

function summarizeHistory(prices) {
  if (!Array.isArray(prices)) {
    return {
      success: false,
      error: "Steam returned no history array"
    };
  }

  const now = Date.now();
  const cutoff = now - 7 * 24 * 60 * 60 * 1000;

  const rows7d = [];
  let sales7d = 0;
  let points7d = 0;
  let weightedSum = 0;
  let low = Infinity;
  let high = -Infinity;

  for (const row of prices) {
    if (!Array.isArray(row) || row.length < 3) continue;

    const pointDate = parseSteamHistoryDate(row[0]);
    const price = Number(row[1]);
    const qty = Number(row[2]);

    if (!pointDate) continue;
    if (!Number.isFinite(price) || !Number.isFinite(qty) || qty <= 0) continue;
    if (pointDate.getTime() < cutoff) continue;

    points7d += 1;
    sales7d += qty;
    weightedSum += price * qty;
    low = Math.min(low, price);
    high = Math.max(high, price);

    rows7d.push({ price, qty });
  }

  if (!rows7d.length || sales7d <= 0) {
    return {
      success: true,
      sales_7d: 0,
      points_7d: points7d,
      median_7d: null,
      average_7d: null,
      low_7d: null,
      high_7d: null,
      error: "No valid 7-day Steam sales found"
    };
  }

  rows7d.sort((a, b) => a.price - b.price);

  let median = null;
  const midpoint = sales7d / 2;
  let running = 0;

  for (const row of rows7d) {
    running += row.qty;
    if (running >= midpoint) {
      median = row.price;
      break;
    }
  }

  return {
    success: true,
    sales_7d: sales7d,
    points_7d: points7d,
    median_7d: median,
    average_7d: weightedSum / sales7d,
    low_7d: Number.isFinite(low) ? low : null,
    high_7d: Number.isFinite(high) ? high : null
  };
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchTextWithRetry(url, retries = 3) {
  let lastError = "Unknown request failure";

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: "https://steamcommunity.com/market/",
          Origin: "https://steamcommunity.com"
        }
      });

      const text = await response.text();

      if (response.ok && text && text.trim()) {
        return {
          ok: true,
          status: response.status,
          text
        };
      }

      lastError = `HTTP ${response.status}`;
    } catch (err) {
      lastError = err.message;
    }

    if (attempt < retries) {
      await sleep(2500 + Math.random() * 1000);
    }
  }

  return {
    ok: false,
    error: lastError
  };
}

async function fetchJsonWithRetry(url, retries = 3, validate = null, label = "request") {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const result = await fetchTextWithRetry(url, 1);

    if (!result.ok) {
      if (attempt < retries) {
        await sleep(2500 + Math.random() * 1000);
        continue;
      }

      return {
        success: false,
        error: `${label} failed: ${result.error || "request failed"}`
      };
    }

    let data = null;

    try {
      data = JSON.parse(result.text);
    } catch {
      if (attempt < retries) {
        await sleep(2500 + Math.random() * 1000);
        continue;
      }

      return {
        success: false,
        error: `Steam returned non-JSON response for ${label}`
      };
    }

    if (data && typeof data === "object" && (!validate || validate(data))) {
      return data;
    }

    if (attempt < retries) {
      await sleep(2500 + Math.random() * 1000);
      continue;
    }

    return {
      success: false,
      error: `Steam returned invalid JSON shape for ${label}`
    };
  }

  return {
    success: false,
    error: `Steam returned invalid response for ${label}`
  };
}

app.get("/api/skins", async (req, res) => {
  try {
    const url =
      "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json";

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0"
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Skin dataset request failed: ${response.status}`
      });
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      return res.status(500).json({
        error: "Skin dataset was not an array"
      });
    }

    const skins = [];

    for (const item of data) {
      if (!item) continue;

      const collection = getCollectionName(item);
      if (collection === "Unknown Collection") continue;

      const wearBlocks = Array.isArray(item.wears) ? item.wears : [];

      if (wearBlocks.length > 0) {
        for (const wear of wearBlocks) {
          const wearName =
            wear?.name ||
            wear?.wear_name ||
            (typeof wear === "string" ? wear : null);

          if (!wearName) continue;
          if (!WEARS.includes(wearName)) continue;

          const marketHashName = buildMarketHashName(item, wearName);
          if (!marketHashName) continue;
          if (marketHashName.includes("StatTrak")) continue;
          if (marketHashName.includes("Souvenir")) continue;

          skins.push({
            market_hash_name: marketHashName,
            collection,
            wear_name: wearName
          });
        }
      }
    }

    res.json({
      count: skins.length,
      skins
    });
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

app.get("/api/steam-price", async (req, res) => {
  try {
    const {
      market_hash_name,
      currency = "1",
      country = "US"
    } = req.query;

    if (!market_hash_name) {
      return res.status(400).json({
        error: "market_hash_name required"
      });
    }

    const params = new URLSearchParams({
      appid: "730",
      market_hash_name: String(market_hash_name),
      currency: String(currency),
      country: String(country)
    });

    const url = `https://steamcommunity.com/market/priceoverview/?${params.toString()}`;
    const data = await fetchJsonWithRetry(
      url,
      3,
      data => data && typeof data === "object",
      `priceoverview:${market_hash_name}`
    );

    res.json(data);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.get("/api/steam-history", async (req, res) => {
  try {
    const {
      market_hash_name,
      currency = "1",
      country = "US"
    } = req.query;

    if (!market_hash_name) {
      return res.status(400).json({
        error: "market_hash_name required"
      });
    }

    const params = new URLSearchParams({
      appid: "730",
      market_hash_name: String(market_hash_name),
      currency: String(currency),
      country: String(country)
    });

    const url = `https://steamcommunity.com/market/pricehistory/?${params.toString()}`;

    const raw = await fetchJsonWithRetry(
      url,
      3,
      data => data && data.success !== false && Array.isArray(data.prices),
      `pricehistory:${market_hash_name}`
    );

    if (!raw || raw.success === false || !Array.isArray(raw.prices)) {
      return res.json({
        success: false,
        error: raw?.error || "Steam history unavailable"
      });
    }

    const summary = summarizeHistory(raw.prices);
    res.json(summary);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
