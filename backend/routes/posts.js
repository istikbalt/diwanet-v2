// routes/posts.js
// create, delete, edit, like, comments, share

const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");

// POST /api/posts
router.post("/", async (req, res) => {
  const pool = req.app.locals.pool;
  const session = await requireAuth(pool, req, res);
  if (!session) return;
  if (session.user_type !== "business") {
    return res.status(403).json({ success: false, error: "Only businesses can create posts." });
  }

  const { content, image_url, images, tagged_businesses } = req.body;
  if (!content || content.trim().length === 0) {
    return res.status(400).json({ success: false, error: "Content is required." });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      "INSERT INTO posts (author_type, author_business_id, post_type, content, image_url, images) VALUES ('business', ?, 'post', ?, ?, ?)",
      [session.business_id, content.trim(), image_url || null, images ? JSON.stringify(images) : null]
    );
    const postId = result.insertId;

    if (tagged_businesses && Array.isArray(tagged_businesses)) {
      for (const bSlug of tagged_businesses) {
        const [bRows] = await connection.execute(
          "SELECT id FROM businesses WHERE slug = ? LIMIT 1", [bSlug]
        );
        if (bRows.length > 0) {
          await connection.execute(
            "INSERT IGNORE INTO post_tags (post_id, business_id) VALUES (?, ?)",
            [postId, bRows[0].id]
          );
        }
      }
    }

    await connection.commit();
    const [posts] = await pool.execute(
      "SELECT p.*, b.business_name, b.slug AS business_slug, b.logo_url FROM posts p JOIN businesses b ON p.author_business_id = b.id WHERE p.id = ?",
      [postId]
    );
    return res.json({ success: true, post: posts[0] });
  } catch (error) {
    await connection.rollback();
    return res.status(500).json({ success: false, error: error.message });
  } finally {
    connection.release();
  }
});

// DELETE /api/posts/:id
router.delete("/:id", async (req, res) => {
  const pool = req.app.locals.pool;
  const session = await requireAuth(pool, req, res);
  if (!session) return;
  try {
    const [posts] = await pool.execute(
      "SELECT author_business_id FROM posts WHERE id = ? LIMIT 1", [req.params.id]
    );
    if (!posts.length) return res.status(404).json({ success: false, error: "Post not found." });
    if (posts[0].author_business_id !== session.business_id) {
      return res.status(403).json({ success: false, error: "Not authorized." });
    }
    await pool.execute("DELETE FROM posts WHERE id = ?", [req.params.id]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/posts/:id
router.put("/:id", async (req, res) => {
  const pool = req.app.locals.pool;
  const session = await requireAuth(pool, req, res);
  if (!session) return;
  const { content } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ success: false, error: "Content required." });
  }
  try {
    const [posts] = await pool.execute(
      "SELECT author_business_id FROM posts WHERE id = ? LIMIT 1", [req.params.id]
    );
    if (!posts.length) return res.status(404).json({ success: false, error: "Post not found." });
    if (posts[0].author_business_id !== session.business_id) {
      return res.status(403).json({ success: false, error: "Not authorized." });
    }
    await pool.execute("UPDATE posts SET content = ? WHERE id = ?", [content.trim(), req.params.id]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/posts/:id/share
router.post("/:id/share", async (req, res) => {
  const pool = req.app.locals.pool;
  const session = await requireAuth(pool, req, res);
  if (!session) return;
  const { content } = req.body;
  const postId = Number(req.params.id);
  try {
    const [original] = await pool.execute(
      "SELECT id, author_business_id FROM posts WHERE id = ? AND status = 'published' LIMIT 1", [postId]
    );
    if (!original.length) return res.status(404).json({ success: false, error: "Post not found." });
    const authorType = session.user_type === "individual" ? "individual" : "business";
    const bizId = session.user_type === "business" ? session.business_id : null;
    const userId = session.user_type === "individual" ? session.user_id : null;
    const [result] = await pool.execute(
      "INSERT INTO posts (author_type, author_business_id, author_user_id, post_type, shared_post_id, content) VALUES (?, ?, ?, 'share', ?, ?)",
      [authorType, bizId, userId, postId, content || ""]
    );
    return res.json({ success: true, share_id: result.insertId });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/posts/:id/like
router.post("/:id/like", async (req, res) => {
  const pool = req.app.locals.pool;
  const session = await requireAuth(pool, req, res);
  if (!session) return;
  const postId = Number(req.params.id);
  try {
    const [posts] = await pool.execute("SELECT id FROM posts WHERE id = ? LIMIT 1", [postId]);
    if (!posts.length) return res.status(404).json({ success: false, error: "Post not found." });

    let existing;
    if (session.user_type === "individual") {
      [existing] = await pool.execute(
        "SELECT id FROM likes WHERE post_id = ? AND liker_user_id = ? LIMIT 1", [postId, session.user_id]
      );
    } else {
      [existing] = await pool.execute(
        "SELECT id FROM likes WHERE post_id = ? AND liker_business_id = ? LIMIT 1", [postId, session.business_id]
      );
    }

    if (existing.length > 0) {
      await pool.execute("DELETE FROM likes WHERE id = ?", [existing[0].id]);
      const [[{ cnt }]] = await pool.execute("SELECT COUNT(*) AS cnt FROM likes WHERE post_id = ?", [postId]);
      return res.json({ success: true, liked: false, like_count: Number(cnt) });
    } else {
      if (session.user_type === "individual") {
        await pool.execute(
          "INSERT INTO likes (post_id, liker_type, liker_user_id) VALUES (?, 'individual', ?)", [postId, session.user_id]
        );
      } else {
        await pool.execute(
          "INSERT INTO likes (post_id, liker_type, liker_business_id) VALUES (?, 'business', ?)", [postId, session.business_id]
        );
        const [postOwner] = await pool.execute("SELECT author_business_id FROM posts WHERE id = ?", [postId]);
        if (postOwner.length && postOwner[0].author_business_id !== session.business_id) {
          await pool.execute(
            "INSERT INTO notifications (recipient_type, recipient_business_id, type, post_id, actor_type, actor_business_id) VALUES ('business', ?, 'like', ?, 'business', ?)",
            [postOwner[0].author_business_id, postId, session.business_id]
          );
        }
      }
      const [[{ cnt }]] = await pool.execute("SELECT COUNT(*) AS cnt FROM likes WHERE post_id = ?", [postId]);
      return res.json({ success: true, liked: true, like_count: Number(cnt) });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/posts/:id/comments
router.get("/:id/comments", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const postId = Number(req.params.id);
    const [comments] = await pool.execute(
      `SELECT c.id, c.commenter_type, c.content, c.created_at,
       b.business_name, b.slug AS business_slug, b.logo_url,
       u.first_name, u.last_name, u.avatar_url, u.id AS commenter_user_id
       FROM comments c
       LEFT JOIN businesses b ON c.commenter_business_id = b.id
       LEFT JOIN users u ON c.commenter_user_id = u.id
       WHERE c.post_id = ? AND c.status = 'visible'
       ORDER BY c.created_at ASC`,
      [postId]
    );
    return res.json({ success: true, comments });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/posts/:id/comments
router.post("/:id/comments", async (req, res) => {
  const pool = req.app.locals.pool;
  const session = await requireAuth(pool, req, res);
  if (!session) return;
  const postId = Number(req.params.id);
  const { content } = req.body;
  if (!content || content.trim().length === 0) {
    return res.status(400).json({ success: false, error: "Comment cannot be empty." });
  }
  try {
    let result;
    if (session.user_type === "individual") {
      [result] = await pool.execute(
        "INSERT INTO comments (post_id, commenter_type, commenter_user_id, content) VALUES (?, 'individual', ?, ?)",
        [postId, session.user_id, content.trim()]
      );
    } else {
      [result] = await pool.execute(
        "INSERT INTO comments (post_id, commenter_type, commenter_business_id, content) VALUES (?, 'business', ?, ?)",
        [postId, session.business_id, content.trim()]
      );
    }
    const [comments] = await pool.execute(
      `SELECT c.id, c.commenter_type, c.content, c.created_at,
       b.business_name, b.slug AS business_slug,
       u.first_name, u.last_name, u.avatar_url, u.id AS commenter_user_id
       FROM comments c
       LEFT JOIN businesses b ON c.commenter_business_id = b.id
       LEFT JOIN users u ON c.commenter_user_id = u.id
       WHERE c.id = ?`,
      [result.insertId]
    );
    return res.json({ success: true, comment: comments[0] });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
