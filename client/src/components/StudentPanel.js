import React, { useState } from 'react';
import axios from 'axios';

const StudentPanel = () => {
  const [kod, setKod] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!kod.trim()) {
      setError('Zəhmət olmasa kodunuzu daxil edin!');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await axios.get(`/api/check-result/${kod.trim()}`);
      
      if (response.data.success) {
        setResult(response.data.data);
      } else {
        setError(response.data.message || 'Nəticə tapılmadı!');
      }
    } catch (err) {
      setError('Xəta baş verdi. Zəhmət olmasa yenidən cəhd edin.');
      console.error('API xətası:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setKod('');
    setResult(null);
    setError('');
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white shadow-lg rounded-lg p-8">
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
            <label htmlFor="kod" className="block text-sm font-medium text-gray-700 mb-2">
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
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Yoxlanılır...
                </span>
              ) : (
                'Nəticəni Yoxla'
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
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
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
            {/* Ümumi bal başlığı */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white text-center py-8">
              <div className="text-6xl font-bold mb-2">{result.umumiBal}</div>
              <div className="text-xl">Ümumi bal</div>
            </div>

            {/* Tələbə məlumatları */}
            <div className="p-6">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Sınaq 2</h2>
                
                <div className="grid grid-cols-2 gap-4 text-left max-w-md mx-auto">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Ad və soyad:</span>
                    <span className="font-medium">{result.ad} {result.soyad}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">İş nömrəsi:</span>
                    <span className="font-medium">{result.kod}</span>
                  </div>
                  {result.variant && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Variant:</span>
                      <span className="font-medium">{result.variant}</span>
                    </div>
                  )}
                  {result.bolme && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Bölmə:</span>
                      <span className="font-medium">{result.bolme}</span>
                    </div>
                  )}
                  {result.sinif && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Sinif:</span>
                      <span className="font-medium">{result.sinif}</span>
                    </div>
                  )}
                  {result.altqrup && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Altqrup:</span>
                      <span className="font-medium">{result.altqrup}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Fənnlər cədvəli */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Fənn
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Uğur faizi
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Bal
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {result.fennler.map((fenn, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {fenn.fenn}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          {fenn.bal.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          {fenn.bal}
                        </td>
                      </tr>
                    ))}
                    {/* Ümumi sətir */}
                    <tr className="border-t-2 border-gray-800 font-bold bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-base text-gray-900">Ümumi</td>
                      <td className="px-6 py-4 whitespace-nowrap text-base text-gray-900">
                        {(result.umumiBal / result.fennSayi).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-base text-gray-900">{result.umumiBal}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Əlavə Excel məlumatları */}
              {result.excelData && Object.keys(result.excelData).length > 0 && (
                <div className="mt-8">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Əlavə Məlumatlar</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(result.excelData).map(([key, values]) => {
                      // Standart sütunları göstərmə (artıq yuxarıda göstərilir)
                      const standardColumns = ['Kod', 'kod', 'KOD', 'Ad', 'ad', 'AD', 'Soyad', 'soyad', 'SOYAD', 
                        'Fənn', 'fenn', 'FENN', 'Bal', 'bal', 'BAL', 'Variant', 'variant', 'VARIANT', 
                        'Bölmə', 'bölmə', 'BOLME', 'Sinif', 'sinif', 'SINIF', 'Altqrup', 'altqrup', 'ALTQRUP',
                        'Student Code', 'student_code', 'Name', 'name', 'First Name', 'Surname', 'surname', 
                        'Last Name', 'Subject', 'subject', 'Course', 'Score', 'score', 'Grade', 'grade', 
                        'Section', 'section', 'Class', 'class', 'Subgroup', 'subgroup'];
                      
                      if (standardColumns.includes(key)) {
                        return null;
                      }

                      // Unikal dəyərləri göstər
                      const uniqueValues = [...new Set(values.filter(v => v !== null && v !== undefined && v !== ''))];
                      if (uniqueValues.length === 0) {
                        return null;
                      }

                      return (
                        <div key={key} className="bg-gray-50 rounded-lg p-4">
                          <h4 className="font-medium text-gray-700 mb-2 capitalize">
                            {key.replace(/([A-Z])/g, ' $1').trim()}
                          </h4>
                          <div className="text-sm text-gray-600">
                            {uniqueValues.length === 1 ? (
                              <span className="font-medium">{uniqueValues[0]}</span>
                            ) : (
                              <ul className="list-disc list-inside space-y-1">
                                {uniqueValues.map((value, index) => (
                                  <li key={index}>{value}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentPanel;
