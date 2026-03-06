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
        Authorization: process.env.CSFLOAT_API_KEY,
        Accept: "application/json"
      }
    })

    const text = await response.text()

    let data
    try {
      data = JSON.parse(text)
    } catch {
      return res.status(500).json({
        error: "CSFloat did not return JSON",
        preview: text.slice(0, 200)
      })
    }

    res.json({
      status: response.status,
      listings: data.listings ? data.listings.slice(0, 10) : data
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