const express = require("express")
require("dotenv").config()

const app = express()

const PORT = process.env.PORT || 3000

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

app.listen(PORT, () => {
  console.log("Server running on port " + PORT)
})
