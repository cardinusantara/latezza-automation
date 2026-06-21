---
trigger: always_on
description: Rule to enforce writing and updating unit tests for any new or modified code/features.
---

## write-tests

Setiap kali Anda (asisten AI) mendeteksi adanya perubahan kode (penambahan fitur baru, perbaikan bug, refactoring, perubahan database, dll), Anda wajib mematuhi aturan berikut:

Rules:
1. **Tulis Unit Test**:
   - Jika membuat fitur baru, buat berkas unit test baru yang sesuai di folder pengujian (`__tests__`).
   - Jika mengubah fitur yang sudah ada, perbarui berkas unit test yang ada untuk mencakup perubahan perilaku kode tersebut.
   - Semua test harus menggunakan *mocking* untuk menghindari pemanggilan eksternal (seperti database PostgreSQL, WhatsApp Baileys socket, dan Google Gemini AI API).

2. **Jalankan Uji Coba (Verifikasi)**:
   - Pastikan untuk menjalankan pengujian di folder masing-masing (`backend` atau `frontend`) sebelum menyelesaikan tugas Anda.
   - Uji coba harus 100% lulus (green).

Rincian panduan langkah demi langkah dapat dilihat di berkas alur kerja [.agents/workflows/write-tests.md](file:///c:/Users/Fardhan%20Rasya/Documents/kerja/inhands/cardi-automation/latezza-automation/.agents/workflows/write-tests.md).
