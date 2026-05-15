import React, { useEffect, useState, useRef } from "react";

const ReportPage: React.FC = () => {
  const [initialized, setInitialized] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exchangedRef = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");

    const handleAuth = async () => {
      try {
        // exchange code → cookie
        if (code && state && !exchangedRef.current) {
          exchangedRef.current = true;

          await fetch(`${process.env.REACT_APP_API_URL}/auth/exchange`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ code, state }),
          });

          // очищаем URL без reload
          window.history.replaceState({}, "", "/");
        }

        // check session
        const res = await fetch(`${process.env.REACT_APP_API_URL}/auth/me`, {
          credentials: "include",
        });

        setIsAuthenticated(res.ok);
      } catch {
        setIsAuthenticated(false);
      } finally {
        setInitialized(true);
      }
    };

    handleAuth();
  }, []);

  // login redirect
  const login = () => {
    window.location.href = `${process.env.REACT_APP_API_URL}/auth/login`;
  };

  // report download
  const [reports, setReports] = useState<any[]>([]);

  const downloadReport = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(
        `${process.env.REACT_APP_REPORTS_URL}/reports`,
        {
          credentials: "include",
        },
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      // предполагаем, что ответ приходит в виде { reports: [...] }
      setReports(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  if (!initialized) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
        <button
          onClick={login}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Login
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <div className="p-8 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold mb-6">Usage Reports</h1>

        <button
          onClick={downloadReport}
          disabled={loading}
          className={`px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 ${
            loading ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          {loading ? "Generating Report..." : "Download Report"}
        </button>

        {error && (
          <div className="mt-4 p-4 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}
      </div>

      {reports.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="border px-4 py-2">Дата</th>
                <th className="border px-4 py-2">Email</th>
                <th className="border px-4 py-2">Имя</th>
                <th className="border px-4 py-2">Действий</th>
                <th className="border px-4 py-2">Ср. отклик (ms)</th>
                <th className="border px-4 py-2">Макс. отклик (ms)</th>
                <th className="border px-4 py-2">Ср. батарея (%)</th>
                <th className="border px-4 py-2">Аномалии</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((rep, idx) => (
                <tr key={idx}>
                  <td className="border px-4 py-2">{rep.report_date}</td>
                  <td className="border px-4 py-2">{rep.email}</td>
                  <td className="border px-4 py-2">{rep.name}</td>
                  <td className="border px-4 py-2 text-center">
                    {rep.total_actions}
                  </td>
                  <td className="border px-4 py-2 text-center">
                    {rep.avg_response_ms}
                  </td>
                  <td className="border px-4 py-2 text-center">
                    {rep.max_response_ms}
                  </td>
                  <td className="border px-4 py-2 text-center">
                    {rep.battery_avg_level}
                  </td>
                  <td className="border px-4 py-2 text-center">
                    {rep.anomaly_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ReportPage;
