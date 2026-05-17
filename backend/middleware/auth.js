// middleware/auth.js
// Session doğrulama — tüm route'lar tarafından kullanılır

async function getSession(pool, req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  try {
    const [rows] = await pool.execute(
      "SELECT * FROM sessions WHERE token = ? AND expires_at > NOW() LIMIT 1",
      [token]
    );
    return rows[0] || null;
  } catch {
    return null;
  }
}

async function requireAuth(pool, req, res) {
  const session = await getSession(pool, req);
  if (!session) {
    res.status(401).json({ success: false, error: "Login required." });
    return null;
  }
  return session;
}

module.exports = { getSession, requireAuth };
