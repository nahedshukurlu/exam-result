# İmtahan Nəticələri Sistemi

Bu sistem tələbələrin imtahan nəticələrini kod vasitəsilə yoxlamaq üçün hazırlanmışdır. Admin Excel fayllarını yükləyərək nəticələri sisteme əlavə edə bilər.

## Xüsusiyyətlər

- **Admin Paneli**: Excel fayllarını yükləmək və bütün nəticələri görüntüləmək
- **Tələbə Paneli**: Kod daxil edərək şəxsi nəticələri yoxlamaq
- **Fayl Saxlama**: Excel faylları server-də real olaraq saxlanılır
- **Responsive Dizayn**: Bütün cihazlarda işləyir

## Texnologiyalar

- **Backend**: Node.js + Express
- **Frontend**: React + Tailwind CSS
- **Veritabanı**: SQLite
- **Fayl Yükləmə**: Multer
- **Excel İşləmə**: xlsx

## Quraşdırma

### 1. Dependencies quraşdırma

```bash
# Backend dependencies
npm install

# Frontend dependencies
cd client
npm install
cd ..
```

### 2. Layihəni işə salma

```bash
# Backend server-i işə salma
npm start

# Yeni terminal pəncərəsində frontend-i işə salma
cd client
npm start
```

### 3. İstifadə

- **Tələbə Paneli**: http://localhost:3000
- **Admin Paneli**: http://localhost:3000/admin
- **Backend API**: http://localhost:5000

## Excel Fayl Formatı

Excel faylınızda aşağıdakı sütunlar olmalıdır:

| Kod | Ad | Soyad | Fənn | Bal |
|-----|----|----|----|----|
| ST001 | Əli | Məmmədov | Riyaziyyat | 85 |
| ST002 | Ayşə | Həsənova | Fizika | 92 |

**Qeyd**: Sütun adları dəyişə bilər (Kod/kod/KOD, Ad/ad/AD və s.)

## API Endpointləri

- `POST /api/upload-excel` - Excel fayl yükləmə
- `GET /api/check-result/:kod` - Tələbə nəticə yoxlama
- `GET /api/all-results` - Bütün nəticələri göstərmə

## Fayl Strukturu

```
imtahan/
├── server.js              # Backend server
├── package.json           # Backend dependencies
├── imtahan.db            # SQLite veritabanı
├── uploads/              # Excel faylları burada saxlanılır
└── client/               # React frontend
    ├── src/
    │   ├── components/
    │   │   ├── StudentPanel.js
    │   │   └── AdminPanel.js
    │   ├── App.js
    │   └── index.js
    └── package.json
```

## Təhlükəsizlik

- Yalnız Excel faylları qəbul edilir
- Fayllar server-də təhlükəsiz saxlanılır
- SQL injection qorunması
- CORS konfiqurasiyası

## Problemlər və Həllər

### Excel fayl yüklənmir
- Fayl formatını yoxlayın (.xlsx, .xls)
- Sütun adlarının düzgün olduğunu yoxlayın

### Nəticə tapılmır
- Kodun düzgün daxil edildiyini yoxlayın
- Admin tərəfindən faylın yükləndiyini yoxlayın

## Dəstək

Hər hansı problem üçün sistem loglarını yoxlayın və ya developer ilə əlaqə saxlayın.
