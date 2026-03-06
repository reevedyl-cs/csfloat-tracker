const express = require("express")
require("dotenv").config()

const app = express()
const PORT = process.env.PORT || 3000

const CSFLOAT_API =
  "https://csfloat.com/api/v1/listings?max_float=0.07&def_index=9&paint_index=51&limit=10&sort_by=lowest_price"

app.get("/", (req, res) => {
  res.json({
    message: "CSFloat tracker running"
  })
})

app.get("/health", (req, res) => {
  res.json({
    status: "healthy"
  })
})

app.get("/market", async (req, res) => {
  try {
    const response = await fetch(CSFLOAT_API, {
      headers: {
        Authorization: process.env.CSFLOAT_API_KEY,
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
        error: "CSFloat did not return JSON",
        status: response.status,
        preview: text.slice(0, 300)
      })
    }

    res.json({
      status: response.status,
      count: Array.isArray(data.data) ? data.data.length : 0,
      lowest_price: Array.isArray(data.data) && data.data.length ? data.data[0].price : null,
      lowest_price_dollars:
        Array.isArray(data.data) && data.data.length ? (data.data[0].price / 100).toFixed(2) : null,
      listings: Array.isArray(data.data) ? data.data.slice(0, 10) : data
    })
  } catch (err) {
    res.status(500).json({
      error: err.message
    })
  }
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})