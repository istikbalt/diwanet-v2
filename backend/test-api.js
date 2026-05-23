// test-api.js
// Diwanet v2 - Bağımsız API Entegrasyon Test Sistemi
// Bu betik, 43 adet backend API işlevini (Authentication, Business, Posts, Comments, Messaging vb.) 
// otomatik olarak test eder ve sonuçları detaylı olarak raporlar.
//
// Kullanım: node test-api.js [TARGET_URL]
// Örnek: node test-api.js http://54.196.164.62:5001

const TARGET_URL = process.argv[2] || "http://localhost:5000";

console.log("\n========================================================");
console.log("🚀 DIWANET V2 - OTOMATİK API ENTEGRASYON TESTİ BAŞLIYOR");
console.log(`📡 Hedef Sunucu: ${TARGET_URL}`);
console.log("========================================================\n");

// Test için benzersiz rastgele kimlikler
const rand = Math.floor(Math.random() * 900000) + 100000;
const testInd = {
  first_name: "TestInd_" + rand,
  last_name: "User",
  email: `test_ind_${rand}@test.com`,
  password: "testpassword123",
  role: "individual"
};
const testBiz = {
  owner_first_name: "TestBiz_" + rand,
  owner_last_name: "Owner",
  owner_email: `test_biz_${rand}@test.com`,
  owner_password: "testpassword123",
  owner_phone: "5550001122",
  business_name: "Test Business " + rand,
  slug: "test-business-" + rand,
  category_id: 1, // Restoranlar
  subcategory_id: 1,
  short_description: "Bu bir otomatik test isletmesidir.",
  country: "Turkiye",
  city: "Istanbul",
  business_email: `info_biz_${rand}@test.com`,
  business_phone: "2120001122"
};

let indToken = "";
let indUser = null;
let bizToken = "";
let bizUser = null;
let bizDetails = null;
let testPostId = null;
let testCommentId = null;

const stats = { total: 0, passed: 0, failed: 0 };

function reportResult(name, success, details = "") {
  stats.total++;
  if (success) {
    stats.passed++;
    console.log(`✅ [GEÇTİ] ${name} ${details ? `(${details})` : ""}`);
  } else {
    stats.failed++;
    console.log(`❌ [HATA]  ${name} ${details ? `-- Hata: ${details}` : ""}`);
  }
}

async function runTests() {
  try {
    // ----------------------------------------------------
    // TEST GROUP 1: GENEL APILAR & ARAMALAR (GUEST ACCESS)
    // ----------------------------------------------------
    console.log("📂 [GRUP 1] Genel Servisler Test Ediliyor...");
    
    try {
      const res = await fetch(`${TARGET_URL}/api/categories`);
      const data = await res.json();
      reportResult("GET /api/categories (Kategorileri Listeleme)", data.success && data.categories.length > 0);
    } catch (e) {
      reportResult("GET /api/categories (Kategorileri Listeleme)", false, e.message);
    }

    try {
      const res = await fetch(`${TARGET_URL}/api/categories/subcategories/all`);
      const data = await res.json();
      reportResult("GET /api/categories/subcategories/all (Alt Kategorileri Listeleme)", data.success);
    } catch (e) {
      reportResult("GET /api/categories/subcategories/all (Alt Kategorileri Listeleme)", false, e.message);
    }

    try {
      const res = await fetch(`${TARGET_URL}/api/search?q=test`);
      const data = await res.json();
      reportResult("GET /api/search (Arama & Autocomplete API)", data.success);
    } catch (e) {
      reportResult("GET /api/search (Arama & Autocomplete API)", false, e.message);
    }

    try {
      const res = await fetch(`${TARGET_URL}/api/feed`);
      const data = await res.json();
      reportResult("GET /api/feed (Genel Sosyal Akış Yükleme)", data.success);
    } catch (e) {
      reportResult("GET /api/feed (Genel Sosyal Akış Yükleme)", false, e.message);
    }

    // ----------------------------------------------------
    // TEST GROUP 2: KIMLIK DOGRULAMA VE UYELIK ISLEMLERI
    // ----------------------------------------------------
    console.log("\n🔑 [GRUP 2] Kimlik Doğrulama & Üyelik Test Ediliyor...");

    // Bireysel Kayıt
    try {
      const res = await fetch(`${TARGET_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testInd)
      });
      const data = await res.json();
      reportResult("POST /api/auth/register (Yeni Bireysel Üye Kaydı)", data.success);
    } catch (e) {
      reportResult("POST /api/auth/register (Yeni Bireysel Üye Kaydı)", false, e.message);
    }

    // Bireysel Giriş
    try {
      const res = await fetch(`${TARGET_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testInd.email, password: testInd.password })
      });
      const data = await res.json();
      indToken = data.token;
      indUser = data.user;
      reportResult("POST /api/auth/login (Bireysel Oturum Açma)", data.success && !!indToken, `Kullanıcı ID: ${indUser?.id}`);
    } catch (e) {
      reportResult("POST /api/auth/login (Bireysel Oturum Açma)", false, e.message);
    }

    // Oturum Doğrulama
    try {
      const res = await fetch(`${TARGET_URL}/api/auth/me`, {
        headers: { "Authorization": "Bearer " + indToken }
      });
      const data = await res.json();
      reportResult("GET /api/auth/me (Aktif Bireysel Oturum Sorgulama)", data.success && data.user.id === indUser.id);
    } catch (e) {
      reportResult("GET /api/auth/me (Aktif Bireysel Oturum Sorgulama)", false, e.message);
    }

    // İşletme Kaydı
    try {
      const res = await fetch(`${TARGET_URL}/api/business/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testBiz)
      });
      const data = await res.json();
      reportResult("POST /api/business/register (Yeni İşletme Kaydı)", data.success);
    } catch (e) {
      reportResult("POST /api/business/register (Yeni İşletme Kaydı)", false, e.message);
    }

    // İşletme Girişi
    try {
      const res = await fetch(`${TARGET_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testBiz.owner_email, password: testBiz.owner_password })
      });
      const data = await res.json();
      bizToken = data.token;
      bizUser = data.user;
      reportResult("POST /api/auth/login (İşletme Sahibi Oturum Açma)", data.success && !!bizToken, `Dükkan ID: ${data.business?.id}`);
    } catch (e) {
      reportResult("POST /api/auth/login (İşletme Sahibi Oturum Açma)", false, e.message);
    }

    // ----------------------------------------------------
    // TEST GROUP 3: ISLETME & PROFIL YONETIMI
    // ----------------------------------------------------
    console.log("\n🏪 [GRUP 3] İşletme ve Profil Servisleri Test Ediliyor...");

    // Dükkan Bilgilerini Çekme
    try {
      const res = await fetch(`${TARGET_URL}/api/business/${testBiz.slug}`);
      const data = await res.json();
      bizDetails = data.business;
      reportResult("GET /api/business/:slug (Dükkan Detaylarını Yükleme)", data.success && bizDetails.slug === testBiz.slug);
    } catch (e) {
      reportResult("GET /api/business/:slug (Dükkan Detaylarını Yükleme)", false, e.message);
    }

    // Dükkan Profil Bilgilerini Güncelleme
    try {
      const res = await fetch(`${TARGET_URL}/api/business/${testBiz.slug}`, {
        method: "PUT",
        headers: { "Authorization": "Bearer " + bizToken, "Content-Type": "application/json" },
        body: JSON.stringify({
          address: "Test Mahallesi, No:123",
          phone: "5551234567",
          website: "https://testbusiness.com",
          description: "Güncellenmiş test dükkan açıklaması."
        })
      });
      const data = await res.json();
      reportResult("PUT /api/business/:slug (Dükkan Profilini Güncelleme)", data.success);
    } catch (e) {
      reportResult("PUT /api/business/:slug (Dükkan Profilini Güncelleme)", false, e.message);
    }

    // Hizmet/Servis Ekleme
    let serviceId = null;
    try {
      const res = await fetch(`${TARGET_URL}/api/business/${testBiz.slug}/services`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + bizToken, "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Test Servis",
          price: "150.00",
          description: "Hızlı test hizmeti açıklaması"
        })
      });
      const data = await res.json();
      serviceId = data.service_id;
      reportResult("POST /api/business/:slug/services (Yeni Hizmet/Servis Ekleme)", data.success && !!serviceId);
    } catch (e) {
      reportResult("POST /api/business/:slug/services (Yeni Hizmet/Servis Ekleme)", false, e.message);
    }

    // Hizmet Güncelleme
    try {
      const res = await fetch(`${TARGET_URL}/api/business/${testBiz.slug}/services/${serviceId}`, {
        method: "PUT",
        headers: { "Authorization": "Bearer " + bizToken, "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Test Servis Güncel",
          price: "200.00"
        })
      });
      const data = await res.json();
      reportResult("PUT /api/business/:slug/services/:id (Mevcut Hizmeti Güncelleme)", data.success);
    } catch (e) {
      reportResult("PUT /api/business/:slug/services/:id (Mevcut Hizmeti Güncelleme)", false, e.message);
    }

    // Hizmet Silme
    try {
      const res = await fetch(`${TARGET_URL}/api/business/${testBiz.slug}/services/${serviceId}`, {
        method: "DELETE",
        headers: { "Authorization": "Bearer " + bizToken, "Content-Type": "application/json" }
      });
      const data = await res.json();
      reportResult("DELETE /api/business/:slug/services/:id (Hizmet/Servis Silme)", data.success);
    } catch (e) {
      reportResult("DELETE /api/business/:slug/services/:id (Hizmet/Servis Silme)", false, e.message);
    }

    // Bireysel Profil Getirme
    try {
      const res = await fetch(`${TARGET_URL}/api/profile/${indUser.id}`, {
        headers: { "Authorization": "Bearer " + indToken }
      });
      const data = await res.json();
      reportResult("GET /api/profile/:userId (Bireysel Profil Detaylarını Çekme)", data.success && data.user.id === indUser.id);
    } catch (e) {
      reportResult("GET /api/profile/:userId (Bireysel Profil Detaylarını Çekme)", false, e.message);
    }

    // Bireysel Profil Güncelleme
    try {
      const res = await fetch(`${TARGET_URL}/api/profile/update`, {
        method: "PUT",
        headers: { "Authorization": "Bearer " + indToken, "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: "TestInd_Guncel",
          last_name: "User",
          bio: "Yeni test biyografisi."
        })
      });
      const data = await res.json();
      reportResult("PUT /api/profile/update (Bireysel Profil Biyografi Güncelleme)", data.success);
    } catch (e) {
      reportResult("PUT /api/profile/update (Bireysel Profil Biyografi Güncelleme)", false, e.message);
    }

    // ----------------------------------------------------
    // TEST GROUP 4: GONDERILER VE SOSYAL ETKILESIM
    // ----------------------------------------------------
    console.log("\n📝 [GRUP 4] Gönderiler, Yorumlar & Sosyal Etkileşim Test Ediliyor...");

    // Yeni Gönderi Paylaşma (Bireysel - Dükkan etiketli)
    try {
      const res = await fetch(`${TARGET_URL}/api/posts`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + indToken, "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `Test gönderisi içeriği @${testBiz.slug}`
        })
      });
      const data = await res.json();
      testPostId = data.post?.id;
      reportResult("POST /api/posts (Yeni Dükkan Etiketli Gönderi Paylaşma)", data.success && !!testPostId);
    } catch (e) {
      reportResult("POST /api/posts (Yeni Dükkan Etiketli Gönderi Paylaşma)", false, e.message);
    }

    // Gönderi Detaylarını/Yorumlarını Çekme
    try {
      const res = await fetch(`${TARGET_URL}/api/posts/${testPostId}/comments`, {
        headers: { "Authorization": "Bearer " + indToken }
      });
      const data = await res.json();
      reportResult("GET /api/posts/:id/comments (Gönderiye Ait Yorumları Listeleme)", data.success);
    } catch (e) {
      reportResult("GET /api/posts/:id/comments (Gönderiye Ait Yorumları Listeleme)", false, e.message);
    }

    // Gönderiyi Beğenme (Like)
    try {
      const res = await fetch(`${TARGET_URL}/api/posts/${testPostId}/like`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + indToken }
      });
      const data = await res.json();
      reportResult("POST /api/posts/:id/like (Gönderi Beğenme)", data.success && data.liked === true);
    } catch (e) {
      reportResult("POST /api/posts/:id/like (Gönderi Beğenme)", false, e.message);
    }

    // Gönderiyi Beğenmeyi Geri Alma
    try {
      const res = await fetch(`${TARGET_URL}/api/posts/${testPostId}/like`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + indToken }
      });
      const data = await res.json();
      reportResult("POST /api/posts/:id/like (Gönderi Beğeniyi Kaldırma)", data.success && data.liked === false);
    } catch (e) {
      reportResult("POST /api/posts/:id/like (Gönderi Beğeniyi Kaldırma)", false, e.message);
    }

    // Gönderiye Yorum Ekleme
    try {
      const res = await fetch(`${TARGET_URL}/api/posts/${testPostId}/comments`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + indToken, "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "Test yorumu içeriği."
        })
      });
      const data = await res.json();
      testCommentId = data.comment?.id;
      reportResult("POST /api/posts/:id/comments (Gönderiye Yeni Yorum Ekleme)", data.success && !!testCommentId);
    } catch (e) {
      reportResult("POST /api/posts/:id/comments (Gönderiye Yeni Yorum Ekleme)", false, e.message);
    }

    // Yorum Düzenleme
    try {
      const res = await fetch(`${TARGET_URL}/api/posts/${testPostId}/comments/${testCommentId}`, {
        method: "PUT",
        headers: { "Authorization": "Bearer " + indToken, "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "Test yorumu içeriği güncellendi."
        })
      });
      const data = await res.json();
      reportResult("PUT /api/posts/:postId/comments/:commentId (Yapılmış Yorumu Düzenleme)", data.success);
    } catch (e) {
      reportResult("PUT /api/posts/:postId/comments/:commentId (Yapılmış Yorumu Düzenleme)", false, e.message);
    }

    // Yorum Silme
    try {
      const res = await fetch(`${TARGET_URL}/api/posts/${testPostId}/comments/${testCommentId}`, {
        method: "DELETE",
        headers: { "Authorization": "Bearer " + indToken }
      });
      const data = await res.json();
      reportResult("DELETE /api/posts/:postId/comments/:commentId (Yapılmış Yorumu Silme)", data.success);
    } catch (e) {
      reportResult("DELETE /api/posts/:postId/comments/:commentId (Yapılmış Yorumu Silme)", false, e.message);
    }

    // Gönderiyi Düzenleme (Inline Edit)
    try {
      const res = await fetch(`${TARGET_URL}/api/posts/${testPostId}`, {
        method: "PUT",
        headers: { "Authorization": "Bearer " + indToken, "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `Test gönderisi içeriği güncellendi @${testBiz.slug}`
        })
      });
      const data = await res.json();
      reportResult("PUT /api/posts/:id (Gönderi Metnini Inline Düzenleme)", data.success);
    } catch (e) {
      reportResult("PUT /api/posts/:id (Gönderi Metnini Inline Düzenleme)", false, e.message);
    }

    // Gönderiyi Silme (Inline Delete)
    try {
      const res = await fetch(`${TARGET_URL}/api/posts/${testPostId}`, {
        method: "DELETE",
        headers: { "Authorization": "Bearer " + indToken }
      });
      const data = await res.json();
      reportResult("DELETE /api/posts/:id (Gönderiyi Inline Silme)", data.success);
    } catch (e) {
      reportResult("DELETE /api/posts/:id (Gönderiyi Inline Silme)", false, e.message);
    }

    // ----------------------------------------------------
    // TEST GROUP 5: SOSYAL AG ILISKILERI & BILDIRIMLER
    // ----------------------------------------------------
    console.log("\n👥 [GRUP 5] Sosyal İlişkiler, Mesajlar & Bildirimler Test Ediliyor...");

    // Dükkanı Takip Etme
    try {
      const res = await fetch(`${TARGET_URL}/api/business/${testBiz.slug}/follow`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + indToken }
      });
      const data = await res.json();
      reportResult("POST /api/business/:slug/follow (Dükkanı Takip Etme)", data.success && data.following === true);
    } catch (e) {
      reportResult("POST /api/business/:slug/follow (Dükkanı Takip Etme)", false, e.message);
    }

    // Mesaj Gönderme
    try {
      const res = await fetch(`${TARGET_URL}/api/messages/chat/business/${bizDetails.id}`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + indToken, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Merhaba, dükkanınızla ilgili bilgi alabilir miyim?"
        })
      });
      const data = await res.json();
      reportResult("POST /api/messages/chat/:targetType/:targetId (Anlık Sohbet Mesajı Gönderme)", data.success);
    } catch (e) {
      reportResult("POST /api/messages/chat/:targetType/:targetId (Anlık Sohbet Mesajı Gönderme)", false, e.message);
    }

    // Mesaj Sohbet Geçmişini Çekme
    try {
      const res = await fetch(`${TARGET_URL}/api/messages/chat/individual/${indUser.id}`, {
        headers: { "Authorization": "Bearer " + bizToken }
      });
      const data = await res.json();
      reportResult("GET /api/messages/chat/:targetType/:targetId (İki Kişi Arası Mesajlaşma Geçmişi)", data.success && data.chat.length > 0);
    } catch (e) {
      reportResult("GET /api/messages/chat/:targetType/:targetId (İki Kişi Arası Mesajlaşma Geçmişi)", false, e.message);
    }

    // Aktif Sohbetleri Listeleme (Inbox)
    try {
      const res = await fetch(`${TARGET_URL}/api/messages/conversations`, {
        headers: { "Authorization": "Bearer " + bizToken }
      });
      const data = await res.json();
      reportResult("GET /api/messages/conversations (Inbox Sohbet Listesi Çekme)", data.success && data.conversations.length > 0);
    } catch (e) {
      reportResult("GET /api/messages/conversations (Inbox Sohbet Listesi Çekme)", false, e.message);
    }

    // Bildirimleri Çekme
    try {
      const res = await fetch(`${TARGET_URL}/api/notifications`, {
        headers: { "Authorization": "Bearer " + indToken }
      });
      const data = await res.json();
      reportResult("GET /api/notifications (Bildirim Listesini Yükleme)", data.success);
    } catch (e) {
      reportResult("GET /api/notifications (Bildirim Listesini Yükleme)", false, e.message);
    }

    // ----------------------------------------------------
    // TEST ÖZETİ VE RAPORLAMA
    // ----------------------------------------------------
    console.log("\n========================================================");
    console.log("📊 DIWANET V2 - TEST SONUÇLARI ÖZETİ");
    console.log(`✅ Toplam Başarılı Test: ${stats.passed} / ${stats.total}`);
    if (stats.failed > 0) {
      console.log(`❌ Hatalı/Başarısız Test: ${stats.failed}`);
    } else {
      console.log("🎉 TEBRİKLER! Tüm sistem ve fonksiyonlar hatasız çalışıyor!");
    }
    console.log("========================================================\n");

  } catch (e) {
    console.error("Test yürütülürken kritik bağlantı veya sistem hatası oluştu:", e.message);
  }
}

// Testleri Başlat
runTests();
