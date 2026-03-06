import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("."));

app.get("/api/skins", async (req, res) => {
  try {
    const url = "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins_not_grouped.json";

    const response = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0"
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Skin dataset request failed: ${response.status}`
      });
    }

    const data = await response.json();

    const names = data
      .map(item => item.market_hash_name)
      .filter(Boolean)
      .filter(name => !name.includes("StatTrak"))
      .filter(name => !name.includes("Souvenir"));

    const uniqueNames = [...new Set(names)].sort((a, b) => a.localeCompare(b));

    res.json({
      count: uniqueNames.length,
      skins: uniqueNames
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

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json"
      }
    });

    const data = await response.json();

    res.json(data);
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});