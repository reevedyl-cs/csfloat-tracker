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

const SKINPORT_CACHE_MS = 5 * 60 * 1000;
const LIVE_PULL_INTERVAL_MS = 60 * 1000;
const STALE_CACHE_MAX_MS = 30 * 60 * 1000;

const skinScanCache = new Map();
let itemsListCache = null;
let lastLivePullAt = 0;

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

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "br",
      "User-Agent": "Mozilla/5.0"
    }
  });

  const text = await response.text();

  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  if (!response.ok) {
    return {
      success: false,
      status: response.status,
      error: `Request failed: ${response.status}`,
      preview: text.slice(0, 300)
    };
  }

  if (!data) {
    return {
      success: false,
      status: response.status,
      error: "Endpoint returned invalid JSON",
      preview: text.slice(0, 300)
    };
  }

  return {
    success: true,
    data
  };
}

function normalizeSkinportItem(item, marketHashName) {
  return {
    success: true,
    market_hash_name: item?.market_hash_name || marketHashName,
    currency: item?.currency || "USD",
    lowest_price: item?.min_price ?? null,
    highest_price: item?.max_price ?? null,
    average_price: item?.mean_price ?? null,
    median_price: item?.median_price ?? null,
    listing_count: item?.quantity ?? 0,
    suggested_price: item?.suggested_price ?? null,
    item_page: item?.item_page || null,
    market_page: item?.market_page || null
  };
}

function normalizeSkinportHistory(item, marketHashName) {
  return {
    success: true,
    market_hash_name: item?.market_hash_name || marketHashName,
    currency: item?.currency || "USD",
    last_24_hours: item?.last_24_hours || null,
    last_7_days: item?.last_7_days || null,
    last_30_days: item?.last_30_days || null,
    last_90_days: item?.last_90_days || null,
    item_page: item?.item_page || null,
    market_page: item?.market_page || null
  };
}

function buildCacheEnvelope(entry, source, note = "") {
  const ageMs = Date.now() - entry.cached_at;
  const expiresInMs = Math.max(0, entry.expires_at - Date.now());

  return {
    success: true,
    source,
    note,
    cached: source !== "live",
    cache_age_seconds: Math.floor(ageMs / 1000),
    cache_expires_in_seconds: Math.floor(expiresInMs / 1000),
    market_hash_name: entry.market_hash_name,
    item: entry.item,
    history: entry.history
  };
}

function getFreshCache(marketHashName) {
  const entry = skinScanCache.get(marketHashName);
  if (!entry) return null;
  if (Date.now() > entry.expires_at) return null;
  return entry;
}

function getUsableStaleCache(marketHashName) {
  const entry = skinScanCache.get(marketHashName);
  if (!entry) return null;
  if (Date.now() - entry.cached_at > STALE_CACHE_MAX_MS) return null;
  return entry;
}

function setSkinCache(marketHashName, item, history) {
  const now = Date.now();

  const entry = {
    market_hash_name: marketHashName,
    item,
    history,
    cached_at: now,
    expires_at: now + SKINPORT_CACHE_MS
  };

  skinScanCache.set(marketHashName, entry);
  return entry;
}

async function getSkinportItemsList(currency = "USD") {
  const now = Date.now();

  if (itemsListCache && now < itemsListCache.expires_at) {
    return {
      success: true,
      from_cache: true,
      rows: itemsListCache.rows
    };
  }

  const params = new URLSearchParams({
    app_id: "730",
    currency,
    tradable: "0"
  });

  const url = `https://api.skinport.com/v1/items?${params.toString()}`;
  const result = await fetchJson(url);

  if (!result.success) return result;

  const rows = Array.isArray(result.data) ? result.data : [];

  itemsListCache = {
    rows,
    expires_at: now + SKINPORT_CACHE_MS
  };

  return {
    success: true,
    from_cache: false,
    rows
  };
}

async function getSkinportItemByName(marketHashName, currency = "USD") {
  const result = await getSkinportItemsList(currency);

  if (!result.success) return result;

  const item = result.rows.find((x) => x.market_hash_name === marketHashName);

  if (!item) {
    return {
      success: false,
      error: "No Skinport item data returned",
      market_hash_name: marketHashName
    };
  }

  return {
    success: true,
    data: normalizeSkinportItem(item, marketHashName)
  };
}

async function getSkinportHistoryByName(marketHashName, currency = "USD") {
  const params = new URLSearchParams({
    app_id: "730",
    currency,
    market_hash_name: marketHashName
  });

  const url = `https://api.skinport.com/v1/sales/history?${params.toString()}`;
  const result = await fetchJson(url);

  if (!result.success) return result;

  const rows = Array.isArray(result.data) ? result.data : [];
  const item = rows.find((x) => x.market_hash_name === marketHashName) || rows[0];

  if (!item) {
    return {
      success: false,
      error: "No Skinport history returned",
      market_hash_name: marketHashName
    };
  }

  return {
    success: true,
    data: normalizeSkinportHistory(item, marketHashName)
  };
}

async function runLiveSkinScan(marketHashName, currency = "USD") {
  const [itemResult, historyResult] = await Promise.all([
    getSkinportItemByName(marketHashName, currency),
    getSkinportHistoryByName(marketHashName, currency)
  ]);

  if (!itemResult.success || !historyResult.success) {
    return {
      success: false,
      error: itemResult.error || historyResult.error || "Live Skinport scan failed",
      item_error: itemResult.success ? null : itemResult.error,
      history_error: historyResult.success ? null : historyResult.error,
      item_preview: itemResult.preview || null,
      history_preview: historyResult.preview || null
    };
  }

  const entry = setSkinCache(marketHashName, itemResult.data, historyResult.data);

  return buildCacheEnvelope(entry, "live", "Fresh live pull");
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

app.get("/api/skinport-item", async (req, res) => {
  try {
    const { market_hash_name, currency = "USD" } = req.query;

    if (!market_hash_name) {
      return res.status(400).json({
        success: false,
        error: "market_hash_name required"
      });
    }

    const result = await getSkinportItemByName(market_hash_name, currency);

    if (!result.success) return res.json(result);
    res.json(result.data);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.get("/api/skinport-history", async (req, res) => {
  try {
    const { market_hash_name, currency = "USD" } = req.query;

    if (!market_hash_name) {
      return res.status(400).json({
        success: false,
        error: "market_hash_name required"
      });
    }

    const result = await getSkinportHistoryByName(market_hash_name, currency);

    if (!result.success) return res.json(result);
    res.json(result.data);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.get("/api/test-skinport", async (req, res) => {
  try {
    const result = await getSkinportItemsList("USD");
    res.json(result);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.get("/api/scan-skin", async (req, res) => {
  try {
    const { market_hash_name, currency = "USD", force_live = "0" } = req.query;

    if (!market_hash_name) {
      return res.status(400).json({
        success: false,
        error: "market_hash_name required"
      });
    }

    const freshCache = getFreshCache(market_hash_name);
    if (freshCache && force_live !== "1") {
      return res.json(buildCacheEnvelope(freshCache, "cache", "Fresh cached result"));
    }

    const now = Date.now();
    const msUntilLive = Math.max(0, lastLivePullAt + LIVE_PULL_INTERVAL_MS - now);

    if (msUntilLive > 0) {
      const stale = getUsableStaleCache(market_hash_name);

      if (stale) {
        return res.json({
          ...buildCacheEnvelope(stale, "cached-limit", "Live pull blocked, using cached result"),
          live_available_in_seconds: Math.ceil(msUntilLive / 1000)
        });
      }

      return res.status(429).json({
        success: false,
        error: "Live pull cooldown active",
        live_available_in_seconds: Math.ceil(msUntilLive / 1000),
        note: "No cached result available yet for this skin"
      });
    }

    lastLivePullAt = now;

    const liveResult = await runLiveSkinScan(market_hash_name, currency);

    if (liveResult.success) {
      return res.json({
        ...liveResult,
        live_available_in_seconds: Math.ceil(LIVE_PULL_INTERVAL_MS / 1000)
      });
    }

    const stale = getUsableStaleCache(market_hash_name);

    if (stale) {
      return res.json({
        ...buildCacheEnvelope(stale, "stale-cache", "Live pull failed, using stale cached result"),
        live_available_in_seconds: Math.ceil(LIVE_PULL_INTERVAL_MS / 1000),
        live_error: liveResult.error,
        item_error: liveResult.item_error || null,
        history_error: liveResult.history_error || null
      });
    }

    return res.status(500).json({
      success: false,
      error: liveResult.error || "Live pull failed",
      item_error: liveResult.item_error || null,
      history_error: liveResult.history_error || null
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});