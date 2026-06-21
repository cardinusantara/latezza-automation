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
| 16 | WhatsApp | GET | `/api/whatsapp/groups` | Mendapatkan daftar grup WhatsApp yang diikuti bot (opsional dengan session_id). |
| 17 | WhatsApp | GET | `/api/whatsapp/sessions` | Mendapatkan daftar seluruh sesi WhatsApp beserta status & QR. |
| 18 | WhatsApp | POST | `/api/whatsapp/sessions` | Membuat sesi WhatsApp baru (menginisialisasi koneksi). |
| 19 | WhatsApp | DELETE | `/api/whatsapp/sessions/:id` | Menghapus sesi WhatsApp, menutup koneksi dan folder kredensial. |
| 20 | WhatsApp | POST | `/api/whatsapp/sessions/:id/regenerate` | Mereset sesi WhatsApp untuk generate QR code baru. |
| 21 | WhatsApp | POST | `/send-message` | Mengirim pesan WhatsApp mentah ke nomor/grup mana saja. |
| 22 | Pengaturan | GET | `/api/settings` | Mendapatkan konfigurasi sistem (API Key disamarkan). |
| 23 | Pengaturan | POST | `/api/settings` | Menyimpan konfigurasi sistem (otomatis memuat ulang scheduler). |
| 24 | Pengaturan | GET | `/api/settings/default-system-prompt` | Melihat draf default prompt sistem agen AI. |
| 25 | Ads & Creative | POST | `/run-analysis` | Menjalankan skrip analisis Meta Ads secara sinkron. |
| 26 | Ads & Creative | POST | `/trigger-analysis` | Memicu analisis Meta Ads dan siaran laporan di latar belakang. |
| 27 | Ads & Creative | GET | `/api/run-analysis-stream` | Memicu analisis Meta Ads manual dengan Server-Sent Events (SSE) progress stream. |
| 28 | Ads & Creative | GET | `/api/creative-report` | Mengambil laporan ide konten kreatif ad terbaru. |
| 29 | Ads & Creative | POST | `/api/trigger-creative-analysis` | Memicu audit kreatif di latar belakang. |
| 30 | Ads & Creative | GET | `/api/trigger-creative-analysis-stream` | Memicu audit kreatif dan melakukan streaming progress (SSE). |
| 31 | Follow-Up | POST | `/api/trigger-followups` | Memicu pengiriman pesan follow-up manual (sinkron). |
| 32 | Follow-Up | POST | `/run-followup` | Memicu pengiriman pesan follow-up manual (latar belakang). |
| 33 | AI Message Summary | GET | `/api/message-summary` | Mengambil laporan ringkasan pesan AI terbaru. |
| 34 | AI Message Summary | GET | `/api/trigger-message-summary-stream` | Memicu pembuatan ringkasan pesan AI dan melakukan streaming progress (SSE). |

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

- **Query Parameters**:
  - `session_id` (string, opsional): ID sesi WhatsApp tertentu. Gunakan `'all'` untuk menampilkan statistik agregasi dari seluruh sesi WhatsApp yang terdaftar. Default: `'default'`.
- **Response (200 OK)**:
  ```json
  {
    "status": "connected",
    "totalLeads": 42,
    "totalProducts": 15,
    "pendingFollowUps": 3,
    "incomingMessages": {
      "last24h": 42,
      "last7d": 280,
      "last30d": 1100
    },
    "newLeads": {
      "last24h": 5,
      "last7d": 30,
      "last30d": 95
    },
    "recentLeads": [
      {
        "phone_number": "628123456789@s.whatsapp.net",
        "session_id": "default",
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
Mendapatkan daftar seluruh kontak pelanggan yang terekam di database untuk sesi WhatsApp tertentu, diurutkan berdasarkan waktu interaksi terakhir secara menurun (terbaru dahulu).

- **Query Parameters**:
  - `session_id` (string, opsional): ID sesi WhatsApp tertentu. Default: `'default'`.
- **Response (200 OK)**:
  ```json
  [
    {
      "phone_number": "628123456789@s.whatsapp.net",
      "session_id": "default",
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
Mendapatkan informasi detail tentang profil satu pelanggan tertentu berdasarkan nomor telepon (JID) dan sesi WhatsApp-nya.

- **Path Parameters**:
  - `phone`: Nomor telepon JID pelanggan (contoh: `628123456789@s.whatsapp.net`).
- **Query Parameters**:
  - `session_id` (string, opsional): ID sesi WhatsApp tertentu. Default: `'default'`.
- **Response (200 OK)**:
  ```json
  {
    "phone_number": "628123456789@s.whatsapp.net",
    "session_id": "default",
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
Mengambil semua riwayat pesan WhatsApp antara bot agen AI dan pelanggan tersebut pada sesi WhatsApp tertentu, diurutkan secara kronologis (pesan terlama dahulu).

- **Path Parameters**:
  - `phone`: Nomor telepon JID pelanggan.
- **Query Parameters**:
  - `session_id` (string, opsional): ID sesi WhatsApp tertentu. Default: `'default'`.
- **Response (200 OK)**:
  ```json
  [
    {
      "role": "user",
      "content": "[Voice Note: /uploads/voice_1718873212873.ogg] Halo, mau tanya marmer cakenya ready?",
      "timestamp": "2026-06-20T14:55:00.000Z"
    },
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
  *(Catatan: Pesan media yang dikirim oleh pelanggan disimpan dengan format khusus di database: foto menggunakan awalan `[Foto: <url>] <caption_or_empty>`, dan pesan suara/voice note menggunakan awalan `[Voice Note: <url>] <transcription>` untuk mendukung pemutaran audio player langsung di dashboard.)*

---

### POST `/api/customers/:phone/toggle-ai`
Mengaktifkan atau menonaktifkan agen AI dalam merespon pesan WhatsApp dari pelanggan tertentu pada sesi tertentu. Jika dinonaktifkan (`ai_enabled: false`), bot tidak akan merespon pesan masuk secara otomatis, sehingga admin dapat membalas secara manual dari dashboard.

- **Path Parameters**:
  - `phone`: Nomor telepon JID pelanggan.
- **Request Body (JSON)**:
  ```json
  {
    "ai_enabled": false,
    "session_id": "default"
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
Memperbarui kolom status CRM dan kolom catatan internal (`notes`) untuk pelanggan tertentu pada sesi tertentu.

- **Path Parameters**:
  - `phone`: Nomor telepon JID pelanggan.
- **Request Body (JSON)**:
  ```json
  {
    "status": "customer",
    "notes": "Sudah melakukan pembayaran DP untuk pesanan tanggal 25 Juni",
    "session_id": "default"
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
Mengirimkan pesan WhatsApp manual kepada pelanggan melalui bot dari halaman dashboard menggunakan sesi tertentu. Endpoint ini mendukung pengiriman pesan teks maupun rekaman suara (voice note).
> [!IMPORTANT]
> Pemanggilan endpoint ini secara otomatis akan **menonaktifkan respon otomatis AI** (`ai_enabled` diubah menjadi `false`) dan **mereset status handoff admin** (`needs_admin` diubah menjadi `false`) untuk nomor tersebut agar admin dapat mengontrol percakapan secara penuh tanpa interupsi bot.

- **Path Parameters**:
  - `phone`: Nomor telepon JID pelanggan.
- **Request Body (JSON)**:
  - Mengirim pesan teks:
    ```json
    {
      "text": "Halo Kak, pesanannya sudah kami catat ya. Nanti akan dikirim via kurir jam 10 pagi.",
      "session_id": "default"
    }
    ```
  - Mengirim pesan suara (voice note):
    ```json
    {
      "audioBase64": "GkXfo69ChoEBQveBAULygQRC84EIQoKEd...",
      "mimetype": "audio/webm",
      "session_id": "default"
    }
    ```
- **Response (200 OK)**:
  - Untuk pesan teks:
    ```json
    {
      "status": "success",
      "messageId": "BAE582C7E9C850FA"
    }
    ```
  - Untuk pesan suara (mengembalikan URL audio dan transkripsi Gemini):
    ```json
    {
      "status": "success",
      "messageId": "BAE582C7E9C850FA",
      "voiceUrl": "/uploads/voice_out_1718873212873.ogg",
      "transcription": "Halo, pesanan custom cake-nya sudah kami terima ya."
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

- **Query Parameters**:
  - `session_id` (string, opsional): ID sesi WhatsApp tertentu yang ingin diambil daftar grupnya. Default: `'default'`.
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
  Mengembalikan array kosong `[]` jika pemanggilan fungsi Baileys `whatsappService.getGroups(session_id)` gagal.

---

### GET `/api/whatsapp/sessions`
Mendapatkan daftar seluruh sesi WhatsApp yang terdaftar beserta status koneksi dan QR code (jika statusnya `qr_received`).

- **Response (200 OK)**:
  ```json
  [
    {
      "id": "default",
      "name": "Default Agent",
      "phone_number": "6281188027702",
      "status": "connected",
      "qr_code": null,
      "created_at": "2026-06-20T15:30:26.123Z",
      "updated_at": "2026-06-20T15:30:26.123Z"
    },
    {
      "id": "cs-hampers",
      "name": "CS Hampers",
      "phone_number": null,
      "status": "qr_received",
      "qr_code": "2@gK8h...",
      "created_at": "2026-06-20T16:05:12.123Z",
      "updated_at": "2026-06-20T16:05:15.123Z"
    }
  ]
  ```

---

### POST `/api/whatsapp/sessions`
Membuat sesi WhatsApp baru di database dan menginisialisasi socket Baileys baru di latar belakang.

- **Request Body (JSON)**:
  ```json
  {
    "id": "cs-hampers",
    "name": "CS Hampers"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "status": "success",
    "data": {
      "id": "cs-hampers",
      "name": "CS Hampers",
      "status": "disconnected",
      "created_at": "2026-06-20T16:05:12.123Z"
    }
  }
  ```

---

### DELETE `/api/whatsapp/sessions/:id`
Menghapus sesi WhatsApp dari database, memutus koneksi socket yang aktif, dan menghapus folder kredensial sesi tersebut secara permanen.

- **Response (200 OK)**:
  ```json
  {
    "status": "success",
    "message": "Session cs-hampers deleted successfully."
  }
  ```

---

### POST `/api/whatsapp/sessions/:id/regenerate`
Mereset sesi WhatsApp tertentu. Tindakan ini akan menutup koneksi, menghapus kredensial lama, dan menginisialisasi ulang koneksi baru untuk menghasilkan QR code baru.

- **Response (200 OK)**:
  ```json
  {
    "status": "success",
    "message": "Session cs-hampers regenerated successfully."
  }
  ```

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

- **Request Body (JSON)**:
  - *Semua parameter bersifat opsional.* Jika sumber data diatur ke CSV (bukan API), parameter rentang tanggal ini digunakan untuk memfilter baris data CSV secara proporsional berdasarkan rentang tanggal yang saling tumpang tindih (overlap).
  ```json
  {
    "date_from": "2026-06-01",
    "date_to": "2026-06-07"
  }
  ```
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

- **Request Body (JSON)**:
  - *Semua parameter bersifat opsional.*
  ```json
  {
    "date_from": "2026-06-01",
    "date_to": "2026-06-07"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "status": "success",
    "message": "Analysis triggered in background."
  }
  ```

---

### GET `/api/run-analysis-stream`
Memicu eksekusi analisis performa iklan Meta Ads secara manual dan melakukan streaming progress logs (stdout & stderr) secara real-time langsung ke browser menggunakan protokol **Server-Sent Events (SSE)**.

- **Query Parameters**:
  - `date_from` (string, opsional): Tanggal mulai analisis (format `YYYY-MM-DD`).
  - `date_to` (string, opsional): Tanggal akhir analisis (format `YYYY-MM-DD`).
- **Response Headers**:
  - `Content-Type`: `text/event-stream`
  - `Cache-Control`: `no-cache`
  - `Connection`: `keep-alive`
- **Response Stream Event Formats**:
  Setiap baris data dikirim dalam format `data: <JSON_STRING>\n\n`.
  - **Info Progress Status**:
    ```json
    {
      "type": "status",
      "message": "Mengambil data real-time dari Meta Ads API..."
    }
    ```
  - **Raw Stream Logs Chunk (stdout/stderr)**:
    ```json
    {
      "type": "chunk",
      "text": "Analysis date range: 2026-06-14 → 2026-06-21\n..."
    }
    ```
  - **Error Event**:
    ```json
    {
      "type": "error",
      "message": "Command failed: node automation.js ..."
    }
    ```
  - **Done Event**:
    Mengembalikan data ringkasan laporan setelah proses selesai berhasil.
    ```json
    {
      "type": "done",
      "data": {
        "custom": {
          "summary": "Laporan performa iklan...",
          "dateRange": "14 Juni 2026 – 21 Juni 2026"
        }
      }
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

- **Request Body (JSON, opsional)**:
  - `prompt` (string, opsional): Instruksi tambahan dari pengguna untuk mengarahkan gaya, tipe, atau fokus konten (contoh: "Fokus ke konten Reels edukasi cake custom").
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

- **Query Parameters**:
  - `prompt` (string, opsional): Instruksi tambahan dari pengguna untuk mengarahkan gaya, tipe, atau fokus konten (harus di-URL encode).
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

---

## 9. Kategori: AI Message Summary (Ringkasan Pesan)

### GET `/api/message-summary`
Mengambil laporan ringkasan analisis pesan pelanggan terakhir yang tersimpan di dalam pengaturan basis data.

- **Response (200 OK)**:
  ```json
  {
    "generatedAt": "2026-06-21T21:20:00.000Z",
    "dateRange": "today",
    "sessionId": "all",
    "totalMessages": 120,
    "totalCustomers": 18,
    "summary": {
      "totalCustomers": 18,
      "topProducts": [
        "Korean Cake 10cm",
        "Cookies hampers"
      ],
      "commonQuestions": [
        "Menanyakan harga custom cake ukuran 15cm",
        "Menanyakan estimasi waktu pengiriman instan"
      ],
      "complaints": [
        "Ada pelanggan mengeluhkan pengiriman marmer cake yang agak terlambat"
      ],
      "salesOpportunities": [
        "Beberapa pelanggan ingin memesan dalam jumlah banyak (hampers korporat)"
      ],
      "insights": [
        "Minat tertinggi hari ini terpusat pada kategori kue ulang tahun ukuran mini (Korean cake)"
      ]
    }
  }
  ```
- **Response (404 Not Found)**:
  ```json
  {
    "status": "not_found",
    "message": "No summary report available."
  }
  ```

---

### GET `/api/trigger-message-summary-stream`
Memicu eksekusi summarization pesan secara manual menggunakan Gemini AI dengan strategi hierarchical batching, dan melakukan streaming kemajuan pengerjaan (progress logs) secara real-time langsung menggunakan protokol **Server-Sent Events (SSE)**.

- **Query Parameters**:
  - `session_id` (string, opsional): ID sesi WhatsApp tertentu yang ingin dianalisis pesan masuknya. Gunakan `'all'` untuk menganalisis pesan dari semua agen. Default: `'all'`.
  - `date_range` (string, opsional): Rentang waktu percakapan. Pilihan: `'today'`, `'3d'`, `'7d'`, `'30d'`. Default: `'today'`.
- **Response Headers**:
  - `Content-Type`: `text/event-stream`
  - `Cache-Control`: `no-cache`
  - `Connection`: `keep-alive`
- **Response Stream Event Formats**:
  Setiap baris data dikirim dalam format `data: <JSON_STRING>\n\n`.
  - **Status Progress Event**:
    ```json
    {
      "type": "status",
      "message": "Mengambil riwayat percakapan dari database..."
    }
    ```
  - **Selesai Event**:
    ```json
    {
      "type": "done",
      "data": {
        "generatedAt": "2026-06-21T21:20:00.000Z",
        "dateRange": "today",
        "sessionId": "all",
        "totalMessages": 120,
        "totalCustomers": 18,
        "summary": { ... }
      }
    }
    ```
  - **Error Event**:
    ```json
    {
      "type": "error",
      "message": "Missing active Gemini API key. Cannot run AI analysis."
    }
    ```
