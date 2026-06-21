---
name: write-tests
description: Panduan wajib untuk membuat dan menjalankan unit test setiap kali melakukan penambahan fitur atau modifikasi kode
---

# Workflow: Menulis & Menjalankan Unit Test

Alur kerja ini harus diikuti setiap kali agen AI menambahkan fitur baru, memperbaiki bug, melakukan refactoring, atau memodifikasi berkas kode yang ada di dalam proyek.

## 📋 Langkah-langkah Pembuatan Test

### 1. Tentukan Cakupan Pengujian
- Identifikasi fungsi, utilitas, service, atau komponen React yang ditambahkan atau diubah.
- Tentukan skenario positif (happy path) dan skenario negatif (edge cases/error handling).

### 2. Buat/Perbarui Berkas Test
- **Backend (Fastify/Node.js)**:
  - Berkas test harus diletakkan di dalam folder `backend/src/__tests__/` dengan akhiran `.test.js` (contoh: `my-service.test.js`).
  - Gunakan `jest.mock()` untuk semua panggilan pihak ketiga (`pg`, `@google/generative-ai`, `@whiskeysockets/baileys`).
  - Gunakan `fastify.inject()` untuk menguji endpoint HTTP tanpa perlu menyalakan server secara langsung.
- **Frontend (React/Vite)**:
  - Berkas test harus diletakkan di folder yang sesuai dengan berkas aslinya atau di bawah folder `__tests__` dengan akhiran `.test.tsx` atau `.test.ts`.
  - Gunakan `vitest` sebagai test runner dan `@testing-library/react` untuk pengujian render komponen DOM.
  - Mock API request menggunakan spy/mock pada `global.fetch`.

### 3. Jalankan Pengujian Secara Lokal
Sebelum menyelesaikan tugas, jalankan perintah uji coba di folder masing-masing:
- **Di folder `backend/`**:
  ```bash
  npm test
  ```
- **Di folder `frontend/`**:
  ```bash
  npm run test
  ```

## 📌 Aturan Penting
- Semua unit test **wajib** lolos (green) sebelum membuat laporan selesai.
- Mocking harus diatur dengan teliti agar pengujian bersifat independen dan dapat dijalankan di lingkungan CI/CD tanpa koneksi database atau internet.
