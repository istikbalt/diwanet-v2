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
  window.location.href = "index.html";
}

// Redirect if not logged in
function requireLogin() {
  if (!getToken()) {
    window.location.href = "login.html";
    return false;
  }
  return true;
}

// Redirect if not business
function requireBusiness() {
  const user = getUser();
  if (!user || user.role !== "business_owner") {
    window.location.href = "login.html";
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
      ? `business.html?slug=${business.slug}`
      : `profile.html?id=${user.id}`;
    container.innerHTML = `
      <a href="${profileLink}" class="btn btn-ghost btn-sm">${escHtml(name.split(" ")[0])}</a>
      <button class="btn btn-ghost btn-sm" onclick="doLogout()">Sign out</button>
    `;
  } else {
    container.innerHTML = `
      <a href="login.html" class="btn btn-ghost btn-sm">Sign in</a>
      <a href="signup.html" class="btn btn-primary btn-sm">Sign up</a>
    `;
  }
}
