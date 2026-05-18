// routes/search.js

const express = require("express");
const router = express.Router();

// GET /api/search
router.get("/", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const q = (req.query.q || "").trim();
    const category = req.query.category || "";
    const city = req.query.city || "";

    let query = `
      SELECT b.id, b.business_name, b.slug, b.business_type, b.short_description,
      b.city, b.country, b.logo_url, b.cover_url, c.name AS category_name,
      (SELECT COUNT(*) FROM follows WHERE following_business_id = b.id) AS follower_count
      FROM businesses b
      LEFT JOIN categories c ON b.category_id = c.id
      WHERE b.status = 'published'
    `;
    const params = [];

    if (q && q.length >= 2) {
      query += " AND (b.business_name LIKE ? OR b.short_description LIKE ?)";
      params.push(`%${q}%`, `%${q}%`);
    }
    if (category) { query += " AND c.slug = ?"; params.push(category); }
    if (city) { query += " AND b.city LIKE ?"; params.push(`%${city}%`); }

    const limitVal = Math.min(parseInt(req.query.limit) || 30, 30);
    query += ` ORDER BY follower_count DESC LIMIT ${limitVal}`;

    const [businesses] = await pool.execute(query, params);
    return res.json({ success: true, businesses });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
