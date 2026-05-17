// routes/feed.js
// Ana feed endpoint

const express = require("express");
const router = express.Router();
const { getSession } = require("../middleware/auth");

// GET /api/feed
router.get("/", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const session = await getSession(pool, req);
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 20;
    const offset = (page - 1) * limit;
    const categorySlug = req.query.category || "";

    let categoryFilter = "";
    let categoryParams = [];
    if (categorySlug) {
      categoryFilter = " AND b.category_id = (SELECT id FROM categories WHERE slug = ? LIMIT 1)";
      categoryParams = [categorySlug];
    }

    const baseSelect = `
      SELECT p.id, p.author_type, p.post_type, p.content, p.image_url, p.images, p.shared_post_id, p.created_at,
      b.id AS business_id, b.business_name, b.slug AS business_slug, b.logo_url,
      u.id AS user_id, u.first_name, u.last_name, u.avatar_url,
      (SELECT COUNT(*) FROM likes WHERE post_id = p.id) AS like_count,
      (SELECT COUNT(*) FROM comments WHERE post_id = p.id AND status = 'visible') AS comment_count,
      (SELECT COUNT(*) FROM posts p2 WHERE p2.shared_post_id = p.id AND p2.post_type = 'share') AS share_count,
    `;

    const baseFrom = `
      FROM posts p
      LEFT JOIN businesses b ON p.author_business_id = b.id
      LEFT JOIN users u ON p.author_user_id = u.id
      WHERE p.status = 'published'${categoryFilter}
      ORDER BY p.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    let posts;

    if (session && session.user_type === "individual") {
      [posts] = await pool.query(
        baseSelect +
        `(SELECT COUNT(*) FROM likes WHERE post_id = p.id AND liker_user_id = ${session.user_id}) AS is_liked` +
        baseFrom,
        [...categoryParams]
      );
    } else if (session && session.user_type === "business" && session.business_id) {
      [posts] = await pool.query(
        baseSelect +
        `(SELECT COUNT(*) FROM likes WHERE post_id = p.id AND liker_business_id = ${session.business_id}) AS is_liked` +
        baseFrom,
        [...categoryParams]
      );
    } else {
      [posts] = await pool.query(
        baseSelect + `0 AS is_liked` + baseFrom
      );
    }

    // Shared post'ların orijinallerini getir
    const sharedIds = posts.filter(p => p.shared_post_id).map(p => p.shared_post_id);
    let sharedPosts = {};
    if (sharedIds.length > 0) {
      const placeholders = sharedIds.map(() => "?").join(",");
      const [originals] = await pool.execute(
        `SELECT p.id, p.content, p.image_url, p.created_at, b.business_name, b.slug AS business_slug
         FROM posts p LEFT JOIN businesses b ON p.author_business_id = b.id
         WHERE p.id IN (${placeholders})`,
        sharedIds
      );
      originals.forEach(o => { sharedPosts[o.id] = o; });
    }

    const enriched = posts.map(p => ({
      ...p,
      is_liked: Number(p.is_liked) > 0,
      original_post: p.shared_post_id ? sharedPosts[p.shared_post_id] || null : null
    }));

    return res.json({ success: true, posts: enriched, page, has_more: posts.length === limit });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
