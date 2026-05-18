require("dotenv").config();

const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
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
