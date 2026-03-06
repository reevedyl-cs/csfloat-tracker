import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("."));

/*
STEAM PRICE (current market price)
*/

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

    const url =
      `https://steamcommunity.com/market/priceoverview/?${params}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json"
      }
    });

    const data = await response.json();

    res.json(data);

  }
  catch (err) {

    res.status(500).json({
      error: err.message
    });

  }

});


/*
STEAM PRICE HISTORY (graph data)
*/

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

    const url =
      `https://steamcommunity.com/market/pricehistory/?${params}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json"
      }
    });

    const data = await response.json();

    res.json(data);

  }
  catch (err) {

    res.status(500).json({
      error: err.message
    });

  }

});


app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});