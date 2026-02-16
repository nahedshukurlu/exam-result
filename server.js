require("dotenv").config();
const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const { MongoClient, GridFSBucket } = require("mongodb");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const pdfParse = require("pdf-parse");
let pdfjsLib = null;
try {
  pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
  if (pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "";
  }
} catch (e) {
  console.log("pdfjs-dist yüklənmədi, tələbə PDF səhifə nömrəsi funksiyası işləməyəcək:", e.message);
}

const app = express();
const PORT = process.env.PORT || 8080;

// Render.com proxy üçün trust proxy aktivləşdir
app.set("trust proxy", true);

// HTTPS redirect middleware (production-da)
if (process.env.NODE_ENV === "production") {
  app.use((req, res, next) => {
    // Əgər request HTTP-dirsə və X-Forwarded-Proto HTTPS deyilsə, HTTPS-ə yönləndir
    const forwardedProto = req.header("x-forwarded-proto");
    const host = req.header("host");

    // Yalnız HTTP request-ləri HTTPS-ə yönləndir
    if (forwardedProto && forwardedProto !== "https" && host) {
      return res.redirect(301, `https://${host}${req.url}`);
    }
    next();
  });
}

// Security headers əlavə et
app.use((req, res, next) => {
  // HTTPS üçün security headers
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains"
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const buildPath = path.join(__dirname, "client/build");
console.log("Looking for build directory at:", buildPath);
console.log("Directory exists:", fs.existsSync(buildPath));

if (fs.existsSync(buildPath)) {
  app.use(express.static(buildPath));
  console.log("Static files served from:", buildPath);

  const files = fs.readdirSync(buildPath);
  console.log("Build directory contents:", files);
} else {
  console.log("Build directory not found:", buildPath);
  console.log("Current working directory:", __dirname);
  console.log("Available directories:", fs.readdirSync(__dirname));

  const altPath1 = path.join(__dirname, "build");
  const altPath2 = path.join(process.cwd(), "client/build");
  const altPath3 = path.join(process.cwd(), "build");

  console.log(
    "Trying alternative path 1:",
    altPath1,
    "exists:",
    fs.existsSync(altPath1)
  );
  console.log(
    "Trying alternative path 2:",
    altPath2,
    "exists:",
    fs.existsSync(altPath2)
  );
  console.log(
    "Trying alternative path 3:",
    altPath3,
    "exists:",
    fs.existsSync(altPath3)
  );

  if (fs.existsSync(altPath1)) {
    app.use(express.static(altPath1));
    console.log("Using alternative path 1:", altPath1);
  } else if (fs.existsSync(altPath2)) {
    app.use(express.static(altPath2));
    console.log("Using alternative path 2:", altPath2);
  } else if (fs.existsSync(altPath3)) {
    app.use(express.static(altPath3));
    console.log("Using alternative path 3:", altPath3);
  }
}

const uploadsDir =
  process.env.NODE_ENV === "production"
    ? path.join("/tmp", "uploads")
    : path.join(__dirname, "uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// PDF faylları artıq MongoDB GridFS-də saxlanılır, disk storage lazım deyil

const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    console.log("File MIME type:", file.mimetype);
    console.log("File original name:", file.originalname);

    if (
      file.mimetype ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.mimetype === "application/vnd.ms-excel" ||
      file.originalname.endsWith(".xlsx") ||
      file.originalname.endsWith(".xls")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Yalnız Excel faylları qəbul edilir!"), false);
    }
  },
});

// Şagird cavabları üçün: Excel və ya PDF qəbul edilir
const uploadStudentAnswers = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const isExcel =
      file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.mimetype === "application/vnd.ms-excel" ||
      /\.(xlsx|xls)$/i.test(file.originalname);
    const isPdf =
      file.mimetype === "application/pdf" || /\.pdf$/i.test(file.originalname);
    if (isExcel || isPdf) {
      cb(null, true);
    } else {
      cb(new Error("Yalnız Excel (.xlsx, .xls) və ya PDF faylları qəbul edilir!"), false);
    }
  },
});

// PDF faylları memory-də saxlanılır və GridFS-ə yazılır
const pdfStorage = multer.memoryStorage();

const uploadPdf = multer({
  storage: pdfStorage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
});

// querySrv ECONNREFUSED olduqda SRV DNS işləmir – .env-də MONGODB_URI_STANDARD təyin edin (Atlas Connect > Drivers > standard format)
const MONGODB_URI_SRV =
  "mongodb+srv://nahedshukurlu_db_user:EebPHBmTA12QOD03@exam-result.bjiyluu.mongodb.net/imtahan_db?retryWrites=true&w=majority";
const MONGODB_URI_STANDARD_FALLBACK =
  "mongodb://nahedshukurlu_db_user:EebPHBmTA12QOD03@exam-result-shard-00-00.bjiyluu.mongodb.net:27017,exam-result-shard-00-01.bjiyluu.mongodb.net:27017,exam-result-shard-00-02.bjiyluu.mongodb.net:27017/imtahan_db?ssl=true&replicaSet=atlasbjiyluu-shard-0&authSource=admin&retryWrites=true&w=majority";
let MONGODB_URI =
  process.env.MONGODB_URI_STANDARD ||
  process.env.MONGODB_URI ||
  MONGODB_URI_SRV;
const DB_NAME = "imtahan_db";
let client;
let db;
let connectionPromise = null;
let connectionRetries = 0;
const MAX_RETRIES = 5;

const connectToMongoDB = async (retry = false) => {
  // Əgər connection artıq davam edirsə, eyni promise-i gözlə
  if (connectionPromise && !retry) {
    console.log("MongoDB connection artıq davam edir, gözlənilir...");
    try {
      await connectionPromise;
      return;
    } catch (err) {
      // Promise reject oldusa, yenidən cəhd et
      connectionPromise = null;
    }
  }

  // Connection aktivdirsə, yoxla
  if (db && client) {
    try {
      await client.db("admin").admin().ping();
      return;
    } catch (err) {
      console.log("MongoDB connection aktiv deyil, yenidən qoşulur...");
      client = null;
      db = null;
      connectionPromise = null;
    }
  }

  // Yeni connection promise yarat
  connectionPromise = (async () => {
    try {
      const connectionOptions = {
        serverSelectionTimeoutMS: 30000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 30000,
        retryWrites: true,
        retryReads: true,
        maxPoolSize: 10,
        minPoolSize: 1,
        maxIdleTimeMS: 30000,
        heartbeatFrequencyMS: 10000,
        tls: true,
        tlsAllowInvalidCertificates: false,
        tlsAllowInvalidHostnames: false,
        maxConnecting: 2,
      };

      const newClient = new MongoClient(MONGODB_URI, connectionOptions);
      await newClient.connect();
      const newDb = newClient.db(DB_NAME);

      await newDb.admin().ping();

      // Connection uğurlu olduqda global dəyişənləri set et
      client = newClient;
      db = newDb;

      console.log("MongoDB-yə uğurla qoşuldu");
      connectionRetries = 0;

      try {
        const resultsCollection = db.collection("imtahan_neticeleri");
        await resultsCollection.createIndex(
          { code: 1, subject: 1 },
          { unique: true }
        );
        console.log("MongoDB index-ləri yaradıldı");
      } catch (indexErr) {
        if (indexErr.code !== 85) {
          console.error("Index yaratma xətası:", indexErr);
        }
      }
    } catch (err) {
      connectionRetries++;
      console.error(
        `MongoDB qoşulma xətası (cəhd ${connectionRetries}/${MAX_RETRIES}):`,
        err.message
      );

      const isSrvError =
        err.message &&
        (err.message.includes("querySrv") || err.message.includes("ECONNREFUSED"));
      if (
        isSrvError &&
        connectionRetries === 1 &&
        !process.env.MONGODB_URI_STANDARD &&
        MONGODB_URI.includes("mongodb+srv")
      ) {
        console.log("SRV DNS uğursuz – standart formatla yenidən cəhd edilir...");
        MONGODB_URI = MONGODB_URI_STANDARD_FALLBACK;
        connectionRetries = 0;
        connectionPromise = null;
        return connectToMongoDB(true);
      }

      if (connectionRetries < MAX_RETRIES) {
        const retryDelay = Math.min(
          1000 * Math.pow(2, connectionRetries),
          10000
        );
        console.log(`${retryDelay}ms sonra yenidən cəhd ediləcək...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        connectionPromise = null;
        return connectToMongoDB(true);
      } else {
        console.error(
          "MongoDB-yə qoşula bilmədi, maksimum cəhd sayına çatıldı"
        );
        connectionPromise = null;
        throw err;
      }
    } finally {
      // Promise bitdikdən sonra təmizlə
      connectionPromise = null;
    }
  })();

  // Promise-i await et
  await connectionPromise;
};

connectToMongoDB().catch((err) => {
  console.error("İlkin MongoDB connection uğursuz oldu:", err.message);
});

// Test endpoint - serverin işlədiyini yoxlamaq üçün
app.get("/api/test", (req, res) => {
  res.json({ success: true, message: "Server işləyir!" });
});

// Köməkçi funksiya: Excel sətirindən sütun dəyərini tapmaq
// Köməkçi funksiya: Excel sətirindən sütun dəyərini tapmaq
function getColumnValue(
  row,
  possibleNames,
  debugName = "",
  isFirstRow = false
) {
  // Əvvəlcə birbaşa uyğunluğu yoxla
  for (const name of possibleNames) {
    if (row[name] !== undefined && row[name] !== null) {
      const value = row[name];
      // 0 dəyəri və boş olmayan string-ləri qəbul et
      if (
        value === 0 ||
        value === "0" ||
        (typeof value === "string" && value.trim() !== "") ||
        (typeof value === "number" && !isNaN(value))
      ) {
        if (debugName && isFirstRow) {
          console.log(
            `${debugName} tapıldı (birbaşa):`,
            name,
            "=",
            value,
            "type:",
            typeof value
          );
        }
        return value;
      }
    }
  }
  // Əgər birbaşa tapılmadısa, bütün sütun adlarını yoxla (case-insensitive və boşluqları nəzərə alaraq)
  const rowKeys = Object.keys(row);
  for (const key of rowKeys) {
    const normalizedKey = key.toLowerCase().trim().replace(/\s+/g, " ");
    for (const name of possibleNames) {
      const normalizedName = name.toLowerCase().trim().replace(/\s+/g, " ");
      if (normalizedKey === normalizedName) {
        const value = row[key];
        if (value !== undefined && value !== null) {
          // 0 dəyəri və boş olmayan string-ləri qəbul et
          if (
            value === 0 ||
            value === "0" ||
            (typeof value === "string" && value.trim() !== "") ||
            (typeof value === "number" && !isNaN(value))
          ) {
            if (debugName && isFirstRow) {
              console.log(
                `${debugName} tapıldı (normalized):`,
                key,
                "=",
                value,
                "type:",
                typeof value
              );
            }
            return value;
          }
        }
      }
    }
  }
  if (debugName && isFirstRow) {
    console.log(`${debugName} tapılmadı. Mövcud sütunlar:`, rowKeys);
    console.log(`${debugName} axtarılan adlar:`, possibleNames);
  }
  return null;
}

// Fənn məlumatlarını Excel sətirlərindən çıxar
function extractSubjectData(rawData, startRow, endRow, subjectName) {
  try {
    // Fənn bölməsindəki məlumatları tap
    let questionRow = null; // Sual nömrələri (rəqəmlərlə başlayır)
    let etalonRow = null; // Etalon cavablar ("etalon" ilə başlayır)
    let studentAnswerRow = null; // Şagirdin cavabları ("Şagirdin cavabı" ilə başlayır)
    let resultRow = null; // Nəticələr (+ və ya - işarələri ilə)
    let scoreRow = null; // Ballar (0 və ya 1)
    let statsRow = null; // Statistikalar (düz, səhv, imtina)

    // Fənn bölməsindəki sətirləri tap
    for (let i = startRow; i <= endRow && i < rawData.length; i++) {
      const row = rawData[i];
      if (!Array.isArray(row) || row.length === 0) continue;

      const firstCell = row[0];
      if (firstCell !== null && firstCell !== undefined) {
        const cellValue = firstCell.toString().trim().toLowerCase();

        // Etalon sətirini tap
        if (cellValue === "etalon" || cellValue.includes("etalon")) {
          etalonRow = row;
          // Etalon sətirindən əvvəlki sətir sual nömrələri ola bilər
          // Amma yalnız eyni fənn bölməsi daxilində olmalıdır (startRow-dan böyük olmalıdır)
          if (i > startRow && rawData[i - 1] && Array.isArray(rawData[i - 1])) {
            const prevRow = rawData[i - 1];
            if (
              prevRow[1] &&
              (typeof prevRow[1] === "number" || !isNaN(parseInt(prevRow[1])))
            ) {
              questionRow = prevRow;
            }
          }
        }

        // Şagirdin cavabı sətirini tap
        if (cellValue.includes("şagirdin") && cellValue.includes("cavab")) {
          studentAnswerRow = row;
        }

        // Statistikalar sətirini tap (düz, səhv, imtina)
        // Statistikalar sətiri adətən "düz", "səhv", "imtina" sözlərini ehtiva edir
        if (
          cellValue.includes("düz") ||
          cellValue.includes("səhv") ||
          cellValue.includes("imtina")
        ) {
          // Əgər sətirdə rəqəmlər varsa, bu statistikalar sətiridir
          const hasNumbers = row.slice(1).some((cell) => {
            if (cell === null || cell === undefined) return false;
            const num = parseFloat(cell);
            return !isNaN(num) && num >= 0;
          });
          if (hasNumbers) {
            statsRow = row;
          }
        }
      }

      // Nəticələr sətirini tap (+ və ya - işarələri ilə)
      if (!resultRow && Array.isArray(row) && row.length > 1) {
        const hasResults = row
          .slice(1)
          .some(
            (cell) =>
              cell === "+" ||
              cell === "-" ||
              cell === "✓" ||
              cell === "✗" ||
              cell === "i"
          );
        if (
          hasResults &&
          row[0] !== "etalon" &&
          !row[0]?.toString().toLowerCase().includes("şagirdin")
        ) {
          resultRow = row;
        }
      }

      // Ballar sətirini tap (0 və ya 1 dəyərləri ilə)
      if (!scoreRow && Array.isArray(row) && row.length > 1) {
        const hasScores = row
          .slice(1)
          .some(
            (cell) => cell === 0 || cell === 1 || cell === "0" || cell === "1"
          );
        if (
          hasScores &&
          row[0] !== "etalon" &&
          !row[0]?.toString().toLowerCase().includes("şagirdin") &&
          !row.some((cell) => cell === "+" || cell === "-")
        ) {
          scoreRow = row;
        }
      }
    }

    if (!etalonRow || !studentAnswerRow) {
      console.log(
        `${subjectName} üçün etalon və ya şagirdin cavabı sətiri tapılmadı`
      );
      return null;
    }

    // Sual nömrələrini tap
    const questions = [];
    if (questionRow) {
      for (let i = 1; i < questionRow.length; i++) {
        const qNum = questionRow[i];
        if (
          qNum !== null &&
          qNum !== undefined &&
          (typeof qNum === "number" || !isNaN(parseInt(qNum)))
        ) {
          questions.push(parseInt(qNum));
        }
      }
    }

    // Əgər sual nömrələri tapılmadısa, etalon sətirindən istifadə et
    if (questions.length === 0) {
      for (let i = 1; i < etalonRow.length; i++) {
        if (
          etalonRow[i] !== null &&
          etalonRow[i] !== undefined &&
          etalonRow[i] !== ""
        ) {
          questions.push(i);
        }
      }
    }

    // Cavabları topla
    const answers = [];
    let correctCount = 0;
    let wrongCount = 0;
    let rejectedCount = 0;

    questions.forEach((questionNum, index) => {
      const colIndex = index + 1; // 0-cı sütun fənn adıdır

      if (colIndex < etalonRow.length && colIndex < studentAnswerRow.length) {
        const etalonAnswer = etalonRow[colIndex];
        const studentAnswer = studentAnswerRow[colIndex];
        const result = resultRow ? resultRow[colIndex] : null;
        const score = scoreRow ? scoreRow[colIndex] : null;

        if (
          etalonAnswer !== null &&
          etalonAnswer !== undefined &&
          etalonAnswer !== ""
        ) {
          const resultStr = result ? result.toString().trim() : "";
          const isCorrect =
            resultStr === "+" ||
            resultStr === "✓" ||
            resultStr === "1" ||
            score === 1;
          const isRejected =
            resultStr === "i" ||
            resultStr === "imtina" ||
            (resultStr === "" && studentAnswer === null);

          answers.push({
            question: questionNum,
            etalonAnswer: etalonAnswer.toString().trim(),
            studentAnswer:
              studentAnswer !== null && studentAnswer !== undefined
                ? studentAnswer.toString().trim()
                : "",
            isCorrect: isCorrect,
            isRejected: isRejected,
            score:
              score !== null && score !== undefined ? score : isCorrect ? 1 : 0,
          });

          if (isRejected) {
            rejectedCount++;
          } else if (isCorrect) {
            correctCount++;
          } else {
            wrongCount++;
          }
        }
      }
    });

    // Statistikaları çıxar
    let stats = {
      correct: correctCount,
      wrong: wrongCount,
      rejected: rejectedCount,
    };

    if (statsRow) {
      // Stats sətirindən məlumatları çıxar
      // Format: [fənn_adı, "düz", düzgün_sayı, "səhv", səhv_sayı, "imtina", imtina_sayı]
      // və ya: [fənn_adı, düzgün_sayı, səhv_sayı, imtina_sayı]
      let düzIndex = -1;
      let səhvIndex = -1;
      let imtinaIndex = -1;

      // Əvvəlcə "düz", "səhv", "imtina" sözlərinin indekslərini tap
      for (let i = 1; i < statsRow.length; i++) {
        const cell = statsRow[i];
        if (cell !== null && cell !== undefined) {
          const cellValue = cell.toString().trim().toLowerCase();
          if (
            (cellValue.includes("düz") || cellValue === "düz") &&
            düzIndex === -1
          ) {
            düzIndex = i;
          } else if (
            (cellValue.includes("səhv") || cellValue === "səhv") &&
            səhvIndex === -1
          ) {
            səhvIndex = i;
          } else if (
            (cellValue.includes("imtina") || cellValue === "imtina") &&
            imtinaIndex === -1
          ) {
            imtinaIndex = i;
          }
        }
      }

      // Əgər "düz" sözü tapıldısa, ondan sonrakı rəqəmi götür
      if (düzIndex !== -1 && düzIndex + 1 < statsRow.length) {
        const düzValue = statsRow[düzIndex + 1];
        if (
          düzValue !== null &&
          düzValue !== undefined &&
          !isNaN(parseFloat(düzValue))
        ) {
          stats.correct = parseFloat(düzValue);
        }
      }

      // Əgər "səhv" sözü tapıldısa, ondan sonrakı rəqəmi götür
      if (səhvIndex !== -1 && səhvIndex + 1 < statsRow.length) {
        const səhvValue = statsRow[səhvIndex + 1];
        if (
          səhvValue !== null &&
          səhvValue !== undefined &&
          !isNaN(parseFloat(səhvValue))
        ) {
          stats.wrong = parseFloat(səhvValue);
        }
      }

      // Əgər "imtina" sözü tapıldısa, ondan sonrakı rəqəmi götür
      if (imtinaIndex !== -1 && imtinaIndex + 1 < statsRow.length) {
        const imtinaValue = statsRow[imtinaIndex + 1];
        if (
          imtinaValue !== null &&
          imtinaValue !== undefined &&
          !isNaN(parseFloat(imtinaValue))
        ) {
          stats.rejected = parseFloat(imtinaValue);
        }
      }

      // Əgər format fərqlidirsə (birbaşa rəqəmlər varsa), onları götür
      // Format: [fənn_adı, düzgün_sayı, səhv_sayı, imtina_sayı]
      if (düzIndex === -1 && səhvIndex === -1 && imtinaIndex === -1) {
        // Birbaşa rəqəmləri yoxla
        const numericValues = [];
        for (let i = 1; i < statsRow.length && numericValues.length < 3; i++) {
          const cell = statsRow[i];
          if (cell !== null && cell !== undefined) {
            const num = parseFloat(cell);
            if (!isNaN(num) && num >= 0) {
              numericValues.push(num);
            }
          }
        }
        if (numericValues.length >= 1) stats.correct = numericValues[0];
        if (numericValues.length >= 2) stats.wrong = numericValues[1];
        if (numericValues.length >= 3) stats.rejected = numericValues[2];
      }
    }

    return {
      subjectName: subjectName,
      totalQuestions: answers.length,
      correctAnswers: stats.correct,
      wrongAnswers: stats.wrong,
      rejectedAnswers: stats.rejected,
      answers: answers,
    };
  } catch (error) {
    console.error(`${subjectName} fənn məlumatlarını çıxararkən xəta:`, error);
    return null;
  }
}

// Lisey formatı (student_results_lisey.xlsx): hər sheet = bir şagird (sheet adı = Şagird ID)
// Struktur: SS/etalon/Şagirdin cavabı sətirləri, sonra fənn adı (Xarici dili, Ana dili, Riyaziyyat), bal, sonda ad və ümumi bal
function parseLiseySheet(rawData, sheetName) {
  if (!Array.isArray(rawData) || rawData.length < 5) return null;

  const firstCell = (row, col) => {
    if (!row || !Array.isArray(row)) return null;
    const v = row[col];
    return v !== null && v !== undefined ? v.toString().trim() : "";
  };
  const isSSRow = (row) =>
    row && Array.isArray(row) && firstCell(row, 0).toUpperCase() === "SS";
  const isEtalonRow = (row) =>
    row && Array.isArray(row) && firstCell(row, 0).toLowerCase() === "etalon";
  const isStudentAnswerRow = (row) =>
    row &&
    Array.isArray(row) &&
    firstCell(row, 0).toLowerCase().includes("şagirdin") &&
    firstCell(row, 0).toLowerCase().includes("cavab");
  // Bəzi fayllarda ilk sətir [Fənn adı, 1, 2, 3, 4.1, 4.2, ...] formatındadır (SS yox)
  const isSubjectNamePlusQuestionsRow = (row) => {
    if (!row || !Array.isArray(row) || row.length < 2) return false;
    const c0 = firstCell(row, 0);
    const c1 = row[1];
    const hasNumericSecond = typeof c1 === "number" || (c1 != null && !isNaN(parseFloat(c1)));
    return c0.length >= 2 && /[A-Za-zƏəİiÖöÜüŞşÇçĞğ]/.test(c0) && hasNumericSecond;
  };

  const subjects = [];
  let studentName = "";
  let totalScore = null;
  let totalScoreSource = "none";
  let totalScoreCell = null;

  // Lisey faylında ümumi yekun bal Z23 xanasındadır (row 23, col Z).
  // Bu dəyər birbaşa götürülməlidir və 100 limiti tətbiq olunmamalıdır.
  const z23Raw = rawData[22] && Array.isArray(rawData[22]) ? rawData[22][25] : null;
  if (z23Raw != null && z23Raw !== "") {
    const z23Num = parseFloat(z23Raw);
    if (!isNaN(z23Num) && isFinite(z23Num) && z23Num >= 0) {
      totalScore = z23Num;
      totalScoreSource = "Z23";
      totalScoreCell = { row: 22, col: 25, value: z23Raw };
    }
  }

  // Fənn bloklarını tap: ya "SS" sətiri, ya [Fənn adı, sual nömrələri...] + etalon + Şagirdin cavabı
  for (let i = 0; i < rawData.length - 4; i++) {
    const row0 = rawData[i];
    const row1 = rawData[i + 1];
    const row2 = rawData[i + 2];
    const hasEtalonAndStudent = isEtalonRow(row1) && isStudentAnswerRow(row2);
    const isBlockStart =
      hasEtalonAndStudent &&
      (isSSRow(row0) || isSubjectNamePlusQuestionsRow(row0));
    if (!isBlockStart) continue;

    const questionRow = row0;
    const etalonRow = row1;
    const studentAnswerRow = row2;
    const resultRow = rawData[i + 3];
    const scoreRow = rawData[i + 4];

    // Fənn adı: ya ilk sətirin birinci xanası (Fənn adı, 1, 2, ... formatında), ya sonrakı sətirlərdə düz/səhv sətiri
    let subjectName = "";
    if (isSubjectNamePlusQuestionsRow(row0)) {
      subjectName = firstCell(row0, 0);
    }
    if (!subjectName) {
      for (let j = i + 5; j <= Math.min(i + 10, rawData.length - 1); j++) {
        const r = rawData[j];
        if (!r || !Array.isArray(r)) continue;
        const c0 = firstCell(r, 0);
        const rest = r.slice(1, 6).map((c) => (c != null ? c.toString().toLowerCase() : ""));
        const hasDuzSehv =
          rest.some((s) => s.includes("düz")) &&
          rest.some((s) => s.includes("səhv"));
        if (c0.length >= 3 && hasDuzSehv && /[A-Za-zƏəİiÖöÜüŞşÇçĞğ]/.test(c0)) {
          subjectName = c0;
          break;
        }
      }
    }
    if (!subjectName) subjectName = "Fənn " + (subjects.length + 1);

    // Excel-dəki summary sətirlərini tap: "düz", "səhv", "imtina" etiket sətiri və alt sətirdə rəqəmlər + "bal" (B6 və alt xanalar)
    // Dəyərlər YALNIZ bu xanalardan götürülür; Excel-in hesablama məntiqi (1, 2, 3, 4.1, 4.2 və s.) eyni qalır
    let subjectBal = null;
    let summaryValueRow = null;
    for (let j = i + 5; j <= Math.min(i + 12, rawData.length - 2); j++) {
      const labelRow = rawData[j];
      const valueRow = rawData[j + 1];
      if (!labelRow || !Array.isArray(labelRow) || !valueRow || !Array.isArray(valueRow)) continue;
      const lb1 = firstCell(labelRow, 1).toLowerCase().replace(/\s+/g, " ").trim();
      const lb2 = firstCell(labelRow, 2).toLowerCase().replace(/\s+/g, " ").trim();
      const lb3 = firstCell(labelRow, 3).toLowerCase().replace(/\s+/g, " ").trim();
      const isLabelRow = lb1.includes("düz") && lb2.includes("səhv") && lb3.includes("imtina");
      if (!isLabelRow) continue;
      const v1 = valueRow[1];
      const v2 = valueRow[2];
      const v3 = valueRow[3];
      const valueRowIsNumeric =
        (v1 != null && (typeof v1 === "number" || !isNaN(parseFloat(v1)))) ||
        (v2 != null && (typeof v2 === "number" || !isNaN(parseFloat(v2)))) ||
        (v3 != null && (typeof v3 === "number" || !isNaN(parseFloat(v3))));
      if (valueRowIsNumeric) {
        summaryValueRow = valueRow;
        break;
      }
    }

    let correctCount = 0;
    let wrongCount = 0;
    let rejectedCount = 0;
    let totalQuestionsFromSummary = null;
    if (summaryValueRow) {
      const duzVal = summaryValueRow[1];
      const sehvVal = summaryValueRow[2];
      const imtinaVal = summaryValueRow[3];
      correctCount = duzVal != null && (typeof duzVal === "number" || !isNaN(parseFloat(duzVal)))
        ? Math.round(Number(duzVal))
        : 0;
      wrongCount = sehvVal != null && (typeof sehvVal === "number" || !isNaN(parseFloat(sehvVal)))
        ? Math.round(Number(sehvVal))
        : 0;
      rejectedCount = imtinaVal != null && (typeof imtinaVal === "number" || !isNaN(parseFloat(imtinaVal)))
        ? Math.round(Number(imtinaVal))
        : 0;
      totalQuestionsFromSummary = correctCount + wrongCount + rejectedCount;
      // Bal: imtina sütunundan sonra (sağında)
      for (let k = 1; k < summaryValueRow.length - 1; k++) {
        const cell = summaryValueRow[k];
        if (cell != null && String(cell).trim().toLowerCase() === "bal") {
          const next = summaryValueRow[k + 1];
          if (next != null) {
            const num = Number(parseFloat(next));
            if (!isNaN(num) && num >= 0 && num <= 100) {
              subjectBal = Math.round(num * 100) / 100;
              break;
            }
          }
        }
      }
    }

    // Cavabları topla: sual nömrələri Excel-də yazıldığı kimi – 1, 2, 3, 4.1, 4.2, 4.3, 4.4, 5, ... (heç nə birləşdirilmir)
    const answers = [];
    for (let col = 1; col < Math.min(etalonRow.length, studentAnswerRow.length); col++) {
      const etalonVal = etalonRow[col];
      if (etalonVal === null || etalonVal === undefined || etalonVal === "") continue;
      const studentVal = studentAnswerRow[col];
      const resultVal = resultRow && resultRow[col] != null ? resultRow[col].toString().trim() : "";
      const scoreVal = scoreRow && scoreRow[col];
      const isCorrect =
        resultVal === "+" ||
        resultVal === "✓" ||
        scoreVal === 1 ||
        (typeof scoreVal === "number" && scoreVal > 0 && resultVal !== "-");
      const studentNum = studentVal != null ? parseFloat(studentVal) : NaN;
      const isZeroOrNearZero =
        studentVal === 0 ||
        studentVal === "0" ||
        (!isNaN(studentNum) && studentNum >= 0 && studentNum <= 0.01);
      const resultSaysImtina =
        resultVal === "i" ||
        (resultVal && String(resultVal).trim().toLowerCase() === "imtina");
      const isRejected =
        resultSaysImtina && !isZeroOrNearZero;

      // Sual nömrəsi: Excel-dəki birinci sətirdən eyni qaydada – 1, 2, 3, 4.1, 4.2, 4.3, 4.4, 5, ...
      const qNum = questionRow[col];
      let questionNum = col;
      if (qNum !== null && qNum !== undefined && qNum !== "") {
        const str = String(qNum).trim();
        if (str !== "") {
          const asNum = parseFloat(qNum);
          if (!isNaN(asNum)) {
            // 4.1, 4.2, 4.3, 4.4 kimi onluq nömrələri Excel-də olduğu kimi saxla (string kimi, yuvarlaqlaşdırma olmasın)
            questionNum = /^\d+\.\d+$/.test(str) ? str : asNum;
          } else {
            questionNum = str;
          }
        }
      }

      answers.push({
        question: questionNum,
        etalonAnswer: etalonVal.toString().trim(),
        studentAnswer:
          studentVal !== null && studentVal !== undefined
            ? studentVal.toString().trim()
            : "",
        isCorrect: !!isCorrect,
        isRejected: !!isRejected,
        score:
          scoreVal !== null && scoreVal !== undefined
            ? (typeof scoreVal === "number" ? scoreVal : parseFloat(scoreVal)) || 0
            : isCorrect ? 1 : 0,
      });
      if (!summaryValueRow) {
        if (isRejected) rejectedCount++;
        else if (isCorrect) correctCount++;
        else wrongCount++;
      }
    }

    // Summary yoxdursa balı köhnə üsulla axtar
    if (subjectBal == null) {
      for (let j = i + 4; j <= Math.min(i + 12, rawData.length - 1); j++) {
        const r = rawData[j];
        if (!r || !Array.isArray(r)) continue;
        for (let k = 1; k < r.length - 1; k++) {
          if (r[k] != null && String(r[k]).trim().toLowerCase() === "bal") {
            const next = r[k + 1];
            if (next != null) {
              const num = parseFloat(next);
              if (!isNaN(num) && num >= 0 && num <= 100) {
                subjectBal = num;
                break;
              }
            }
          }
        }
        if (subjectBal != null) break;
      }
    }

    subjects.push({
      subjectName,
      totalQuestions: totalQuestionsFromSummary != null ? totalQuestionsFromSummary : answers.length,
      correctAnswers: correctCount,
      wrongAnswers: wrongCount,
      rejectedAnswers: rejectedCount,
      answers,
      bal: subjectBal,
    });
  }

  // Sonda şagird adı və ümumi balı tap: sətirdə ID (rəqəm və ya string), ad soyad, onun sağında ümumi bal
  const sheetIdNum = parseInt(sheetName, 10);
  const sheetIdStr = String(sheetName).trim();
  for (let i = rawData.length - 1; i >= Math.max(0, rawData.length - 15); i--) {
    const row = rawData[i];
    if (!row || !Array.isArray(row)) continue;
    const rowHasId =
      row.some(
        (val) =>
          val != null &&
          (val === sheetIdStr || val === sheetIdNum || (parseFloat(val) === sheetIdNum && !isNaN(parseFloat(val))))
      );
    if (!rowHasId) continue;
    for (let c = 0; c < row.length; c++) {
      const val = row[c];
      if (val == null) continue;
      const idMatch =
        val === sheetIdStr ||
        val === sheetIdNum ||
        (typeof val === "number" && val === sheetIdNum) ||
        (parseFloat(val) === sheetIdNum && !isNaN(parseFloat(val)));
      if (!idMatch) continue;
      for (let k = c + 1; k < row.length; k++) {
        const nameVal = row[k];
        const nameStr = nameVal != null ? String(nameVal).trim() : "";
        if (
          nameStr.length > 2 &&
          /[A-Za-zƏəİiÖöÜüŞşÇçĞğ]/.test(nameStr) &&
          !/^\d+$/.test(nameStr)
        ) {
          studentName = nameStr;
          for (let j = k + 1; j < Math.min(k + 15, row.length); j++) {
            const cell = row[j];
            if (cell == null || cell === "") continue;
            const num = parseFloat(cell);
            if (totalScore == null && !isNaN(num) && num >= 0 && num <= 100) {
              totalScore = num;
              totalScoreSource = "id-row-near-name";
              totalScoreCell = { row: i, col: j, value: cell };
              break;
            }
          }
          break;
        }
      }
      break;
    }
    if (studentName) break;
  }
  // Ümumi bal tapılmadısa, son sətirlərdə 0–100 arası ən böyük rəqəmi götür (ehtiyat)
  if (totalScore == null && studentName) {
    for (let i = rawData.length - 1; i >= Math.max(0, rawData.length - 5); i--) {
      const row = rawData[i];
      if (!row || !Array.isArray(row)) continue;
      let best = null;
      for (let c = 0; c < row.length; c++) {
        const num = parseFloat(row[c]);
        if (!isNaN(num) && num >= 0 && num <= 100 && (best == null || num > best))
          best = num;
      }
      if (best != null) {
        totalScore = best;
        totalScoreSource = "fallback-max-last5";
        break;
      }
    }
  }


  return {
    studentCode: String(sheetName).trim(),
    studentName: studentName || "",
    totalScore: totalScore != null ? totalScore : undefined,
    subjects,
  };
}

// Etalon / şagird cavabı sətirini tam N tokena bölür: tək rəqəmlər birləşmir (1, 2 ayrı), yalnız 10–99 iki rəqəm bir token; N = +/- sətirinin uzunluğu
function tokenizeAnswerLineToLength(str, targetCount) {
  const s = (str || "").replace(/\s/g, "");
  const tokens = [];
  let i = 0;
  let needed = targetCount;
  while (i < s.length && needed > 0) {
    const c = s[i];
    if (/[A-Za-z*]/.test(c)) {
      tokens.push(c);
      i++;
      needed--;
      continue;
    }
    if (/\d/.test(c)) {
      const remaining = s.length - i;
      const two = remaining >= 2 ? s.slice(i, i + 2) : c;
      const twoVal = parseInt(two, 10);
      const takeTwo = remaining >= 2 && twoVal >= 10 && twoVal <= 99 && (remaining - 2) >= (needed - 1);
      if (takeTwo) {
        tokens.push(two);
        i += 2;
      } else {
        tokens.push(c);
        i += 1;
      }
      needed--;
    } else {
      i++;
    }
  }
  return tokens;
}

// Köhnə davranış: N verilməyəndə hərflər tək, rəqəm yalnız 10–99 olanda iki simvol
function tokenizeAnswerLine(str) {
  const s = (str || "").replace(/\s/g, "");
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/[A-Za-z*]/.test(c)) {
      tokens.push(c);
      i++;
    } else if (/\d/.test(c)) {
      if (i + 1 < s.length && /\d/.test(s[i + 1])) {
        const two = s[i] + s[i + 1];
        const val = parseInt(two, 10);
        if (val >= 10 && val <= 99) {
          tokens.push(two);
          i += 2;
          continue;
        }
      }
      tokens.push(c);
      i++;
    } else {
      i++;
    }
  }
  return tokens;
}

// Sual nömrələri: 1, 2, 3, 4.1, 4.2, 4.3, 4.4, 5, …, 26. PDF-də boşluq/vergüllə ayrılmış rəqəmlər olduğu kimi parse edilir (1, 2, 3, 4 birləşmir).
function parseQuestionNumberLine(line) {
  if (!line || typeof line !== "string") return [];
  // Əvvəlcə boşluq və vergül ilə ayır – hər token ayrı sual nömrəsi (1 2 3 4 → 1, 2, 3, 4)
  const tokens = line
    .replace(/,/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const result = [];
  for (const t of tokens) {
    const normalized = t.replace(/,/g, ".");
    if (/^\d+\.\d+$/.test(normalized)) {
      const val = parseFloat(normalized);
      if (!isNaN(val)) result.push(val);
    } else if (/^\d+$/.test(normalized)) {
      const val = parseInt(normalized, 10);
      if (!isNaN(val)) result.push(val);
    }
  }
  if (result.length > 0) return result;
  // Fallback: boşluq yoxdursa (tək uzun sətir) – rəqəmləri tək-tək və 4.1 kimi sub-nömrələri saxlayaraq parse et
  const s = line.replace(/,/g, ".").replace(/\s/g, "");
  let i = 0;
  while (i < s.length) {
    if (!/\d/.test(s[i])) {
      i++;
      continue;
    }
    if (s[i + 1] === "." && /\d/.test(s[i + 2])) {
      result.push(parseFloat(s[i] + s[i + 1] + s[i + 2]));
      i += 3;
      continue;
    }
    if (/\d/.test(s[i + 1])) {
      const two = parseInt(s[i] + s[i + 1], 10);
      if (two >= 10 && two <= 99) {
        result.push(two);
        i += 2;
        continue;
      }
    }
    result.push(parseInt(s[i], 10));
    i += 1;
  }
  return result;
}

// BİLLİS PDF mətnindən şagird bloklarını parse et (BİLLİS9-11 SINAQ nəticə PDF formatı)
// Qeyd: PDF-də şagird sətiri (3000XX Ad Soyad ÜmumiBal) həmin şagirdin fənn bloklarından SONRA gəlir.
function parseBillisPdfText(pdfText) {
  const students = [];
  const lines = pdfText.split(/\r?\n/).map((s) => s.trim()).filter((s) => s.length > 0);
  const subjectNames = ["Xarici dili", "Ana dili", "Riyaziyyat"];
  const codeRegex = /^(3000\d{2})(.*)$/;

  const codeLineIndices = [];
  for (let i = 0; i < lines.length; i++) {
    if (codeRegex.test(lines[i])) codeLineIndices.push(i);
  }

  const seenStudentCodes = new Set();
  for (let k = 0; k < codeLineIndices.length; k++) {
    const codeIdx = codeLineIndices[k];
    const headerLine = lines[codeIdx];
    const codeMatch = codeRegex.exec(headerLine);
    if (!codeMatch) continue;

    const studentCode = codeMatch[1];
    if (seenStudentCodes.has(studentCode)) continue;
    seenStudentCodes.add(studentCode);
    const restOfFirstLine = (codeMatch[2] || "").trim();

    let studentName = "";
    let totalScore = null;
    const lastNumMatch = restOfFirstLine.match(/(\d+(?:\.\d+)?)\s*$/);
    if (lastNumMatch) {
      const score = parseFloat(lastNumMatch[1]);
      if (!isNaN(score) && score >= 0 && score <= 250) {
        totalScore = score;
        studentName = restOfFirstLine.slice(0, lastNumMatch.index).trim();
      } else {
        studentName = restOfFirstLine;
      }
    } else {
      studentName = restOfFirstLine;
    }
    if (studentName && /^\d/.test(studentName)) studentName = "";

    const blockStart = k === 0 ? 0 : codeLineIndices[k - 1] + 1;
    const blockEnd = codeIdx;
    const blockLines = lines.slice(blockStart, blockEnd);
    const blockText = blockLines.join("\n");

    const subjects = [];
    for (const subjName of subjectNames) {
      const idx = blockText.indexOf(subjName);
      if (idx === -1) continue;
      let section = blockText.slice(idx);
      const nextSubj = subjectNames.find((n) => n !== subjName && section.indexOf(n) !== -1);
      if (nextSubj) {
        const nextIdx = section.indexOf(nextSubj);
        if (nextIdx !== -1) section = section.slice(0, nextIdx);
      }
      const sectionLines = section.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      let questionNumberLine = null;
      let etalonLine = null;
      let studentLine = null;
      let resultLine = null;
      let bal = null;
      let correctCount = 0;
      let wrongCount = 0;
      let rejectedCount = 0;

      const firstLine = sectionLines[0] || "";
      const subjNameLower = subjName.toLowerCase();
      const nameIdx = firstLine.toLowerCase().indexOf(subjNameLower);
      if (nameIdx !== -1) {
        const afterName = firstLine.slice(nameIdx + subjName.length).trim();
        if (afterName.length > 0 && /[\d.,\s]/.test(afterName)) {
          questionNumberLine = afterName;
        }
      }

      for (let j = 0; j < sectionLines.length; j++) {
        const l = sectionLines[j];
        if (l.toLowerCase() === "etalon" && j + 1 < sectionLines.length) {
          if (j > 0 && !questionNumberLine && /[\d.,\s]/.test(sectionLines[j - 1]) && sectionLines[j - 1].replace(/\s/g, "").length > 4) {
            questionNumberLine = sectionLines[j - 1];
          }
          etalonLine = sectionLines[j + 1];
          j++;
          continue;
        }
        if (!questionNumberLine && /^\d[\d.\s,]*\d$|^\d+\.\d+/.test(l) && l.replace(/\s/g, "").length > 4) {
          questionNumberLine = l;
        }
        if (l.toLowerCase().includes("şagirdin") && j + 2 < sectionLines.length) {
          const next = sectionLines[j + 1];
          if (next.toLowerCase().includes("cavab")) {
            studentLine = sectionLines[j + 2];
            j += 2;
            continue;
          }
        }
        if (l.toLowerCase().includes("şagirdin") && l.toLowerCase().includes("cavab") && j + 1 < sectionLines.length) {
          studentLine = sectionLines[j + 1];
          j++;
          continue;
        }
        if (/^[+\-i\s]+$/i.test(l.replace(/\s/g, "")) && l.length > 5) {
          resultLine = l;
          continue;
        }
        const balLineMatch = l.match(/^(\d+)bal\s*([\d.]+)/i) || l.match(/(\d+)\s*bal\s*([\d.]+)/i);
        if (balLineMatch) {
          const beforeBal = balLineMatch[1];
          const afterBal = parseFloat(balLineMatch[2]);
          if (!isNaN(afterBal)) bal = afterBal;
          if (beforeBal.length >= 3) {
            rejectedCount = parseInt(beforeBal.slice(-1), 10) || 0;
            correctCount = parseInt(beforeBal.slice(0, beforeBal.length - 3), 10) || 0;
            wrongCount = parseInt(beforeBal.slice(beforeBal.length - 3, -1), 10) || 0;
          }
        }
        const anyBalMatch = l.match(/bal\s*([\d.]+)/i);
        if (anyBalMatch) {
          const b = parseFloat(anyBalMatch[1]);
          if (!isNaN(b)) bal = b;
        }
        if (l.toLowerCase().includes("düz") && l.toLowerCase().includes("səhv")) {
          const düzMatch = l.match(/düz\s*(\d+)/i);
          const səhvMatch = l.match(/səhv\s*(\d+)/i);
          const imtinaMatch = l.match(/imtina\s*(\d+)/i);
          if (düzMatch) correctCount = parseInt(düzMatch[1], 10) || 0;
          if (səhvMatch) wrongCount = parseInt(səhvMatch[1], 10) || 0;
          if (imtinaMatch) rejectedCount = parseInt(imtinaMatch[1], 10) || 0;
        }
      }

      if (!etalonLine || !studentLine) continue;
      const resultChars = resultLine ? resultLine.replace(/\s/g, "").split("") : [];
      let n;
      let etalonTokens;
      let studentTokens;
      if (resultChars.length > 0) {
        n = resultChars.length;
        etalonTokens = tokenizeAnswerLineToLength(etalonLine, n);
        studentTokens = tokenizeAnswerLineToLength(studentLine, n);
      } else {
        etalonTokens = tokenizeAnswerLine(etalonLine);
        studentTokens = tokenizeAnswerLine(studentLine);
        n = Math.max(etalonTokens.length, studentTokens.length, 1);
      }
      let questionNumbers = parseQuestionNumberLine(questionNumberLine || "");
      if (questionNumbers.length > n) questionNumbers = questionNumbers.slice(0, n);
      while (questionNumbers.length < n) questionNumbers.push(questionNumbers.length + 1);
      const answers = [];
      for (let q = 0; q < n; q++) {
        const res = resultChars[q] != null ? String(resultChars[q]).trim() : "";
        const isCorrect = res === "+" || res === "✓";
        const isRejected = res === "i" || res.toLowerCase() === "imtina";
        const et = etalonTokens[q] != null ? String(etalonTokens[q]).trim() : "";
        const st = studentTokens[q] != null ? String(studentTokens[q]).trim() : "";
        const questionNum = questionNumbers[q] != null ? questionNumbers[q] : q + 1;
        if (et === "" && st === "" && res === "") continue;
        answers.push({
          question: questionNum,
          etalonAnswer: et || "",
          studentAnswer: st,
          isCorrect: !!isCorrect,
          isRejected: !!isRejected,
          score: isCorrect ? 1 : 0,
        });
      }
      const correctFromAnswers = answers.filter((a) => a.isCorrect).length;
      const wrongFromAnswers = answers.filter((a) => !a.isCorrect && !a.isRejected).length;
      const rejectedFromAnswers = answers.filter((a) => a.isRejected).length;
      subjects.push({
        subjectName: subjName,
        totalQuestions: answers.length,
        correctAnswers: correctCount > 0 ? correctCount : correctFromAnswers,
        wrongAnswers: wrongCount > 0 ? wrongCount : wrongFromAnswers,
        rejectedAnswers: rejectedCount > 0 ? rejectedCount : rejectedFromAnswers,
        answers,
        bal: bal != null ? bal : undefined,
      });
    }

    if (subjects.length > 0) {
      students.push({
        studentCode,
        studentName: studentName || studentCode,
        totalScore: totalScore != null ? totalScore : undefined,
        subjects,
      });
    }
  }
  return students;
}

// PDF-də hər tələbə kodunun hansı səhifədə olduğunu tapır (pdfjs-dist ilə); tələbə blokunu "screenshot" üçün səhifə göstərməyə imkan verir
async function getStudentPageNumbersFromPdf(pdfBuffer, studentCodes) {
  const pageByCode = {};
  if (!pdfjsLib || !studentCodes.length) return pageByCode;
  try {
    const data = new Uint8Array(pdfBuffer);
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdfDocument = await loadingTask.promise;
    const numPages = pdfDocument.numPages;
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => (item.str || "")).join(" ");
      for (const code of studentCodes) {
        if (pageText.indexOf(code) !== -1) {
          pageByCode[code] = pageNum;
        }
      }
      page.cleanup();
    }
    await pdfDocument.destroy();
  } catch (err) {
    console.error("getStudentPageNumbersFromPdf xətası:", err.message);
  }
  return pageByCode;
}

// Lisey formatı olub-olmadığını yoxla: ilk işlənə bilən sheet-də SS/etalon/Şagirdin cavabı var
function isLiseyFormat(workbook) {
  const names = (workbook.SheetNames || []).filter(
    (n) => !String(n || "").toLowerCase().includes("şagird") &&
      !String(n || "").toLowerCase().includes("student") &&
      !String(n || "").toLowerCase().includes("tələbə")
  );
  for (const sheetName of names) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;
    const raw = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });
    if (raw.length < 3) continue;
    const r0 = raw[0] && raw[0][0] != null ? raw[0][0].toString().trim().toUpperCase() : "";
    const r1 = raw[1] && raw[1][0] != null ? raw[1][0].toString().trim().toLowerCase() : "";
    const r2 = raw[2] && raw[2][0] != null ? raw[2][0].toString().trim().toLowerCase() : "";
    const secondCell = raw[0] && raw[0][1] != null ? raw[0][1] : null;
    const hasNumericSecond =
      typeof secondCell === "number" ||
      (secondCell != null && !isNaN(parseFloat(secondCell)));
    const startsWithSubjectAndQuestions =
      r0.length >= 2 &&
      /[A-Za-zƏəİiÖöÜüŞşÇçĞğ]/.test(r0) &&
      hasNumericSecond;
    if (
      ((r0 === "SS") || startsWithSubjectAndQuestions) &&
      r1 === "etalon" &&
      r2.includes("şagirdin") &&
      r2.includes("cavab")
    )
      return true;
  }
  return false;
}

app.post("/api/upload-excel", upload.single("excelFile"), async (req, res) => {
  console.log("Upload request received:", req.file);
  try {
    if (!db || !client) {
      await connectToMongoDB();
    }

    try {
      await client.db("admin").admin().ping();
    } catch (err) {
      console.log("MongoDB connection kəsildi, yenidən qoşulur...");
      await connectToMongoDB();
    }

    if (!req.file) {
      console.log("No file received");
      return res.status(400).json({ error: "Excel faylı seçilməyib!" });
    }

    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);

    // Debug: Excel-dəki sütun adlarını çap et
    if (data.length > 0) {
      console.log("=== EXCEL FAYL ANALİZİ ===");
      console.log("Excel faylındakı sütun adları:", Object.keys(data[0]));
      console.log("İlk sətir məlumatları:", JSON.stringify(data[0], null, 2));
      console.log(
        "'İmtina' sütunu var?",
        data[0].hasOwnProperty("İmtina"),
        "Dəyəri:",
        data[0]["İmtina"]
      );
      console.log(
        "'Yazı işi' sütunu var?",
        data[0].hasOwnProperty("Yazı işi"),
        "Dəyəri:",
        data[0]["Yazı işi"]
      );
    }

    const filteredData = data.filter((row) => {
      const kod = row["Kod"] || row["kod"] || row["KOD"];
      return kod && kod.toString().trim() !== "";
    });

    console.log(
      `Ümumi sətir sayı: ${data.length}, Filter edilmiş sətir sayı: ${filteredData.length}`
    );

    let successCount = 0;
    let errorCount = 0;

    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const fileName = "imtahan-" + uniqueSuffix + ".xlsx";

    for (let index = 0; index < filteredData.length; index++) {
      const row = filteredData[index];
      try {
        const code =
          row["Kod"] ||
          row["kod"] ||
          row["KOD"] ||
          row["Student Code"] ||
          row["student_code"];
        const name =
          row["Ad"] ||
          row["ad"] ||
          row["AD"] ||
          row["Name"] ||
          row["name"] ||
          row["First Name"];
        const surname =
          row["Soyad"] ||
          row["soyad"] ||
          row["SOYAD"] ||
          row["Surname"] ||
          row["surname"] ||
          row["Last Name"];
        const subject =
          row["Fənn"] ||
          row["fenn"] ||
          row["FENN"] ||
          row["Subject"] ||
          row["subject"] ||
          row["Course"];
        const result =
          row["Yekun bal"] ||
          row["Yekun Bal"] ||
          row["yekun bal"] ||
          row["YEKUN BAL"] ||
          row["Bal"] ||
          row["bal"] ||
          row["BAL"] ||
          row["Score"] ||
          row["score"] ||
          row["Grade"] ||
          row["grade"];
        const correctAnswer =
          row["Doğru cavab"] ||
          row["Doğru Cavab"] ||
          row["doğru cavab"] ||
          null;
        const wrongAnswer = getColumnValue(row, [
          "Səhv",
          "səhv",
          "SEHV",
          "Səhv cavab",
          "Səhv Cavab",
          "səhv cavab",
          "Wrong",
          "wrong",
          "WRONG",
        ]);
        const rejectedAnswer = getColumnValue(
          row,
          [
            "İmtina",
            "imtina",
            "İMTİNA",
            "İmtina edilmiş",
            "İmtina edilmiş suallar",
            "İmtina edilmiş sual",
            "Rejected",
            "rejected",
            "REJECTED",
          ],
          "rejectedAnswer",
          index === 0
        );
        const openQuestion = getColumnValue(
          row,
          [
            "Yazı işi",
            "Yazı İşi",
            "yazı işi",
            "YAZI İŞİ",
            "Açıq sual (balı)",
            "Açıq Sual (balı)",
            "açıq sual (balı)",
            "Açıq sual",
            "Açıq Sual",
            "açıq sual",
            "Open Question",
            "open question",
            "OPEN QUESTION",
          ],
          "openQuestion",
          index === 0
        );

        // Debug: İlk sətir üçün oxunan dəyərləri çap et
        if (index === 0) {
          console.log("=== İLK SƏTİR DEBUG ===");
          console.log("Excel sətirinin bütün sütunları:", Object.keys(row));
          console.log("Oxunan dəyərlər:", {
            rejectedAnswer: rejectedAnswer,
            rejectedAnswerType: typeof rejectedAnswer,
            openQuestion: openQuestion,
            openQuestionType: typeof openQuestion,
            wrongAnswer: wrongAnswer,
            wrongAnswerType: typeof wrongAnswer,
          });
          console.log(
            "Excel-də 'İmtina' sütunu var?",
            row.hasOwnProperty("İmtina"),
            row["İmtina"]
          );
          console.log(
            "Excel-də 'Yazı işi' sütunu var?",
            row.hasOwnProperty("Yazı işi"),
            row["Yazı işi"]
          );
        }
        const successRate =
          row["Uğur faizi"] || row["Uğur Faizi"] || row["uğur faizi"] || null;
        const variant =
          row["Variant"] || row["variant"] || row["VARIANT"] || "";
        const section =
          row["Bölmə"] ||
          row["bölmə"] ||
          row["BOLME"] ||
          row["Section"] ||
          row["section"] ||
          "";
        const classValue =
          row["Sinif"] ||
          row["sinif"] ||
          row["SINIF"] ||
          row["Class"] ||
          row["class"] ||
          "";
        const subclass =
          row["Altqrup"] ||
          row["altqrup"] ||
          row["ALTQRUP"] ||
          row["Subgroup"] ||
          row["subgroup"] ||
          "";

        const excelData = JSON.stringify(row);

        let isValidResult = false;
        if (result !== undefined && result !== null && result !== "") {
          const testValue =
            typeof result === "string" ? parseFloat(result.trim()) : result;
          isValidResult = !isNaN(testValue) && isFinite(testValue);
        }

        if (code && name && surname && subject && isValidResult) {
          const resultsCollection = db.collection("imtahan_neticeleri");

          const document = {
            code: code.toString(),
            name: name.toString(),
            surname: surname.toString(),
            subject: subject.toString(),
            result: result,
            correctAnswer:
              correctAnswer !== undefined &&
              correctAnswer !== null &&
              correctAnswer !== ""
                ? correctAnswer
                : null,
            wrongAnswer:
              wrongAnswer !== undefined &&
              wrongAnswer !== null &&
              wrongAnswer !== ""
                ? wrongAnswer
                : null,
            rejectedAnswer:
              rejectedAnswer !== undefined && rejectedAnswer !== null
                ? rejectedAnswer
                : null,
            openQuestion:
              openQuestion !== undefined && openQuestion !== null
                ? openQuestion
                : null,
            successRate:
              successRate !== undefined &&
              successRate !== null &&
              successRate !== ""
                ? successRate
                : null,
            variant: variant.toString(),
            section: section.toString(),
            class: classValue.toString(),
            subclass: subclass.toString(),
            fileName: fileName,
            excelData: excelData,
            uploadDate: new Date(),
          };

          // Debug: Veritabanına yazılan məlumatları çap et
          if (index === 0) {
            console.log("=== VERİTABANINA YAZILAN DOCUMENT ===");
            console.log("Document obyekti:", JSON.stringify(document, null, 2));
            console.log(
              "rejectedAnswer field-i varmı?",
              document.hasOwnProperty("rejectedAnswer")
            );
            console.log("rejectedAnswer dəyəri:", document.rejectedAnswer);
            console.log(
              "openQuestion field-i varmı?",
              document.hasOwnProperty("openQuestion")
            );
            console.log("openQuestion dəyəri:", document.openQuestion);
          }

          // Mövcud sətri yenilə və ya yeni sətr yarat
          // Əmin ol ki, rejectedAnswer və openQuestion field-ləri həmişə yazılır
          // document obyektində artıq bu field-lər var, amma yenidən təyin edirik ki, əmin olaq
          const updateData = {
            ...document,
            // rejectedAnswer və openQuestion field-lərini açıq şəkildə təyin et
            rejectedAnswer:
              rejectedAnswer !== undefined && rejectedAnswer !== null
                ? rejectedAnswer
                : null,
            openQuestion:
              openQuestion !== undefined && openQuestion !== null
                ? openQuestion
                : null,
          };

          // Əmin ol ki, updateData-da bu field-lər var
          if (!updateData.hasOwnProperty("rejectedAnswer")) {
            updateData.rejectedAnswer = null;
          }
          if (!updateData.hasOwnProperty("openQuestion")) {
            updateData.openQuestion = null;
          }

          // Debug: Update data-nı çap et
          if (index === 0) {
            console.log("=== UPDATE DATA ===");
            console.log(
              "Update data obyekti:",
              JSON.stringify(updateData, null, 2)
            );
            console.log(
              "rejectedAnswer updateData-də varmı?",
              updateData.hasOwnProperty("rejectedAnswer")
            );
            console.log("rejectedAnswer dəyəri:", updateData.rejectedAnswer);
            console.log(
              "openQuestion updateData-də varmı?",
              updateData.hasOwnProperty("openQuestion")
            );
            console.log("openQuestion dəyəri:", updateData.openQuestion);
          }

          const updateResult = await resultsCollection.updateOne(
            { code: code.toString(), subject: subject.toString() },
            { $set: updateData },
            { upsert: true }
          );

          // Debug: Update nəticəsini çap et
          if (index === 0) {
            console.log("=== UPDATE NƏTİCƏSİ ===");
            console.log("Update nəticəsi:", {
              matchedCount: updateResult.matchedCount,
              modifiedCount: updateResult.modifiedCount,
              upsertedCount: updateResult.upsertedCount,
            });

            // Veritabanından yeni yazılan sətri oxu və yoxla
            const savedDoc = await resultsCollection.findOne({
              code: code.toString(),
              subject: subject.toString(),
            });
            if (savedDoc) {
              console.log("=== VERİTABANINDAN OXUNAN SƏTR ===");
              console.log(
                "rejectedAnswer field-i varmı?",
                savedDoc.hasOwnProperty("rejectedAnswer")
              );
              console.log("rejectedAnswer dəyəri:", savedDoc.rejectedAnswer);
              console.log(
                "openQuestion field-i varmı?",
                savedDoc.hasOwnProperty("openQuestion")
              );
              console.log("openQuestion dəyəri:", savedDoc.openQuestion);
              console.log("Bütün field-lər:", Object.keys(savedDoc));
            }
          }

          successCount++;
        } else {
          const missingFields = [];
          if (!code) missingFields.push("Kod");
          if (!name) missingFields.push("Ad");
          if (!surname) missingFields.push("Soyad");
          if (!subject) missingFields.push("Fənn");
          if (
            parsedResult === null ||
            parsedResult === undefined ||
            isNaN(parsedResult) ||
            !isFinite(parsedResult)
          )
            missingFields.push("Yekun bal");

          console.log(
            `Sətir ${
              index + 1
            }: Məlumatlar tam deyil. Çatışmayan sütunlar: ${missingFields.join(
              ", "
            )}`
          );
          console.log(`Sətir ${index + 1} məlumatları:`, {
            code: code || "YOX",
            name: name || "YOX",
            surname: surname || "YOX",
            subject: subject || "YOX",
            result: result || "YOX",
            parsedResult: parsedResult,
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
      fileName: fileName,
    });
  } catch (error) {
    console.error("Excel fayl işlənmə xətası:", error);
    res.status(500).json({
      error: "Excel fayl işlənərkən xəta baş verdi: " + error.message,
    });
  }
});

app.get("/api/check-result/:kod", async (req, res) => {
  const kod = req.params.kod;

  try {
    if (!db || !client) {
      await connectToMongoDB();
    }

    try {
      await client.db("admin").admin().ping();
    } catch (err) {
      console.log("MongoDB connection kəsildi, yenidən qoşulur...");
      await connectToMongoDB();
    }

    const resultsCollection = db.collection("imtahan_neticeleri");
    const rows = await resultsCollection
      .find({ code: kod })
      .sort({ subject: 1 })
      .toArray();
    const getSubjectResult = (subject) => {
      if (!subject || typeof subject !== "object") return null;
      const directCandidates = [subject.bal, subject.result, subject.score];
      for (const candidate of directCandidates) {
        if (candidate != null && !Number.isNaN(Number(candidate))) {
          return Math.round(Number(candidate) * 100) / 100;
        }
      }
      return null;
    };

    if (rows && rows.length > 0) {
      const studentInfo = {
        code: rows[0].code,
        name: rows[0].name,
        surname: rows[0].surname,
        variant: rows[0].variant || "",
        section: rows[0].section || "",
        class: rows[0].class || "",
        subclass: rows[0].subclass || "",
        uploadDate: rows[0].uploadDate,
      };

      const subjects = rows.map((row) => {
        const subjectData = {
          subject: row.subject || "",
          result:
            row.result !== undefined && row.result !== null ? row.result : null,
          correctAnswer:
            row.correctAnswer !== undefined && row.correctAnswer !== null
              ? row.correctAnswer
              : null,
          wrongAnswer:
            row.wrongAnswer !== undefined && row.wrongAnswer !== null
              ? row.wrongAnswer
              : null,
          rejectedAnswer:
            row.rejectedAnswer !== undefined && row.rejectedAnswer !== null
              ? row.rejectedAnswer
              : null,
          openQuestion:
            row.openQuestion !== undefined && row.openQuestion !== null
              ? row.openQuestion
              : null,
          successRate:
            row.successRate !== undefined && row.successRate !== null
              ? row.successRate
              : null,
        };

        // Debug: API-dən qaytarılan məlumatları çap et
        if (rows.indexOf(row) === 0) {
          console.log("API-dən qaytarılan subject data:", subjectData);
          console.log("Veritabanından oxunan row:", {
            rejectedAnswer: row.rejectedAnswer,
            openQuestion: row.openQuestion,
          });
        }

        return subjectData;
      });

      const totalResult = subjects.reduce((sum, subj) => {
        if (subj.result === undefined || subj.result === null) return sum;
        const value =
          typeof subj.result === "number"
            ? subj.result
            : parseFloat(subj.result) || 0;
        return sum + value;
      }, 0);

      const allExcelData = {};
      rows.forEach((row) => {
        if (row.excelData) {
          try {
            const excelRow = JSON.parse(row.excelData);
            Object.keys(excelRow).forEach((key) => {
              if (!allExcelData[key]) {
                allExcelData[key] = [];
              }
              allExcelData[key].push(excelRow[key]);
            });
          } catch (err) {
            console.error("Excel data parse xətası:", err);
          }
        }
      });

      // Şagird cavablarını student_answers collection-dan tap
      let studentAnswers = null;
      try {
        const studentAnswersCollection = db.collection("student_answers");
        studentAnswers = await studentAnswersCollection.findOne({
          studentCode: kod,
        });

        if (studentAnswers) {
          console.log(`${kod} üçün şagird cavabları tapıldı:`, {
            totalQuestions: studentAnswers.totalQuestions,
            correctAnswers: studentAnswers.correctAnswers,
            wrongAnswers: studentAnswers.wrongAnswers,
            subjectsCount: studentAnswers.subjects
              ? studentAnswers.subjects.length
              : 0,
          });
        } else {
          console.log(`${kod} üçün şagird cavabları tapılmadı`);
        }
      } catch (err) {
        console.error("Şagird cavabları oxunarkən xəta:", err);
        // Xəta olsa belə, əsas nəticələri göstər
      }

      // Əgər şagird cavabları (Excel) yüklənibsə, əsas cədvəldə də həmin rəqəmləri göstər (exceldə olduğu kimi)
      let displaySubjects = subjects || [];
      let displayTotalResult = totalResult || 0;
      let displaySubjectCount = rows.length || 0;
      if (studentAnswers && studentAnswers.subjects && studentAnswers.subjects.length > 0) {
        displaySubjects = studentAnswers.subjects.map((s) => ({
          subject: s.subjectName || s.subject || "",
          result: getSubjectResult(s),
          correctAnswer: s.correctAnswers ?? null,
          wrongAnswer: s.wrongAnswers ?? null,
          rejectedAnswer: s.rejectedAnswers ?? null,
          openQuestion: null,
          successRate: null,
        }));
        displayTotalResult =
          studentAnswers.totalScore != null
            ? studentAnswers.totalScore
            : displaySubjects.reduce((sum, s) => sum + (parseFloat(s.result) || 0), 0) || 0;
        displaySubjectCount = displaySubjects.length;
      }

      res.json({
        success: true,
        data: {
          ...studentInfo,
          subjects: displaySubjects,
          totalResult: displayTotalResult,
          subjectCount: displaySubjectCount,
          excelData: allExcelData || {},
          studentAnswers: studentAnswers
            ? {
                totalQuestions: studentAnswers.totalQuestions || 0,
                correctAnswers: studentAnswers.correctAnswers || 0,
                wrongAnswers: studentAnswers.wrongAnswers || 0,
                subjects: studentAnswers.subjects || [],
                sheetName: studentAnswers.sheetName || "",
                pdfPageNumber: studentAnswers.pdfPageNumber || null,
                hasPdfScreenshot: !!(studentAnswers.pdfGridfsId && studentAnswers.pdfPageNumber),
              }
            : null,
        },
      });
    } else {
      // İmtahan_neticeleri-də yoxdur – yalnız Şagird ID ilə cavablar yüklənibsə, student_answers-dan göstər
      const studentAnswersCollection = db.collection("student_answers");
      const studentAnswers = await studentAnswersCollection.findOne({
        studentCode: String(kod).trim(),
      });
      if (studentAnswers && studentAnswers.subjects && studentAnswers.subjects.length > 0) {
        const subs = (studentAnswers.subjects || []).map((s) => ({
          subject: s.subjectName || s.subject || "",
          result: getSubjectResult(s),
          correctAnswer: s.correctAnswers ?? null,
          wrongAnswer: s.wrongAnswers ?? null,
          rejectedAnswer: s.rejectedAnswers ?? null,
          openQuestion: null,
          successRate: null,
        }));
        const totalResult =
          studentAnswers.totalScore != null
            ? studentAnswers.totalScore
            : (subs.reduce((sum, s) => sum + (parseFloat(s.result) || 0), 0) || 0);
        res.json({
          success: true,
          data: {
            code: studentAnswers.studentCode,
            name: studentAnswers.studentName || "",
            surname: "",
            variant: "",
            section: "",
            class: "",
            subclass: "",
            uploadDate: studentAnswers.uploadDate,
            subjects: subs,
            totalResult,
            subjectCount: subs.length,
            excelData: {},
            studentAnswers: {
              totalQuestions: studentAnswers.totalQuestions || 0,
              correctAnswers: studentAnswers.correctAnswers || 0,
              wrongAnswers: studentAnswers.wrongAnswers || 0,
              subjects: studentAnswers.subjects || [],
              sheetName: studentAnswers.sheetName || "",
              pdfPageNumber: studentAnswers.pdfPageNumber || null,
              hasPdfScreenshot: !!(studentAnswers.pdfGridfsId && studentAnswers.pdfPageNumber),
            },
          },
        });
      } else {
        res.json({
          success: false,
          message: "Bu kodla heç bir nəticə tapılmadı!",
        });
      }
    }
  } catch (err) {
    console.error("Veritabanı xətası:", err);
    return res.status(500).json({ error: "Veritabanı xətası!" });
  }
});

// Tələbə cavablarının PDF faylını göstər (tələbə bloku olan səhifə ilə); tələbə koduna görə
app.get("/api/student-answer-pdf/:studentCode", async (req, res) => {
  try {
    if (!db || !client) await connectToMongoDB();
    const studentAnswersCollection = db.collection("student_answers");
    const student = await studentAnswersCollection.findOne({
      studentCode: String(req.params.studentCode).trim(),
    });
    if (!student || !student.pdfGridfsId) {
      return res.status(404).json({ error: "Bu tələbə üçün PDF tapılmadı." });
    }
    const bucket = new GridFSBucket(db, { bucketName: "student_answer_pdfs" });
    const downloadStream = bucket.openDownloadStream(student.pdfGridfsId);
    downloadStream.on("error", (err) => {
      console.error("Student answer PDF download xətası:", err);
      if (!res.headersSent) res.status(404).json({ error: "PDF faylı tapılmadı." });
    });
    res.setHeader("Content-Type", "application/pdf");
    if (student.pdfPageNumber) {
      res.setHeader("X-Page-Number", String(student.pdfPageNumber));
    }
    res.setHeader(
      "Content-Disposition",
      `inline; filename="cavablar_${student.studentCode}.pdf"`
    );
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    downloadStream.pipe(res);
  } catch (err) {
    console.error("Student answer PDF xətası:", err);
    if (!res.headersSent) res.status(500).json({ error: "Server xətası." });
  }
});

app.get("/api/download-sample-excel", (req, res) => {
  const sampleFilePath = path.join(__dirname, "yeni_imtahan.xlsx");

  if (!fs.existsSync(sampleFilePath)) {
    return res.status(404).json({
      error:
        "Nümunə fayl tapılmadı! Zəhmət olmasa Excel faylınızı yükləyərkən aşağıdakı formatı istifadə edin:",
      format: {
        sütunlar: [
          "Kod",
          "Ad",
          "Soyad",
          "Fənn",
          "Doğru cavab",
          "Səhv",
          "İmtina",
          "Yazı işi",
          "Uğur faizi",
          "Yekun bal",
          "Variant",
          "Bölmə",
          "Sinif",
          "Altqrup",
        ],
        nümunə: {
          Kod: "ST001",
          Ad: "Əli",
          Soyad: "Məmmədov",
          Fənn: "Riyaziyyat",
          "Doğru cavab": 21.25,
          Səhv: 5.3125,
          İmtina: 2,
          "Yazı işi": 8.5,
          "Uğur faizi": 76.5,
          "Yekun bal": 85,
          Variant: "B",
          Bölmə: "Azərbaycan",
          Sinif: "11",
          Altqrup: 3,
        },
      },
    });
  }

  res.download(sampleFilePath, "nümunə_imtahan_neticeleri.xlsx", (err) => {
    if (err) {
      console.error("Download error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Fayl yüklənərkən xəta baş verdi!" });
      }
    }
  });
});

app.get("/api/all-results", async (req, res) => {
  try {
    if (!db || !client) {
      await connectToMongoDB();
    }

    try {
      await client.db("admin").admin().ping();
    } catch (err) {
      console.log("MongoDB connection kəsildi, yenidən qoşulur...");
      await connectToMongoDB();
    }

    const resultsCollection = db.collection("imtahan_neticeleri");
    const rows = await resultsCollection
      .find({})
      .sort({ uploadDate: -1 })
      .toArray();
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Veritabanı xətası:", err);
    return res.status(500).json({ error: "Veritabanı xətası!" });
  }
});

// Migration endpoint: Bütün mövcud sətirlərə rejectedAnswer və openQuestion field-lərini əlavə et
app.post("/api/add-missing-fields", async (req, res) => {
  try {
    if (!db || !client) {
      await connectToMongoDB();
    }

    try {
      await client.db("admin").admin().ping();
    } catch (err) {
      console.log("MongoDB connection kəsildi, yenidən qoşulur...");
      await connectToMongoDB();
    }

    const resultsCollection = db.collection("imtahan_neticeleri");

    // Bütün sətirləri tap
    const allRows = await resultsCollection.find({}).toArray();
    console.log(`Ümumi sətr sayı: ${allRows.length}`);

    let updatedCount = 0;
    let skippedCount = 0;

    // Hər sətr üçün rejectedAnswer və openQuestion field-lərini əlavə et
    for (const row of allRows) {
      const updateFields = {};
      let needsUpdate = false;

      // rejectedAnswer field-i yoxdursa və ya undefined-dırsa əlavə et
      if (
        !row.hasOwnProperty("rejectedAnswer") ||
        row.rejectedAnswer === undefined
      ) {
        updateFields.rejectedAnswer = null;
        needsUpdate = true;
      }

      // openQuestion field-i yoxdursa və ya undefined-dırsa əlavə et
      if (
        !row.hasOwnProperty("openQuestion") ||
        row.openQuestion === undefined
      ) {
        updateFields.openQuestion = null;
        needsUpdate = true;
      }

      if (needsUpdate) {
        const updateResult = await resultsCollection.updateOne(
          { _id: row._id },
          { $set: updateFields }
        );

        if (updateResult.modifiedCount > 0 || updateResult.matchedCount > 0) {
          updatedCount++;
        } else {
          skippedCount++;
        }
      } else {
        skippedCount++;
      }
    }

    res.json({
      success: true,
      message: `Migration tamamlandı: ${updatedCount} sətr yeniləndi, ${skippedCount} sətr artıq field-lərə malikdir`,
      updatedCount,
      skippedCount,
      totalCount: allRows.length,
    });
  } catch (err) {
    console.error("Migration xətası:", err);
    return res.status(500).json({
      error: "Migration zamanı xəta baş verdi: " + err.message,
    });
  }
});

// Migration endpoint: Köhnə məlumatları yeniləmək üçün
// Bu endpoint Excel faylından köhnə məlumatları yeniləyir
app.post("/api/migrate-data", upload.single("excelFile"), async (req, res) => {
  console.log("Migration request received");
  try {
    if (!db || !client) {
      await connectToMongoDB();
    }

    try {
      await client.db("admin").admin().ping();
    } catch (err) {
      console.log("MongoDB connection kəsildi, yenidən qoşulur...");
      await connectToMongoDB();
    }

    if (!req.file) {
      return res.status(400).json({ error: "Excel faylı seçilməyib!" });
    }

    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);

    const filteredData = data.filter((row) => {
      const kod = row["Kod"] || row["kod"] || row["KOD"];
      return kod && kod.toString().trim() !== "";
    });

    let updatedCount = 0;
    let notFoundCount = 0;

    const resultsCollection = db.collection("imtahan_neticeleri");

    for (let index = 0; index < filteredData.length; index++) {
      const row = filteredData[index];
      try {
        const code =
          row["Kod"] ||
          row["kod"] ||
          row["KOD"] ||
          row["Student Code"] ||
          row["student_code"];
        const subject =
          row["Fənn"] ||
          row["fenn"] ||
          row["FENN"] ||
          row["Subject"] ||
          row["subject"] ||
          row["Course"];

        if (code && subject) {
          const rejectedAnswer = getColumnValue(
            row,
            [
              "İmtina",
              "imtina",
              "İMTİNA",
              "İmtina edilmiş",
              "İmtina edilmiş suallar",
              "İmtina edilmiş sual",
              "Rejected",
              "rejected",
              "REJECTED",
            ],
            "rejectedAnswer",
            index === 0
          );
          const openQuestion = getColumnValue(
            row,
            [
              "Yazı işi",
              "Yazı İşi",
              "yazı işi",
              "YAZI İŞİ",
              "Açıq sual (balı)",
              "Açıq Sual (balı)",
              "açıq sual (balı)",
              "Açıq sual",
              "Açıq Sual",
              "açıq sual",
              "Open Question",
              "open question",
              "OPEN QUESTION",
            ],
            "openQuestion",
            index === 0
          );

          const updateResult = await resultsCollection.updateOne(
            { code: code.toString(), subject: subject.toString() },
            {
              $set: {
                rejectedAnswer:
                  rejectedAnswer !== undefined && rejectedAnswer !== null
                    ? rejectedAnswer
                    : null,
                openQuestion:
                  openQuestion !== undefined && openQuestion !== null
                    ? openQuestion
                    : null,
              },
            }
          );

          if (updateResult.matchedCount > 0) {
            updatedCount++;
          } else {
            notFoundCount++;
          }
        }
      } catch (err) {
        console.error(`Migration sətir ${index + 1} xətası:`, err);
      }
    }

    res.json({
      success: true,
      message: `Migration tamamlandı: ${updatedCount} sətr yeniləndi, ${notFoundCount} sətr tapılmadı`,
      updatedCount,
      notFoundCount,
    });
  } catch (error) {
    console.error("Migration xətası:", error);
    res.status(500).json({
      error: "Migration zamanı xəta baş verdi: " + error.message,
    });
  }
});

app.post("/api/upload-pdf", uploadPdf.single("pdfFile"), async (req, res) => {
  console.log("File upload request received");
  console.log("Request body:", req.body);
  console.log("Request file:", req.file ? "File exists" : "No file");
  console.log("Sinif from body:", req.body.sinif);

  try {
    if (!req.file) {
      console.log("No file in request");
      return res.status(400).json({ error: "Fayl seçilməyib!" });
    }

    const sinif = parseInt(req.body.sinif);
    console.log("Parsed sinif:", sinif);
    if (!sinif || sinif < 1 || sinif > 11) {
      return res
        .status(400)
        .json({ error: "Düzgün sinif nömrəsi daxil edin (1-11)!" });
    }

    // MongoDB connection yoxla
    if (!db || !client) {
      await connectToMongoDB();
    }

    try {
      await client.db("admin").admin().ping();
    } catch (err) {
      console.log("MongoDB connection kəsildi, yenidən qoşulur...");
      await connectToMongoDB();
    }

    // GridFS bucket yarat
    const bucket = new GridFSBucket(db, { bucketName: "sinif_pdfs" });

    // Köhnə faylı tap (əgər varsa)
    const pdfCollection = db.collection("sinif_pdf");
    const oldRecord = await pdfCollection.findOne({ sinif: sinif });
    const oldGridfsId = oldRecord ? oldRecord.gridfs_id : null;

    // Yeni faylı GridFS-ə yaz
    const originalExt = path.extname(req.file.originalname);
    const fileName = `sinif_${sinif}${originalExt}`;

    const uploadStream = bucket.openUploadStream(fileName, {
      metadata: {
        sinif: sinif,
        originalName: req.file.originalname,
        uploadDate: new Date(),
      },
    });

    // Promise ilə upload-u gözlə
    const uploadPromise = new Promise((resolve, reject) => {
      uploadStream.on("finish", () => {
        resolve(uploadStream.id);
      });

      uploadStream.on("error", (error) => {
        console.error("GridFS upload xətası:", error);
        reject(error);
      });

      // Buffer-dan yaz
      uploadStream.end(req.file.buffer);
    });

    try {
      // Upload-u gözlə
      const gridfsId = await uploadPromise;

      // Metadata-nı sinif_pdf collection-da saxla
      await pdfCollection.updateOne(
        { sinif: sinif },
        {
          $set: {
            sinif: sinif,
            fayl_adi: fileName,
            gridfs_id: gridfsId,
            yuklenme_tarixi: new Date(),
          },
        },
        { upsert: true }
      );

      // Yeni fayl uğurla yazıldıqdan sonra köhnə faylı sil
      if (oldGridfsId && oldGridfsId.toString() !== gridfsId.toString()) {
        try {
          await bucket.delete(oldGridfsId);
          console.log(
            `Köhnə fayl silindi: sinif ${sinif}, gridfs_id: ${oldGridfsId}`
          );
        } catch (deleteErr) {
          // Əgər fayl tapılmadısa, xəta vermə, sadəcə log yaz
          console.log(
            `Köhnə fayl tapılmadı və ya silinə bilmədi: ${deleteErr.message}`
          );
        }
      }

      res.json({
        success: true,
        message: `${sinif}-ci sinif üçün fayl uğurla yükləndi`,
        sinif: sinif,
        fileName: fileName,
      });
    } catch (uploadErr) {
      console.error("GridFS upload xətası:", uploadErr);
      // Əgər upload uğursuz oldusa, yeni yazılmış faylı sil (əgər varsa)
      if (uploadStream.id) {
        try {
          await bucket.delete(uploadStream.id);
          console.log("Yazılmış fayl upload xətası səbəbindən silindi");
        } catch (deleteErr) {
          console.error("Fayl silinərkən xəta:", deleteErr);
        }
      }
      if (!res.headersSent) {
        res.status(500).json({
          error: "Fayl yüklənərkən xəta baş verdi: " + uploadErr.message,
        });
      }
    }
  } catch (error) {
    console.error("PDF fayl yükləmə xətası:", error);
    if (!res.headersSent) {
      res.status(500).json({
        error: "PDF fayl yüklənərkən xəta baş verdi: " + error.message,
      });
    }
  }
});

app.get("/api/download-pdf/:sinif", async (req, res) => {
  const sinif = parseInt(req.params.sinif);

  if (!sinif || sinif < 1 || sinif > 11) {
    return res
      .status(400)
      .json({ error: "Düzgün sinif nömrəsi daxil edin (1-11)!" });
  }

  try {
    // MongoDB connection yoxla
    if (!db || !client) {
      await connectToMongoDB();
    }

    try {
      await client.db("admin").admin().ping();
    } catch (err) {
      console.log("MongoDB connection kəsildi, yenidən qoşulur...");
      await connectToMongoDB();
    }

    const pdfCollection = db.collection("sinif_pdf");
    const pdfRecord = await pdfCollection.findOne({ sinif: sinif });

    if (!pdfRecord) {
      return res
        .status(404)
        .json({ error: `${sinif}-ci sinif üçün fayl tapılmadı!` });
    }

    // Əgər gridfs_id varsa, GridFS-dən oxu
    if (pdfRecord.gridfs_id) {
      const bucket = new GridFSBucket(db, { bucketName: "sinif_pdfs" });
      const downloadStream = bucket.openDownloadStream(pdfRecord.gridfs_id);

      downloadStream.on("error", (err) => {
        console.error("File download xətası:", err);
        if (!res.headersSent) {
          res.status(404).json({ error: "Fayl tapılmadı!" });
        }
      });

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${pdfRecord.fayl_adi}"`
      );

      const ext = path.extname(pdfRecord.fayl_adi).toLowerCase();
      const mimeTypes = {
        ".pdf": "application/pdf",
        ".doc": "application/msword",
        ".docx":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xls": "application/vnd.ms-excel",
        ".xlsx":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      };
      res.setHeader(
        "Content-Type",
        mimeTypes[ext] || "application/octet-stream"
      );
      // Cache-i deaktiv et ki, hər dəfə yeni fayl götürülsün
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");

      downloadStream.pipe(res);
    }
    // Əgər köhnə fayl_yolu varsa, disk-dən oxu
    else if (pdfRecord.fayl_yolu && fs.existsSync(pdfRecord.fayl_yolu)) {
      // Cache-i deaktiv et
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.download(pdfRecord.fayl_yolu, pdfRecord.fayl_adi, (err) => {
        if (err) {
          console.error("File download xətası:", err);
          if (!res.headersSent) {
            res.status(500).json({ error: "Fayl yüklənərkən xəta baş verdi!" });
          }
        }
      });
    } else {
      return res
        .status(404)
        .json({ error: `${sinif}-ci sinif üçün fayl tapılmadı!` });
    }
  } catch (err) {
    console.error("File download xətası:", err);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Veritabanı xətası!" });
    }
  }
});

app.get("/api/view-pdf/:sinif", async (req, res) => {
  const sinif = parseInt(req.params.sinif);

  if (!sinif || sinif < 1 || sinif > 11) {
    return res
      .status(400)
      .json({ error: "Düzgün sinif nömrəsi daxil edin (1-11)!" });
  }

  try {
    // MongoDB connection yoxla
    if (!db || !client) {
      await connectToMongoDB();
    }

    try {
      await client.db("admin").admin().ping();
    } catch (err) {
      console.log("MongoDB connection kəsildi, yenidən qoşulur...");
      await connectToMongoDB();
    }

    const pdfCollection = db.collection("sinif_pdf");
    const pdfRecord = await pdfCollection.findOne({ sinif: sinif });

    if (!pdfRecord) {
      return res
        .status(404)
        .json({ error: `${sinif}-ci sinif üçün fayl tapılmadı!` });
    }

    // Əgər gridfs_id varsa, GridFS-dən oxu
    if (pdfRecord.gridfs_id) {
      const bucket = new GridFSBucket(db, { bucketName: "sinif_pdfs" });

      // Metadata üçün files collection-dan oxu
      const filesCollection = db.collection("sinif_pdfs.files");
      const fileInfo = await filesCollection.findOne({
        _id: pdfRecord.gridfs_id,
      });

      if (!fileInfo) {
        return res.status(404).json({ error: "Fayl metadata tapılmadı!" });
      }

      const downloadStream = bucket.openDownloadStream(pdfRecord.gridfs_id);

      downloadStream.on("error", (err) => {
        console.error("PDF file stream error:", err);
        if (!res.headersSent) {
          res.status(404).json({ error: "PDF faylı tapılmadı!" });
        } else {
          res.end();
        }
      });

      const ext = path.extname(pdfRecord.fayl_adi).toLowerCase();
      const mimeTypes = {
        ".pdf": "application/pdf",
        ".doc": "application/msword",
        ".docx":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xls": "application/vnd.ms-excel",
        ".xlsx":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".txt": "text/plain",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
      };
      const contentType = mimeTypes[ext] || "application/octet-stream";

      res.setHeader("Content-Type", contentType);
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${pdfRecord.fayl_adi}"`
      );
      if (fileInfo.length) {
        res.setHeader("Content-Length", fileInfo.length);
      }
      res.setHeader("Accept-Ranges", "bytes");
      // Cache-i deaktiv et ki, hər dəfə yeni fayl götürülsün
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");

      downloadStream.pipe(res);
    }
    // Əgər köhnə fayl_yolu varsa, disk-dən oxu
    else if (pdfRecord.fayl_yolu && fs.existsSync(pdfRecord.fayl_yolu)) {
      const stats = fs.statSync(pdfRecord.fayl_yolu);
      const fileSize = stats.size;

      const ext = path.extname(pdfRecord.fayl_adi).toLowerCase();
      const mimeTypes = {
        ".pdf": "application/pdf",
        ".doc": "application/msword",
        ".docx":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xls": "application/vnd.ms-excel",
        ".xlsx":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".txt": "text/plain",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
      };
      const contentType = mimeTypes[ext] || "application/octet-stream";

      res.setHeader("Content-Type", contentType);
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${pdfRecord.fayl_adi}"`
      );
      res.setHeader("Content-Length", fileSize);
      res.setHeader("Accept-Ranges", "bytes");
      // Cache-i deaktiv et ki, hər dəfə yeni fayl götürülsün
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");

      const fileStream = fs.createReadStream(pdfRecord.fayl_yolu);

      fileStream.on("error", (err) => {
        console.error("PDF file stream error:", err);
        if (!res.headersSent) {
          res
            .status(500)
            .json({ error: "PDF faylı oxunarkən xəta baş verdi!" });
        } else {
          res.end();
        }
      });

      fileStream.pipe(res);
    } else {
      return res
        .status(404)
        .json({ error: `${sinif}-ci sinif üçün fayl tapılmadı!` });
    }
  } catch (err) {
    console.error("PDF görüntüləmə xətası:", err);
    if (!res.headersSent) {
      return res
        .status(500)
        .json({ error: "PDF faylı görüntülənərkən xəta baş verdi!" });
    }
  }
});

app.get("/api/list-pdfs", async (req, res) => {
  try {
    // MongoDB connection yoxla
    if (!db || !client) {
      await connectToMongoDB();
    }

    try {
      await client.db("admin").admin().ping();
    } catch (err) {
      console.log("MongoDB connection kəsildi, yenidən qoşulur...");
      await connectToMongoDB();
    }

    const pdfCollection = db.collection("sinif_pdf");
    const allRows = await pdfCollection.find({}).sort({ sinif: 1 }).toArray();

    // Yalnız mövcud faylları filter et
    const validRows = [];
    const bucket = new GridFSBucket(db, { bucketName: "sinif_pdfs" });

    for (const row of allRows) {
      let fileExists = false;

      // Əgər gridfs_id varsa, GridFS-də yoxla
      if (row.gridfs_id) {
        try {
          const filesCollection = db.collection("sinif_pdfs.files");
          const fileInfo = await filesCollection.findOne({
            _id: row.gridfs_id,
          });
          if (fileInfo) {
            fileExists = true;
          }
        } catch (err) {
          console.log(
            `GridFS fayl yoxlanılarkən xəta (sinif ${row.sinif}):`,
            err.message
          );
        }
      }
      // Əgər köhnə fayl_yolu varsa, disk-də yoxla
      else if (row.fayl_yolu) {
        if (fs.existsSync(row.fayl_yolu)) {
          fileExists = true;
        }
      }

      // Yalnız mövcud faylları əlavə et
      if (fileExists) {
        validRows.push(row);
      } else {
        // Mövcud olmayan faylların metadata-sını sil
        console.log(
          `Mövcud olmayan fayl metadata-sı silinir: sinif ${row.sinif}`
        );
        try {
          await pdfCollection.deleteOne({ _id: row._id });
        } catch (deleteErr) {
          console.error(
            `Metadata silinərkən xəta (sinif ${row.sinif}):`,
            deleteErr.message
          );
        }
      }
    }

    res.json({ success: true, data: validRows });
  } catch (err) {
    console.error("PDF siyahısı xətası:", err);
    return res.status(500).json({ error: "Veritabanı xətası!" });
  }
});

// Doğru cavablar faylları üçün endpoint-lər
app.post(
  "/api/upload-answers",
  uploadPdf.single("answersFile"),
  async (req, res) => {
    console.log("Doğru cavablar fayl upload request received");
    console.log("Request body:", req.body);
    console.log("Request file:", req.file ? "File exists" : "No file");
    console.log("Sinif from body:", req.body.sinif);

    try {
      if (!req.file) {
        console.log("No file in request");
        return res.status(400).json({ error: "Fayl seçilməyib!" });
      }

      const sinif = parseInt(req.body.sinif);
      console.log("Parsed sinif:", sinif);
      if (!sinif || sinif < 1 || sinif > 11) {
        return res
          .status(400)
          .json({ error: "Düzgün sinif nömrəsi daxil edin (1-11)!" });
      }

      // MongoDB connection yoxla
      if (!db || !client) {
        await connectToMongoDB();
      }

      try {
        await client.db("admin").admin().ping();
      } catch (err) {
        console.log("MongoDB connection kəsildi, yenidən qoşulur...");
        await connectToMongoDB();
      }

      // GridFS bucket yarat
      const bucket = new GridFSBucket(db, { bucketName: "sinif_answers" });

      // Köhnə faylı tap (əgər varsa)
      const answersCollection = db.collection("sinif_dogru_cavablar");
      const oldRecord = await answersCollection.findOne({ sinif: sinif });
      const oldGridfsId = oldRecord ? oldRecord.gridfs_id : null;

      // Yeni faylı GridFS-ə yaz
      const originalExt = path.extname(req.file.originalname);
      const fileName = `sinif_${sinif}_dogru_cavablar${originalExt}`;

      console.log("Fayl ölçüsü:", req.file.buffer.length, "bytes");
      console.log("Fayl adı:", fileName);
      console.log("Fayl tipi:", req.file.mimetype);

      const uploadStream = bucket.openUploadStream(fileName, {
        metadata: {
          sinif: sinif,
          originalName: req.file.originalname,
          uploadDate: new Date(),
        },
      });

      // Promise ilə upload-u gözlə
      const uploadPromise = new Promise((resolve, reject) => {
        uploadStream.on("finish", () => {
          console.log("GridFS upload tamamlandı, ID:", uploadStream.id);
          resolve(uploadStream.id);
        });

        uploadStream.on("error", (error) => {
          console.error("GridFS upload xətası:", error);
          reject(error);
        });

        // Buffer-dan yaz
        uploadStream.end(req.file.buffer);
      });

      try {
        // Upload-u gözlə
        const gridfsId = await uploadPromise;

        console.log("GridFS ID alındı:", gridfsId);

        // GridFS-də faylın mövcud olduğunu və ölçüsünü yoxla
        const filesCollection = db.collection("sinif_answers.files");
        const uploadedFileInfo = await filesCollection.findOne({
          _id: gridfsId,
        });

        if (uploadedFileInfo) {
          console.log(
            "Fayl GridFS-də tapıldı, ölçü:",
            uploadedFileInfo.length,
            "bytes"
          );
        } else {
          console.error("Fayl GridFS-də tapılmadı!");
        }

        // Metadata-nı sinif_dogru_cavablar collection-da saxla
        await answersCollection.updateOne(
          { sinif: sinif },
          {
            $set: {
              sinif: sinif,
              fayl_adi: fileName,
              gridfs_id: gridfsId,
              yuklenme_tarixi: new Date(),
            },
          },
          { upsert: true }
        );

        console.log("Metadata database-ə yazıldı");

        // Yeni fayl uğurla yazıldıqdan sonra köhnə faylı sil
        if (oldGridfsId && oldGridfsId.toString() !== gridfsId.toString()) {
          try {
            await bucket.delete(oldGridfsId);
            console.log(
              `Köhnə doğru cavablar faylı silindi: sinif ${sinif}, gridfs_id: ${oldGridfsId}`
            );
          } catch (deleteErr) {
            // Əgər fayl tapılmadısa, xəta vermə, sadəcə log yaz
            console.log(
              `Köhnə fayl tapılmadı və ya silinə bilmədi: ${deleteErr.message}`
            );
          }
        }

        res.json({
          success: true,
          message: `${sinif}-ci sinif üçün doğru cavablar faylı uğurla yükləndi`,
          sinif: sinif,
          fileName: fileName,
        });
      } catch (uploadErr) {
        console.error("GridFS upload xətası:", uploadErr);
        // Əgər upload uğursuz oldusa, yeni yazılmış faylı sil (əgər varsa)
        if (uploadStream.id) {
          try {
            await bucket.delete(uploadStream.id);
            console.log("Yazılmış fayl upload xətası səbəbindən silindi");
          } catch (deleteErr) {
            console.error("Fayl silinərkən xəta:", deleteErr);
          }
        }
        if (!res.headersSent) {
          res.status(500).json({
            error: "Fayl yüklənərkən xəta baş verdi: " + uploadErr.message,
          });
        }
      }
    } catch (error) {
      console.error("Doğru cavablar fayl yükləmə xətası:", error);
      if (!res.headersSent) {
        res.status(500).json({
          error:
            "Doğru cavablar faylı yüklənərkən xəta baş verdi: " + error.message,
        });
      }
    }
  }
);

app.get("/api/list-answers", async (req, res) => {
  try {
    // MongoDB connection yoxla
    if (!db || !client) {
      await connectToMongoDB();
    }

    try {
      await client.db("admin").admin().ping();
    } catch (err) {
      console.log("MongoDB connection kəsildi, yenidən qoşulur...");
      await connectToMongoDB();
    }

    const answersCollection = db.collection("sinif_dogru_cavablar");
    const allRows = await answersCollection
      .find({})
      .sort({ sinif: 1 })
      .toArray();

    // Yalnız mövcud faylları filter et
    const validRows = [];
    const bucket = new GridFSBucket(db, { bucketName: "sinif_answers" });

    for (const row of allRows) {
      let fileExists = false;

      // Əgər gridfs_id varsa, GridFS-də yoxla
      if (row.gridfs_id) {
        try {
          const filesCollection = db.collection("sinif_answers.files");
          const fileInfo = await filesCollection.findOne({
            _id: row.gridfs_id,
          });
          if (fileInfo) {
            fileExists = true;
          }
        } catch (err) {
          console.log(
            `GridFS fayl yoxlanılarkən xəta (sinif ${row.sinif}):`,
            err.message
          );
        }
      }

      // Yalnız mövcud faylları əlavə et
      if (fileExists) {
        validRows.push(row);
      } else {
        // Mövcud olmayan faylların metadata-sını sil
        console.log(
          `Mövcud olmayan doğru cavablar fayl metadata-sı silinir: sinif ${row.sinif}`
        );
        try {
          await answersCollection.deleteOne({ _id: row._id });
        } catch (deleteErr) {
          console.error(
            `Metadata silinərkən xəta (sinif ${row.sinif}):`,
            deleteErr.message
          );
        }
      }
    }

    res.json({ success: true, data: validRows });
  } catch (err) {
    console.error("Doğru cavablar siyahısı xətası:", err);
    return res.status(500).json({ error: "Veritabanı xətası!" });
  }
});

app.get("/api/download-answers/:sinif", async (req, res) => {
  const sinif = parseInt(req.params.sinif);

  if (!sinif || sinif < 1 || sinif > 11) {
    return res
      .status(400)
      .json({ error: "Düzgün sinif nömrəsi daxil edin (1-11)!" });
  }

  try {
    // MongoDB connection yoxla
    if (!db || !client) {
      await connectToMongoDB();
    }

    try {
      await client.db("admin").admin().ping();
    } catch (err) {
      console.log("MongoDB connection kəsildi, yenidən qoşulur...");
      await connectToMongoDB();
    }

    const answersCollection = db.collection("sinif_dogru_cavablar");
    const answerRecord = await answersCollection.findOne({ sinif: sinif });

    if (!answerRecord) {
      return res.status(404).json({
        error: `${sinif}-ci sinif üçün doğru cavablar faylı tapılmadı!`,
      });
    }

    // Əgər gridfs_id varsa, GridFS-dən oxu
    if (answerRecord.gridfs_id) {
      const bucket = new GridFSBucket(db, { bucketName: "sinif_answers" });
      const downloadStream = bucket.openDownloadStream(answerRecord.gridfs_id);

      downloadStream.on("error", (err) => {
        console.error("Doğru cavablar fayl download xətası:", err);
        if (!res.headersSent) {
          res.status(404).json({ error: "Fayl tapılmadı!" });
        }
      });

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${answerRecord.fayl_adi}"`
      );

      const ext = path.extname(answerRecord.fayl_adi).toLowerCase();
      const mimeTypes = {
        ".pdf": "application/pdf",
        ".doc": "application/msword",
        ".docx":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xls": "application/vnd.ms-excel",
        ".xlsx":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      };
      res.setHeader(
        "Content-Type",
        mimeTypes[ext] || "application/octet-stream"
      );
      // Cache-i deaktiv et ki, hər dəfə yeni fayl götürülsün
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");

      downloadStream.pipe(res);
    } else {
      return res.status(404).json({
        error: `${sinif}-ci sinif üçün doğru cavablar faylı tapılmadı!`,
      });
    }
  } catch (err) {
    console.error("Doğru cavablar fayl download xətası:", err);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Veritabanı xətası!" });
    }
  }
});

app.get("/api/view-answers/:sinif", async (req, res) => {
  const sinif = parseInt(req.params.sinif);

  if (!sinif || sinif < 1 || sinif > 11) {
    return res
      .status(400)
      .json({ error: "Düzgün sinif nömrəsi daxil edin (1-11)!" });
  }

  try {
    // MongoDB connection yoxla
    if (!db || !client) {
      await connectToMongoDB();
    }

    try {
      await client.db("admin").admin().ping();
    } catch (err) {
      console.log("MongoDB connection kəsildi, yenidən qoşulur...");
      await connectToMongoDB();
    }

    const answersCollection = db.collection("sinif_dogru_cavablar");
    const answerRecord = await answersCollection.findOne({ sinif: sinif });

    if (!answerRecord) {
      return res.status(404).json({
        error: `${sinif}-ci sinif üçün doğru cavablar faylı tapılmadı!`,
      });
    }

    // Əgər gridfs_id varsa, GridFS-dən oxu
    if (answerRecord.gridfs_id) {
      const bucket = new GridFSBucket(db, { bucketName: "sinif_answers" });

      // Metadata üçün files collection-dan oxu
      const filesCollection = db.collection("sinif_answers.files");
      const fileInfo = await filesCollection.findOne({
        _id: answerRecord.gridfs_id,
      });

      if (!fileInfo) {
        return res.status(404).json({ error: "Fayl metadata tapılmadı!" });
      }

      const downloadStream = bucket.openDownloadStream(answerRecord.gridfs_id);

      downloadStream.on("error", (err) => {
        console.error("Doğru cavablar fayl stream xətası:", err);
        if (!res.headersSent) {
          res.status(404).json({ error: "Doğru cavablar faylı tapılmadı!" });
        } else {
          res.end();
        }
      });

      const ext = path.extname(answerRecord.fayl_adi).toLowerCase();
      const mimeTypes = {
        ".pdf": "application/pdf",
        ".doc": "application/msword",
        ".docx":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xls": "application/vnd.ms-excel",
        ".xlsx":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".txt": "text/plain",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
      };
      const contentType = mimeTypes[ext] || "application/octet-stream";

      res.setHeader("Content-Type", contentType);
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${answerRecord.fayl_adi}"`
      );
      if (fileInfo.length) {
        res.setHeader("Content-Length", fileInfo.length);
      }
      res.setHeader("Accept-Ranges", "bytes");
      // Cache-i deaktiv et ki, hər dəfə yeni fayl götürülsün
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");

      downloadStream.pipe(res);
    } else {
      return res.status(404).json({
        error: `${sinif}-ci sinif üçün doğru cavablar faylı tapılmadı!`,
      });
    }
  } catch (err) {
    console.error("Doğru cavablar faylı görüntüləmə xətası:", err);
    if (!res.headersSent) {
      return res.status(500).json({
        error: "Doğru cavablar faylı görüntülənərkən xəta baş verdi!",
      });
    }
  }
});

// Şagird cavabları upload endpoint
// Qəbul edir: Excel (.xlsx, .xls) və ya PDF (BİLLİS nəticə formatı)
app.post(
  "/api/upload-student-answers",
  uploadStudentAnswers.single("studentAnswersFile"),
  async (req, res) => {
    console.log("Şagird cavabları upload request received:", req.file);
    try {
      if (!db || !client) {
        await connectToMongoDB();
      }

      try {
        await client.db("admin").admin().ping();
      } catch (err) {
        console.log("MongoDB connection kəsildi, yenidən qoşulur...");
        await connectToMongoDB();
      }

      if (!req.file) {
        console.log("No file received");
        return res.status(400).json({ error: "Excel və ya PDF faylı seçilməyib!" });
      }

      const isPdf =
        req.file.mimetype === "application/pdf" ||
        (req.file.originalname && req.file.originalname.toLowerCase().endsWith(".pdf"));

      if (isPdf) {
        const studentAnswersCollection = db.collection("student_answers");
        let totalProcessed = 0;
        let totalErrors = 0;
        const processedSheets = [];
        try {
          const pdfData = await pdfParse(req.file.buffer);
          const students = parseBillisPdfText(pdfData.text || "");
          const studentCodes = students.map((s) => s.studentCode);
          const pageByCode = await getStudentPageNumbersFromPdf(req.file.buffer, studentCodes);

          let pdfGridfsId = null;
          const bucket = new GridFSBucket(db, { bucketName: "student_answer_pdfs" });
          const uploadStream = bucket.openUploadStream(
            `student_answers_${Date.now()}_${(req.file.originalname || "upload.pdf").replace(/[^a-zA-Z0-9.-]/g, "_")}`,
            { metadata: { originalName: req.file.originalname, uploadDate: new Date() } }
          );
          pdfGridfsId = await new Promise((resolve, reject) => {
            uploadStream.on("finish", () => resolve(uploadStream.id));
            uploadStream.on("error", reject);
            uploadStream.end(req.file.buffer);
          });

          for (const stu of students) {
            try {
              const totalQuestions = stu.subjects.reduce((s, sub) => s + (sub.totalQuestions || 0), 0);
              const totalCorrect = stu.subjects.reduce((s, sub) => s + (sub.correctAnswers || 0), 0);
              const totalWrong = stu.subjects.reduce((s, sub) => s + (sub.wrongAnswers || 0), 0);
              const document = {
                studentCode: stu.studentCode,
                sheetName: stu.studentCode,
                studentName: stu.studentName || "",
                totalScore: stu.totalScore,
                subjects: stu.subjects,
                totalQuestions,
                correctAnswers: totalCorrect,
                wrongAnswers: totalWrong,
                fileName: req.file.originalname,
                uploadDate: new Date(),
                pdfGridfsId: pdfGridfsId || undefined,
                pdfPageNumber: pageByCode[stu.studentCode] || undefined,
              };
              await studentAnswersCollection.updateOne(
                { studentCode: stu.studentCode },
                { $set: document },
                { upsert: true }
              );
              totalProcessed++;
              processedSheets.push({
                sheetName: stu.studentCode,
                studentCode: stu.studentCode,
                studentName: stu.studentName,
                subjectsCount: stu.subjects.length,
                totalQuestions,
                correctAnswers: totalCorrect,
                wrongAnswers: totalWrong,
                processed: true,
                hasPdfPage: !!pageByCode[stu.studentCode],
              });
            } catch (err) {
              console.error("PDF şagird save xətası:", stu.studentCode, err);
              processedSheets.push({
                sheetName: stu.studentCode,
                processed: false,
                error: err.message,
              });
              totalErrors++;
            }
          }
          return res.json({
            success: true,
            message: `${totalProcessed} şagirdin cavabları (PDF) uğurla yükləndi. Tələbə blokunu PDF-də səhifə ilə birlikdə göstərmək mümkündür.`,
            processedCount: totalProcessed,
            errorCount: totalErrors,
            sheets: processedSheets,
            fileName: req.file.originalname,
          });
        } catch (pdfErr) {
          console.error("PDF parse xətası:", pdfErr);
          return res.status(400).json({
            error: "PDF faylı oxuna bilmədi: " + (pdfErr.message || "Naməlum xəta"),
          });
        }
      }

      const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
      console.log("Excel faylındakı sheet-lər:", workbook.SheetNames);

      const studentAnswersCollection = db.collection("student_answers");
      let totalProcessed = 0;
      let totalErrors = 0;
      const processedSheets = [];

      // Lisey formatı (student_results_lisey.xlsx): hər sheet = Şagird ID, SS/etalon/Şagirdin cavabı
      const useLiseyParser = isLiseyFormat(workbook);
      if (useLiseyParser) {
        console.log("Lisey formatı aşkar edildi, bütün sheet-lər işlənir.");
        for (const sheetNameRaw of workbook.SheetNames) {
          const sheetName = sheetNameRaw != null ? String(sheetNameRaw) : "";
          const sheetNameLower = sheetName.toLowerCase();
          if (
            sheetNameLower.includes("şagird") ||
            sheetNameLower.includes("student") ||
            sheetNameLower.includes("tələbə")
          ) {
            continue;
          }
          try {
            const worksheet = workbook.Sheets[sheetNameRaw] || workbook.Sheets[sheetName];
            if (!worksheet) {
              console.log(`${sheetName} üçün worksheet tapılmadı, atlanır`);
              totalErrors++;
              processedSheets.push({ sheetName, processed: false, error: "Worksheet tapılmadı" });
              continue;
            }
            const rawData = xlsx.utils.sheet_to_json(worksheet, {
              header: 1,
              defval: null,
            });
            const parsed = parseLiseySheet(rawData, sheetName);
            if (!parsed || !parsed.subjects || parsed.subjects.length === 0) {
              console.log(`${sheetName} üçün məlumat çıxarılmadı, atlanır`);
              processedSheets.push({ sheetName, processed: false, error: "Məlumat çıxarılmadı" });
              continue;
            }
            if (sheetName === "300025" && parsed.subjects && parsed.subjects[0]) {
              console.log("300025 parse nəticəsi (summary xanalarından):", {
                fənn: parsed.subjects[0].subjectName,
                düz: parsed.subjects[0].correctAnswers,
                səhv: parsed.subjects[0].wrongAnswers,
                imtina: parsed.subjects[0].rejectedAnswers,
                bal: parsed.subjects[0].bal,
              });
            }
            const totalQuestions = parsed.subjects.reduce(
              (s, sub) => s + (sub.totalQuestions || 0),
              0
            );
            const totalCorrect = parsed.subjects.reduce(
              (s, sub) => s + (sub.correctAnswers || 0),
              0
            );
            const totalWrong = parsed.subjects.reduce(
              (s, sub) => s + (sub.wrongAnswers || 0),
              0
            );
            const document = {
              studentCode: parsed.studentCode,
              sheetName: sheetName,
              studentName: parsed.studentName || "",
              totalScore: parsed.totalScore,
              subjects: parsed.subjects,
              totalQuestions,
              correctAnswers: totalCorrect,
              wrongAnswers: totalWrong,
              fileName: req.file.originalname,
              uploadDate: new Date(),
            };
            await studentAnswersCollection.updateOne(
              { studentCode: parsed.studentCode },
              { $set: document },
              { upsert: true }
            );
            totalProcessed++;
            processedSheets.push({
              sheetName: sheetName,
              studentCode: parsed.studentCode,
              studentName: parsed.studentName,
              subjectsCount: parsed.subjects.length,
              totalQuestions,
              correctAnswers: totalCorrect,
              wrongAnswers: totalWrong,
              processed: true,
            });
          } catch (sheetError) {
            console.error(`${sheetName} (lisey) işlənərkən xəta:`, sheetError);
            processedSheets.push({
              sheetName: sheetName,
              processed: false,
              error: sheetError.message,
            });
            totalErrors++;
          }
        }
        return res.json({
          success: true,
          message: `${totalProcessed} şagirdin cavabları uğurla yükləndi`,
          processedCount: totalProcessed,
          errorCount: totalErrors,
          sheets: processedSheets,
          fileName: req.file.originalname,
        });
      }

      const studentCodes = [];
      // "Şagird" sheet-indən şagird kodlarını oxu
      const studentSheetName = workbook.SheetNames.find(
        (name) =>
          name.toLowerCase().includes("şagird") ||
          name.toLowerCase().includes("student") ||
          name.toLowerCase().includes("tələbə")
      );

      if (studentSheetName) {
        const studentWorksheet = workbook.Sheets[studentSheetName];
        const studentData = xlsx.utils.sheet_to_json(studentWorksheet);

        // Şagird kodlarını tap (ilk sütunda olur)
        if (studentData.length > 0) {
          const firstRow = studentData[0];
          const columns = Object.keys(firstRow).filter(
            (key) => key !== "__EMPTY"
          );

          // İlk sətirdə şagird kodları var
          columns.forEach((col) => {
            const code = firstRow[col];
            if (code && typeof code === "string" && code.trim() !== "") {
              studentCodes.push(code.trim());
            }
          });
        }
      }

      console.log("Tapılan şagird kodları:", studentCodes);

      // Hər şagird üçün sheet-i işlə (sheet adı rəqəm ola bilər, həmişə string kimi işlə)
      for (const sheetNameRaw of workbook.SheetNames) {
        const sheetName = sheetNameRaw != null ? String(sheetNameRaw) : "";
        if (
          sheetName.toLowerCase().includes("şagird") ||
          sheetName.toLowerCase().includes("student") ||
          sheetName.toLowerCase().includes("tələbə")
        ) {
          continue;
        }

        try {
          const worksheet = workbook.Sheets[sheetNameRaw] || workbook.Sheets[sheetName];
          // Raw data kimi oxu (array formatında)
          const rawData = xlsx.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: null,
          });

          console.log(`=== ${sheetName} SHEET ANALİZİ ===`);
          console.log(`Sətir sayı: ${rawData.length}`);

          if (rawData.length < 3) {
            console.log(`${sheetName} sheet-ində kifayət qədər məlumat yoxdur`);
            continue;
          }

          // Şagird kodunu sheet adından tap
          const studentCode = sheetName.trim();

          // Fənn bölmələrini tap
          // Hər fənnin adı A sütununda (ilk sütun, row[0]) qeyd olunub
          // Fənn adından sonra o fənnin məlumatları gəlir
          // Növbəti fənn adına qədər olan bölmə bir fəndir
          const subjects = [];

          // A sütununda fənn adı olan sətirləri tap
          // Fənn adı olan sətir: A sütununda (row[0]) fənn adı var, digər sütunlarda isə boş və ya az məlumat var
          const subjectNameRows = [];
          for (let i = 0; i < rawData.length; i++) {
            const row = rawData[i];
            if (!Array.isArray(row) || row.length === 0) continue;

            const firstCell = row[0];
            // Fənn adı A sütununda (row[0]) olmalıdır
            if (firstCell !== null && firstCell !== undefined) {
              const cellValue = firstCell.toString().trim();

              // Fənn adı olub-olmadığını yoxla
              // Fənn adı adətən:
              // 1. Uzun mətn olur (ən azı 3 simvol)
              // 2. Rəqəm deyil
              // 3. Digər sütunlarda (row[1], row[2]...) az məlumat var və ya boşdur (fənn adı sətirində adətən yalnız fənn adı olur)
              // 4. Mətn fənn adına bənzəyir (fənn adları adətən hərflərdən ibarətdir)

              const isNumeric =
                !isNaN(parseFloat(cellValue)) && isFinite(cellValue);
              const isLongEnough = cellValue.length >= 3;
              const isNotKeyword = !cellValue
                .toLowerCase()
                .match(
                  /^(etalon|şagirdin|cavab|düz|səhv|imtina|sual|\+|\-|\d+)$/
                );

              // Digər sütunlarda nə qədər məlumat var?
              const otherCellsData = row
                .slice(1)
                .filter(
                  (cell) =>
                    cell !== null &&
                    cell !== undefined &&
                    cell.toString().trim() !== ""
                ).length;

              // Fənn adı sətirində adətən yalnız fənn adı olur, digər sütunlarda az məlumat var
              // Amma bəzən fənn adı sətirindən sonra birbaşa etalon gələ bilər
              const looksLikeSubjectName =
                isLongEnough &&
                !isNumeric &&
                isNotKeyword &&
                cellValue.match(/[A-Za-zƏəİiÖöÜüŞşÇçĞğ]/);

              if (looksLikeSubjectName) {
                // Əlavə yoxlama: növbəti sətirdə "etalon" və ya "şagirdin cavabı" varsa, bu fənn adıdır
                const nextRow = i + 1 < rawData.length ? rawData[i + 1] : null;
                const hasEtalonOrStudentAnswer =
                  nextRow &&
                  Array.isArray(nextRow) &&
                  nextRow.some((cell) => {
                    if (!cell) return false;
                    const cellStr = cell.toString().toLowerCase().trim();
                    return (
                      cellStr.includes("etalon") || cellStr.includes("şagirdin")
                    );
                  });

                // Fənn adı olub-olmadığını təsdiq et
                // Mütləq növbəti sətirdə "etalon" və ya "şagirdin cavabı" olmalıdır
                // və ya digər sütunlarda çox az məlumat olmalıdır (yalnız fənn adı sətiridir)
                if (hasEtalonOrStudentAnswer || otherCellsData === 0) {
                  subjectNameRows.push({ rowIndex: i, subjectName: cellValue });
                  console.log(`Fənn adı tapıldı: "${cellValue}" (sətir ${i})`);
                }
              }
            }
          }

          console.log(`Ümumi fənn sayı: ${subjectNameRows.length}`);

          // Hər fənn üçün məlumatları çıxar
          for (let i = 0; i < subjectNameRows.length; i++) {
            const currentSubjectRow = subjectNameRows[i];
            const nextSubjectRow = subjectNameRows[i + 1];

            const subjectName = currentSubjectRow.subjectName;
            // Fənn adı sətirindən sonrakı sətirdən başla (fənn adı sətirində etalon və şagirdin cavabı yoxdur)
            const startRow = currentSubjectRow.rowIndex + 1;
            // Növbəti fənn adı sətirindən əvvəlki sətirə qədər (növbəti fənn adı sətirini daxil etmə)
            const endRow = nextSubjectRow
              ? nextSubjectRow.rowIndex - 1
              : rawData.length - 1;

            // Əgər startRow endRow-dan böyükdürsə, bu fənn üçün məlumat yoxdur
            if (startRow > endRow) {
              console.log(
                `Fənn "${subjectName}" üçün məlumat yoxdur (startRow: ${startRow}, endRow: ${endRow})`
              );
              continue;
            }

            console.log(
              `Fənn: "${subjectName}" - sətirlər ${startRow}-${endRow} (fənn adı sətiri: ${currentSubjectRow.rowIndex})`
            );

            // Fənn məlumatlarını çıxar
            const subjectData = extractSubjectData(
              rawData,
              startRow,
              endRow,
              subjectName
            );

            // Yalnız düzgün məlumatları olan fənləri əlavə et
            // Fənn adı olmalıdır, cavablar olmalıdır və ən azı 1 sual olmalıdır
            if (
              subjectData &&
              subjectData.answers &&
              subjectData.answers.length > 0 &&
              subjectData.subjectName &&
              subjectData.subjectName.trim() !== ""
            ) {
              // Eyni fənn adı ilə artıq əlavə edilibsə, atla (duplicate yoxla)
              const isDuplicate = subjects.some(
                (s) => s.subjectName === subjectData.subjectName
              );

              if (!isDuplicate) {
                subjects.push(subjectData);
                console.log(
                  `Fənn "${subjectName}" uğurla əlavə edildi: ${subjectData.answers.length} sual`
                );
              } else {
                console.log(
                  `Fənn "${subjectName}" artıq əlavə edilib, duplicate atlandı`
                );
              }
            } else {
              console.log(
                `Fənn "${subjectName}" üçün məlumat çıxarıla bilmədi və ya məlumat yoxdur`
              );
            }
          }

          console.log(
            `${sheetName} üçün ${subjects.length} fənn tapıldı:`,
            subjects.map((s) => s.subjectName)
          );

          // Ümumi statistikalar
          let totalQuestions = 0;
          let totalCorrect = 0;
          let totalWrong = 0;

          subjects.forEach((subject) => {
            totalQuestions += subject.totalQuestions || 0;
            totalCorrect += subject.correctAnswers || 0;
            totalWrong += subject.wrongAnswers || 0;
          });

          // MongoDB-yə yaz
          const document = {
            studentCode: studentCode,
            sheetName: sheetName,
            subjects: subjects,
            totalQuestions: totalQuestions,
            correctAnswers: totalCorrect,
            wrongAnswers: totalWrong,
            fileName: req.file.originalname,
            uploadDate: new Date(),
          };

          await studentAnswersCollection.updateOne(
            { studentCode: studentCode },
            { $set: document },
            { upsert: true }
          );

          totalProcessed++;
          processedSheets.push({
            sheetName: sheetName,
            studentCode: studentCode,
            subjectsCount: subjects.length,
            totalQuestions: totalQuestions,
            correctAnswers: totalCorrect,
            wrongAnswers: totalWrong,
            processed: true,
          });

          console.log(
            `${sheetName} üçün ${subjects.length} fənn işlənib: ${totalCorrect} düzgün, ${totalWrong} səhv`
          );
        } catch (sheetError) {
          console.error(`${sheetName} sheet-i işlənərkən xəta:`, sheetError);
          processedSheets.push({
            sheetName: sheetName,
            processed: false,
            error: sheetError.message,
          });
          totalErrors++;
        }
      }

      res.json({
        success: true,
        message: `${totalProcessed} şagirdin cavabları uğurla yükləndi`,
        processedCount: totalProcessed,
        errorCount: totalErrors,
        sheets: processedSheets,
        fileName: req.file.originalname,
      });
    } catch (error) {
      console.error("Şagird cavabları fayl işlənmə xətası:", error);
      res.status(500).json({
        error: "Fayl işlənərkən xəta baş verdi: " + error.message,
      });
    }
  }
);

app.get("*", (req, res) => {
  const possiblePaths = [
    path.join(__dirname, "client/build", "index.html"),
    path.join(__dirname, "build", "index.html"),
    path.join(process.cwd(), "client/build", "index.html"),
    path.join(process.cwd(), "build", "index.html"),
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
        console.error("Static file error:", err);
        res.status(500).send("Server error");
      }
    });
  } else {
    console.error("index.html not found in any of the expected locations");
    res.status(404).send(`
            <html>
                <body>
                    <h1>404 - Page Not Found</h1>
                    <p>Build files not found. Please check the deployment logs.</p>
                    <p>Expected paths:</p>
                    <ul>
                        ${possiblePaths.map((p) => `<li>${p}</li>`).join("")}
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
      console.error(
        "Server başlananda MongoDB-yə qoşula bilmədi:",
        err.message
      );
      console.log(
        "Server işləməyə davam edir, MongoDB connection sonra yenidən cəhd ediləcək"
      );
    }
  }
});

process.on("SIGINT", async () => {
  if (client) {
    await client.close();
    console.log("MongoDB connection bağlandı");
  }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  if (client) {
    await client.close();
    console.log("MongoDB connection bağlandı");
  }
  process.exit(0);
});
