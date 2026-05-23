// migration_messages.js
const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
  console.log("Connecting to Database for Messages Migration:", process.env.DB_HOST);
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306)
  });

  try {
    console.log("Creating messages table if not exists...");
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS messages (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        sender_type VARCHAR(20) NOT NULL, -- 'individual' or 'business'
        sender_user_id INT UNSIGNED NULL,
        sender_business_id INT UNSIGNED NULL,
        recipient_type VARCHAR(20) NOT NULL, -- 'individual' or 'business'
        recipient_user_id INT UNSIGNED NULL,
        recipient_business_id INT UNSIGNED NULL,
        message TEXT NOT NULL,
        is_read TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (sender_business_id) REFERENCES businesses(id) ON DELETE SET NULL,
        FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (recipient_business_id) REFERENCES businesses(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log("Adding indexes to messages table for high-performance messaging...");
    try { await connection.execute("CREATE INDEX idx_sender_user ON messages(sender_user_id)"); } catch(e){}
    try { await connection.execute("CREATE INDEX idx_sender_biz ON messages(sender_business_id)"); } catch(e){}
    try { await connection.execute("CREATE INDEX idx_recipient_user ON messages(recipient_user_id)"); } catch(e){}
    try { await connection.execute("CREATE INDEX idx_recipient_biz ON messages(recipient_business_id)"); } catch(e){}

    console.log("Messages migration completed successfully!");
  } catch (error) {
    console.error("Messages migration failed:", error);
  } finally {
    await connection.end();
  }
}

main();
