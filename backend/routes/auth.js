// routes/auth.js
// register, login, logout, me

const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { getSession } = require("../middleware/auth");

function generateToken() {
  return crypto.randomBytes(48).toString("hex");
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
  const { first_name, last_name, email, password, phone } = req.body;
  if (!first_name || !last_name || !email || !password) {
    return res.status(400).json({ success: false, error: "Required fields missing." });
  }
  const pool = req.app.locals.pool;
  try {
    const [existing] = await pool.execute(
      "SELECT id FROM users WHERE email = ? LIMIT 1", [email]
    );
    if (existing.length > 0) {
      return res.status(400).json({ success: false, error: "Email already registered." });
    }
    const [result] = await pool.execute(
      "INSERT INTO users (first_name, last_name, email, password_hash, phone, role, status) VALUES (?, ?, ?, ?, ?, 'individual', 'active')",
      [first_name, last_name, email, password, phone || null]
    );
    const token = generateToken();
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await pool.execute(
      "INSERT INTO sessions (token, user_type, user_id, expires_at) VALUES (?, 'individual', ?, ?)",
      [token, result.insertId, expires]
    );
    return res.json({
      success: true, token,
      user: { id: result.insertId, first_name, last_name, email, role: "individual" }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: "Email and password required." });
  }
  const pool = req.app.locals.pool;
  try {
    const [users] = await pool.execute(
      "SELECT * FROM users WHERE email = ? AND password_hash = ? LIMIT 1", [email, password]
    );
    if (!users.length) {
      return res.status(401).json({ success: false, error: "Invalid email or password." });
    }
    const user = users[0];
    let business = null;
    if (user.role === "business_owner") {
      const [businesses] = await pool.execute(
        "SELECT id, business_name, slug FROM businesses WHERE owner_user_id = ? LIMIT 1", [user.id]
      );
      business = businesses[0] || null;
    }
    const token = generateToken();
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await pool.execute(
      "INSERT INTO sessions (token, user_type, user_id, business_id, expires_at) VALUES (?, ?, ?, ?, ?)",
      [token, user.role === "business_owner" ? "business" : "individual", user.id, business ? business.id : null, expires]
    );
    return res.json({
      success: true, token,
      user: { id: user.id, first_name: user.first_name, last_name: user.last_name, email: user.email, role: user.role, avatar_url: user.avatar_url || null },
      business
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/auth/logout
router.post("/logout", async (req, res) => {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    const pool = req.app.locals.pool;
    try {
      await pool.execute("DELETE FROM sessions WHERE token = ?", [auth.slice(7)]);
    } catch {}
  }
  res.json({ success: true });
});

// GET /api/auth/me
router.get("/me", async (req, res) => {
  const pool = req.app.locals.pool;
  const session = await getSession(pool, req);
  if (!session) return res.status(401).json({ success: false, error: "Not logged in." });
  try {
    const [users] = await pool.execute(
      "SELECT id, first_name, last_name, email, role, avatar_url, bio FROM users WHERE id = ?", [session.user_id]
    );
    if (!users.length) return res.status(404).json({ success: false, error: "User not found." });
    let business = null;
    if (session.business_id) {
      const [businesses] = await pool.execute(
        "SELECT id, business_name, slug FROM businesses WHERE id = ?", [session.business_id]
      );
      business = businesses[0] || null;
    }
    return res.json({ success: true, user: users[0], business });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
