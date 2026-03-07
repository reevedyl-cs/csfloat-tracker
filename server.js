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

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  return null;
}

function weightedMedian(values) {
  if (!values.length) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  return sorted[mid];
}

function summarizeHistory(prices) {
  if (!Array.isArray(prices)) {
    return {
      success: false,
      error: "Steam returned no history array"
    };
  }

  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const cutoff = now - sevenDaysMs;

  const expandedSales = [];
  let sales7d = 0;
  let points7d = 0;

  for (const row of prices) {
    if (!Array.isArray(row) || row.length < 3) continue;

    const pointDate = parseSteamHistoryDate(row[0]);
    const price = Number(row[1]);
    const qty = Number(row[2]);

    if (!pointDate) continue;
    if (!Number.isFinite(price) || !Number.isFinite(qty)) continue;
    if (pointDate.getTime() < cutoff) continue;
    if (qty <= 0) continue;

    points7d += 1;
    sales7d += qty;

    for (let i = 0; i < qty; i++) {
      expandedSales.push(price);
    }
  }

  if (!expandedSales.length) {
    return {
      success: true,
      sales_7d: 0,
      points_7d: 0,
      median_7d: null,
      average_7d: null,
      low_7d: null,
      high_7d: null
    };
  }

  const sum = expandedSales.reduce((a, b) => a + b, 0);

  return {
    success: true,
    sales_7d: sales7d,
    points_7d: points7d,
    median_7d: weightedMedian(expandedSales),
    average_7d: sum / expandedSales.length,
    low_7d: Math.min(...expandedSales),
    high_7d: Math.max(...expandedSales)
  };
}

async function fetchJsonWithRetry(url, retries = 2) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "application/json",
          Referer: "https://steamcommunity.com/market/"
        }
      });

      const text = await response.text();

      let data = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }

      if (data && typeof data === "object") {
        return data;
      }

      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 2500));
      }
    } catch (err) {
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 2500));
      } else {
        return {
          success: false,
          error: err.message
        };
      }
    }
  }

  return {
    success: false,
    error: "Steam returned invalid response"
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
    const { market_hash_name, currency = "1" } = req.query;

    if (!market_hash_name) {
      return res.status(400).json({
        error: "market_hash_name required"
      });
    }

    const params = new URLSearchParams({
      appid: "730",
      market_hash_name,
      currency
    });

    const url = `https://steamcommunity.com/market/priceoverview/?${params.toString()}`;
    const data = await fetchJsonWithRetry(url, 2);

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
    const { market_hash_name } = req.query;

    if (!market_hash_name) {
      return res.status(400).json({
        error: "market_hash_name required"
      });
    }

    const params = new URLSearchParams({
      appid: "730",
      market_hash_name
    });

    const url = `https://steamcommunity.com/market/pricehistory/?${params.toString()}`;
    const raw = await fetchJsonWithRetry(url, 2);

    if (!raw || raw.success === false) {
      return res.json({
        success: false,
        error: raw?.error || "Steam history unavailable"
      });
    }

    res.json(summarizeHistory(raw.prices));
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