// routes/business.js
// register, get, update, follow

const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { getSession, requireAuth } = require("../middleware/auth");

function generateToken() {
  return crypto.randomBytes(48).toString("hex");
}

// POST /api/business/register
router.post("/register", async (req, res) => {
  const pool = req.app.locals.pool;
  const connection = await pool.getConnection();
  try {
    const {
      owner_first_name, owner_last_name, owner_email, owner_password, owner_phone,
      business_name, slug, category_id, subcategory_id,
      short_description, country, city, business_email, business_phone
    } = req.body;

    if (!owner_first_name || !owner_last_name || !owner_email || !owner_password ||
        !business_name || !slug || !category_id || !short_description || !country || !city) {
      return res.status(400).json({ success: false, error: "Required fields are missing." });
    }

    await connection.beginTransaction();

    const [existingUser] = await connection.execute(
      "SELECT id FROM users WHERE email = ? LIMIT 1", [owner_email]
    );
    if (existingUser.length > 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, error: "This email is already registered." });
    }

    const [existingSlug] = await connection.execute(
      "SELECT id FROM businesses WHERE slug = ? LIMIT 1", [slug]
    );
    if (existingSlug.length > 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, error: "This business slug already exists." });
    }

    const [userResult] = await connection.execute(
      "INSERT INTO users (first_name, last_name, email, password_hash, phone, role, status) VALUES (?, ?, ?, ?, ?, 'business_owner', 'active')",
      [owner_first_name, owner_last_name, owner_email, owner_password, owner_phone || null]
    );
    const ownerUserId = userResult.insertId;

    const [businessResult] = await connection.execute(
      "INSERT INTO businesses (owner_user_id, business_name, slug, category_id, subcategory_id, short_description, business_email, business_phone, country, city, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')",
      [ownerUserId, business_name, slug, Number(category_id), subcategory_id ? Number(subcategory_id) : null, short_description, business_email || null, business_phone || null, country, city]
    );

    const token = generateToken();
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await connection.execute(
      "INSERT INTO sessions (token, user_type, user_id, business_id, expires_at) VALUES (?, 'business', ?, ?, ?)",
      [token, ownerUserId, businessResult.insertId, expires]
    );

    await connection.commit();
    return res.json({
      success: true,
      message: "Business page created successfully.",
      token,
      user_id: ownerUserId,
      business_id: businessResult.insertId,
      slug
    });
  } catch (error) {
    await connection.rollback();
    return res.status(500).json({ success: false, error: error.message });
  } finally {
    connection.release();
  }
});

// GET /api/business/:slug
router.get("/:slug", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { slug } = req.params;
    const session = await getSession(pool, req);
    const [rows] = await pool.execute(
      `SELECT b.id, b.business_name, b.slug, b.business_type, b.short_description,
       b.business_email, b.business_phone, b.country, b.city,
       b.logo_url, b.cover_url, b.website,
       b.instagram_url, b.facebook_url, b.linkedin_url, b.twitter_url, b.youtube_url, b.tiktok_url,
       b.created_at, c.name AS category_name,
       (SELECT COUNT(*) FROM follows WHERE following_business_id = b.id) AS follower_count
       FROM businesses b
       LEFT JOIN categories c ON b.category_id = c.id
       WHERE b.slug = ? LIMIT 1`,
      [slug]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: "Business not found." });

    const business = rows[0];
    let is_following = false;

    if (session) {
      if (session.user_type === "individual") {
        const [f] = await pool.execute(
          "SELECT id FROM follows WHERE follower_user_id = ? AND following_business_id = ? LIMIT 1",
          [session.user_id, business.id]
        );
        is_following = f.length > 0;
      } else if (session.user_type === "business" && session.business_id) {
        const [f] = await pool.execute(
          "SELECT id FROM follows WHERE follower_business_id = ? AND following_business_id = ? LIMIT 1",
          [session.business_id, business.id]
        );
        is_following = f.length > 0;
      }
    }

    return res.json({ success: true, business: { ...business, is_following } });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/business/:slug
router.put("/:slug", async (req, res) => {
  const pool = req.app.locals.pool;
  const session = await requireAuth(pool, req, res);
  if (!session) return;
  if (session.user_type !== "business") {
    return res.status(403).json({ success: false, error: "Only business accounts can edit profiles." });
  }

  const { slug } = req.params;
  const {
    business_name, short_description, business_email, business_phone,
    city, country, logo_url, cover_url, website,
    instagram_url, facebook_url, linkedin_url, twitter_url, youtube_url, tiktok_url
  } = req.body;

  try {
    const [businesses] = await pool.execute(
      "SELECT id, owner_user_id FROM businesses WHERE slug = ? LIMIT 1", [slug]
    );
    if (!businesses.length) return res.status(404).json({ success: false, error: "Business not found." });
    const biz = businesses[0];
    if (biz.owner_user_id !== session.user_id) {
      return res.status(403).json({ success: false, error: "Not authorized." });
    }

    const updates = [];
    const params = [];
    if (business_name) { updates.push("business_name = ?"); params.push(business_name); }
    if (short_description !== undefined) { updates.push("short_description = ?"); params.push(short_description); }
    if (business_email !== undefined) { updates.push("business_email = ?"); params.push(business_email || null); }
    if (business_phone !== undefined) { updates.push("business_phone = ?"); params.push(business_phone || null); }
    if (city !== undefined) { updates.push("city = ?"); params.push(city); }
    if (country !== undefined) { updates.push("country = ?"); params.push(country); }
    if (logo_url !== undefined) { updates.push("logo_url = ?"); params.push(logo_url || null); }
    if (cover_url !== undefined) { updates.push("cover_url = ?"); params.push(cover_url || null); }
    if (website !== undefined) { updates.push("website = ?"); params.push(website || null); }
    if (instagram_url !== undefined) { updates.push("instagram_url = ?"); params.push(instagram_url || null); }
    if (facebook_url !== undefined) { updates.push("facebook_url = ?"); params.push(facebook_url || null); }
    if (linkedin_url !== undefined) { updates.push("linkedin_url = ?"); params.push(linkedin_url || null); }
    if (twitter_url !== undefined) { updates.push("twitter_url = ?"); params.push(twitter_url || null); }
    if (youtube_url !== undefined) { updates.push("youtube_url = ?"); params.push(youtube_url || null); }
    if (tiktok_url !== undefined) { updates.push("tiktok_url = ?"); params.push(tiktok_url || null); }

    if (updates.length === 0) return res.status(400).json({ success: false, error: "Nothing to update." });

    params.push(biz.id);
    await pool.execute(`UPDATE businesses SET ${updates.join(", ")} WHERE id = ?`, params);
    const [updated] = await pool.execute(
      "SELECT b.*, c.name AS category_name FROM businesses b LEFT JOIN categories c ON b.category_id = c.id WHERE b.id = ?",
      [biz.id]
    );
    return res.json({ success: true, business: updated[0] });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/business/:slug/follow
router.post("/:slug/follow", async (req, res) => {
  const pool = req.app.locals.pool;
  const session = await requireAuth(pool, req, res);
  if (!session) return;
  try {
    const [businesses] = await pool.execute(
      "SELECT id FROM businesses WHERE slug = ? LIMIT 1", [req.params.slug]
    );
    if (!businesses.length) return res.status(404).json({ success: false, error: "Business not found." });
    const businessId = businesses[0].id;

    if (session.user_type === "individual") {
      const [existing] = await pool.execute(
        "SELECT id FROM follows WHERE follower_user_id = ? AND following_business_id = ? LIMIT 1",
        [session.user_id, businessId]
      );
      if (existing.length > 0) {
        await pool.execute("DELETE FROM follows WHERE id = ?", [existing[0].id]);
        return res.json({ success: true, following: false });
      }
      await pool.execute(
        "INSERT INTO follows (follower_type, follower_user_id, following_business_id) VALUES ('individual', ?, ?)",
        [session.user_id, businessId]
      );
      await pool.execute(
        "INSERT INTO notifications (recipient_type, recipient_business_id, type, actor_type, actor_user_id) VALUES ('business', ?, 'follow', 'individual', ?)",
        [businessId, session.user_id]
      );
      return res.json({ success: true, following: true });
    } else {
      if (session.business_id === businessId) {
        return res.status(400).json({ success: false, error: "Cannot follow yourself." });
      }
      const [existing] = await pool.execute(
        "SELECT id FROM follows WHERE follower_business_id = ? AND following_business_id = ? LIMIT 1",
        [session.business_id, businessId]
      );
      if (existing.length > 0) {
        await pool.execute("DELETE FROM follows WHERE id = ?", [existing[0].id]);
        return res.json({ success: true, following: false });
      }
      await pool.execute(
        "INSERT INTO follows (follower_type, follower_business_id, following_business_id) VALUES ('business', ?, ?)",
        [session.business_id, businessId]
      );
      return res.json({ success: true, following: true });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/business/:slug/posts
router.get("/:slug/posts", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { slug } = req.params;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 20;
    const offset = (page - 1) * limit;

    const [businesses] = await pool.execute(
      "SELECT id FROM businesses WHERE slug = ? LIMIT 1", [slug]
    );
    if (!businesses.length) return res.status(404).json({ success: false, error: "Business not found." });
    const businessId = businesses[0].id;

    const session = await getSession(pool, req);
    let isLikedExpr = "0";
    if (session && session.user_type === "individual") {
      isLikedExpr = `(SELECT COUNT(*) FROM likes WHERE post_id = p.id AND liker_user_id = ${session.user_id})`;
    } else if (session && session.user_type === "business" && session.business_id) {
      isLikedExpr = `(SELECT COUNT(*) FROM likes WHERE post_id = p.id AND liker_business_id = ${session.business_id})`;
    }

    const [posts] = await pool.query(
      `SELECT p.id, p.author_type, p.post_type, p.content, p.image_url, p.images, p.shared_post_id, p.created_at,
       b.business_name, b.slug AS business_slug, b.logo_url,
       (SELECT COUNT(*) FROM likes WHERE post_id = p.id) AS like_count,
       (SELECT COUNT(*) FROM comments WHERE post_id = p.id AND status = 'visible') AS comment_count,
       (SELECT COUNT(*) FROM posts p2 WHERE p2.shared_post_id = p.id) AS share_count,
       ${isLikedExpr} AS is_liked
       FROM posts p
       LEFT JOIN businesses b ON p.author_business_id = b.id
       WHERE p.author_business_id = ${businessId} AND p.status = 'published'
       ORDER BY p.created_at DESC LIMIT ${limit} OFFSET ${offset}`
    );

    const [taggedPosts] = await pool.execute(
      `SELECT p.id, p.content, p.created_at, b.business_name, b.slug AS business_slug
       FROM post_tags pt
       JOIN posts p ON pt.post_id = p.id
       JOIN businesses b ON p.author_business_id = b.id
       WHERE pt.business_id = ? AND p.status = 'published'
       ORDER BY p.created_at DESC LIMIT 10`,
      [businessId]
    );

    const sharedIds = posts.filter(p => p.shared_post_id).map(p => p.shared_post_id);
    let sharedPosts = {};
    if (sharedIds.length > 0) {
      const placeholders = sharedIds.map(() => "?").join(",");
      const [originals] = await pool.execute(
        `SELECT p.id, p.content, p.image_url, p.images, b.business_name, b.slug AS business_slug
         FROM posts p LEFT JOIN businesses b ON p.author_business_id = b.id
         WHERE p.id IN (${placeholders})`,
        sharedIds
      );
      originals.forEach(o => { sharedPosts[o.id] = o; });
    }

    return res.json({
      success: true,
      posts: posts.map(p => ({ ...p, is_liked: Number(p.is_liked) > 0, original_post: p.shared_post_id ? sharedPosts[p.shared_post_id] || null : null })),
      tagged_posts: taggedPosts,
      page,
      has_more: posts.length === limit
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
