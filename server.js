const express = require("express")
require("dotenv").config()

const app = express()
const PORT = process.env.PORT || 3000

const CSFLOAT_API = "https://csfloat.com/api/v1/listings"

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
        Authorization: process.env.CSFLOAT_API_KEY
      }
    })

    const data = await response.json()

    res.json({
      listings: data.listings.slice(0, 10)
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