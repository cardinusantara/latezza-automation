---
name: update-docs
description: Panduan wajib untuk memperbarui berkas CHANGELOG.md dan dokumentasi proyek (DEVELOPER.md, API.md) setiap kali melakukan perubahan kode
---

# Workflow: Update Dokumentasi & Changelog

Alur kerja ini harus dijalankan setiap kali agen AI menyelesaikan tugas modifikasi, perbaikan, atau penambahan fitur di dalam proyek.

## 📋 Langkah-langkah Pembaruan

### 1. Perbarui `CHANGELOG.md`
- Masukkan entri baru di bagian paling atas berkas (di bawah judul dan deskripsi format).
- Gunakan tanggal saat ini dengan format `## YYYY-MM-DD`.
- Kelompokkan perubahan berdasarkan modul/fitur dengan subheader `### Nama Fitur`.
- Gunakan daftar poin (`-`) dengan penjelasan ringkas, lugas, ramah-AI, dan tanpa hiasan markdown berlebih.

### 2. Perbarui `DEVELOPER.md` (Jika Perlu)
Perbarui berkas ini jika terdapat:
- Perubahan atau penambahan struktur direktori proyek.
- Perubahan cara instalasi, konfigurasi, atau cara menjalankan aplikasi.
- Penambahan variabel lingkungan baru di berkas `.env` (backend maupun frontend).
- Perubahan arsitektur sistem atau pustaka utama yang digunakan.

### 3. Perbarui `API.md` (Jika Perlu)
Perbarui berkas ini jika terdapat:
- Penambahan endpoint HTTP/REST API baru di backend.
- Perubahan parameter input (Path, Query, atau Request Body) pada endpoint yang sudah ada.
- Perubahan struktur response (JSON, status code, dll) pada endpoint yang sudah ada.
- Gunakan format tabel ringkasan di awal berkas dan dokumentasikan detail endpoint di kategori yang sesuai.

## 📌 Aturan Penting
- Jangan pernah menghapus entri riwayat perubahan terdahulu pada berkas `CHANGELOG.md`.
- Pastikan berkas markdown menggunakan tautan file absolut yang valid (`file:///...`) jika merujuk ke berkas kode sumber lokal agar mudah dibuka oleh pengguna atau asisten AI.
