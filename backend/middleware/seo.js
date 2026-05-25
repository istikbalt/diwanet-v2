// middleware/seo.js
// Sunucu taraflı SEO meta etiket enjeksiyonu (Hybrid SSR)

const fs = require("fs");
const path = require("path");

async function seoMiddleware(req, res, next) {
  let isBusinessPage = req.path === "/business.html" || req.path === "/business";
  let slug = req.query.slug;

  // Pretty URL desteği: /b/:slug
  const pathParts = req.path.split("/");
  if (pathParts.length === 3 && pathParts[1] === "b") {
    isBusinessPage = true;
    slug = pathParts[2];
  }

  if (isBusinessPage && slug) {
    const pool = req.app.locals.pool;
    try {
      // 1. RDS Veritabanından işletme bilgilerini çek
      const [rows] = await pool.execute(
        `SELECT b.business_name, b.short_description, b.logo_url, b.cover_url, c.name AS category_name, b.city, b.country
         FROM businesses b
         LEFT JOIN categories c ON b.category_id = c.id
         WHERE b.slug = ? AND b.status = 'published' LIMIT 1`,
        [slug]
      );

      if (rows.length > 0) {
        const biz = rows[0];
        const title = `${biz.business_name} · Diwanet`;
        const description = biz.short_description || `${biz.business_name} Diwanet business page.`;
        const imageUrl = biz.logo_url || biz.cover_url || "https://diwanet.com/assets/img/logo-colored.png";
        const pageUrl = `https://diwanet.com/b/${slug}`;

        // 2. business.html dosyasını oku
        const filePath = path.join(__dirname, "..", "..", "frontend", "business.html");
        
        if (fs.existsSync(filePath)) {
          let html = fs.readFileSync(filePath, "utf8");

          // 3. Meta etiketlerini ve Structured Data'yı (Schema JSON-LD) oluştur
          const metaTags = `
  <!-- SEO & Social Media Meta Tags -->
  <title>${title}</title>
  <link rel="canonical" href="${pageUrl}" />
  <meta name="description" content="${description.replace(/"/g, '&quot;')}" />
  <meta property="og:title" content="${title.replace(/"/g, '&quot;')}" />
  <meta property="og:description" content="${description.replace(/"/g, '&quot;')}" />
  <meta property="og:image" content="${imageUrl}" />
  <meta property="og:url" content="${pageUrl}" />
  <meta property="og:type" content="business.business" />
  <meta property="og:site_name" content="Diwanet" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title.replace(/"/g, '&quot;')}" />
  <meta name="twitter:description" content="${description.replace(/"/g, '&quot;')}" />
  <meta name="twitter:image" content="${imageUrl}" />

  <!-- Schema.org JSON-LD Structured Data for Rich Snippets -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": "${biz.business_name.replace(/"/g, '\\"')}",
    "description": "${description.replace(/"/g, '\\"')}",
    "image": "${imageUrl}",
    "url": "${pageUrl}",
    "category": "${(biz.category_name || '').replace(/"/g, '\\"')}",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "${(biz.city || '').replace(/"/g, '\\"')}",
      "addressCountry": "${(biz.country || '').replace(/"/g, '\\"')}"
    }
  }
  </script>
`;

          // 4. Varsayılan başlığı ve eski meta etiketlerini değiştir
          html = html.replace(/<title>.*?<\/title>/i, metaTags);

          // 5. Düzenlenmiş HTML'i gönder
          res.setHeader("Content-Type", "text/html");
          return res.send(html);
        }
      }
    } catch (error) {
      console.error("SEO Middleware error:", error.message);
    }
  }

  next();
}

module.exports = seoMiddleware;
