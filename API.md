# Dokumentasi API Backend

Dokumentasi ini menjelaskan seluruh endpoint HTTP/REST API yang tersedia pada backend **WhatsApp AI Agent & Ads Report Automation** (Latezza Cake).

## Informasi Umum
- **Base URL**: `http://localhost:3001` (atau sesuai konfigurasi `PORT` di berkas `.env`)
- **Format Data**: Request Body dan Response menggunakan format **JSON** (kecuali endpoint `/report-html` yang mengembalikan berkas HTML statis dan `/api/trigger-creative-analysis-stream` yang menggunakan Server-Sent Events).
- **Format JID WhatsApp**:
  - Chat personal: `628xxx@s.whatsapp.net` atau `xxx@lid`
  - Chat grup: `120363xxx@g.us`

---

## Ringkasan Endpoint

| No | Kategori | Method | Endpoint | Deskripsi |
|---|---|---|---|---|
| 1 | Umum | GET | `/health` | Mengecek status koneksi WhatsApp dan waktu server. |
| 2 | Umum | GET | `/dashboard` | Mengalihkan ke URL Frontend. |
| 3 | Umum | GET | `/` | Mengalihkan ke URL Frontend. |
| 4 | Umum | GET | `/report-html` | Menyajikan berkas HTML laporan Meta Ads terbaru. |
| 5 | Statistik | GET | `/api/stats` | Mengambil metrik ringkasan untuk dashboard. |
| 6 | CRM | GET | `/api/customers` | Mendapatkan daftar seluruh pelanggan. |
| 7 | CRM | GET | `/api/customers/:phone` | Mendapatkan detail profil satu pelanggan. |
| 8 | CRM | GET | `/api/customers/:phone/history` | Mendapatkan riwayat pesan WhatsApp dengan pelanggan. |
| 9 | CRM | POST | `/api/customers/:phone/toggle-ai` | Mengaktifkan atau menonaktifkan respon AI agen. |
| 10 | CRM | POST | `/api/customers/:phone/update-details` | Memperbarui status CRM dan catatan admin. |
| 11 | CRM | POST | `/api/customers/:phone/send-message` | Mengirim pesan WhatsApp manual (sekaligus membisukan AI). |
| 12 | Catalog | GET | `/api/products` | Mendapatkan daftar produk dalam katalog. |
| 13 | Catalog | POST | `/api/products` | Menambah produk baru ke katalog (generate embedding otomatis). |
| 14 | Catalog | PUT | `/api/products/:id` | Memperbarui data produk (regenerate embedding otomatis). |
| 15 | Catalog | DELETE | `/api/products/:id` | Menghapus produk dari katalog. |
| 16 | WhatsApp | GET | `/api/whatsapp/groups` | Mendapatkan daftar grup WhatsApp yang diikuti bot. |
| 17 | WhatsApp | POST | `/send-message` | Mengirim pesan WhatsApp mentah ke nomor/grup mana saja. |
| 18 | Pengaturan | GET | `/api/settings` | Mendapatkan konfigurasi sistem (API Key disamarkan). |
| 19 | Pengaturan | POST | `/api/settings` | Menyimpan konfigurasi sistem (otomatis memuat ulang scheduler). |
| 20 | Pengaturan | GET | `/api/settings/default-system-prompt` | Melihat draf default prompt sistem agen AI. |
| 21 | Ads & Creative | POST | `/run-analysis` | Menjalankan skrip analisis Meta Ads secara sinkron. |
| 22 | Ads & Creative | POST | `/trigger-analysis` | Memicu analisis Meta Ads dan siaran laporan di latar belakang. |
| 23 | Ads & Creative | GET | `/api/creative-report` | Mengambil laporan ide konten kreatif ad terbaru. |
| 24 | Ads & Creative | POST | `/api/trigger-creative-analysis` | Memicu audit kreatif di latar belakang. |
| 25 | Ads & Creative | GET | `/api/trigger-creative-analysis-stream` | Memicu audit kreatif dan melakukan streaming progress (SSE). |
| 26 | Follow-Up | POST | `/api/trigger-followups` | Memicu pengiriman pesan follow-up manual (sinkron). |
| 27 | Follow-Up | POST | `/run-followup` | Memicu pengiriman pesan follow-up manual (latar belakang). |

---

## 1. Kategori: Umum

### GET `/health`
Mengecek apakah koneksi socket bot WhatsApp aktif dan server berjalan normal.

- **Request Headers**: `None`
- **Response (200 OK)**:
  ```json
  {
    "status": "connected",
    "timestamp": "2026-06-20T15:30:26.123Z"
  }
  ```
  *(Status bisa berupa `"connected"` atau `"disconnected"`)*

---

### GET `/dashboard`
Mengalihkan (302 Redirect) pengguna ke URL frontend utama dashboard.

- **Response (302 Found)**: Redirect ke `FRONTEND_URL` (default: `http://localhost:5173`)

---

### GET `/`
Mengalihkan (302 Redirect) pengguna ke URL frontend utama dashboard (sama seperti `/dashboard`).

- **Response (302 Found)**: Redirect ke `FRONTEND_URL`

---

### GET `/report-html`
Menyajikan berkas HTML statis laporan performa Meta Ads terbaru yang dihasilkan oleh skrip analisis.

- **Response (200 OK)**:
  - `Content-Type`: `text/html`
  - Body: Kode HTML dari berkas `backend/ads-analysis/report.html`
- **Response (404 Not Found)**:
  ```json
  {
    "status": "error",
    "message": "Report file not found or not generated yet."
  }
  ```

---

## 2. Kategori: Statistik Dashboard

### GET `/api/stats`
Mengambil metrik ringkasan untuk ditampilkan di halaman overview dashboard.

- **Response (200 OK)**:
  ```json
  {
    "status": "connected",
    "totalLeads": 42,
    "totalProducts": 15,
    "pendingFollowUps": 3,
    "totalMessages": 520,
    "recentLeads": [
      {
        "phone_number": "628123456789@s.whatsapp.net",
        "name": "Fardhan Rasya",
        "status": "lead",
        "notes": "Tertarik custom cake cokelat",
        "contact_phone": "08123456789",
        "ai_enabled": true,
        "needs_admin": false,
        "needs_follow_up": true,
        "follow_up_reason": "Menanyakan harga tapi belum konfirmasi",
        "last_interaction": "2026-06-20T15:00:00.000Z",
        "created_at": "2026-06-19T10:00:00.000Z"
      }
    ]
  }
  ```

---

## 3. Kategori: CRM (Manajemen Pelanggan)

### GET `/api/customers`
Mendapatkan daftar seluruh kontak pelanggan yang terekam di database, diurutkan berdasarkan waktu interaksi terakhir secara menurun (terbaru dahulu).

- **Response (200 OK)**:
  ```json
  [
    {
      "phone_number": "628123456789@s.whatsapp.net",
      "name": "Fardhan Rasya",
      "status": "lead",
      "notes": "Tertarik custom cake cokelat",
      "contact_phone": "08123456789",
      "ai_enabled": true,
      "needs_admin": false,
      "needs_follow_up": false,
      "follow_up_reason": null,
      "last_interaction": "2026-06-20T15:00:00.000Z",
      "created_at": "2026-06-19T10:00:00.000Z"
    }
  ]
  ```

---

### GET `/api/customers/:phone`
Mendapatkan informasi detail tentang profil satu pelanggan tertentu berdasarkan nomor telepon (JID).

- **Path Parameters**:
  - `phone`: Nomor telepon JID pelanggan (contoh: `628123456789@s.whatsapp.net`).
- **Response (200 OK)**:
  ```json
  {
    "phone_number": "628123456789@s.whatsapp.net",
    "name": "Fardhan Rasya",
    "status": "lead",
    "notes": "Tertarik custom cake cokelat",
    "contact_phone": "08123456789",
    "ai_enabled": true,
    "needs_admin": false,
    "needs_follow_up": false,
    "follow_up_reason": null,
    "last_interaction": "2026-06-20T15:00:00.000Z",
    "created_at": "2026-06-19T10:00:00.000Z"
  }
  ```
- **Response (404 Not Found)**:
  ```json
  {
    "status": "error",
    "message": "Customer not found."
  }
  ```

---

### GET `/api/customers/:phone/history`
Mengambil semua riwayat pesan WhatsApp antara bot agen AI dan pelanggan tersebut, diurutkan secara kronologis (pesan terlama dahulu).

- **Path Parameters**:
  - `phone`: Nomor telepon JID pelanggan.
- **Response (200 OK)**:
  ```json
  [
    {
      "role": "user",
      "content": "Halo, saya mau tanya harga cake ultah ukuran 15cm berapa ya?",
      "timestamp": "2026-06-20T14:58:00.000Z"
    },
    {
      "role": "model",
      "content": "Halo Kak! Untuk cake ulang tahun ukuran 15cm, harganya mulai dari Rp 150.000 untuk varian cokelat standar. Kakak mau lihat katalog lengkapnya?",
      "timestamp": "2026-06-20T14:58:15.000Z"
    }
  ]
  ```

---

### POST `/api/customers/:phone/toggle-ai`
Mengaktifkan atau menonaktifkan agen AI dalam merespon pesan WhatsApp dari pelanggan tertentu. Jika dinonaktifkan (`ai_enabled: false`), bot tidak akan merespon pesan masuk secara otomatis, sehingga admin dapat membalas secara manual dari dashboard.

- **Path Parameters**:
  - `phone`: Nomor telepon JID pelanggan.
- **Request Body (JSON)**:
  ```json
  {
    "ai_enabled": false
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "status": "success",
    "ai_enabled": false
  }
  ```

---

### POST `/api/customers/:phone/update-details`
Memperbarui kolom status CRM dan kolom catatan internal (`notes`) untuk pelanggan tertentu.

- **Path Parameters**:
  - `phone`: Nomor telepon JID pelanggan.
- **Request Body (JSON)**:
  - *Semua properti bersifat opsional.*
  ```json
  {
    "status": "customer",
    "notes": "Sudah melakukan pembayaran DP untuk pesanan tanggal 25 Juni"
  }
  ```
  *(Status yang valid: `'lead'`, `'customer'`, `'dormant'`, `'opt_out'`)*
- **Response (200 OK)**:
  ```json
  {
    "status": "success"
  }
  ```

---

### POST `/api/customers/:phone/send-message`
Mengirimkan pesan WhatsApp manual kepada pelanggan melalui bot dari halaman dashboard. 
> [!IMPORTANT]
> Pemanggilan endpoint ini secara otomatis akan **menonaktifkan respon otomatis AI** (`ai_enabled` diubah menjadi `false`) dan **mereset status handoff admin** (`needs_admin` diubah menjadi `false`) untuk nomor tersebut agar admin dapat mengontrol percakapan secara penuh tanpa interupsi bot.

- **Path Parameters**:
  - `phone`: Nomor telepon JID pelanggan.
- **Request Body (JSON)**:
  ```json
  {
    "text": "Halo Kak, pesanannya sudah kami catat ya. Nanti akan dikirim via kurir jam 10 pagi."
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "status": "success",
    "messageId": "BAE582C7E9C850FA"
  }
  ```
- **Response (503 Service Unavailable)**:
  ```json
  {
    "status": "error",
    "message": "WhatsApp client is not ready."
  }
  ```

---

## 4. Kategori: Catalog (Manajemen Produk)

### GET `/api/products`
Mendapatkan daftar seluruh produk kue/katalog yang terdaftar di database, diurutkan berdasarkan ID produk secara naik (asc).

- **Response (200 OK)**:
  ```json
  [
    {
      "id": 1,
      "product_name": "Latezza Chocolate Classic Cake 15cm",
      "price": 150000,
      "description": "Kue cokelat klasik dengan ganache melimpah dan tekstur lembut.",
      "image_url": "http://localhost:3001/uploads/chocolate_classic.jpg",
      "shopee_link": "https://shopee.co.id/latezza-chocolate-classic-15",
      "embedding": null,
      "created_at": "2026-06-19T08:00:00.000Z"
    }
  ]
  ```

---

### POST `/api/products`
Menambahkan produk baru ke dalam katalog. Backend akan otomatis menjadwalkan pembentukan vector embedding (`gemini-embedding-2`) dari teks `product_name` + `description` di latar belakang (tanpa menghalangi respons HTTP).

- **Request Body (JSON)**:
  ```json
  {
    "product_name": "Matcha Tiramisu Cake 20cm",
    "price": 210000,
    "description": "Kue matcha premium dipadukan dengan keju mascarpone lembut ala Italia.",
    "image_url": "http://localhost:3001/uploads/matcha_tiramisu.jpg",
    "shopee_link": "https://shopee.co.id/matcha-tiramisu-20"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "id": 16,
    "product_name": "Matcha Tiramisu Cake 20cm",
    "price": 210000,
    "description": "Kue matcha premium dipadukan dengan keju mascarpone lembut ala Italia.",
    "image_url": "http://localhost:3001/uploads/matcha_tiramisu.jpg",
    "shopee_link": "https://shopee.co.id/matcha-tiramisu-20",
    "embedding": null,
    "created_at": "2026-06-20T15:32:00.000Z"
  }
  ```

---

### PUT `/api/products/:id`
Memperbarui data produk yang sudah ada berdasarkan ID produk. Embedding baru juga akan di-generate ulang di latar belakang secara asinkron.

- **Path Parameters**:
  - `id`: ID unik produk (integer).
- **Request Body (JSON)**:
  ```json
  {
    "product_name": "Matcha Tiramisu Cake 20cm (New Recipe)",
    "price": 220000,
    "description": "Kue matcha premium dengan lapisan keju mascarpone melimpah dan taburan bubuk matcha Jepang murni.",
    "image_url": "http://localhost:3001/uploads/matcha_tiramisu_v2.jpg",
    "shopee_link": "https://shopee.co.id/matcha-tiramisu-20"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "id": 16,
    "product_name": "Matcha Tiramisu Cake 20cm (New Recipe)",
    "price": 220000,
    "description": "Kue matcha premium dengan lapisan keju mascarpone melimpah dan taburan bubuk matcha Jepang murni.",
    "image_url": "http://localhost:3001/uploads/matcha_tiramisu_v2.jpg",
    "shopee_link": "https://shopee.co.id/matcha-tiramisu-20",
    "embedding": null,
    "created_at": "2026-06-20T15:32:00.000Z"
  }
  ```
- **Response (404 Not Found)**:
  ```json
  {
    "status": "error",
    "message": "Product not found."
  }
  ```

---

### DELETE `/api/products/:id`
Menghapus produk tertentu dari katalog database berdasarkan ID.

- **Path Parameters**:
  - `id`: ID unik produk (integer).
- **Response (200 OK)**:
  ```json
  {
    "status": "success",
    "message": "Product deleted successfully."
  }
  ```
- **Response (404 Not Found)**:
  ```json
  {
    "status": "error",
    "message": "Product not found."
  }
  ```

---

## 5. Kategori: Integrasi WhatsApp

### GET `/api/whatsapp/groups`
Mendapatkan daftar seluruh grup WhatsApp yang diikuti oleh bot (digunakan oleh admin untuk memilih grup target siaran laporan performa iklan).

- **Response (200 OK)**:
  ```json
  [
    {
      "id": "120363427625298309@g.us",
      "subject": "Tim Marketing Latezza Cake"
    },
    {
      "id": "120363198276182736@g.us",
      "subject": "Latezza Cake Internal Group"
    }
  ]
  ```
- **Response (Error Fallback)**:
  Mengembalikan array kosong `[]` jika pemanggilan fungsi Baileys `whatsappService.getGroups()` gagal.

---

### POST `/send-message`
Mengirimkan pesan teks WhatsApp mentah secara langsung ke nomor personal (JID) atau grup mana saja. Endpoint ini murni berfungsi untuk utilitas pengiriman dan **tidak merekam pesan** ke database CRM (`chat_histories` & `customers`).

- **Request Body (JSON)**:
  ```json
  {
    "jid": "120363427625298309@g.us",
    "text": "Pengumuman: Laporan performa ads hari ini sedang diproses."
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "status": "success",
    "messageId": "BAE582C7E9C850FA"
  }
  ```
- **Response (503 Service Unavailable / 500 Error)**:
  ```json
  {
    "status": "error",
    "message": "WhatsApp client is not ready."
  }
  ```

---

## 6. Kategori: Pengaturan & Prompt

### GET `/api/settings`
Mendapatkan semua konfigurasi sistem yang tersimpan di basis data. Nilai untuk API Key atau kredensial rahasia (seperti Gemini API Key dan Meta Access Token) dikembalikan dalam keadaan terenkripsi parsial (disamarkan/masked) untuk keamanan.

- **Response (200 OK)**:
  ```json
  {
    "gemini_api_key": "AIzaSyAb...6FGH",
    "whatsapp_group_jid": "120363427625298309@g.us",
    "rate_limit_max": "5",
    "rate_limit_window": "60000",
    "followup_hours": "24",
    "system_instruction": "Anda adalah asisten penjualan Latezza Cake yang ramah...",
    "followup_instruction": "Tanyakan dengan nada sopan apakah mereka ingin melanjutkan pesanan...",
    "meta_access_token": "EAAB76ba...zY78",
    "meta_ad_account_id": "act_1020304050",
    "ads_analysis_frequency": "1",
    "ads_analysis_time": "09:00",
    "creative_analysis_frequency": "7",
    "creative_analysis_time": "09:00"
  }
  ```

---

### POST `/api/settings`
Memperbarui konfigurasi sistem di database dan memperbarui cache memori instan (`settingsCache`).
> [!TIP]
> Endpoint ini secara otomatis memicu pembatalan dan penjadwalan ulang instan seluruh tugas latar belakang (`node-cron` untuk Ads Report & Creative Analysis) sesuai parameter frekuensi dan waktu baru, tanpa membutuhkan restart server backend.
> Key `gemini_api_key` dan `meta_access_token` tidak akan diperbarui di database apabila request body mengandung nilai yang disamarkan (mengandung karakter `'...'`).

- **Request Body (JSON)**:
  - *Semua parameter bersifat opsional.*
  ```json
  {
    "gemini_api_key": "AIzaSyAbC1234567890defGHIJKL",
    "whatsapp_group_jid": "120363427625298309@g.us",
    "rate_limit_max": "10",
    "rate_limit_window": "60000",
    "followup_hours": "12",
    "system_instruction": "Anda adalah asisten Latezza Cake yang sangat ceria...",
    "followup_instruction": "Tawarkan diskon 5% jika membalas dalam 1 jam.",
    "meta_access_token": "EAAB76baC123456789...",
    "meta_ad_account_id": "act_1020304050",
    "ads_analysis_frequency": "2",
    "ads_analysis_time": "10:00",
    "creative_analysis_frequency": "5",
    "creative_analysis_time": "14:30"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "status": "success"
  }
  ```

---

### GET `/api/settings/default-system-prompt`
Mengambil salinan teks instruksi prompt sistem bawaan (default system instructions) untuk Agen AI yang dibangun secara dinamis oleh backend (gabungan instruksi kepribadian dasar dan data produk ter-embedding).

- **Response (200 OK)**:
  ```json
  {
    "default_system_prompt": "Anda adalah asisten penjualan Latezza Cake. Jawab pertanyaan pelanggan dengan sopan...\n\nBerikut adalah daftar produk kami:\n..."
  }
  ```

---

## 7. Kategori: Automasi Ads & Creative

### POST `/run-analysis`
Menjalankan skrip ekstraksi data Meta Ads API (`ads-analysis/automation.js`) secara sinkron sebagai sub-proses (`child_process.exec`). Endpoint ini akan memblokir dan mengembalikan output stdout/stderr proses setelah skrip selesai dieksekusi.

- **Response (200 OK)**:
  ```json
  {
    "status": "success",
    "stdout": "Meta Ads fetcher started...\nAnalysis completed successfully.",
    "stderr": "",
    "publicUrl": "https://dashboard.latezzacake.com",
    "whatsappGroupJid": "120363427625298309@g.us"
  }
  ```
- **Response (500 Internal Server Error)**:
  ```json
  {
    "status": "error",
    "message": "Command failed: node automation.js ...",
    "stdout": "Meta Ads fetcher started...\nAuthentication failed.",
    "stderr": "Error: Invalid Access Token"
  }
  ```

---

### POST `/trigger-analysis`
Memicu eksekusi analisis performa iklan Meta Ads di latar belakang secara asinkron. Iklan akan dianalisis, berkas `report.html` akan di-overwrite, dan laporan teks ringkasan akan diposting otomatis ke grup WhatsApp target.

- **Response (200 OK)**:
  ```json
  {
    "status": "success",
    "message": "Analysis triggered in background."
  }
  ```

---

### GET `/api/creative-report`
Mengambil laporan terstruktur berupa analisis ide kreatif konten ad terbaru yang disimpan di basis data.

- **Response (200 OK)**:
  ```json
  {
    "metadata": {
      "generated_at": "2026-06-20T09:00:00.000Z",
      "ad_account_id": "act_1020304050"
    },
    "summary": {
      "winners_count": 2,
      "losers_count": 3
    },
    "analysis": {
      "winners": [
        {
          "ad_name": "Promo Birthday Cake Juni",
          "spend": 500000,
          "conversions": 45,
          "cpr": 11111,
          "caption": "Momen spesial makin manis dengan Birthday Cake Latezza...",
          "audit": "Performa sangat baik karena Call-To-Action (CTA) jelas dan visual kue menarik."
        }
      ],
      "losers": [
        {
          "ad_name": "Ad Kue Kering Cokelat",
          "spend": 300000,
          "conversions": 2,
          "cpr": 150000,
          "caption": "Cobain rasa renyah cokelat lumer Latezza...",
          "audit": "Tingginya Cost Per Result disebabkan oleh kejenuhan materi kreatif atau kurangnya penawaran terbatas."
        }
      ]
    },
    "recommendations": [
      {
        "concept": "Promo Flash Sale Kue Ulang Tahun",
        "copy_variation": "KHUSUS HARI INI! Dapatkan diskon spesial kue ultah...",
        "visual_brief": "Tampilkan video potongan kue cokelat dengan cokelat cair yang mengalir perlahan."
      }
    ]
  }
  ```
- **Response (404 Not Found)**:
  ```json
  {
    "status": "error",
    "message": "Laporan kreatif belum pernah digenerate. Silakan trigger regenerasi."
  }
  ```

---

### POST `/api/trigger-creative-analysis`
Memicu audit dan regenerasi analisis konten kreatif Meta Ads di latar belakang secara asinkron.

- **Response (200 OK)**:
  ```json
  {
    "status": "success",
    "data": {
      "metadata": { "generated_at": "2026-06-20T15:32:00.000Z", ... },
      "summary": { ... },
      "analysis": { ... },
      "recommendations": [ ... ]
    }
  }
  ```
  *(Meskipun berjalan di latar belakang, respons pertama mengembalikan data instan dari DB atau hasil inisialisasi)*

---

### GET `/api/trigger-creative-analysis-stream`
Memicu eksekusi analisis kreatif iklan Meta Ads secara manual dan melakukan streaming kemajuan pengerjaan (progress logs) secara real-time langsung ke browser menggunakan protokol **Server-Sent Events (SSE)**.

- **Response Headers**:
  - `Content-Type`: `text/event-stream`
  - `Cache-Control`: `no-cache`
  - `Connection`: `keep-alive`
- **Response Stream Event Formats**:
  Setiap baris data dikirim dalam format `data: <JSON_STRING>\n\n`.
  - **Info Progress**:
    ```json
    {
      "type": "info",
      "message": "Mengambil data iklan aktif dari Meta Graph API..."
    }
    ```
  - **Error Event**:
    ```json
    {
      "type": "error",
      "message": "Failed to fetch ads: Access Token Expired"
    }
    ```
  - **Selesai Event**:
    ```json
    {
      "type": "done",
      "data": {
        "metadata": { ... },
        "analysis": { ... },
        "recommendations": [ ... ]
      }
    }
    ```

---

## 8. Kategori: Automasi Follow-Up

### POST `/api/trigger-followups`
Menjalankan pemindaian manual atas database untuk menyaring calon pembeli potensial yang tertinggal (`needs_follow_up = true`), membungkus percakapan ke prompt follow-up, memanggil model Gemini untuk menyusun teks sapaan personal, dan langsung mengirimkannya ke WhatsApp mereka secara sinkron.
> [!NOTE]
> Pemanggilan manual ini akan **mengabaikan batas waktu keaktifan** (`followup_hours`), membolehkan pesan follow-up dikirimkan secara langsung terlepas dari seberapa baru interaksi terakhir mereka untuk keperluan pengujian instan.

- **Response (200 OK)**:
  ```json
  {
    "status": "success",
    "message": "Proses follow-up selesai dijalankan."
  }
  ```

---

### POST `/run-followup`
Memicu pemindaian follow-up manual yang sama dengan `/api/trigger-followups`, tetapi eksekusi diproses di latar belakang secara asinkron tanpa memblokir request HTTP.

- **Response (200 OK)**:
  ```json
  {
    "status": "success",
    "message": "Follow-up scan triggered in background. Check server logs."
  }
  ```
