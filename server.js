const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Form data üçün

// Static files serving
const buildPath = path.join(__dirname, 'client/build');
console.log('Looking for build directory at:', buildPath);
console.log('Directory exists:', fs.existsSync(buildPath));

if (fs.existsSync(buildPath)) {
    app.use(express.static(buildPath));
    console.log('Static files served from:', buildPath);
    
    // List files in build directory
    const files = fs.readdirSync(buildPath);
    console.log('Build directory contents:', files);
} else {
    console.log('Build directory not found:', buildPath);
    console.log('Current working directory:', __dirname);
    console.log('Available directories:', fs.readdirSync(__dirname));
    
    // Try alternative paths
    const altPath1 = path.join(__dirname, 'build');
    const altPath2 = path.join(process.cwd(), 'client/build');
    const altPath3 = path.join(process.cwd(), 'build');
    
    console.log('Trying alternative path 1:', altPath1, 'exists:', fs.existsSync(altPath1));
    console.log('Trying alternative path 2:', altPath2, 'exists:', fs.existsSync(altPath2));
    console.log('Trying alternative path 3:', altPath3, 'exists:', fs.existsSync(altPath3));
    
    // Use first available build directory
    if (fs.existsSync(altPath1)) {
        app.use(express.static(altPath1));
        console.log('Using alternative path 1:', altPath1);
    } else if (fs.existsSync(altPath2)) {
        app.use(express.static(altPath2));
        console.log('Using alternative path 2:', altPath2);
    } else if (fs.existsSync(altPath3)) {
        app.use(express.static(altPath3));
        console.log('Using alternative path 3:', altPath3);
    }
}

// Uploads qovluğunu yaratmaq - Render üçün /tmp istifadə et
const uploadsDir = process.env.NODE_ENV === 'production' 
    ? path.join('/tmp', 'uploads') 
    : path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// PDF faylları üçün qovluq
const pdfDir = process.env.NODE_ENV === 'production' 
    ? path.join('/tmp', 'pdfs') 
    : path.join(__dirname, 'uploads', 'pdfs');

if (!fs.existsSync(pdfDir)) {
    fs.mkdirSync(pdfDir, { recursive: true });
}

// Multer konfiqurasiyası - memory storage istifadə et
const storage = multer.memoryStorage();

const upload = multer({ 
    storage: storage,
    fileFilter: function (req, file, cb) {
        console.log('File MIME type:', file.mimetype);
        console.log('File original name:', file.originalname);
        
        if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            file.mimetype === 'application/vnd.ms-excel' ||
            file.originalname.endsWith('.xlsx') ||
            file.originalname.endsWith('.xls')) {
            cb(null, true);
        } else {
            cb(new Error('Yalnız Excel faylları qəbul edilir!'), false);
        }
    }
});

// Fayl yükləmə üçün multer konfiqurasiyası - disk storage (istənilən format)
const pdfStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, pdfDir);
    },
    filename: function (req, file, cb) {
        const sinif = req.body.sinif || 'unknown';
        // Orijinal fayl uzantısını saxla
        const originalExt = path.extname(file.originalname);
        const fileName = `sinif_${sinif}${originalExt}`;
        cb(null, fileName);
    }
});

const uploadPdf = multer({ 
    storage: pdfStorage,
    // Format məhdudiyyəti yoxdur - istənilən format qəbul edilir
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    }
});

// SQLite veritabanı
const dbPath = process.env.DATABASE_URL || path.join(__dirname, 'imtahan.db');
const db = new Database(dbPath);

// Veritabanı cədvəlini yaratmaq
const createTable = () => {
    try {
        db.exec(`CREATE TABLE IF NOT EXISTS imtahan_neticeleri (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kod TEXT NOT NULL,
            ad TEXT NOT NULL,
            soyad TEXT NOT NULL,
            fenn TEXT NOT NULL,
            bal INTEGER NOT NULL,
            variant TEXT,
            bolme TEXT,
            sinif TEXT,
            altqrup TEXT,
            fayl_adi TEXT NOT NULL,
            yuklenme_tarixi DATETIME DEFAULT CURRENT_TIMESTAMP,
            excel_data TEXT,
            UNIQUE(kod, fenn)
        )`);
        
        // PDF faylları üçün cədvəl
        db.exec(`CREATE TABLE IF NOT EXISTS sinif_pdf (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sinif INTEGER NOT NULL UNIQUE,
            fayl_adi TEXT NOT NULL,
            fayl_yolu TEXT NOT NULL,
            yuklenme_tarixi DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        
        console.log('SQLite cədvəlləri yaradıldı');
    } catch (err) {
        console.error('Veritabanı xətası:', err);
    }
};

createTable();

// Admin paneli - Excel fayl yükləmə
app.post('/api/upload-excel', upload.single('excelFile'), async (req, res) => {
    console.log('Upload request received:', req.file);
    try {
        if (!req.file) {
            console.log('No file received');
            return res.status(400).json({ error: 'Excel faylı seçilməyib!' });
        }

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet);

        // Excel məlumatlarını veritabanına yazmaq
        let successCount = 0;
        let errorCount = 0;
        
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileName = 'imtahan-' + uniqueSuffix + '.xlsx';

        for (let index = 0; index < data.length; index++) {
            const row = data[index];
            try {
                const kod = row['Kod'] || row['kod'] || row['KOD'] || row['Student Code'] || row['student_code'];
                const ad = row['Ad'] || row['ad'] || row['AD'] || row['Name'] || row['name'] || row['First Name'];
                const soyad = row['Soyad'] || row['soyad'] || row['SOYAD'] || row['Surname'] || row['surname'] || row['Last Name'];
                const fenn = row['Fənn'] || row['fenn'] || row['FENN'] || row['Subject'] || row['subject'] || row['Course'];
                const bal = row['Bal'] || row['bal'] || row['BAL'] || row['Score'] || row['score'] || row['Grade'] || row['grade'];
                const variant = row['Variant'] || row['variant'] || row['VARIANT'] || '';
                const bolme = row['Bölmə'] || row['bölmə'] || row['BOLME'] || row['Section'] || row['section'] || '';
                const sinif = row['Sinif'] || row['sinif'] || row['SINIF'] || row['Class'] || row['class'] || '';
                const altqrup = row['Altqrup'] || row['altqrup'] || row['ALTQRUP'] || row['Subgroup'] || row['subgroup'] || '';

                const excelData = JSON.stringify(row);

                if (kod && ad && soyad && fenn && bal !== undefined) {
                    const insert = db.prepare(`
                        INSERT INTO imtahan_neticeleri 
                        (kod, ad, soyad, fenn, bal, variant, bolme, sinif, altqrup, fayl_adi, excel_data) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(kod, fenn) DO UPDATE SET
                        ad = excluded.ad,
                        soyad = excluded.soyad,
                        bal = excluded.bal,
                        variant = excluded.variant,
                        bolme = excluded.bolme,
                        sinif = excluded.sinif,
                        altqrup = excluded.altqrup,
                        fayl_adi = excluded.fayl_adi,
                        excel_data = excluded.excel_data,
                        yuklenme_tarixi = CURRENT_TIMESTAMP
                    `);
                    
                    insert.run(
                        kod.toString(), 
                        ad.toString(), 
                        soyad.toString(), 
                        fenn.toString(), 
                        parseInt(bal),
                        variant.toString(),
                        bolme.toString(),
                        sinif.toString(),
                        altqrup.toString(),
                        fileName,
                        excelData
                    );
                    successCount++;
                } else {
                    console.log(`Sətir ${index + 1}: Məlumatlar tam deyil`, row);
                    errorCount++;
                }
            } catch (err) {
                console.error(`Sətir ${index + 1} xətası:`, err);
                errorCount++;
            }
        }

        res.json({
            success: true,
            message: `${successCount} tələbənin məlumatı uğurla yükləndi`,
            successCount,
            errorCount,
            fileName: fileName
        });

    } catch (error) {
        console.error('Excel fayl işlənmə xətası:', error);
        res.status(500).json({ error: 'Excel fayl işlənərkən xəta baş verdi: ' + error.message });
    }
});

// Tələbə nəticə yoxlama
app.get('/api/check-result/:kod', async (req, res) => {
    const kod = req.params.kod;

    try {
        const stmt = db.prepare('SELECT * FROM imtahan_neticeleri WHERE kod = ? ORDER BY fenn');
        const rows = stmt.all(kod);

        if (rows && rows.length > 0) {
            // Tələbə məlumatlarını ilk sətirdən götür
            const studentInfo = {
                kod: rows[0].kod,
                ad: rows[0].ad,
                soyad: rows[0].soyad,
                variant: rows[0].variant || '',
                bolme: rows[0].bolme || '',
                sinif: rows[0].sinif || '',
                altqrup: rows[0].altqrup || '',
                yuklenme_tarixi: rows[0].yuklenme_tarixi
            };

            // Bütün fənləri və balları topla
            const fennler = rows.map(row => ({
                fenn: row.fenn,
                bal: row.bal
            }));

            // Ümumi bal hesabla (bütün fənlərin cəmi)
            const umumiBal = rows.reduce((sum, row) => sum + row.bal, 0);

            // Excel-dən gələn bütün əlavə məlumatları topla
            const allExcelData = {};
            rows.forEach(row => {
                if (row.excel_data) {
                    try {
                        const excelRow = JSON.parse(row.excel_data);
                        // Hər sətirdəki bütün sütunları topla
                        Object.keys(excelRow).forEach(key => {
                            if (!allExcelData[key]) {
                                allExcelData[key] = [];
                            }
                            allExcelData[key].push(excelRow[key]);
                        });
                    } catch (err) {
                        console.error('Excel data parse xətası:', err);
                    }
                }
            });

            res.json({
                success: true,
                data: {
                    ...studentInfo,
                    fennler: fennler,
                    umumiBal: umumiBal,
                    fennSayi: rows.length,
                    excelData: allExcelData
                }
            });
        } else {
            res.json({
                success: false,
                message: 'Bu kodla heç bir nəticə tapılmadı!'
            });
        }
    } catch (err) {
        console.error('Veritabanı xətası:', err);
        return res.status(500).json({ error: 'Veritabanı xətası!' });
    }
});

// Nümunə Excel faylını yükləmək
app.get('/api/download-sample-excel', (req, res) => {
    const sampleFilePath = process.env.NODE_ENV === 'production' 
        ? null 
        : '/Users/shukurlun/Desktop/imtahan/sample_imtahan_neticeleri.xlsx';
    
    if (!sampleFilePath || !fs.existsSync(sampleFilePath)) {
        return res.status(404).json({ 
            error: 'Nümunə fayl tapılmadı! Zəhmət olmasa Excel faylınızı yükləyərkən aşağıdakı formatı istifadə edin:',
            format: {
                sütunlar: ['Kod', 'Ad', 'Soyad', 'Fənn', 'Bal', 'Variant', 'Bölmə', 'Sinif', 'Altqrup'],
                nümunə: {
                    'Kod': '12345',
                    'Ad': 'Əli',
                    'Soyad': 'Məmmədov',
                    'Fənn': 'Riyaziyyat',
                    'Bal': 85,
                    'Variant': 'A',
                    'Bölmə': '1',
                    'Sinif': '9',
                    'Altqrup': 'a'
                }
            }
        });
    }

    res.download(sampleFilePath, 'nümunə_imtahan_neticeleri.xlsx', (err) => {
        if (err) {
            console.error('Download error:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Fayl yüklənərkən xəta baş verdi!' });
            }
        }
    });
});

// Bütün nəticələri göstərmək (admin üçün)
app.get('/api/all-results', async (req, res) => {
    try {
        const stmt = db.prepare('SELECT * FROM imtahan_neticeleri ORDER BY yuklenme_tarixi DESC');
        const rows = stmt.all();
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('Veritabanı xətası:', err);
        return res.status(500).json({ error: 'Veritabanı xətası!' });
    }
});

// Fayl yükləmə (admin üçün - istənilən format)
app.post('/api/upload-pdf', uploadPdf.single('pdfFile'), async (req, res) => {
    console.log('File upload request received');
    console.log('Request body:', req.body);
    console.log('Request file:', req.file ? 'File exists' : 'No file');
    console.log('Sinif from body:', req.body.sinif);
    
    try {
        if (!req.file) {
            console.log('No file in request');
            return res.status(400).json({ error: 'Fayl seçilməyib!' });
        }

        const sinif = parseInt(req.body.sinif);
        console.log('Parsed sinif:', sinif);
        if (!sinif || sinif < 1 || sinif > 11) {
            // Əgər fayl yüklənibsə, onu sil
            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            return res.status(400).json({ error: 'Düzgün sinif nömrəsi daxil edin (1-11)!' });
        }

        // Orijinal fayl uzantısını istifadə et
        const originalExt = path.extname(req.file.originalname);
        const fileName = `sinif_${sinif}${originalExt}`;
        const filePath = path.join(pdfDir, fileName);

        // Əgər köhnə fayl varsa, onu sil
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Yeni faylı köçür
        fs.renameSync(req.file.path, filePath);

        // Veritabanına yaz
        const insert = db.prepare(`
            INSERT INTO sinif_pdf (sinif, fayl_adi, fayl_yolu)
            VALUES (?, ?, ?)
            ON CONFLICT(sinif) DO UPDATE SET
            fayl_adi = excluded.fayl_adi,
            fayl_yolu = excluded.fayl_yolu,
            yuklenme_tarixi = CURRENT_TIMESTAMP
        `);
        
        insert.run(sinif, fileName, filePath);

        res.json({
            success: true,
            message: `${sinif}-ci sinif üçün PDF faylı uğurla yükləndi`,
            sinif: sinif,
            fileName: fileName
        });

    } catch (error) {
        console.error('PDF fayl yükləmə xətası:', error);
        // Əgər fayl yüklənibsə, onu sil
        if (req.file && fs.existsSync(req.file.path)) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (unlinkErr) {
                console.error('Fayl silinərkən xəta:', unlinkErr);
            }
        }
        res.status(500).json({ error: 'PDF fayl yüklənərkən xəta baş verdi: ' + error.message });
    }
});

// Fayl yükləmə (download üçün - istənilən format)
app.get('/api/download-pdf/:sinif', (req, res) => {
    const sinif = parseInt(req.params.sinif);
    
    if (!sinif || sinif < 1 || sinif > 11) {
        return res.status(400).json({ error: 'Düzgün sinif nömrəsi daxil edin (1-11)!' });
    }

    try {
        const stmt = db.prepare('SELECT * FROM sinif_pdf WHERE sinif = ?');
        const pdfRecord = stmt.get(sinif);

        if (!pdfRecord || !fs.existsSync(pdfRecord.fayl_yolu)) {
            return res.status(404).json({ error: `${sinif}-ci sinif üçün fayl tapılmadı!` });
        }

        res.download(pdfRecord.fayl_yolu, pdfRecord.fayl_adi, (err) => {
            if (err) {
                console.error('File download xətası:', err);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Fayl yüklənərkən xəta baş verdi!' });
                }
            }
        });
    } catch (err) {
        console.error('File download xətası:', err);
        return res.status(500).json({ error: 'Veritabanı xətası!' });
    }
});

// Fayl görüntüləmə (online - istənilən format)
app.get('/api/view-pdf/:sinif', (req, res) => {
    const sinif = parseInt(req.params.sinif);
    
    if (!sinif || sinif < 1 || sinif > 11) {
        return res.status(400).json({ error: 'Düzgün sinif nömrəsi daxil edin (1-11)!' });
    }

    try {
        const stmt = db.prepare('SELECT * FROM sinif_pdf WHERE sinif = ?');
        const pdfRecord = stmt.get(sinif);

        if (!pdfRecord || !fs.existsSync(pdfRecord.fayl_yolu)) {
            return res.status(404).json({ error: `${sinif}-ci sinif üçün fayl tapılmadı!` });
        }

        // Fayl ölçüsünü al
        const stats = fs.statSync(pdfRecord.fayl_yolu);
        const fileSize = stats.size;

        // Fayl uzantısına görə Content-Type təyin et
        const ext = path.extname(pdfRecord.fayl_adi).toLowerCase();
        const mimeTypes = {
            '.pdf': 'application/pdf',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.xls': 'application/vnd.ms-excel',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.txt': 'text/plain',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif'
        };
        const contentType = mimeTypes[ext] || 'application/octet-stream';

        // Headers təyin et
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${pdfRecord.fayl_adi}"`);
        res.setHeader('Content-Length', fileSize);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=3600');

        // File stream yarat və pipe et
        const fileStream = fs.createReadStream(pdfRecord.fayl_yolu);
        
        fileStream.on('error', (err) => {
            console.error('PDF file stream error:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'PDF faylı oxunarkən xəta baş verdi!' });
            } else {
                res.end();
            }
        });

        fileStream.pipe(res);
    } catch (err) {
        console.error('PDF görüntüləmə xətası:', err);
        if (!res.headersSent) {
            return res.status(500).json({ error: 'PDF faylı görüntülənərkən xəta baş verdi!' });
        }
    }
});

// Bütün mövcud PDF fayllarını göstərmək
app.get('/api/list-pdfs', (req, res) => {
    try {
        const stmt = db.prepare('SELECT sinif, fayl_adi, yuklenme_tarixi FROM sinif_pdf ORDER BY sinif');
        const rows = stmt.all();
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('PDF siyahısı xətası:', err);
        return res.status(500).json({ error: 'Veritabanı xətası!' });
    }
});

// React app üçün - bütün route-ları React-ə yönləndir
app.get('*', (req, res) => {
    // Try multiple possible paths for index.html
    const possiblePaths = [
        path.join(__dirname, 'client/build', 'index.html'),
        path.join(__dirname, 'build', 'index.html'),
        path.join(process.cwd(), 'client/build', 'index.html'),
        path.join(process.cwd(), 'build', 'index.html')
    ];
    
    let indexPath = null;
    for (const possiblePath of possiblePaths) {
        if (fs.existsSync(possiblePath)) {
            indexPath = possiblePath;
            break;
        }
    }
    
    if (indexPath) {
        res.sendFile(indexPath, (err) => {
            if (err) {
                console.error('Static file error:', err);
                res.status(500).send('Server error');
            }
        });
    } else {
        console.error('index.html not found in any of the expected locations');
        res.status(404).send(`
            <html>
                <body>
                    <h1>404 - Page Not Found</h1>
                    <p>Build files not found. Please check the deployment logs.</p>
                    <p>Expected paths:</p>
                    <ul>
                        ${possiblePaths.map(p => `<li>${p}</li>`).join('')}
                    </ul>
                </body>
            </html>
        `);
    }
});

app.listen(PORT, () => {
    console.log(`Server ${PORT} portunda işləyir`);
    console.log(`Admin paneli: http://localhost:${PORT}/admin`);
    console.log(`Tələbə paneli: http://localhost:${PORT}/`);
});
