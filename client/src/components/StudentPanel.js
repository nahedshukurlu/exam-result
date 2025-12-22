import React, { useState } from "react";
import axios from "axios";

const StudentPanel = () => {
  const [activeTab, setActiveTab] = useState("results"); // 'results', 'topics', or 'answers'
  const [kod, setKod] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedClass, setSelectedClass] = useState("");
  const [pdfAvailable, setPdfAvailable] = useState(false);
  const [checkingPdf, setCheckingPdf] = useState(false);
  const [selectedClassAnswers, setSelectedClassAnswers] = useState("");
  const [answersAvailable, setAnswersAvailable] = useState(false);
  const [checkingAnswers, setCheckingAnswers] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!kod.trim()) {
      setError("Zəhmət olmasa kodunuzu daxil edin!");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await axios.get(`/api/check-result/${kod.trim()}`);

      if (response.data.success && response.data.data) {
        const data = response.data.data;
        if (!data.subjects || !Array.isArray(data.subjects)) {
          console.error("API-dən gələn data-da subjects array yoxdur:", data);
          setError("Nəticə məlumatları düzgün formatda deyil!");
          setResult(null);
        } else {
          // Debug: API-dən gələn məlumatları çap et
          console.log("API-dən gələn data:", data);
          console.log("Subjects:", data.subjects);
          if (data.subjects.length > 0) {
            console.log("İlk subject:", data.subjects[0]);
            console.log("rejectedAnswer:", data.subjects[0].rejectedAnswer);
            console.log("openQuestion:", data.subjects[0].openQuestion);
          }
          setResult(data);
        }
      } else {
        setError(response.data.message || "Nəticə tapılmadı!");
        setResult(null);
      }
    } catch (err) {
      setError("Xəta baş verdi. Zəhmət olmasa yenidən cəhd edin.");
      console.error("API xətası:", err);
    } finally {
      setLoading(false);
    }
  };

  console.log("test");

  const handleReset = () => {
    setKod("");
    setResult(null);
    setError("");
  };

  const handleClassChange = async (e) => {
    const sinif = e.target.value;
    setSelectedClass(sinif);

    if (sinif) {
      setCheckingPdf(true);
      try {
        // Cache-busting üçün timestamp parametri əlavə et
        const timestamp = new Date().getTime();
        const response = await axios.get(
          `/api/view-pdf/${sinif}?t=${timestamp}`,
          {
            responseType: "blob",
            validateStatus: (status) => status < 500,
            headers: {
              "Cache-Control": "no-cache",
            },
          }
        );
        setPdfAvailable(response.status === 200);
      } catch (err) {
        setPdfAvailable(false);
      } finally {
        setCheckingPdf(false);
      }
    } else {
      setPdfAvailable(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!selectedClass) return;

    try {
      // Cache-busting üçün timestamp parametri əlavə et
      const timestamp = new Date().getTime();
      const response = await axios.get(
        `/api/download-pdf/${selectedClass}?t=${timestamp}`,
        {
          responseType: "blob",
          headers: {
            "Cache-Control": "no-cache",
          },
        }
      );

      const contentType =
        response.headers["content-type"] || "application/octet-stream";
      const blob = new Blob([response.data], { type: contentType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const contentDisposition = response.headers["content-disposition"];
      let filename = `${selectedClass}-ci_sinif_movzulari`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      link.download = filename;
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Fayl download xətası:", err);
      alert("Fayl yüklənərkən xəta baş verdi!");
    }
  };

  const handleViewPdf = async () => {
    if (!selectedClass) return;

    try {
      // Cache-busting üçün timestamp parametri əlavə et
      const timestamp = new Date().getTime();
      const response = await axios.get(
        `/api/view-pdf/${selectedClass}?t=${timestamp}`,
        {
          responseType: "blob",
          headers: {
            "Cache-Control": "no-cache",
          },
        }
      );

      // Blob URL yarat və yeni pəncərədə aç
      const blob = new Blob([response.data], {
        type: response.headers["content-type"] || "application/pdf",
      });
      const url = window.URL.createObjectURL(blob);
      const newWindow = window.open(url, "_blank");

      // Pəncərə bağlandıqda blob URL-i təmizlə
      if (newWindow) {
        newWindow.addEventListener("beforeunload", () => {
          window.URL.revokeObjectURL(url);
        });
      } else {
        // Əgər popup bloklanıbsa, bir az gözlə və təmizlə
        setTimeout(() => {
          window.URL.revokeObjectURL(url);
        }, 1000);
      }
    } catch (err) {
      console.error("PDF görüntüləmə xətası:", err);
      alert("PDF faylı açıla bilmədi!");
    }
  };

  const handleClassAnswersChange = async (e) => {
    const sinif = e.target.value;
    setSelectedClassAnswers(sinif);

    if (sinif) {
      setCheckingAnswers(true);
      try {
        // Cache-busting üçün timestamp parametri əlavə et
        const timestamp = new Date().getTime();
        const response = await axios.get(
          `/api/view-answers/${sinif}?t=${timestamp}`,
          {
            responseType: "blob",
            validateStatus: (status) => status < 500,
            headers: {
              "Cache-Control": "no-cache",
            },
          }
        );
        setAnswersAvailable(response.status === 200);
      } catch (err) {
        setAnswersAvailable(false);
      } finally {
        setCheckingAnswers(false);
      }
    } else {
      setAnswersAvailable(false);
    }
  };

  const handleDownloadAnswers = async () => {
    if (!selectedClassAnswers) return;

    try {
      // Cache-busting üçün timestamp parametri əlavə et
      const timestamp = new Date().getTime();
      const response = await axios.get(
        `/api/download-answers/${selectedClassAnswers}?t=${timestamp}`,
        {
          responseType: "blob",
          headers: {
            "Cache-Control": "no-cache",
          },
        }
      );

      const contentType =
        response.headers["content-type"] || "application/octet-stream";
      const blob = new Blob([response.data], { type: contentType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const contentDisposition = response.headers["content-disposition"];
      let filename = `${selectedClassAnswers}-ci_sinif_dogru_cavablar`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      link.download = filename;
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Doğru cavablar fayl download xətası:", err);
      alert("Fayl yüklənərkən xəta baş verdi!");
    }
  };

  const handleViewAnswers = async () => {
    if (!selectedClassAnswers) return;

    try {
      // Cache-busting üçün timestamp parametri əlavə et
      const timestamp = new Date().getTime();
      const response = await axios.get(
        `/api/view-answers/${selectedClassAnswers}?t=${timestamp}`,
        {
          responseType: "blob",
          headers: {
            "Cache-Control": "no-cache",
          },
        }
      );

      // Blob URL yarat və yeni pəncərədə aç
      const blob = new Blob([response.data], {
        type: response.headers["content-type"] || "application/pdf",
      });
      const url = window.URL.createObjectURL(blob);
      const newWindow = window.open(url, "_blank");

      // Pəncərə bağlandıqda blob URL-i təmizlə
      if (newWindow) {
        newWindow.addEventListener("beforeunload", () => {
          window.URL.revokeObjectURL(url);
        });
      } else {
        // Əgər popup bloklanıbsa, bir az gözlə və təmizlə
        setTimeout(() => {
          window.URL.revokeObjectURL(url);
        }, 1000);
      }
    } catch (err) {
      console.error("Doğru cavablar faylı görüntüləmə xətası:", err);
      alert("Fayl açıla bilmədi!");
    }
  };

  const classes = Array.from({ length: 11 }, (_, i) => i + 1);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white shadow-lg rounded-lg p-8">
        {}
        <div className="mb-8 border-b border-gray-200">
          <nav className="flex space-x-8" aria-label="Tabs">
            <button
              onClick={() => setActiveTab("results")}
              className={`${
                activeTab === "results"
                  ? "border-primary-500 text-primary-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
            >
              İmtahan Nəticələri
            </button>
            <button
              onClick={() => setActiveTab("topics")}
              className={`${
                activeTab === "topics"
                  ? "border-primary-500 text-primary-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
            >
              İmtahan Mövzuları
            </button>
            <button
              onClick={() => setActiveTab("answers")}
              className={`${
                activeTab === "answers"
                  ? "border-primary-500 text-primary-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
            >
              Doğru Cavablar
            </button>
          </nav>
        </div>

        {}
        {activeTab === "results" && (
          <>
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-gray-800 mb-2">
                İmtahan Nəticələri
              </h2>
              <p className="text-gray-600">
                Kodunuzu daxil edərək imtahan nəticələrinizi yoxlayın
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label
                  htmlFor="kod"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Tələbə Kodu
                </label>
                <input
                  type="text"
                  id="kod"
                  value={kod}
                  onChange={(e) => setKod(e.target.value)}
                  placeholder="Kodunuzu daxil edin..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-lg"
                  disabled={loading}
                />
              </div>

              <div className="flex space-x-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-primary-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-primary-700 focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? (
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
                      Yoxlanılır...
                    </span>
                  ) : (
                    "Nəticəni Yoxla"
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleReset}
                  className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
                >
                  Təmizlə
                </button>
              </div>
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

            {result && (
              <div className="mt-6 bg-white rounded-lg shadow-lg overflow-hidden">
                {}
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white text-center py-8">
                  <div className="text-6xl font-bold mb-2">
                    {result.totalResult || 0}
                  </div>
                  <div className="text-xl">Ümumi bal</div>
                </div>

                {}
                <div className="p-6">
                  <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-800 mb-4">
                      Sınaq 2
                    </h2>

                    <div className="grid grid-cols-2 gap-4 text-left max-w-md mx-auto">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Ad və soyad:</span>
                        <span className="font-medium">
                          {result.name || "-"} {result.surname || "-"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">İş nömrəsi:</span>
                        <span className="font-medium">
                          {result.code || "-"}
                        </span>
                      </div>
                      {result.variant && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Variant:</span>
                          <span className="font-medium">{result.variant}</span>
                        </div>
                      )}
                      {result.section && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Bölmə:</span>
                          <span className="font-medium">{result.section}</span>
                        </div>
                      )}
                      {result.class && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Sinif:</span>
                          <span className="font-medium">{result.class}</span>
                        </div>
                      )}
                      {result.subclass && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Altqrup:</span>
                          <span className="font-medium">{result.subclass}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {}
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Fənn
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Doğru cavab
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Səhv
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            İmtina
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Yazı işi
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Uğur faizi
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Yekun bal
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {result &&
                        result.subjects &&
                        Array.isArray(result.subjects) &&
                        result.subjects.length > 0 ? (
                          result.subjects.map((subject, index) => (
                            <tr key={index} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {subject.subject}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                {subject.correctAnswer !== undefined &&
                                subject.correctAnswer !== null
                                  ? subject.correctAnswer
                                  : "-"}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                {subject.wrongAnswer !== undefined &&
                                subject.wrongAnswer !== null
                                  ? subject.wrongAnswer
                                  : "-"}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                {subject.rejectedAnswer !== undefined &&
                                subject.rejectedAnswer !== null
                                  ? Array.isArray(subject.rejectedAnswer)
                                    ? subject.rejectedAnswer.join(", ")
                                    : subject.rejectedAnswer
                                  : "-"}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                {subject.openQuestion !== undefined &&
                                subject.openQuestion !== null
                                  ? Array.isArray(subject.openQuestion)
                                    ? subject.openQuestion.join(", ")
                                    : subject.openQuestion
                                  : "-"}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                {subject.successRate !== undefined &&
                                subject.successRate !== null
                                  ? subject.successRate
                                  : "-"}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {subject.result !== undefined &&
                                subject.result !== null
                                  ? subject.result
                                  : "-"}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td
                              colSpan="7"
                              className="px-6 py-4 text-center text-sm text-gray-500"
                            >
                              Nəticə tapılmadı
                            </td>
                          </tr>
                        )}
                        {}
                        {result &&
                          result.subjects &&
                          Array.isArray(result.subjects) &&
                          result.subjects.length > 0 && (
                            <tr className="border-t-2 border-gray-800 font-bold bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap text-base text-gray-900">
                                Ümumi
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-base text-gray-900"></td>
                              <td className="px-6 py-4 whitespace-nowrap text-base text-gray-900"></td>
                              <td className="px-6 py-4 whitespace-nowrap text-base text-gray-900"></td>
                              <td className="px-6 py-4 whitespace-nowrap text-base text-gray-900"></td>
                              <td className="px-6 py-4 whitespace-nowrap text-base text-gray-900"></td>
                              <td className="px-6 py-4 whitespace-nowrap text-base text-gray-900">
                                {result.totalResult || 0}
                              </td>
                            </tr>
                          )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {}
        {activeTab === "topics" && (
          <>
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-gray-800 mb-2">
                İmtahan Mövzuları
              </h2>
              <p className="text-gray-600">
                Hansı sinif mövzularını oxumaq istəyirsiniz?
              </p>
            </div>

            <div className="space-y-6">
              <div>
                <label
                  htmlFor="sinif"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Sinif Seçin
                </label>
                <select
                  id="sinif"
                  value={selectedClass}
                  onChange={handleClassChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-lg appearance-none bg-white cursor-pointer"
                >
                  <option value="">Sinif seçin...</option>
                  {classes.map((sinif) => (
                    <option key={sinif} value={sinif}>
                      {sinif}-ci sinif
                    </option>
                  ))}
                </select>
              </div>

              {selectedClass && (
                <div className="mt-6 space-y-4">
                  {checkingPdf ? (
                    <div className="p-6 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="flex items-center justify-center">
                        <svg
                          className="animate-spin h-5 w-5 text-gray-400 mr-3"
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
                        <p className="text-sm text-gray-600">Yoxlanılır...</p>
                      </div>
                    </div>
                  ) : pdfAvailable ? (
                    <div className="p-6 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center mb-4">
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
                            {selectedClass}-ci sinif üçün mövzu sənədləri
                            mövcuddur
                          </p>
                        </div>
                      </div>
                      <div className="flex space-x-3">
                        <button
                          onClick={handleViewPdf}
                          className="flex-1 bg-primary-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-primary-700 focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors flex items-center justify-center"
                        >
                          <svg
                            className="h-5 w-5 mr-2"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                          </svg>
                          Online Görüntülə
                        </button>
                        <button
                          onClick={handleDownloadPdf}
                          className="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors flex items-center justify-center"
                        >
                          <svg
                            className="h-5 w-5 mr-2"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                            />
                          </svg>
                          Yüklə
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <svg
                            className="h-5 w-5 text-yellow-400"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </div>
                        <div className="ml-3">
                          <p className="text-sm text-yellow-800">
                            <span className="font-medium">
                              {selectedClass}-ci sinif
                            </span>{" "}
                            üçün mövzu sənədləri hələ yüklənməyib.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {}
        {activeTab === "answers" && (
          <>
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-gray-800 mb-2">
                Doğru Cavablar
              </h2>
              <p className="text-gray-600">
                Hansı sinif doğru cavablarını oxumaq istəyirsiniz?
              </p>
            </div>

            <div className="space-y-6">
              <div>
                <label
                  htmlFor="sinifAnswers"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Sinif Seçin
                </label>
                <select
                  id="sinifAnswers"
                  value={selectedClassAnswers}
                  onChange={handleClassAnswersChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-lg appearance-none bg-white cursor-pointer"
                >
                  <option value="">Sinif seçin...</option>
                  {classes.map((sinif) => (
                    <option key={sinif} value={sinif}>
                      {sinif}-ci sinif
                    </option>
                  ))}
                </select>
              </div>

              {selectedClassAnswers && (
                <div className="mt-6 space-y-4">
                  {checkingAnswers ? (
                    <div className="p-6 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="flex items-center justify-center">
                        <svg
                          className="animate-spin h-5 w-5 text-gray-400 mr-3"
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
                        <p className="text-sm text-gray-600">Yoxlanılır...</p>
                      </div>
                    </div>
                  ) : answersAvailable ? (
                    <div className="p-6 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center mb-4">
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
                            {selectedClassAnswers}-ci sinif üçün doğru cavablar
                            mövcuddur
                          </p>
                        </div>
                      </div>
                      <div className="flex space-x-3">
                        <button
                          onClick={handleViewAnswers}
                          className="flex-1 bg-primary-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-primary-700 focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors flex items-center justify-center"
                        >
                          <svg
                            className="h-5 w-5 mr-2"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                          </svg>
                          Online Görüntülə
                        </button>
                        <button
                          onClick={handleDownloadAnswers}
                          className="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors flex items-center justify-center"
                        >
                          <svg
                            className="h-5 w-5 mr-2"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                            />
                          </svg>
                          Yüklə
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <svg
                            className="h-5 w-5 text-yellow-400"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </div>
                        <div className="ml-3">
                          <p className="text-sm text-yellow-800">
                            <span className="font-medium">
                              {selectedClassAnswers}-ci sinif
                            </span>{" "}
                            üçün doğru cavablar hələ yüklənməyib.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default StudentPanel;
