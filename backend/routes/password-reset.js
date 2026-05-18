const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

const ses = new SESClient({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// POST /api/auth/forgot-password
router.post("/forgot-password", async (req, res) => {
  const pool = req.app.locals.pool;
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, error: "Email is required." });
  try {
    const [users] = await pool.execute("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
    if (users.length === 0) {
      return res.json({ success: true, message: "If this email exists, a reset link has been sent." });
    }
    const userId = users[0].id;
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await pool.execute(
      "INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)",
      [userId, token, expiresAt]
    );
    const resetLink = `https://diwanet.com/reset-password.html?token=${token}`;
    await ses.send(new SendEmailCommand({
      Source: "noreply@diwanet.com",
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: "Reset your Diwanet password" },
        Body: {
          Html: {
            Data: `
              <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;">
                <h2 style="color:#14213d;">Reset your password</h2>
                <p>You requested a password reset for your Diwanet account.</p>
                <p>Click the button below to set a new password. This link expires in 1 hour.</p>
                <a href="${resetLink}" style="display:inline-block;margin:20px 0;padding:12px 24px;background:#2563eb;color:white;border-radius:999px;text-decoration:none;font-weight:700;">Reset Password</a>
                <p style="color:#718096;font-size:0.85rem;">If you didn't request this, you can safely ignore this email.</p>
              </div>
            `
          }
        }
      }
    }));
    return res.json({ success: true, message: "If this email exists, a reset link has been sent." });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/auth/reset-password
router.post("/reset-password", async (req, res) => {
  const pool = req.app.locals.pool;
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ success: false, error: "Token and password are required." });
  if (password.length < 6) return res.status(400).json({ success: false, error: "Password must be at least 6 characters." });
  try {
    const [tokens] = await pool.execute(
      "SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0 AND expires_at > NOW() LIMIT 1",
      [token]
    );
    if (tokens.length === 0) {
      return res.status(400).json({ success: false, error: "Invalid or expired reset link." });
    }
    const userId = tokens[0].id;
    await pool.execute("UPDATE users SET password_hash = ? WHERE id = ?", [password, tokens[0].user_id]);
    await pool.execute("UPDATE password_reset_tokens SET used = 1 WHERE id = ?", [userId]);
    return res.json({ success: true, message: "Password updated successfully." });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
