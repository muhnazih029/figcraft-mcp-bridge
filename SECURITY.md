# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 0.1.x | ✅ |

## Reporting a vulnerability

Jangan buka issue publik untuk kerentanan. Kirim laporan lewat GitHub Security
Advisory ("Report a vulnerability") pada repositori ini, sertakan:

- versi bridge, Bun, FigCraft, dan OpenCode;
- langkah reproducing;
- dampak yang mungkin terjadi.

Laporan akan dibalas paling lambat 7 hari.

## Catatan penting

Control port FigCraft adalah TCP **loopback tanpa autentikasi**. Siapa pun yang bisa
menjalankan proses sebagai user yang sama pada mesin itu dapat mengirim perintah
desain (baca dokumen, ubah layer, export/save file). Jangan pernah meneruskan port
tersebut ke jaringan, dan jangan menyimpan kredensial di environment bridge ini.
