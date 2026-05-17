// routes/categories.js
// categories, subcategories

const express = require("express");
const router = express.Router();

// GET /api/categories
router.get("/", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const [rows] = await pool.execute(
      "SELECT id, name, slug FROM categories WHERE status = 'active' ORDER BY sort_order ASC, name ASC"
    );
    res.json({ success: true, categories: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/subcategories/all
router.get("/subcategories/all", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const [rows] = await pool.execute(
      "SELECT id, category_id, name, slug FROM subcategories WHERE status = 'active' ORDER BY category_id ASC, sort_order ASC"
    );
    res.json({ success: true, subcategories: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/subcategories/:category_id
router.get("/subcategories/:category_id", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const [rows] = await pool.execute(
      "SELECT id, name, slug FROM subcategories WHERE category_id = ? AND status = 'active' ORDER BY sort_order ASC, name ASC",
      [req.params.category_id]
    );
    res.json({ success: true, subcategories: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
