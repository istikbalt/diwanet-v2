// routes/notifications.js

const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");

// GET /api/notifications
router.get("/", async (req, res) => {
  const pool = req.app.locals.pool;
  const session = await requireAuth(pool, req, res);
  if (!session) return;
  try {
    let where, params;
    if (session.user_type === "individual") {
      where = "recipient_user_id = ?"; params = [session.user_id];
    } else {
      where = "recipient_business_id = ?"; params = [session.business_id];
    }
    const [notifications] = await pool.execute(
      `SELECT n.*, ab.business_name AS actor_business_name, ab.slug AS actor_business_slug,
       au.first_name AS actor_first_name, au.last_name AS actor_last_name
       FROM notifications n
       LEFT JOIN businesses ab ON n.actor_business_id = ab.id
       LEFT JOIN users au ON n.actor_user_id = au.id
       WHERE ${where} ORDER BY n.created_at DESC LIMIT 30`,
      params
    );
    await pool.execute(`UPDATE notifications SET is_read = 1 WHERE ${where}`, params);
    const [[{ unread }]] = await pool.execute(
      `SELECT COUNT(*) AS unread FROM notifications WHERE ${where} AND is_read = 0`, params
    );
    return res.json({ success: true, notifications, unread_count: Number(unread) });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/notifications/read
router.post("/read", async (req, res) => {
  const pool = req.app.locals.pool;
  const session = await requireAuth(pool, req, res);
  if (!session) return;
  try {
    const col = session.user_type === "business" ? "recipient_business_id" : "recipient_user_id";
    const id = session.user_type === "business" ? session.business_id : session.user_id;
    await pool.execute(`UPDATE notifications SET is_read = 1 WHERE ${col} = ?`, [id]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
