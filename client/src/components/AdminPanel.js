import React, { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const ADMIN_EMAIL = "imtahan@bilim.edu.az";
const ADMIN_PASSWORD = "Bilim@2024#Secure!Admin";

const AdminPanel = () => {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [error, setError] = useState("");
  const [allResults, setAllResults] = useState([]);
  const [showResults, setShowResults] = useState(false);

  const [pdfFile, setPdfFile] = useState(null);
  const [selectedSinif, setSelectedSinif] = useState("");
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [pdfUploadResult, setPdfUploadResult] = useState(null);
  const [pdfError, setPdfError] = useState("");
  const [uploadedPdfs, setUploadedPdfs] = useState([]);

  const [answersFile, setAnswersFile] = useState(null);
  const [selectedSinifAnswers, setSelectedSinifAnswers] = useState("");
  const [uploadingAnswers, setUploadingAnswers] = useState(false);
  const [answersUploadResult, setAnswersUploadResult] = useState(null);
  const [answersError, setAnswersError] = useState("");
  const [uploadedAnswers, setUploadedAnswers] = useState([]);

  const [studentAnswersFile, setStudentAnswersFile] = useState(null);
  const [uploadingStudentAnswers, setUploadingStudentAnswers] = useState(false);
  const [studentAnswersUploadResult, setStudentAnswersUploadResult] = useState(null);
  const [studentAnswersError, setStudentAnswersError] = useState("");

  useEffect(() => {
    const authStatus = sessionStorage.getItem("adminAuthenticated");
    if (authStatus === "true") {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    setLoginError("");

    if (email.trim() === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      sessionStorage.setItem("adminAuthenticated", "true");
    } else {
      setLoginError("Email və ya şifrə yanlışdır!");
      setPassword("");
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem("adminAuthenticated");
    setEmail("");
    setPassword("");
    navigate("/");
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      const validTypes = [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
      ];

      if (validTypes.includes(selectedFile.type)) {
        setFile(selectedFile);
        setError("");
        setUploadResult(null);
      } else {
        setError("Yalnız Excel faylları (.xlsx, .xls) qəbul edilir!");
        setFile(null);
      }
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) {
      setError("Zəhmət olmasa Excel faylı seçin!");
      return;
    }

    setUploading(true);
    setError("");
    setUploadResult(null);

    const formData = new FormData();
    formData.append("excelFile", file);

    try {
      const response = await axios.post("/api/upload-excel", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      setUploadResult(response.data);
      setFile(null);
      document.getElementById("excelFile").value = "";
    } catch (err) {
      if (err.response && err.response.data && err.response.data.error) {
        setError(err.response.data.error);
      } else {
        setError("Fayl yüklənərkən xəta baş verdi!");
      }
      console.error("Upload xətası:", err);
    } finally {
      setUploading(false);
    }
  };

  const fetchAllResults = async () => {
    try {
      const response = await axios.get("/api/all-results");
      setAllResults(response.data.data);
      setShowResults(true);
    } catch (err) {
      setError("Nəticələr yüklənərkən xəta baş verdi!");
      console.error("API xətası:", err);
    }
  };

  const downloadSampleExcel = async () => {
    try {
      const response = await axios.get("/api/download-sample-excel", {
        responseType: "blob",
      });

      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "nümunə_imtahan_neticeleri.xlsx";
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setError("Nümunə fayl yüklənərkən xəta baş verdi!");
      console.error("Download xətası:", error);
    }
  };

  const handlePdfFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setPdfFile(selectedFile);
      setPdfError("");
      setPdfUploadResult(null);
    }
  };

  const handlePdfUpload = async (e) => {
    e.preventDefault();
    if (!pdfFile || !selectedSinif) {
      setPdfError("Zəhmət olmasa fayl və sinifi seçin!");
      return;
    }

    setUploadingPdf(true);
    setPdfError("");
    setPdfUploadResult(null);

    const formData = new FormData();
    formData.append("pdfFile", pdfFile);
    formData.append("sinif", selectedSinif);

    try {
      const response = await axios.post("/api/upload-pdf", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      setPdfUploadResult(response.data);
      setPdfFile(null);
      setSelectedSinif("");
      document.getElementById("pdfFile").value = "";
      fetchUploadedPdfs();
    } catch (err) {
      console.error("PDF upload xətası:", err);
      if (err.response) {
        if (err.response.data && err.response.data.error) {
          setPdfError(err.response.data.error);
        } else {
          setPdfError(
            `Server xətası: ${err.response.status} ${err.response.statusText}`
          );
        }
      } else if (err.request) {
        setPdfError(
          "Serverə bağlantı qurula bilmədi. Zəhmət olmasa serverin işlədiyini yoxlayın."
        );
      } else {
        setPdfError("Fayl yüklənərkən xəta baş verdi!");
      }
    } finally {
      setUploadingPdf(false);
    }
  };

  const fetchUploadedPdfs = async () => {
    try {
      const response = await axios.get("/api/list-pdfs");
      if (response.data && response.data.success && response.data.data) {
        setUploadedPdfs(response.data.data);
      } else {
        setUploadedPdfs([]);
      }
    } catch (err) {
      console.error("PDF siyahısı yüklənərkən xəta:", err);
      setUploadedPdfs([]);
    }
  };

  useEffect(() => {
    fetchUploadedPdfs();
    fetchUploadedAnswers();
  }, []);

  const handleAnswersFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setAnswersFile(selectedFile);
      setAnswersError("");
      setAnswersUploadResult(null);
    }
  };

  const handleAnswersUpload = async (e) => {
    e.preventDefault();
    if (!answersFile || !selectedSinifAnswers) {
      setAnswersError("Zəhmət olmasa fayl və sinifi seçin!");
      return;
    }

    setUploadingAnswers(true);
    setAnswersError("");
    setAnswersUploadResult(null);

    const formData = new FormData();
    formData.append("answersFile", answersFile);
    formData.append("sinif", selectedSinifAnswers);

    try {
      const response = await axios.post("/api/upload-answers", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      setAnswersUploadResult(response.data);
      setAnswersFile(null);
      setSelectedSinifAnswers("");
      document.getElementById("answersFile").value = "";
      fetchUploadedAnswers();
    } catch (err) {
      console.error("Doğru cavablar upload xətası:", err);
      if (err.response) {
        if (err.response.data && err.response.data.error) {
          setAnswersError(err.response.data.error);
        } else {
          setAnswersError(
            `Server xətası: ${err.response.status} ${err.response.statusText}`
          );
        }
      } else if (err.request) {
        setAnswersError(
          "Serverə bağlantı qurula bilmədi. Zəhmət olmasa serverin işlədiyini yoxlayın."
        );
      } else {
        setAnswersError("Fayl yüklənərkən xəta baş verdi!");
      }
    } finally {
      setUploadingAnswers(false);
    }
  };

  const fetchUploadedAnswers = async () => {
    try {
      const response = await axios.get("/api/list-answers");
      if (response.data && response.data.success && response.data.data) {
        setUploadedAnswers(response.data.data);
      } else {
        setUploadedAnswers([]);
      }
    } catch (err) {
      console.error("Doğru cavablar siyahısı yüklənərkən xəta:", err);
      setUploadedAnswers([]);
    }
  };

  const handleStudentAnswersFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      const validTypes = [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
      ];

      if (validTypes.includes(selectedFile.type) || 
          selectedFile.name.endsWith(".xlsx") || 
          selectedFile.name.endsWith(".xls")) {
        setStudentAnswersFile(selectedFile);
        setStudentAnswersError("");
        setStudentAnswersUploadResult(null);
      } else {
        setStudentAnswersError("Yalnız Excel faylları (.xlsx, .xls) qəbul edilir!");
        setStudentAnswersFile(null);
      }
    }
  };

  const handleStudentAnswersUpload = async (e) => {
    e.preventDefault();
    if (!studentAnswersFile) {
      setStudentAnswersError("Zəhmət olmasa Excel faylı seçin!");
      return;
    }

    setUploadingStudentAnswers(true);
    setStudentAnswersError("");
    setStudentAnswersUploadResult(null);

    const formData = new FormData();
    formData.append("studentAnswersFile", studentAnswersFile);

    try {
      const response = await axios.post("/api/upload-student-answers", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      setStudentAnswersUploadResult(response.data);
      setStudentAnswersFile(null);
      document.getElementById("studentAnswersFile").value = "";
    } catch (err) {
      console.error("Şagird cavabları upload xətası:", err);
      if (err.response) {
        if (err.response.data && err.response.data.error) {
          setStudentAnswersError(err.response.data.error);
        } else {
          setStudentAnswersError(
            `Server xətası: ${err.response.status} ${err.response.statusText}`
          );
        }
      } else if (err.request) {
        setStudentAnswersError(
          "Serverə bağlantı qurula bilmədi. Zəhmət olmasa serverin işlədiyini yoxlayın."
        );
      } else {
        setStudentAnswersError("Fayl yüklənərkən xəta baş verdi!");
      }
    } finally {
      setUploadingStudentAnswers(false);
    }
  };

  const classes = Array.from({ length: 11 }, (_, i) => i + 1);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-800 mb-2">
              Admin Girişi
            </h2>
            <p className="text-gray-600">
              Admin paneline daxil olmaq üçün email və şifrənizi daxil edin
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email daxil edin"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Şifrə
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Şifrəni daxil edin"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                required
              />
            </div>

            {loginError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg
                      className="h-5 w-5 text-red-400"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-800">{loginError}</p>
                  </div>
                </div>
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-primary-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-primary-700 focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors"
            >
              Daxil Ol
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {}
      <div className="flex justify-end">
        <button
          onClick={handleLogout}
          className="bg-red-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
        >
          Çıxış
        </button>
      </div>
      {}
      <div className="bg-white shadow-lg rounded-lg p-8">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-800 mb-2">
            Mövzu Sənədləri Yükləmə
          </h2>
          <p className="text-gray-600">
            Hər sinif üçün mövzu sənədlərini yükləyin (istənilən format)
          </p>
        </div>

        <form onSubmit={handlePdfUpload} className="space-y-6">
          <div>
            <label
              htmlFor="sinif"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Sinif Seçin
            </label>
            <select
              id="sinif"
              value={selectedSinif}
              onChange={(e) => setSelectedSinif(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-lg"
            >
              <option value="">Sinif seçin...</option>
              {classes.map((sinif) => (
                <option key={sinif} value={sinif}>
                  {sinif}-ci sinif
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="pdfFile"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Fayl Seçin
            </label>
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:border-gray-400 transition-colors">
              <div className="space-y-1 text-center">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  stroke="currentColor"
                  fill="none"
                  viewBox="0 0 48 48"
                >
                  <path
                    d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <div className="flex text-sm text-gray-600">
                  <label
                    htmlFor="pdfFile"
                    className="relative cursor-pointer bg-white rounded-md font-medium text-primary-600 hover:text-primary-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-primary-500"
                  >
                    <span>Fayl seçin</span>
                    <input
                      id="pdfFile"
                      name="pdfFile"
                      type="file"
                      onChange={handlePdfFileChange}
                      className="sr-only"
                    />
                  </label>
                  <p className="pl-1">və ya buraya sürükləyin</p>
                </div>
                <p className="text-xs text-gray-500">İstənilən format</p>
              </div>
            </div>
            {pdfFile && (
              <p className="mt-2 text-sm text-gray-600">
                Seçilmiş fayl:{" "}
                <span className="font-medium">{pdfFile.name}</span>
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={uploadingPdf || !pdfFile || !selectedSinif}
            className="w-full bg-primary-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-primary-700 focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {uploadingPdf ? (
              <span className="flex items-center justify-center">
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Yüklənir...
              </span>
            ) : (
              "Faylı Yüklə"
            )}
          </button>
        </form>

        {pdfError && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-red-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-800">{pdfError}</p>
              </div>
            </div>
          </div>
        )}

        {pdfUploadResult && (
          <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-green-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-green-800 font-medium">
                  {pdfUploadResult.message}
                </p>
              </div>
            </div>
          </div>
        )}

        {}
        {uploadedPdfs && uploadedPdfs.length > 0 && (
          <div className="mt-8">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              Yüklənmiş Fayllar
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {uploadedPdfs.map((pdf) => (
                <div
                  key={pdf.sinif}
                  className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">
                        {pdf.sinif}-ci sinif
                      </p>
                      <p className="text-sm text-gray-500">
                        {new Date(pdf.yuklenme_tarixi).toLocaleDateString(
                          "az-AZ"
                        )}
                      </p>
                    </div>
                    <svg
                      className="h-8 w-8 text-red-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {}
      <div className="bg-white shadow-lg rounded-lg p-8">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-800 mb-2">
            Doğru Cavablar
          </h2>
          <p className="text-gray-600">
            Hər sinif üçün doğru cavablar faylını yükləyin (istənilən format)
          </p>
        </div>

        <form onSubmit={handleAnswersUpload} className="space-y-6">
          <div>
            <label
              htmlFor="sinifAnswers"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Sinif Seçin
            </label>
            <select
              id="sinifAnswers"
              value={selectedSinifAnswers}
              onChange={(e) => setSelectedSinifAnswers(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-lg"
            >
              <option value="">Sinif seçin...</option>
              {classes.map((sinif) => (
                <option key={sinif} value={sinif}>
                  {sinif}-ci sinif
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="answersFile"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Fayl Seçin
            </label>
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:border-gray-400 transition-colors">
              <div className="space-y-1 text-center">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  stroke="currentColor"
                  fill="none"
                  viewBox="0 0 48 48"
                >
                  <path
                    d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <div className="flex text-sm text-gray-600">
                  <label
                    htmlFor="answersFile"
                    className="relative cursor-pointer bg-white rounded-md font-medium text-primary-600 hover:text-primary-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-primary-500"
                  >
                    <span>Fayl seçin</span>
                    <input
                      id="answersFile"
                      name="answersFile"
                      type="file"
                      onChange={handleAnswersFileChange}
                      className="sr-only"
                    />
                  </label>
                  <p className="pl-1">və ya buraya sürükləyin</p>
                </div>
                <p className="text-xs text-gray-500">İstənilən format</p>
              </div>
            </div>
            {answersFile && (
              <p className="mt-2 text-sm text-gray-600">
                Seçilmiş fayl:{" "}
                <span className="font-medium">{answersFile.name}</span>
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={uploadingAnswers || !answersFile || !selectedSinifAnswers}
            className="w-full bg-primary-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-primary-700 focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {uploadingAnswers ? (
              <span className="flex items-center justify-center">
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Yüklənir...
              </span>
            ) : (
              "Faylı Yüklə"
            )}
          </button>
        </form>

        {answersError && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-red-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-800">{answersError}</p>
              </div>
            </div>
          </div>
        )}

        {answersUploadResult && (
          <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-green-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-green-800 font-medium">
                  {answersUploadResult.message}
                </p>
              </div>
            </div>
          </div>
        )}

        {}
        {uploadedAnswers && uploadedAnswers.length > 0 && (
          <div className="mt-8">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              Yüklənmiş Doğru Cavablar Faylları
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {uploadedAnswers.map((answer) => (
                <div
                  key={answer.sinif}
                  className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">
                        {answer.sinif}-ci sinif
                      </p>
                      <p className="text-sm text-gray-500">
                        {new Date(answer.yuklenme_tarixi).toLocaleDateString(
                          "az-AZ"
                        )}
                      </p>
                    </div>
                    <svg
                      className="h-8 w-8 text-green-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {}
      <div className="bg-white shadow-lg rounded-lg p-8">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-800 mb-2">
            Şagird Cavabları Yükləmə
          </h2>
          <p className="text-gray-600">
            Şagirdlərin düzgün və ya səhv cavab qeyd etdiklərini göstərən Excel faylını yükləyin (student_results.xlsx formatında)
          </p>
        </div>

        <form onSubmit={handleStudentAnswersUpload} className="space-y-6">
          <div>
            <label
              htmlFor="studentAnswersFile"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Excel Faylı Seçin (student_results.xlsx formatında)
            </label>
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:border-gray-400 transition-colors">
              <div className="space-y-1 text-center">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  stroke="currentColor"
                  fill="none"
                  viewBox="0 0 48 48"
                >
                  <path
                    d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <div className="flex text-sm text-gray-600">
                  <label
                    htmlFor="studentAnswersFile"
                    className="relative cursor-pointer bg-white rounded-md font-medium text-primary-600 hover:text-primary-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-primary-500"
                  >
                    <span>Fayl seçin</span>
                    <input
                      id="studentAnswersFile"
                      name="studentAnswersFile"
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleStudentAnswersFileChange}
                      className="sr-only"
                    />
                  </label>
                  <p className="pl-1">və ya buraya sürükləyin</p>
                </div>
                <p className="text-xs text-gray-500">
                  Excel faylları (.xlsx, .xls) - student_results.xlsx formatında
                </p>
              </div>
            </div>
            {studentAnswersFile && (
              <p className="mt-2 text-sm text-gray-600">
                Seçilmiş fayl:{" "}
                <span className="font-medium">{studentAnswersFile.name}</span>
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={uploadingStudentAnswers || !studentAnswersFile}
            className="w-full bg-primary-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-primary-700 focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {uploadingStudentAnswers ? (
              <span className="flex items-center justify-center">
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Yüklənir...
              </span>
            ) : (
              "Faylı Yüklə"
            )}
          </button>
        </form>

        {studentAnswersError && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-red-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-800">{studentAnswersError}</p>
              </div>
            </div>
          </div>
        )}

        {studentAnswersUploadResult && (
          <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-green-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-green-800 font-medium">
                  {studentAnswersUploadResult.message}
                </p>
                {studentAnswersUploadResult.processedCount !== undefined && (
                  <p className="text-sm text-green-700 mt-1">
                    İşlənmiş sətir sayı: {studentAnswersUploadResult.processedCount}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {}
      <div className="bg-white shadow-lg rounded-lg p-8">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-800 mb-2">
            Admin Paneli
          </h2>
          <p className="text-gray-600">
            Excel faylı yükləyərək imtahan nəticələrini sisteme əlavə edin
          </p>
        </div>

        <form onSubmit={handleUpload} className="space-y-6">
          <div>
            <label
              htmlFor="excelFile"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Excel Faylı Seçin
            </label>
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:border-gray-400 transition-colors">
              <div className="space-y-1 text-center">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  stroke="currentColor"
                  fill="none"
                  viewBox="0 0 48 48"
                >
                  <path
                    d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <div className="flex text-sm text-gray-600">
                  <label
                    htmlFor="excelFile"
                    className="relative cursor-pointer bg-white rounded-md font-medium text-primary-600 hover:text-primary-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-primary-500"
                  >
                    <span>Fayl seçin</span>
                    <input
                      id="excelFile"
                      name="excelFile"
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleFileChange}
                      className="sr-only"
                    />
                  </label>
                  <p className="pl-1">və ya buraya sürükləyin</p>
                </div>
                <p className="text-xs text-gray-500">
                  Excel faylları (.xlsx, .xls)
                </p>
              </div>
            </div>
            {file && (
              <p className="mt-2 text-sm text-gray-600">
                Seçilmiş fayl: <span className="font-medium">{file.name}</span>
              </p>
            )}
          </div>

          <div className="flex space-x-4">
            <button
              type="submit"
              disabled={uploading || !file}
              className="flex-1 bg-primary-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-primary-700 focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {uploading ? (
                <span className="flex items-center justify-center">
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Yüklənir...
                </span>
              ) : (
                "Faylı Yüklə"
              )}
            </button>

            <button
              type="button"
              onClick={downloadSampleExcel}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
            >
              Nümunə Excel Fayl
            </button>
          </div>

          {/* <div className="mt-4 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={addMissingFields}
              disabled={uploading}
              className="w-full bg-yellow-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-yellow-700 focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {uploading ? (
                <span className="flex items-center justify-center">
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Migration edilir...
                </span>
              ) : (
                'Veritabanına "İmtina" və "Yazı işi" Field-lərini Əlavə Et'
              )}
            </button>
            <p className="mt-2 text-sm text-gray-500 text-center">
              Bu düymə bütün mövcud sətirlərə "İmtina" (rejectedAnswer) və "Yazı
              işi" (openQuestion) field-lərini əlavə edir
            </p>
          </div> */}
        </form>

        {error && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-red-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          </div>
        )}

        {uploadResult && (
          <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-green-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-green-800 font-medium">
                  {uploadResult.message}
                </p>
                <p className="text-sm text-green-700 mt-1">
                  Uğurlu: {uploadResult.successCount} | Xəta:{" "}
                  {uploadResult.errorCount}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {}
      <div className="bg-white shadow-lg rounded-lg p-8">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-gray-800">Bütün Nəticələr</h3>
          <button
            onClick={fetchAllResults}
            className="bg-gray-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-gray-700 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
          >
            Nəticələri Yüklə
          </button>
        </div>

        {showResults && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Kod
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ad
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Soyad
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fənn
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Bal
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tarix
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {allResults.map((result) => (
                  <tr key={result.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {result.code}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {result.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {result.surname}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {result.subject}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          result.result >= 50
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {result.result}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(result.uploadDate).toLocaleDateString("az-AZ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
