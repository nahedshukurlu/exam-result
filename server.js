const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); 
const buildPath = path.join(__dirname, 'client/build');
console.log('Looking for build directory at:', buildPath);
console.log('Directory exists:', fs.existsSync(buildPath));

if (fs.existsSync(buildPath)) {
    app.use(express.static(buildPath));
    console.log('Static files served from:', buildPath);
    
        const files = fs.readdirSync(buildPath);
    console.log('Build directory contents:', files);
} else {
    console.log('Build directory not found:', buildPath);
    console.log('Current working directory:', __dirname);
    console.log('Available directories:', fs.readdirSync(__dirname));
    
        const altPath1 = path.join(__dirname, 'build');
    const altPath2 = path.join(process.cwd(), 'client/build');
    const altPath3 = path.join(process.cwd(), 'build');
    
    console.log('Trying alternative path 1:', altPath1, 'exists:', fs.existsSync(altPath1));
    console.log('Trying alternative path 2:', altPath2, 'exists:', fs.existsSync(altPath2));
    console.log('Trying alternative path 3:', altPath3, 'exists:', fs.existsSync(altPath3));
    
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

const uploadsDir = process.env.NODE_ENV === 'production' 
    ? path.join('/tmp', 'uploads') 
    : path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const pdfDir = process.env.NODE_ENV === 'production' 
    ? path.join('/tmp', 'pdfs') 
    : path.join(__dirname, 'uploads', 'pdfs');

if (!fs.existsSync(pdfDir)) {
    fs.mkdirSync(pdfDir, { recursive: true });
}

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

const pdfStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, pdfDir);
    },
    filename: function (req, file, cb) {
        const sinif = req.body.sinif || 'unknown';
                const originalExt = path.extname(file.originalname);
        const fileName = `sinif_${sinif}${originalExt}`;
        cb(null, fileName);
    }
});

const uploadPdf = multer({ 
    storage: pdfStorage,
        limits: {
        fileSize: 50 * 1024 * 1024     }
});

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://nahedshukurlu_db_user:EebPHBmTA12QOD03@exam-result.bjiyluu.mongodb.net/imtahan_db?retryWrites=true&w=majority';
const DB_NAME = 'imtahan_db';
let client;
let db;
let isConnecting = false;
let connectionRetries = 0;
const MAX_RETRIES = 5;

const connectToMongoDB = async (retry = false) => {
    if (isConnecting && !retry) {
        console.log('MongoDB connection artıq davam edir...');
        return;
    }
    
    if (db && client) {
        try {
                        await client.db('admin').admin().ping();
            return;
        } catch (err) {
            console.log('MongoDB connection aktiv deyil, yenidən qoşulur...');
            client = null;
            db = null;
        }
    }
    
    isConnecting = true;
    
    try {
        const connectionOptions = {
            serverSelectionTimeoutMS: 30000,             socketTimeoutMS: 45000,             connectTimeoutMS: 30000,             retryWrites: true,
            retryReads: true,
            maxPoolSize: 10,
            minPoolSize: 1,
            maxIdleTimeMS: 30000,
            heartbeatFrequencyMS: 10000,
                        tls: true,
            tlsAllowInvalidCertificates: false,
            tlsAllowInvalidHostnames: false,
                        maxConnecting: 2
        };
        
        client = new MongoClient(MONGODB_URI, connectionOptions);
        await client.connect();
        db = client.db(DB_NAME);
        
                await db.admin().ping();
        
        console.log('MongoDB-yə uğurla qoşuldu');
        connectionRetries = 0;
        
                try {
            const resultsCollection = db.collection('imtahan_neticeleri');
            await resultsCollection.createIndex({ code: 1, subject: 1 }, { unique: true });
            console.log('MongoDB index-ləri yaradıldı');
        } catch (indexErr) {
                        if (indexErr.code !== 85) {                 console.error('Index yaratma xətası:', indexErr);
            }
        }
        
        isConnecting = false;
    } catch (err) {
        isConnecting = false;
        connectionRetries++;
        console.error(`MongoDB qoşulma xətası (cəhd ${connectionRetries}/${MAX_RETRIES}):`, err.message);
        
        if (connectionRetries < MAX_RETRIES) {
            const retryDelay = Math.min(1000 * Math.pow(2, connectionRetries), 10000);             console.log(`${retryDelay}ms sonra yenidən cəhd ediləcək...`);
            setTimeout(() => {
                connectToMongoDB(true).catch(console.error);
            }, retryDelay);
        } else {
            console.error('MongoDB-yə qoşula bilmədi, maksimum cəhd sayına çatıldı');
            throw err;
        }
    }
};

connectToMongoDB().catch((err) => {
    console.error('İlkin MongoDB connection uğursuz oldu:', err.message);
    });

app.post('/api/upload-excel', upload.single('excelFile'), async (req, res) => {
    console.log('Upload request received:', req.file);
    try {
        if (!db || !client) {
            await connectToMongoDB();
        }
        
                try {
            await client.db('admin').admin().ping();
        } catch (err) {
            console.log('MongoDB connection kəsildi, yenidən qoşulur...');
            await connectToMongoDB();
        }
        
        if (!req.file) {
            console.log('No file received');
            return res.status(400).json({ error: 'Excel faylı seçilməyib!' });
        }

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet);
        
                const filteredData = data.filter(row => {
            const kod = row['Kod'] || row['kod'] || row['KOD'];
            return kod && kod.toString().trim() !== '';
        });
        
        console.log(`Ümumi sətir sayı: ${data.length}, Filter edilmiş sətir sayı: ${filteredData.length}`);

                let successCount = 0;
        let errorCount = 0;
        
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileName = 'imtahan-' + uniqueSuffix + '.xlsx';

        for (let index = 0; index < filteredData.length; index++) {
            const row = filteredData[index];
            try {
                                const code = row['Kod'] || row['kod'] || row['KOD'] || row['Student Code'] || row['student_code'];
                const name = row['Ad'] || row['ad'] || row['AD'] || row['Name'] || row['name'] || row['First Name'];
                const surname = row['Soyad'] || row['soyad'] || row['SOYAD'] || row['Surname'] || row['surname'] || row['Last Name'];
                const subject = row['Fənn'] || row['fenn'] || row['FENN'] || row['Subject'] || row['subject'] || row['Course'];
                const result = row['Yekun bal'] || row['Yekun Bal'] || row['yekun bal'] || row['YEKUN BAL'] || 
                              row['Bal'] || row['bal'] || row['BAL'] || row['Score'] || row['score'] || row['Grade'] || row['grade'];
                const correctAnswer = row['Doğru cavab'] || row['Doğru Cavab'] || row['doğru cavab'] || null;
                const wrongAnswer = row['Səhv'] || row['səhv'] || row['SEHV'] || null;
                const openQuestion = row['Açıq sual (balı)'] || row['Açıq Sual (balı)'] || row['açıq sual (balı)'] || null;
                const successRate = row['Uğur faizi'] || row['Uğur Faizi'] || row['uğur faizi'] || null;
                const variant = row['Variant'] || row['variant'] || row['VARIANT'] || '';
                const section = row['Bölmə'] || row['bölmə'] || row['BOLME'] || row['Section'] || row['section'] || '';
                const classValue = row['Sinif'] || row['sinif'] || row['SINIF'] || row['Class'] || row['class'] || '';
                const subclass = row['Altqrup'] || row['altqrup'] || row['ALTQRUP'] || row['Subgroup'] || row['subgroup'] || '';

                                const excelData = JSON.stringify(row);

                                let isValidResult = false;
                if (result !== undefined && result !== null && result !== '') {
                                        const testValue = typeof result === 'string' ? parseFloat(result.trim()) : result;
                    isValidResult = !isNaN(testValue) && isFinite(testValue);
                }
                
                if (code && name && surname && subject && isValidResult) {
                    const resultsCollection = db.collection('imtahan_neticeleri');
                    
                    const document = {
                        code: code.toString(),
                        name: name.toString(),
                        surname: surname.toString(),
                        subject: subject.toString(),
                        result: result,                         correctAnswer: correctAnswer !== undefined && correctAnswer !== null && correctAnswer !== '' ? correctAnswer : null,
                        wrongAnswer: wrongAnswer !== undefined && wrongAnswer !== null && wrongAnswer !== '' ? wrongAnswer : null,
                        openQuestion: openQuestion !== undefined && openQuestion !== null && openQuestion !== '' ? openQuestion : null,
                        successRate: successRate !== undefined && successRate !== null && successRate !== '' ? successRate : null,
                        variant: variant.toString(),
                        section: section.toString(),
                        class: classValue.toString(),
                        subclass: subclass.toString(),
                        fileName: fileName,
                        excelData: excelData,
                        uploadDate: new Date()
                    };
                    
                                        await resultsCollection.updateOne(
                        { code: code.toString(), subject: subject.toString() },
                        { $set: document },
                        { upsert: true }
                    );
                    successCount++;
                } else {
                    const missingFields = [];
                    if (!code) missingFields.push('Kod');
                    if (!name) missingFields.push('Ad');
                    if (!surname) missingFields.push('Soyad');
                    if (!subject) missingFields.push('Fənn');
                    if (parsedResult === null || parsedResult === undefined || isNaN(parsedResult) || !isFinite(parsedResult)) missingFields.push('Yekun bal');
                    
                    console.log(`Sətir ${index + 1}: Məlumatlar tam deyil. Çatışmayan sütunlar: ${missingFields.join(', ')}`);
                    console.log(`Sətir ${index + 1} məlumatları:`, {
                        code: code || 'YOX',
                        name: name || 'YOX',
                        surname: surname || 'YOX',
                        subject: subject || 'YOX',
                        result: result || 'YOX',
                        parsedResult: parsedResult
                    });
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

app.get('/api/check-result/:kod', async (req, res) => {
    const kod = req.params.kod;

    try {
        if (!db || !client) {
            await connectToMongoDB();
        }
        
                try {
            await client.db('admin').admin().ping();
        } catch (err) {
            console.log('MongoDB connection kəsildi, yenidən qoşulur...');
            await connectToMongoDB();
        }
        
        const resultsCollection = db.collection('imtahan_neticeleri');
        const rows = await resultsCollection.find({ code: kod }).sort({ subject: 1 }).toArray();

        if (rows && rows.length > 0) {
                        const studentInfo = {
                code: rows[0].code,
                name: rows[0].name,
                surname: rows[0].surname,
                variant: rows[0].variant || '',
                section: rows[0].section || '',
                class: rows[0].class || '',
                subclass: rows[0].subclass || '',
                uploadDate: rows[0].uploadDate
            };

                        const subjects = rows.map(row => {
                return {
                    subject: row.subject || '',
                    result: row.result !== undefined && row.result !== null ? row.result : null,
                    correctAnswer: row.correctAnswer !== undefined && row.correctAnswer !== null ? row.correctAnswer : null,
                    wrongAnswer: row.wrongAnswer !== undefined && row.wrongAnswer !== null ? row.wrongAnswer : null,
                    openQuestion: row.openQuestion !== undefined && row.openQuestion !== null ? row.openQuestion : null,
                    successRate: row.successRate !== undefined && row.successRate !== null ? row.successRate : null
                };
            });

                        const totalResult = subjects.reduce((sum, subj) => {
                if (subj.result === undefined || subj.result === null) return sum;
                const value = typeof subj.result === 'number' ? subj.result : (parseFloat(subj.result) || 0);
                return sum + value;
            }, 0);

                        const allExcelData = {};
            rows.forEach(row => {
                if (row.excelData) {
                    try {
                        const excelRow = JSON.parse(row.excelData);
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
                    subjects: subjects || [],                     totalResult: totalResult || 0,
                    subjectCount: rows.length || 0,
                    excelData: allExcelData || {}
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

app.get('/api/download-sample-excel', (req, res) => {
    const sampleFilePath = path.join(__dirname, 'yeni_imtahan.xlsx');
    
    if (!fs.existsSync(sampleFilePath)) {
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

app.get('/api/all-results', async (req, res) => {
    try {
        if (!db || !client) {
            await connectToMongoDB();
        }
        
                try {
            await client.db('admin').admin().ping();
        } catch (err) {
            console.log('MongoDB connection kəsildi, yenidən qoşulur...');
            await connectToMongoDB();
        }
        
        const resultsCollection = db.collection('imtahan_neticeleri');
        const rows = await resultsCollection.find({}).sort({ uploadDate: -1 }).toArray();
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('Veritabanı xətası:', err);
        return res.status(500).json({ error: 'Veritabanı xətası!' });
    }
});

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
                        if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            return res.status(400).json({ error: 'Düzgün sinif nömrəsi daxil edin (1-11)!' });
        }

                const originalExt = path.extname(req.file.originalname);
        const fileName = `sinif_${sinif}${originalExt}`;
        const filePath = path.join(pdfDir, fileName);

                if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

                fs.renameSync(req.file.path, filePath);

                const pdfCollection = db.collection('sinif_pdf');
        await pdfCollection.updateOne(
            { sinif: sinif },
            { 
                $set: {
                    sinif: sinif,
                    fayl_adi: fileName,
                    fayl_yolu: filePath,
                    yuklenme_tarixi: new Date()
                }
            },
            { upsert: true }
        );

        res.json({
            success: true,
            message: `${sinif}-ci sinif üçün PDF faylı uğurla yükləndi`,
            sinif: sinif,
            fileName: fileName
        });

    } catch (error) {
        console.error('PDF fayl yükləmə xətası:', error);
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

app.get('/api/download-pdf/:sinif', async (req, res) => {
    const sinif = parseInt(req.params.sinif);
    
    if (!sinif || sinif < 1 || sinif > 11) {
        return res.status(400).json({ error: 'Düzgün sinif nömrəsi daxil edin (1-11)!' });
    }

    try {
        const pdfCollection = db.collection('sinif_pdf');
        const pdfRecord = await pdfCollection.findOne({ sinif: sinif });

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

app.get('/api/view-pdf/:sinif', async (req, res) => {
    const sinif = parseInt(req.params.sinif);
    
    if (!sinif || sinif < 1 || sinif > 11) {
        return res.status(400).json({ error: 'Düzgün sinif nömrəsi daxil edin (1-11)!' });
    }

    try {
        const pdfCollection = db.collection('sinif_pdf');
        const pdfRecord = await pdfCollection.findOne({ sinif: sinif });

        if (!pdfRecord || !fs.existsSync(pdfRecord.fayl_yolu)) {
            return res.status(404).json({ error: `${sinif}-ci sinif üçün fayl tapılmadı!` });
        }

                const stats = fs.statSync(pdfRecord.fayl_yolu);
        const fileSize = stats.size;

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

                res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${pdfRecord.fayl_adi}"`);
        res.setHeader('Content-Length', fileSize);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=3600');

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

app.get('/api/list-pdfs', async (req, res) => {
    try {
        const pdfCollection = db.collection('sinif_pdf');
        const rows = await pdfCollection.find({}).sort({ sinif: 1 }).toArray();
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('PDF siyahısı xətası:', err);
        return res.status(500).json({ error: 'Veritabanı xətası!' });
    }
});

app.get('*', (req, res) => {
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

app.listen(PORT, async () => {
    console.log(`Server ${PORT} portunda işləyir`);
    console.log(`Admin paneli: http://localhost:${PORT}/admin`);
    console.log(`Tələbə paneli: http://localhost:${PORT}/`);
    
        if (!db || !client) {
        try {
            await connectToMongoDB();
        } catch (err) {
            console.error('Server başlananda MongoDB-yə qoşula bilmədi:', err.message);
            console.log('Server işləməyə davam edir, MongoDB connection sonra yenidən cəhd ediləcək');
        }
    }
});

process.on('SIGINT', async () => {
    if (client) {
        await client.close();
        console.log('MongoDB connection bağlandı');
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    if (client) {
        await client.close();
        console.log('MongoDB connection bağlandı');
    }
    process.exit(0);
});
