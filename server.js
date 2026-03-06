const express = require("express")
const path = require("path")

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.static(__dirname))

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"))
})

app.get("/api/search", async (req, res) => {
  const { def_index, paint_index, max_float } = req.query

  const params = new URLSearchParams({
    def_index,
    paint_index,
    limit: 10,
    sort_by: "lowest_price"
  })

  if (max_float) params.append("max_float", max_float)

  const url = `https://csfloat.com/api/v1/listings?${params}`

  try {
    const response = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0"
      }
    })

    const data = await response.json()

    res.json(data)

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.listen(PORT, () => {
  console.log("Server running")
})