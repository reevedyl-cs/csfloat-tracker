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

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  return sorted[mid];
}

function summarizeCsfloatListings(data, marketHashName) {
  const listings = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];

  const normalized = listings
    .filter(listing => listing && typeof listing === "object")
    .map(listing => {
      const cents = Number(listing.price);
      const dollars = Number.isFinite(cents) ? cents / 100 : NaN;

      return {
        id: listing.id || null,
        price_cents: cents,
        price: dollars,
        type: listing.type || null,
        state: listing.state || null,
        item: listing.item || null,
        market_hash_name:
          listing.item?.market_hash_name ||
          listing.market_hash_name ||
          marketHashName ||
          null,
        float_value: listing.item?.float_value ?? null,
        seller: listing.seller || null
      };
    })
    .filter(x => Number.isFinite(x.price) && x.price > 0);

  if (!normalized.length) {
    return {
      success: false,
      error: "No CSFloat listings returned",
      market_hash_name: marketHashName,
      lowest_price: null,
      median_price: null,
      average_price: null,
      listing_count: 0,
      spread_percent: null,
      listings: []
    };
  }

  const prices = normalized.map(x => x.price).sort((a, b) => a - b);
  const lowest = prices[0];
  const med = median(prices);
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const highest = prices[prices.length - 1];
  const spreadPercent = lowest > 0 ? ((highest - lowest) / lowest) * 100 : null;

  return {
    success: true,
    market_hash_name: normalized[0].market_hash_name || marketHashName,
    lowest_price: lowest,
    median_price: med,
    average_price: avg,
    highest_price: highest,
    listing_count: normalized.length,
    spread_percent: spreadPercent,
    listings: normalized
  };
}

async function fetchCsfloatListings(marketHashName) {

  const params = new URLSearchParams({
    market_hash_name: marketHashName,
    sort_by: "lowest_price",
    limit: "50"
  });

  const url = `https://csfloat.com/api/v1/listings?${params.toString()}`;

  try {

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0"
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: `CSFloat request failed: ${response.status}`
      };
    }

    return summarizeCsfloatListings(data, marketHashName);

  } catch (err) {

    return {
      success: false,
      error: err.message
    };

  }

}

  const params = new URLSearchParams({
    market_hash_name: marketHashName,
    sort_by: "lowest_price",
    limit: "50",
    category: "1"
  });

  const url = `https://csfloat.com/api/v1/listings?${params.toString()}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: apiKey,
          Accept: "application/json",
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

      if (response.status === 401) {
        return {
          success: false,
          error: "CSFloat API key rejected (401)"
        };
      }

      if (response.status === 429) {
        if (attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          continue;
        }

        return {
          success: false,
          error: "CSFloat rate limited the request (429)"
        };
      }

      if (!response.ok) {
        return {
          success: false,
          error: `CSFloat request failed: ${response.status}`
        };
      }

      if (!data) {
        if (attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }

        return {
          success: false,
          error: "CSFloat returned invalid JSON"
        };
      }

      return summarizeCsfloatListings(data, marketHashName);
    } catch (err) {
      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }

      return {
        success: false,
        error: err.message
      };
    }
  }

  return {
    success: false,
    error: "Unknown CSFloat request failure"
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

app.get("/api/test-csfloat-key", (req, res) => {
  res.json({
    hasKey: !!process.env.CSFLOAT_API_KEY
  });
});

app.get("/api/csfloat-price", async (req, res) => {
  try {
    const { market_hash_name } = req.query;

    if (!market_hash_name) {
      return res.status(400).json({
        success: false,
        error: "market_hash_name required"
      });
    }

    const data = await fetchCsfloatListings(market_hash_name);
    res.json(data);
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