// migration.js
const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
  console.log("Connecting to Database for Migration:", process.env.DB_HOST);
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306)
  });

  try {
    // 1. Alter businesses table to add cta_btn_text and cta_btn_url
    console.log("Checking businesses table columns...");
    const [cols] = await connection.execute("SHOW COLUMNS FROM businesses");
    const colNames = cols.map(c => c.Field);

    if (!colNames.includes('cta_btn_text')) {
      console.log("Adding cta_btn_text column to businesses...");
      await connection.execute("ALTER TABLE businesses ADD COLUMN cta_btn_text VARCHAR(50) NULL");
    }
    if (!colNames.includes('cta_btn_url')) {
      console.log("Adding cta_btn_url column to businesses...");
      await connection.execute("ALTER TABLE businesses ADD COLUMN cta_btn_url VARCHAR(255) NULL");
    }

    // 2. Create business_services table
    console.log("Creating business_services table if not exists...");
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS business_services (
        id INT AUTO_INCREMENT PRIMARY KEY,
        business_id INT UNSIGNED NOT NULL,
        title VARCHAR(100) NOT NULL,
        description TEXT NULL,
        price VARCHAR(50) NULL,
        image_url VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log("Migration completed successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await connection.end();
  }
}

main();
