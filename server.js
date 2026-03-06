const express = require("express")
const path = require("path")

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.static(__dirname))

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"))
})

app.get("/api/steam-price", async (req, res) => {
  try {
    const marketHashName = (req.query.market_hash_name || "").trim()
    const currency = (req.query.currency || "1").trim()

    if (!marketHashName) {
      return res.status(400).json({
        error: "market_hash_name is required"
      })
    }

    const params = new URLSearchParams({
      appid: "730",
      currency,
      market_hash_name: marketHashName
    })

    const url = `https://steamcommunity.com/market/priceoverview/?${params.toString()}`

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0"
      }
    })

    const text = await response.text()

    let data
    try {
      data = JSON.parse(text)
    } catch {
      return res.status(500).json({
        error: "Steam did not return JSON",
        status: response.status,
        preview: text.slice(0, 300)
      })
    }

    return res.status(response.status).json(data)
  } catch (err) {
    return res.status(500).json({
      error: err.message
    })
  }
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})