const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const { MongoClient, GridFSBucket } = require("mongodb");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

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

// PDF faylları memory-də saxlanılır və GridFS-ə yazılır
const pdfStorage = multer.memoryStorage();

const uploadPdf = multer({
  storage: pdfStorage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
});

const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://nahedshukurlu_db_user:EebPHBmTA12QOD03@exam-result.bjiyluu.mongodb.net/imtahan_db?retryWrites=true&w=majority";
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
      console.log("'İmtina' sütunu var?", data[0].hasOwnProperty("İmtina"), "Dəyəri:", data[0]["İmtina"]);
      console.log("'Yazı işi' sütunu var?", data[0].hasOwnProperty("Yazı işi"), "Dəyəri:", data[0]["Yazı işi"]);
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

      res.json({
        success: true,
        data: {
          ...studentInfo,
          subjects: subjects || [],
          totalResult: totalResult || 0,
          subjectCount: rows.length || 0,
          excelData: allExcelData || {},
        },
      });
    } else {
      res.json({
        success: false,
        message: "Bu kodla heç bir nəticə tapılmadı!",
      });
    }
  } catch (err) {
    console.error("Veritabanı xətası:", err);
    return res.status(500).json({ error: "Veritabanı xətası!" });
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
