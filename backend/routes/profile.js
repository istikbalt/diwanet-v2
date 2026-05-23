// routes/profile.js

const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");

// GET /api/profile/:userId
router.get("/:userId", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const userId = Number(req.params.userId);
    const [users] = await pool.execute(
      "SELECT id, first_name, last_name, avatar_url, cover_url, bio, role, created_at FROM users WHERE id = ? LIMIT 1",
      [userId]
    );
    if (!users.length) return res.status(404).json({ success: false, error: "User not found." });

    const [shares] = await pool.execute(
      `SELECT p.id, p.content, p.created_at, p.shared_post_id,
       op.content AS original_content, op.image_url AS original_image_url, op.images AS original_images,
       ob.business_name AS original_business_name, ob.slug AS original_business_slug
       FROM posts p
       LEFT JOIN posts op ON p.shared_post_id = op.id
       LEFT JOIN businesses ob ON op.author_business_id = ob.id
       WHERE p.author_user_id = ? AND p.post_type = 'share' AND p.status = 'published'
       ORDER BY p.created_at DESC LIMIT 20`,
      [userId]
    );

    const [comments] = await pool.execute(
      `SELECT c.id, c.content, c.created_at, b.business_name, b.slug AS business_slug
       FROM comments c
       JOIN posts p ON c.post_id = p.id
       JOIN businesses b ON p.author_business_id = b.id
       WHERE c.commenter_user_id = ? AND c.status = 'visible'
       ORDER BY c.created_at DESC LIMIT 20`,
      [userId]
    );

    const [following] = await pool.execute(
      `SELECT b.id, b.business_name, b.slug, b.logo_url, c.name AS category_name
       FROM follows f
       JOIN businesses b ON f.following_business_id = b.id
       LEFT JOIN categories c ON b.category_id = c.id
       WHERE f.follower_user_id = ?
       ORDER BY f.created_at DESC`,
      [userId]
    );

    return res.json({ success: true, user: users[0], shares, comments, following });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/profile/update
router.put("/update", async (req, res) => {
  const pool = req.app.locals.pool;
  const session = await requireAuth(pool, req, res);
  if (!session) return;

  const { first_name, last_name, bio, avatar_url, cover_url } = req.body;

  if (!first_name || !last_name) {
    return res.status(400).json({ success: false, error: "First name and last name are required." });
  }

  try {
    await pool.execute(
      "UPDATE users SET first_name = ?, last_name = ?, bio = ?, avatar_url = ?, cover_url = ? WHERE id = ?",
      [first_name, last_name, bio || null, avatar_url || null, cover_url || null, session.user_id]
    );

    return res.json({
      success: true,
      user: {
        id: session.user_id,
        first_name,
        last_name,
        bio: bio || null,
        avatar_url: avatar_url || null,
        cover_url: cover_url || null
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
