// routes/posts.js
const express = require("express");
const router = express.Router();
const { requireAuth, getSession } = require("../middleware/auth");

// GET /api/posts?slug=...
router.get("/", async (req, res) => {
  const pool = req.app.locals.pool;
  const slug = req.query.slug || null;
  const limit = parseInt(req.query.limit) || 20;
  try {
    let rows;
    if (slug) {
      [rows] = await pool.execute(
        `SELECT p.id, p.content, p.image_url, p.images, p.created_at,
         b.business_name, b.slug, b.logo_url,
         (SELECT COUNT(*) FROM likes WHERE post_id = p.id) AS like_count,
         (SELECT COUNT(*) FROM comments WHERE post_id = p.id AND status = 'visible') AS comment_count
         FROM posts p
         JOIN businesses b ON p.author_business_id = b.id
         WHERE b.slug = ? AND p.status = 'published'
         ORDER BY p.created_at DESC LIMIT ${limit}`,
        [slug]
      );
    } else {
      [rows] = await pool.execute(
        `SELECT p.id, p.content, p.image_url, p.images, p.created_at,
         b.business_name, b.slug, b.logo_url,
         (SELECT COUNT(*) FROM likes WHERE post_id = p.id) AS like_count,
         (SELECT COUNT(*) FROM comments WHERE post_id = p.id AND status = 'visible') AS comment_count
         FROM posts p
         JOIN businesses b ON p.author_business_id = b.id
         WHERE p.status = 'published'
         ORDER BY p.created_at DESC LIMIT ${limit}`
      );
    }
    const enriched = rows.map(p => ({
      ...p,
      media_urls: p.images ? JSON.parse(p.images) : (p.image_url ? [p.image_url] : [])
    }));
    return res.json({ success: true, posts: enriched });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/posts
router.post("/", async (req, res) => {
  const pool = req.app.locals.pool;
  const session = await requireAuth(pool, req, res);
  if (!session) return;

  const { content, image_url, images } = req.body;
  if (!content || content.trim().length === 0) {
    return res.status(400).json({ success: false, error: "Content is required." });
  }

  // Parse tagged business slugs from content
  let taggedSlugs = [];
  const matches = content.match(/@([a-zA-Z0-9-_]+)/g);
  if (matches) {
    taggedSlugs = matches.map(m => m.substring(1));
  }

  if (session.user_type === "individual") {
    if (taggedSlugs.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Individual members can only create posts that tag a business using @business-slug (e.g. @nora-agents)."
      });
    }
    
    // Verify at least one tagged slug belongs to a valid business
    const [bizRows] = await pool.query(
      "SELECT id, slug, business_name FROM businesses WHERE slug IN (?)",
      [taggedSlugs]
    );
    if (bizRows.length === 0) {
      return res.status(400).json({
        success: false,
        error: "The tagged business does not exist. Please tag a valid business slug."
      });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute(
        "INSERT INTO posts (author_type, author_user_id, post_type, content, image_url, images, status) VALUES ('individual', ?, 'post', ?, ?, ?, 'published')",
        [session.user_id, content.trim(), image_url || null, images ? JSON.stringify(images) : null]
      );
      const postId = result.insertId;

      // Add tags
      for (const biz of bizRows) {
        await connection.execute(
          "INSERT IGNORE INTO post_tags (post_id, business_id) VALUES (?, ?)",
          [postId, biz.id]
        );
      }

      await connection.commit();
      const [posts] = await pool.execute(
        `SELECT p.*, u.first_name, u.last_name, u.avatar_url 
         FROM posts p 
         JOIN users u ON p.author_user_id = u.id 
         WHERE p.id = ?`,
        [postId]
      );
      return res.json({ success: true, post: posts[0] });
    } catch (error) {
      await connection.rollback();
      return res.status(500).json({ success: false, error: error.message });
    } finally {
      connection.release();
    }
  } else {
    // Business account flow
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute(
        "INSERT INTO posts (author_type, author_business_id, post_type, content, image_url, images, status) VALUES ('business', ?, 'post', ?, ?, ?, 'published')",
        [session.business_id, content.trim(), image_url || null, images ? JSON.stringify(images) : null]
      );
      const postId = result.insertId;

      const businessTags = req.body.tagged_businesses || taggedSlugs;
      if (businessTags && businessTags.length > 0) {
        for (const bSlug of businessTags) {
          const [bRows] = await connection.execute("SELECT id FROM businesses WHERE slug = ? LIMIT 1", [bSlug]);
          if (bRows.length > 0) {
            await connection.execute("INSERT IGNORE INTO post_tags (post_id, business_id) VALUES (?, ?)", [postId, bRows[0].id]);
          }
        }
      }

      await connection.commit();
      const [posts] = await pool.execute(
        `SELECT p.*, b.business_name, b.slug AS business_slug, b.logo_url 
         FROM posts p 
         JOIN businesses b ON p.author_business_id = b.id 
         WHERE p.id = ?`,
        [postId]
      );
      return res.json({ success: true, post: posts[0] });
    } catch (error) {
      await connection.rollback();
      return res.status(500).json({ success: false, error: error.message });
    } finally {
      connection.release();
    }
  }
});

// DELETE /api/posts/:id
router.delete("/:id", async (req, res) => {
  const pool = req.app.locals.pool;
  const session = await requireAuth(pool, req, res);
  if (!session) return;
  try {
    const [posts] = await pool.execute("SELECT author_business_id, author_user_id, author_type FROM posts WHERE id = ? LIMIT 1", [req.params.id]);
    if (!posts.length) return res.status(404).json({ success: false, error: "Post not found." });
    const p = posts[0];
    const isOwner = (session.user_type === "business" && p.author_business_id === session.business_id) ||
                    (session.user_type === "individual" && p.author_user_id === session.user_id);
    if (!isOwner) {
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
    const [posts] = await pool.execute("SELECT author_business_id, author_user_id, author_type FROM posts WHERE id = ? LIMIT 1", [req.params.id]);
    if (!posts.length) return res.status(404).json({ success: false, error: "Post not found." });
    const p = posts[0];
    const isOwner = (session.user_type === "business" && p.author_business_id === session.business_id) ||
                    (session.user_type === "individual" && p.author_user_id === session.user_id);
    if (!isOwner) {
      return res.status(403).json({ success: false, error: "Not authorized." });
    }
    await pool.execute("UPDATE posts SET content = ? WHERE id = ?", [content.trim(), req.params.id]);
    return res.json({ success: true });
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
      [existing] = await pool.execute("SELECT id FROM likes WHERE post_id = ? AND liker_user_id = ? LIMIT 1", [postId, session.user_id]);
    } else {
      [existing] = await pool.execute("SELECT id FROM likes WHERE post_id = ? AND liker_business_id = ? LIMIT 1", [postId, session.business_id]);
    }
    if (existing.length > 0) {
      await pool.execute("DELETE FROM likes WHERE id = ?", [existing[0].id]);
      const [[{ cnt }]] = await pool.execute("SELECT COUNT(*) AS cnt FROM likes WHERE post_id = ?", [postId]);
      return res.json({ success: true, liked: false, like_count: Number(cnt) });
    } else {
      if (session.user_type === "individual") {
        await pool.execute("INSERT INTO likes (post_id, liker_type, liker_user_id) VALUES (?, 'individual', ?)", [postId, session.user_id]);
      } else {
        await pool.execute("INSERT INTO likes (post_id, liker_type, liker_business_id) VALUES (?, 'business', ?)", [postId, session.business_id]);
      }
      const [[{ cnt }]] = await pool.execute("SELECT COUNT(*) AS cnt FROM likes WHERE post_id = ?", [postId]);
      return res.json({ success: true, liked: true, like_count: Number(cnt) });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/posts/:id/like
router.delete("/:id/like", async (req, res) => {
  const pool = req.app.locals.pool;
  const session = await requireAuth(pool, req, res);
  if (!session) return;
  const postId = Number(req.params.id);
  try {
    if (session.user_type === "individual") {
      await pool.execute("DELETE FROM likes WHERE post_id = ? AND liker_user_id = ?", [postId, session.user_id]);
    } else {
      await pool.execute("DELETE FROM likes WHERE post_id = ? AND liker_business_id = ?", [postId, session.business_id]);
    }
    const [[{ cnt }]] = await pool.execute("SELECT COUNT(*) AS cnt FROM likes WHERE post_id = ?", [postId]);
    return res.json({ success: true, like_count: Number(cnt) });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/posts/:id/comments
router.get("/:id/comments", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const postId = Number(req.params.id);
    const session = await getSession(pool, req);
    const likerUserId = (session && session.user_type === "individual") ? session.user_id : -1;
    const likerBusinessId = (session && session.user_type === "business") ? session.business_id : -1;

    const [comments] = await pool.execute(
      `SELECT c.id, c.commenter_type, c.content, c.created_at, c.commenter_business_id,
       b.business_name, b.slug AS business_slug, b.logo_url,
       u.first_name, u.last_name, u.avatar_url, u.id AS commenter_user_id,
       (SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id) AS like_count,
       (SELECT COUNT(*) FROM comment_likes 
        WHERE comment_id = c.id 
          AND (
            (liker_type = 'individual' AND liker_user_id = ?) 
            OR 
            (liker_type = 'business' AND liker_business_id = ?)
          )
       ) AS is_liked
       FROM comments c
       LEFT JOIN businesses b ON c.commenter_business_id = b.id
       LEFT JOIN users u ON c.commenter_user_id = u.id
       WHERE c.post_id = ? AND c.status = 'visible'
       ORDER BY c.created_at ASC`,
      [likerUserId, likerBusinessId, postId]
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
      "INSERT INTO posts (author_type, author_business_id, author_user_id, post_type, shared_post_id, content, status) VALUES (?, ?, ?, 'share', ?, ?, 'published')",
      [authorType, bizId, userId, postId, content || ""]
    );
    return res.json({ success: true, share_id: result.insertId });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/posts/:postId/comments/:commentId
router.delete("/:postId/comments/:commentId", async (req, res) => {
  const pool = req.app.locals.pool;
  const session = await requireAuth(pool, req, res);
  if (!session) return;
  try {
    const [comments] = await pool.execute(
      "SELECT id, commenter_type, commenter_business_id, commenter_user_id FROM comments WHERE id = ? LIMIT 1",
      [req.params.commentId]
    );
    if (!comments.length) return res.status(404).json({ success: false, error: "Comment not found." });
    const c = comments[0];
    const isOwner = (session.user_type === "business" && c.commenter_business_id === session.business_id) ||
                    (session.user_type === "individual" && c.commenter_user_id === session.user_id);
    if (!isOwner) return res.status(403).json({ success: false, error: "Not authorized." });
    await pool.execute("DELETE FROM comments WHERE id = ?", [req.params.commentId]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/posts/:postId/comments/:commentId
router.put("/:postId/comments/:commentId", async (req, res) => {
  const pool = req.app.locals.pool;
  const session = await requireAuth(pool, req, res);
  if (!session) return;
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ success: false, error: "Content required." });
  try {
    const [comments] = await pool.execute(
      "SELECT id, commenter_business_id, commenter_user_id FROM comments WHERE id = ? LIMIT 1",
      [req.params.commentId]
    );
    if (!comments.length) return res.status(404).json({ success: false, error: "Comment not found." });
    const c = comments[0];
    const isOwner = (session.user_type === "business" && c.commenter_business_id === session.business_id) ||
                    (session.user_type === "individual" && c.commenter_user_id === session.user_id);
    if (!isOwner) return res.status(403).json({ success: false, error: "Not authorized." });
    await pool.execute("UPDATE comments SET content = ? WHERE id = ?", [content.trim(), req.params.commentId]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/posts/:postId/comments/:commentId/like
router.post("/:postId/comments/:commentId/like", async (req, res) => {
  const pool = req.app.locals.pool;
  const session = await requireAuth(pool, req, res);
  if (!session) return;
  const commentId = Number(req.params.commentId);
  try {
    const [comments] = await pool.execute("SELECT id FROM comments WHERE id = ? LIMIT 1", [commentId]);
    if (!comments.length) return res.status(404).json({ success: false, error: "Comment not found." });
    let existing;
    if (session.user_type === "individual") {
      [existing] = await pool.execute("SELECT id FROM comment_likes WHERE comment_id = ? AND liker_user_id = ? LIMIT 1", [commentId, session.user_id]);
    } else {
      [existing] = await pool.execute("SELECT id FROM comment_likes WHERE comment_id = ? AND liker_business_id = ? LIMIT 1", [commentId, session.business_id]);
    }
    if (existing.length > 0) {
      await pool.execute("DELETE FROM comment_likes WHERE id = ?", [existing[0].id]);
      const [[{ cnt }]] = await pool.execute("SELECT COUNT(*) AS cnt FROM comment_likes WHERE comment_id = ?", [commentId]);
      return res.json({ success: true, liked: false, like_count: Number(cnt) });
    } else {
      if (session.user_type === "individual") {
        await pool.execute("INSERT INTO comment_likes (comment_id, liker_type, liker_user_id) VALUES (?, 'individual', ?)", [commentId, session.user_id]);
      } else {
        await pool.execute("INSERT INTO comment_likes (comment_id, liker_type, liker_business_id) VALUES (?, 'business', ?)", [commentId, session.business_id]);
      }
      const [[{ cnt }]] = await pool.execute("SELECT COUNT(*) AS cnt FROM comment_likes WHERE comment_id = ?", [commentId]);
      return res.json({ success: true, liked: true, like_count: Number(cnt) });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/posts/:postId/comments/:commentId/like
router.delete("/:postId/comments/:commentId/like", async (req, res) => {
  const pool = req.app.locals.pool;
  const session = await requireAuth(pool, req, res);
  if (!session) return;
  const commentId = Number(req.params.commentId);
  try {
    if (session.user_type === "individual") {
      await pool.execute("DELETE FROM comment_likes WHERE comment_id = ? AND liker_user_id = ?", [commentId, session.user_id]);
    } else {
      await pool.execute("DELETE FROM comment_likes WHERE comment_id = ? AND liker_business_id = ?", [commentId, session.business_id]);
    }
    const [[{ cnt }]] = await pool.execute("SELECT COUNT(*) AS cnt FROM comment_likes WHERE comment_id = ?", [commentId]);
    return res.json({ success: true, like_count: Number(cnt) });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
