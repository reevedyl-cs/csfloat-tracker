const express = require("express")
const path = require("path")
require("dotenv").config()

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.static(__dirname))

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"))
})

app.get("/api/search", async (req, res) => {
  const { def_index, paint_index, max_float } = req.query

  const params = new URLSearchParams({
    def_index: def_index || "",
    paint_index: paint_index || "",
    limit: "10",
    sort_by: "lowest_price"
  })

  if (max_float) params.append("max_float", max_float)

  const url = `https://csfloat.com/api/v1/listings?${params.toString()}`

  try {
    const response = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "Authorization": process.env.CSFLOAT_API_KEY || "",
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

    res.status(response.status).json(data)
  } catch (err) {
    res.status(500).json({
      error: err.message
    })
  }
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})