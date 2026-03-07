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

function inferWear(name = "") {
  for (const wear of WEARS) {
    if (name.includes(`(${wear})`)) return wear;
  }
  return "N/A";
}

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

app.get("/api/skins", async (req, res) => {
  try {
    const url =
      "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins_not_grouped.json";

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

    const skins = data
      .filter(item => item && item.market_hash_name)
      .filter(item => !item.market_hash_name.includes("StatTrak"))
      .filter(item => !item.market_hash_name.includes("Souvenir"))
      .map(item => ({
        market_hash_name: item.market_hash_name,
        collection: getCollectionName(item),
        wear_name: item.wear?.name || item.wear_name || inferWear(item.market_hash_name)
      }));

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

async function getSteamPriceWithRetry(market_hash_name, currency = "1") {
  const params = new URLSearchParams({
    appid: "730",
    market_hash_name,
    currency
  });

  const url = `https://steamcommunity.com/market/priceoverview/?${params.toString()}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
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

      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 2500));
      }
    } catch (err) {
      if (attempt < 2) {
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

app.get("/api/steam-price", async (req, res) => {
  try {
    const { market_hash_name, currency = "1" } = req.query;

    if (!market_hash_name) {
      return res.status(400).json({
        error: "market_hash_name required"
      });
    }

    const data = await getSteamPriceWithRetry(market_hash_name, currency);
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