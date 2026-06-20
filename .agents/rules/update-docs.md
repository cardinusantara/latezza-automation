---
trigger: always_on
description: Rule to always update CHANGELOG.md, DEVELOPER.md, and API.md on any code changes.
---

## update-docs

Setiap kali Anda (asisten AI) mendeteksi adanya perubahan kode (penambahan fitur baru, perbaikan bug, refactoring, perubahan database, dll), Anda wajib mematuhi aturan berikut:

Rules:
1. **Perbarui CHANGELOG.md**:
   - Tambahkan entri perubahan di bagian paling atas berkas (di bawah subheader tanggal `## YYYY-MM-DD`).
   - Kelompokkan perubahan secara logis (misalnya, `### WhatsApp Multi-Session & QR Scanner Dashboard`).
   - Tulis poin-poin yang jelas, ringkas, dan dapat dibaca oleh AI.

2. **Perbarui DEVELOPER.md**:
   - Jika ada perubahan skema database, tambahkan tabel baru atau perbarui definisi kolom.
   - Jika ada perubahan direktori, struktur proyek, variabel lingkungan `.env`, atau arsitektur utama.
   - Gunakan path berkas absolut (`file:///...`) jika merujuk ke berkas kode lokal.

3. **Perbarui API.md**:
   - Jika ada penambahan endpoint baru, parameter kueri baru (`query param`), body request baru, atau struktur respon baru.
   - Perbarui tabel ringkasan endpoint di bagian atas serta detail penjelasannya di kategori yang sesuai.

Rincian panduan langkah demi langkah dapat dilihat di berkas alur kerja [.agents/workflows/update-docs.md](file:///c:/Users/Fardhan%20Rasya/Documents/kerja/inhands/cardi-automation/latezza-automation/.agents/workflows/update-docs.md).
