const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json());

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

// Uploads qovluğunu yaratmaq
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer konfiqurasiyası
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'imtahan-' + uniqueSuffix + '.xlsx');
    }
});

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

// PostgreSQL veritabanı
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/imtahan',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Veritabanı cədvəlini yaratmaq
const createTable = async () => {
    try {
        await pool.query(`DROP TABLE IF EXISTS imtahan_neticeleri`);
        await pool.query(`CREATE TABLE imtahan_neticeleri (
            id SERIAL PRIMARY KEY,
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
            yuklenme_tarixi TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            excel_data TEXT,
            UNIQUE(kod, fenn)
        )`);
        console.log('PostgreSQL cədvəli yaradıldı');
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

        const filePath = req.file.path;
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet);

        // Excel məlumatlarını veritabanına yazmaq
        let successCount = 0;
        let errorCount = 0;

        for (let index = 0; index < data.length; index++) {
            const row = data[index];
            try {
                // Excel sütunlarının adlarını yoxlamaq
                const kod = row['Kod'] || row['kod'] || row['KOD'] || row['Student Code'] || row['student_code'];
                const ad = row['Ad'] || row['ad'] || row['AD'] || row['Name'] || row['name'] || row['First Name'];
                const soyad = row['Soyad'] || row['soyad'] || row['SOYAD'] || row['Surname'] || row['surname'] || row['Last Name'];
                const fenn = row['Fənn'] || row['fenn'] || row['FENN'] || row['Subject'] || row['subject'] || row['Course'];
                const bal = row['Bal'] || row['bal'] || row['BAL'] || row['Score'] || row['score'] || row['Grade'] || row['grade'];
                const variant = row['Variant'] || row['variant'] || row['VARIANT'] || '';
                const bolme = row['Bölmə'] || row['bölmə'] || row['BOLME'] || row['Section'] || row['section'] || '';
                const sinif = row['Sinif'] || row['sinif'] || row['SINIF'] || row['Class'] || row['class'] || '';
                const altqrup = row['Altqrup'] || row['altqrup'] || row['ALTQRUP'] || row['Subgroup'] || row['subgroup'] || '';

                // Bütün Excel məlumatlarını JSON formatında saxla
                const excelData = JSON.stringify(row);

                if (kod && ad && soyad && fenn && bal !== undefined) {
                    await pool.query(
                        `INSERT INTO imtahan_neticeleri 
                        (kod, ad, soyad, fenn, bal, variant, bolme, sinif, altqrup, fayl_adi, excel_data) 
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                        ON CONFLICT (kod, fenn) DO UPDATE SET
                        ad = EXCLUDED.ad,
                        soyad = EXCLUDED.soyad,
                        bal = EXCLUDED.bal,
                        variant = EXCLUDED.variant,
                        bolme = EXCLUDED.bolme,
                        sinif = EXCLUDED.sinif,
                        altqrup = EXCLUDED.altqrup,
                        fayl_adi = EXCLUDED.fayl_adi,
                        excel_data = EXCLUDED.excel_data,
                        yuklenme_tarixi = CURRENT_TIMESTAMP`,
                        [
                            kod.toString(), 
                            ad.toString(), 
                            soyad.toString(), 
                            fenn.toString(), 
                            parseInt(bal),
                            variant.toString(),
                            bolme.toString(),
                            sinif.toString(),
                            altqrup.toString(),
                            req.file.filename,
                            excelData
                        ]
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
            fileName: req.file.filename
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
        const result = await pool.query(
            'SELECT * FROM imtahan_neticeleri WHERE kod = $1 ORDER BY fenn',
            [kod]
        );

        const rows = result.rows;

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
    const sampleFilePath = '/Users/shukurlun/Desktop/imtahan/sample_imtahan_neticeleri.xlsx';
    
    if (!fs.existsSync(sampleFilePath)) {
        return res.status(404).json({ error: 'Nümunə fayl tapılmadı!' });
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
        const result = await pool.query('SELECT * FROM imtahan_neticeleri ORDER BY yuklenme_tarixi DESC');
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Veritabanı xətası:', err);
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
