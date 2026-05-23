// assets/js/auth.js
// Tüm sayfalar tarafından kullanılan ortak auth fonksiyonları

const API = (window.location.origin && window.location.origin.startsWith("http"))
  ? (window.location.origin.includes("localhost") || window.location.origin.includes("127.0.0.1")
      ? "http://localhost:5000"
      : window.location.origin)
  : "https://diwanet.com";

// LocalStorage helpers
function getToken() {
  return localStorage.getItem("dn_token");
}

function getUser() {
  try { return JSON.parse(localStorage.getItem("dn_user")); }
  catch { return null; }
}

function getBusiness() {
  try { return JSON.parse(localStorage.getItem("dn_business")); }
  catch { return null; }
}

function setAuth(token, user, business) {
  localStorage.setItem("dn_token", token);
  localStorage.setItem("dn_user", JSON.stringify(user));
  if (business) localStorage.setItem("dn_business", JSON.stringify(business));
}

function clearAuth() {
  localStorage.removeItem("dn_token");
  localStorage.removeItem("dn_user");
  localStorage.removeItem("dn_business");
}

function authHeaders() {
  const token = getToken();
  return token
    ? { "Authorization": "Bearer " + token, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

// Logout
async function doLogout() {
  const token = getToken();
  if (token) {
    try {
      await fetch(`${API}/api/auth/logout`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token }
      });
    } catch {}
  }
  clearAuth();
  window.location.href = "/index.html";
}

// Redirect if not logged in
function requireLogin() {
  if (!getToken()) {
    window.location.href = "/login.html";
    return false;
  }
  return true;
}

// Redirect if not business
function requireBusiness() {
  const user = getUser();
  if (!user || user.role !== "business_owner") {
    window.location.href = "/login.html";
    return false;
  }
  return true;
}

// Utility: escape HTML
function escHtml(s) {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Utility: escape attribute
function escAttr(s) {
  if (!s) return "";
  return String(s).replace(/'/g, "\\'").replace(/"/g, "&quot;");
}

// Utility: time ago
function timeAgo(dateStr) {
  const d = new Date(dateStr);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  if (diff < 604800) return Math.floor(diff / 86400) + "d ago";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Utility: make slug
function makeSlug(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

// Topbar renderer — her sayfa kendi topbar'ını oluştururken bunu çağırır
function renderTopbarAuth(containerId, options = {}) {
  const user = getUser();
  const business = getBusiness();
  const container = document.getElementById(containerId);
  if (!container) return;

  if (user) {
    const name = business ? business.business_name : `${user.first_name} ${user.last_name}`;
    const profileLink = business
      ? `/b/${business.slug}`
      : `/profile.html?id=${user.id}`;
    container.innerHTML = `
      <a href="${profileLink}" class="btn btn-ghost btn-sm">${escHtml(name.split(" ")[0])}</a>
      <button class="btn btn-ghost btn-sm" onclick="doLogout()">Sign out</button>
    `;

    // Inject Messages link to topbar-nav if logged in
    const topNav = document.querySelector(".topbar-nav") || document.getElementById("topbarNav");
    if (topNav) {
      const hasMsgLink = Array.from(topNav.querySelectorAll("a")).some(a => {
        const href = a.getAttribute("href");
        return href && href.includes("messages.html");
      });
      if (!hasMsgLink) {
        const isMessagesActive = window.location.pathname.includes("messages.html");
        const msgLink = document.createElement("a");
        msgLink.href = "/messages.html";
        msgLink.textContent = "Messages";
        if (isMessagesActive) {
          msgLink.className = "active";
          topNav.querySelectorAll("a").forEach(a => a.classList.remove("active"));
        }
        topNav.appendChild(msgLink);
      }
    }
  } else {
    container.innerHTML = `
      <a href="/login.html" class="btn btn-ghost btn-sm">Sign in</a>
      <a href="/signup.html" class="btn btn-primary btn-sm">Sign up</a>
    `;
  }
}

// Dynamic Cookie Consent Banner Injection
function injectCookieConsent() {
  if (localStorage.getItem("dn_cookie_consent")) return;
  const banner = document.createElement("div");
  banner.id = "dn-cookie-banner";
  banner.style.cssText = `
    position: fixed;
    bottom: 24px;
    left: 24px;
    right: 24px;
    max-width: 440px;
    background: rgba(20, 33, 61, 0.95);
    color: white;
    padding: 18px 22px;
    border-radius: 16px;
    box-shadow: 0 12px 36px rgba(0,0,0,0.3);
    z-index: 10000;
    font-family: 'DM Sans', sans-serif;
    font-size: 0.85rem;
    line-height: 1.5;
    display: flex;
    flex-direction: column;
    gap: 12px;
    border: 1px solid rgba(255,255,255,0.12);
    backdrop-filter: blur(10px);
    transition: all 0.3s ease;
  `;
  
  if (window.innerWidth > 600) {
    banner.style.left = "auto";
    banner.style.right = "24px";
  }

  banner.innerHTML = `
    <div style="font-weight: 500;">
      🍪 <strong>Cookie Consent</strong><br>
      We use cookies to enhance your experience. By continuing to browse, you agree to our 
      <a href="/privacy-policy.html" style="color:#60a5fa;text-decoration:underline;font-weight:600;">Privacy Policy</a> and 
      <a href="/terms.html" style="color:#60a5fa;text-decoration:underline;font-weight:600;">Terms of Service</a>.
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:2px;">
      <button id="cookie-decline-btn" style="background:transparent;color:rgba(255,255,255,0.7);border:1px solid rgba(255,255,255,0.3);padding:7px 16px;border-radius:8px;cursor:pointer;font-size:0.78rem;font-weight:600;font-family:inherit;transition:all 0.2s;">Decline</button>
      <button id="cookie-accept-btn" style="background:#2563eb;color:white;border:none;padding:7px 20px;border-radius:8px;cursor:pointer;font-size:0.78rem;font-weight:700;font-family:inherit;transition:all 0.2s;">Accept</button>
    </div>
  `;

  document.body.appendChild(banner);

  document.getElementById("cookie-accept-btn").onmouseover = function() { this.style.background = "#1d4ed8"; };
  document.getElementById("cookie-accept-btn").onmouseout = function() { this.style.background = "#2563eb"; };
  document.getElementById("cookie-decline-btn").onmouseover = function() { this.style.background = "rgba(255,255,255,0.1)"; };
  document.getElementById("cookie-decline-btn").onmouseout = function() { this.style.background = "transparent"; };

  document.getElementById("cookie-accept-btn").onclick = () => {
    localStorage.setItem("dn_cookie_consent", "accepted");
    banner.remove();
  };
  document.getElementById("cookie-decline-btn").onclick = () => {
    localStorage.setItem("dn_cookie_consent", "declined");
    banner.remove();
  };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", injectCookieConsent);
} else {
  injectCookieConsent();
}
