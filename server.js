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
    } catch (parseErr) {
      return res.status(500).json({
        error: "CSFloat did not return JSON",
        status: response.status,
        preview: text.slice(0, 300)
      })
    }

    res.json({
      status: response.status,
      listings: Array.isArray(data.listings) ? data.listings.slice(0, 10) : data
    })
  } catch (err) {
    res.status(500).json({
      error: err.message
    })
  }
})