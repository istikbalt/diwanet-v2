// routes/messages.js
const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");

// Helper to get active identity from session
function getMyIdentity(session) {
  if (session.user_type === "business") {
    return { type: "business", id: session.business_id };
  } else {
    return { type: "individual", id: session.user_id };
  }
}

// GET /api/messages/conversations
router.get("/conversations", async (req, res) => {
  const pool = req.app.locals.pool;
  const session = await requireAuth(pool, req, res);
  if (!session) return;

  const identity = getMyIdentity(session);
  const myType = identity.type;
  const myId = identity.id;

  try {
    let query = "";
    let params = [];

    if (myType === "individual") {
      query = `
        SELECT * FROM messages 
        WHERE (sender_type = 'individual' AND sender_user_id = ?) 
           OR (recipient_type = 'individual' AND recipient_user_id = ?) 
        ORDER BY id DESC LIMIT 2000
      `;
      params = [myId, myId];
    } else { // business
      query = `
        SELECT * FROM messages 
        WHERE (sender_type = 'business' AND sender_business_id = ?) 
           OR (recipient_type = 'business' AND recipient_business_id = ?) 
        ORDER BY id DESC LIMIT 2000
      `;
      params = [myId, myId];
    }

    const [messages] = await pool.execute(query, params);

    // Group into conversations
    const conversationsMap = new Map();

    for (const msg of messages) {
      let otherType, otherId;
      let isSenderMe = false;

      if (myType === "individual") {
        if (msg.sender_type === "individual" && msg.sender_user_id === myId) {
          isSenderMe = true;
          otherType = msg.recipient_type;
          otherId = otherType === "business" ? msg.recipient_business_id : msg.recipient_user_id;
        } else {
          otherType = msg.sender_type;
          otherId = otherType === "business" ? msg.sender_business_id : msg.sender_user_id;
        }
      } else { // business
        if (msg.sender_type === "business" && msg.sender_business_id === myId) {
          isSenderMe = true;
          otherType = msg.recipient_type;
          otherId = otherType === "business" ? msg.recipient_business_id : msg.recipient_user_id;
        } else {
          otherType = msg.sender_type;
          otherId = otherType === "business" ? msg.sender_business_id : msg.sender_user_id;
        }
      }

      if (!otherId) continue;

      const key = `${otherType}_${otherId}`;
      if (!conversationsMap.has(key)) {
        conversationsMap.set(key, {
          other_type: otherType,
          other_id: otherId,
          last_message: msg.message,
          last_message_time: msg.created_at,
          unread_count: 0
        });
      }

      // If the message is unread and not sent by me, it's an unread message to me
      if (!msg.is_read && !isSenderMe) {
        conversationsMap.get(key).unread_count += 1;
      }
    }

    const conversations = Array.from(conversationsMap.values());

    // Gather unique user/business IDs for profiles
    const userIds = [...new Set(conversations.filter(c => c.other_type === "individual").map(c => c.other_id))];
    const businessIds = [...new Set(conversations.filter(c => c.other_type === "business").map(c => c.other_id))];

    const usersMap = new Map();
    if (userIds.length > 0) {
      const [users] = await pool.query(
        "SELECT id, first_name, last_name, avatar_url FROM users WHERE id IN (?)",
        [userIds]
      );
      users.forEach(u => usersMap.set(u.id, u));
    }

    const businessesMap = new Map();
    if (businessIds.length > 0) {
      const [businesses] = await pool.query(
        "SELECT id, business_name, logo_url, slug FROM businesses WHERE id IN (?)",
        [businessIds]
      );
      businesses.forEach(b => businessesMap.set(b.id, b));
    }

    // Populate conversation metadata
    for (const c of conversations) {
      if (c.other_type === "individual") {
        const u = usersMap.get(c.other_id);
        c.name = u ? `${u.first_name} ${u.last_name}` : "User";
        c.avatar_url = u ? u.avatar_url : null;
      } else {
        const b = businessesMap.get(c.other_id);
        c.name = b ? b.business_name : "Business";
        c.avatar_url = b ? b.logo_url : null;
        c.slug = b ? b.slug : null;
      }
    }

    return res.json({ success: true, conversations });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/messages/chat/:targetType/:targetId
router.get("/chat/:targetType/:targetId", async (req, res) => {
  const pool = req.app.locals.pool;
  const session = await requireAuth(pool, req, res);
  if (!session) return;

  const identity = getMyIdentity(session);
  const myType = identity.type;
  const myId = identity.id;

  const { targetType, targetId } = req.params;
  const targetIdNum = parseInt(targetId);

  if (!["individual", "business"].includes(targetType) || isNaN(targetIdNum)) {
    return res.status(400).json({ success: false, error: "Invalid target type or ID." });
  }

  try {
    // 1. Fetch chat history
    let chatQuery = "";
    let chatParams = [];

    if (myType === "individual" && targetType === "individual") {
      chatQuery = `
        SELECT * FROM messages
        WHERE ((sender_type = 'individual' AND sender_user_id = ?) AND (recipient_type = 'individual' AND recipient_user_id = ?))
           OR ((sender_type = 'individual' AND sender_user_id = ?) AND (recipient_type = 'individual' AND recipient_user_id = ?))
        ORDER BY id ASC
      `;
      chatParams = [myId, targetIdNum, targetIdNum, myId];
    } else if (myType === "individual" && targetType === "business") {
      chatQuery = `
        SELECT * FROM messages
        WHERE ((sender_type = 'individual' AND sender_user_id = ?) AND (recipient_type = 'business' AND recipient_business_id = ?))
           OR ((sender_type = 'business' AND sender_business_id = ?) AND (recipient_type = 'individual' AND recipient_user_id = ?))
        ORDER BY id ASC
      `;
      chatParams = [myId, targetIdNum, targetIdNum, myId];
    } else if (myType === "business" && targetType === "individual") {
      chatQuery = `
        SELECT * FROM messages
        WHERE ((sender_type = 'business' AND sender_business_id = ?) AND (recipient_type = 'individual' AND recipient_user_id = ?))
           OR ((sender_type = 'individual' AND sender_user_id = ?) AND (recipient_type = 'business' AND recipient_business_id = ?))
        ORDER BY id ASC
      `;
      chatParams = [myId, targetIdNum, targetIdNum, myId];
    } else if (myType === "business" && targetType === "business") {
      chatQuery = `
        SELECT * FROM messages
        WHERE ((sender_type = 'business' AND sender_business_id = ?) AND (recipient_type = 'business' AND recipient_business_id = ?))
           OR ((sender_type = 'business' AND sender_business_id = ?) AND (recipient_type = 'business' AND recipient_business_id = ?))
        ORDER BY id ASC
      `;
      chatParams = [myId, targetIdNum, targetIdNum, myId];
    }

    const [chatHistory] = await pool.execute(chatQuery, chatParams);

    // 2. Mark incoming messages from target as read
    let readQuery = "";
    let readParams = [];

    if (myType === "individual") {
      readQuery = `
        UPDATE messages SET is_read = 1 
        WHERE sender_type = ? AND sender_user_id = ? 
          AND recipient_type = 'individual' AND recipient_user_id = ? AND is_read = 0
      `;
      // If target is business, sender_user_id is not targetIdNum.
      // Wait, let's be careful. If target is business, sender_type is 'business' and sender_business_id is targetIdNum.
      if (targetType === "business") {
        readQuery = `
          UPDATE messages SET is_read = 1 
          WHERE sender_type = 'business' AND sender_business_id = ? 
            AND recipient_type = 'individual' AND recipient_user_id = ? AND is_read = 0
        `;
        readParams = [targetIdNum, myId];
      } else {
        readQuery = `
          UPDATE messages SET is_read = 1 
          WHERE sender_type = 'individual' AND sender_user_id = ? 
            AND recipient_type = 'individual' AND recipient_user_id = ? AND is_read = 0
        `;
        readParams = [targetIdNum, myId];
      }
    } else { // myType === 'business'
      if (targetType === "business") {
        readQuery = `
          UPDATE messages SET is_read = 1 
          WHERE sender_type = 'business' AND sender_business_id = ? 
            AND recipient_type = 'business' AND recipient_business_id = ? AND is_read = 0
        `;
        readParams = [targetIdNum, myId];
      } else {
        readQuery = `
          UPDATE messages SET is_read = 1 
          WHERE sender_type = 'individual' AND sender_user_id = ? 
            AND recipient_type = 'business' AND recipient_business_id = ? AND is_read = 0
        `;
        readParams = [targetIdNum, myId];
      }
    }

    if (readQuery) {
      await pool.execute(readQuery, readParams);
    }

    // 3. Return history
    return res.json({ success: true, chat: chatHistory });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/messages/chat/:targetType/:targetId
router.post("/chat/:targetType/:targetId", async (req, res) => {
  const pool = req.app.locals.pool;
  const session = await requireAuth(pool, req, res);
  if (!session) return;

  const identity = getMyIdentity(session);
  const myType = identity.type;
  const myId = identity.id;

  const { targetType, targetId } = req.params;
  const targetIdNum = parseInt(targetId);
  const { message } = req.body;

  if (!["individual", "business"].includes(targetType) || isNaN(targetIdNum)) {
    return res.status(400).json({ success: false, error: "Invalid target type or ID." });
  }

  if (!message || message.trim().length === 0) {
    return res.status(400).json({ success: false, error: "Message content cannot be empty." });
  }

  try {
    // Check target existence
    if (targetType === "individual") {
      const [u] = await pool.execute("SELECT id FROM users WHERE id = ? LIMIT 1", [targetIdNum]);
      if (u.length === 0) return res.status(404).json({ success: false, error: "Recipient user not found." });
    } else {
      const [b] = await pool.execute("SELECT id, owner_user_id FROM businesses WHERE id = ? LIMIT 1", [targetIdNum]);
      if (b.length === 0) return res.status(404).json({ success: false, error: "Recipient business not found." });
    }

    // Insert Message
    let insertQuery = "";
    let insertParams = [];

    if (myType === "individual" && targetType === "individual") {
      insertQuery = `
        INSERT INTO messages (sender_type, sender_user_id, sender_business_id, recipient_type, recipient_user_id, recipient_business_id, message)
        VALUES ('individual', ?, NULL, 'individual', ?, NULL, ?)
      `;
      insertParams = [myId, targetIdNum, message];
    } else if (myType === "individual" && targetType === "business") {
      insertQuery = `
        INSERT INTO messages (sender_type, sender_user_id, sender_business_id, recipient_type, recipient_user_id, recipient_business_id, message)
        VALUES ('individual', ?, NULL, 'business', NULL, ?, ?)
      `;
      insertParams = [myId, targetIdNum, message];
    } else if (myType === "business" && targetType === "individual") {
      insertQuery = `
        INSERT INTO messages (sender_type, sender_user_id, sender_business_id, recipient_type, recipient_user_id, recipient_business_id, message)
        VALUES ('business', ?, ?, 'individual', ?, NULL, ?)
      `;
      insertParams = [session.user_id, myId, targetIdNum, message];
    } else if (myType === "business" && targetType === "business") {
      insertQuery = `
        INSERT INTO messages (sender_type, sender_user_id, sender_business_id, recipient_type, recipient_user_id, recipient_business_id, message)
        VALUES ('business', ?, ?, 'business', NULL, ?, ?)
      `;
      insertParams = [session.user_id, myId, targetIdNum, message];
    }

    const [result] = await pool.execute(insertQuery, insertParams);

    // Create a real notification for the recipient!
    try {
      let notifQuery = "";
      let notifParams = [];

      if (targetType === "individual") {
        notifQuery = `
          INSERT INTO notifications (recipient_type, recipient_user_id, type, actor_type, actor_user_id, actor_business_id)
          VALUES ('individual', ?, 'message', ?, ?, ?)
        `;
        notifParams = [
          targetIdNum,
          myType,
          myType === "individual" ? myId : session.user_id,
          myType === "business" ? myId : null
        ];
      } else {
        // Find owner user ID of recipient business to also receive notification if they are online/notified
        const [bOwner] = await pool.execute("SELECT owner_user_id FROM businesses WHERE id = ? LIMIT 1", [targetIdNum]);
        const recipientUserId = bOwner[0] ? bOwner[0].owner_user_id : null;

        notifQuery = `
          INSERT INTO notifications (recipient_type, recipient_user_id, recipient_business_id, type, actor_type, actor_user_id, actor_business_id)
          VALUES ('business', ?, ?, 'message', ?, ?, ?)
        `;
        notifParams = [
          recipientUserId,
          targetIdNum,
          myType,
          myType === "individual" ? myId : session.user_id,
          myType === "business" ? myId : null
        ];
      }

      await pool.execute(notifQuery, notifParams);
    } catch (notifErr) {
      console.error("Failed to create message notification:", notifErr.message);
    }

    return res.json({
      success: true,
      messageId: result.insertId,
      created_at: new Date()
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/messages/read/:targetType/:targetId
router.post("/read/:targetType/:targetId", async (req, res) => {
  const pool = req.app.locals.pool;
  const session = await requireAuth(pool, req, res);
  if (!session) return;

  const identity = getMyIdentity(session);
  const myType = identity.type;
  const myId = identity.id;

  const { targetType, targetId } = req.params;
  const targetIdNum = parseInt(targetId);

  if (!["individual", "business"].includes(targetType) || isNaN(targetIdNum)) {
    return res.status(400).json({ success: false, error: "Invalid target type or ID." });
  }

  try {
    let readQuery = "";
    let readParams = [];

    if (myType === "individual") {
      if (targetType === "business") {
        readQuery = `
          UPDATE messages SET is_read = 1 
          WHERE sender_type = 'business' AND sender_business_id = ? 
            AND recipient_type = 'individual' AND recipient_user_id = ? AND is_read = 0
        `;
        readParams = [targetIdNum, myId];
      } else {
        readQuery = `
          UPDATE messages SET is_read = 1 
          WHERE sender_type = 'individual' AND sender_user_id = ? 
            AND recipient_type = 'individual' AND recipient_user_id = ? AND is_read = 0
        `;
        readParams = [targetIdNum, myId];
      }
    } else { // myType === 'business'
      if (targetType === "business") {
        readQuery = `
          UPDATE messages SET is_read = 1 
          WHERE sender_type = 'business' AND sender_business_id = ? 
            AND recipient_type = 'business' AND recipient_business_id = ? AND is_read = 0
        `;
        readParams = [targetIdNum, myId];
      } else {
        readQuery = `
          UPDATE messages SET is_read = 1 
          WHERE sender_type = 'individual' AND sender_user_id = ? 
            AND recipient_type = 'business' AND recipient_business_id = ? AND is_read = 0
        `;
        readParams = [targetIdNum, myId];
      }
    }

    await pool.execute(readQuery, readParams);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
