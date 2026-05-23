require("dotenv").config();

const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    callback(null, true);
  },
  credentials: true
}));
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
app.use(require("./middleware/seo"));
app.use(express.static(path.join(__dirname, "..", "frontend")));

// Database pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: { rejectUnauthorized: false }
});

// Pool'u tüm route'ların erişebileceği şekilde paylaş
app.locals.pool = pool;

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/categories", require("./routes/categories"));
app.use("/api/auth", require("./routes/password-reset"));
app.use("/api/subcategories", require("./routes/categories")); // subcategories aynı dosyada
app.use("/api/business", require("./routes/business"));
app.use("/api/posts", require("./routes/posts"));
app.use("/api/feed", require("./routes/feed"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/search", require("./routes/search"));
app.use("/api/profile", require("./routes/profile"));
app.use("/api/upload", require("./routes/upload"));
// Pretty URL route for business profiles
app.get("/b/:slug", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "business.html"));
});

// Dynamic XML Sitemap for SEO search indexing
app.get("/sitemap.xml", async (req, res) => {
  try {
    const [businesses] = await pool.query("SELECT slug, updated_at FROM businesses WHERE status = 'published'");
    const [categories] = await pool.query("SELECT slug FROM categories WHERE status = 'active'");
    
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Main Pages -->
  <url>
    <loc>https://diwanet.com/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://diwanet.com/categories.html</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://diwanet.com/feed.html</loc>
    <changefreq>always</changefreq>
    <priority>0.7</priority>
  </url>
`;

    // Categories sitemaps
    categories.forEach(c => {
      xml += `  <url>
    <loc>https://diwanet.com/categories.html?cat=${c.slug}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>
`;
    });

    // Business profiles sitemaps (using modern Pretty URL structure)
    businesses.forEach(b => {
      const date = b.updated_at ? new Date(b.updated_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
      xml += `  <url>
    <loc>https://diwanet.com/b/${b.slug}</loc>
    <lastmod>${date}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
`;
    });

    xml += `</urlset>`;
    res.header("Content-Type", "application/xml");
    res.status(200).send(xml);
  } catch (error) {
    console.error("Sitemap generation error:", error.message);
    res.status(500).send("Error generating sitemap");
  }
});

// Health check
app.get("/api/health", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS ok");
    res.json({ success: true, db: rows[0].ok === 1 });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/", (req, res) => {
  res.send("Diwanet backend is running.");
});

app.listen(PORT, () => {
  console.log(`Diwanet server running on port ${PORT}`);
});
