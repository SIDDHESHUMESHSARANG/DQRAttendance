import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

const API_URL = "http://localhost:3000/api";

async function apiRequest(path, options = {}) {
  const token = localStorage.getItem("professorToken");

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `Request failed (${response.status})`);
  }

  return data;
}

function getLectureList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.lectures)) return data.lectures;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.data?.lectures)) return data.data.lectures;
  return [];
}

function getLectureId(lecture) {
  return lecture?._id || lecture?.id;
}

function formatDate(date) {
  if (!date) return "Date not set";

  const parsed = new Date(date);

  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

function getStatusClass(status) {
  return `status status-${status || "scheduled"}`;
}

function Professor({ onLogout }) {
  const [professor] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("professorData") || "{}");
    } catch {
      return {};
    }
  });

  const [lectures, setLectures] = useState([]);
  const [qrData, setQrData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyLectureId, setBusyLectureId] = useState(null);
  const [activeLectureId, setActiveLectureId] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const qrRequestInProgress = useRef(false);

  const loadLectures = useCallback(async () => {
    const data = await apiRequest("/lectures");
    const list = getLectureList(data);

    setLectures(list);

    const ongoing = list.find(
      (lecture) => lecture.status === "ongoing"
    );

    setActiveLectureId(ongoing ? getLectureId(ongoing) : null);

    return list;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        setLoading(true);
        setError("");

        if (!localStorage.getItem("professorToken")) {
          throw new Error("Professor login token nahi mila. Dobara login karein.");
        }

        await loadLectures();
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Lectures load nahi hui.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    initialize();

    return () => {
      cancelled = true;
    };
  }, [loadLectures]);

  const activeLecture = lectures.find(
    (lecture) => getLectureId(lecture) === activeLectureId
  );

  useEffect(() => {
    if (!qrData?.expiresAt) {
      setRemainingSeconds(0);
      return;
    }

    const updateRemaining = () => {
      const expiry = new Date(qrData.expiresAt).getTime();

      setRemainingSeconds(
        Number.isFinite(expiry)
          ? Math.max(0, Math.ceil((expiry - Date.now()) / 1000))
          : 0
      );
    };

    updateRemaining();

    const timer = setInterval(updateRemaining, 250);

    return () => clearInterval(timer);
  }, [qrData]);

  useEffect(() => {
    if (!activeLectureId || activeLecture?.status !== "ongoing") {
      setQrData(null);
      return;
    }

    let cancelled = false;
    let timer;

    const refreshQR = async () => {
      if (qrRequestInProgress.current) {
        timer = setTimeout(refreshQR, 100);
        return;
      }

      qrRequestInProgress.current = true;

      try {
        const data = await apiRequest(
          `/lectures/${activeLectureId}/qr`,
          {
            method: "POST",
            body: JSON.stringify({}),
          }
        );

        if (!cancelled && data.qrData) {
          setQrData(data.qrData);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "QR generate nahi ho paya.");
        }
      } finally {
        qrRequestInProgress.current = false;

        if (!cancelled) {
          timer = setTimeout(refreshQR, 500);
        }
      }
    };

    refreshQR();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeLectureId, activeLecture?.status]);

  async function startLecture(lecture) {
    const id = getLectureId(lecture);

    if (!id) {
      setError("Lecture ID nahi mila.");
      return;
    }

    if (activeLectureId) {
      setError("Pehle current attendance session stop karein.");
      return;
    }

    if (!navigator.geolocation) {
      setError("Is browser mein GPS location supported nahi hai.");
      return;
    }

    setError("");
    setNotice("");
    setBusyLectureId(id);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;

          await apiRequest(`/lectures/${id}/start`, {
            method: "PATCH",
            body: JSON.stringify({ latitude, longitude }),
          });

          setQrData(null);
          setNotice("Attendance session start ho gaya hai.");

          await loadLectures();
        } catch (err) {
          setError(err.message || "Lecture start nahi ho paya.");
        } finally {
          setBusyLectureId(null);
        }
      },
      (geoError) => {
        const messages = {
          1: "Location permission allow karein.",
          2: "Aapki location nahi mil rahi.",
          3: "Location request timeout ho gayi.",
        };

        setError(
          messages[geoError.code] || "GPS location capture nahi ho payi."
        );

        setBusyLectureId(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }

  async function stopLecture(lecture) {
    const id = getLectureId(lecture);

    if (!id) return;

    const confirmed = window.confirm(
      "Attendance band karne par session close ho jayega. Kya aap continue karna chahte hain?"
    );

    if (!confirmed) return;

    setBusyLectureId(id);
    setError("");
    setNotice("");

    try {
      const result = await apiRequest(`/lectures/${id}/stop`, {
        method: "PATCH",
        body: JSON.stringify({}),
      });

      setQrData(null);

      // This message confirms the API call succeeded.
      // Permanent report saving must be implemented by the backend.
      setNotice(
        result?.message ||
          "Attendance session stop ho gaya. Report status verify karein."
      );

      await loadLectures();
    } catch (err) {
      setError(
        `${err.message || "Attendance stop nahi ho payi."} Session close hone ki confirmation nahi mili.`
      );
    } finally {
      setBusyLectureId(null);
    }
  }

  function logout() {
    localStorage.removeItem("professorToken");
    localStorage.removeItem("professorData");

    if (onLogout) {
      onLogout();
    } else {
      window.location.reload();
    }
  }

  const professorName =
    professor.name || professor.professorName || "Professor";

  const subjects = Array.isArray(professor.subjects)
    ? professor.subjects
    : professor.subjects
      ? [professor.subjects]
      : [];

  const assignedClasses = Array.isArray(professor.assignedClasses)
    ? professor.assignedClasses
    : professor.assignedClasses
      ? [professor.assignedClasses]
      : [];

  const counts = {
    total: lectures.length,
    scheduled: lectures.filter((l) => l.status === "scheduled").length,
    ongoing: lectures.filter((l) => l.status === "ongoing").length,
    completed: lectures.filter((l) => l.status === "completed").length,
  };

  const query = search.trim().toLowerCase();

  const filteredLectures = lectures.filter((lecture) => {
    const matchesSearch = [
      lecture.subject,
      lecture.assignedClass,
      lecture.startTime,
      lecture.endTime,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));

    const matchesStatus =
      statusFilter === "all" || lecture.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <main className="prof-page">
      <style>{`
        * { box-sizing: border-box; }

        .prof-page {
          min-height: 100vh;
          background: #f5f7fb;
          color: #172033;
          font-family: Inter, Arial, sans-serif;
          padding: 28px;
        }

        .prof-container { max-width: 1280px; margin: auto; }

        .prof-topbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 18px;
          margin-bottom: 28px;
        }

        .prof-brand { display: flex; align-items: center; gap: 13px; }

        .prof-logo {
          width: 48px;
          height: 48px;
          display: grid;
          place-items: center;
          border-radius: 15px;
          color: white;
          font-size: 22px;
          font-weight: 800;
          background: linear-gradient(135deg, #2563eb, #4f46e5);
          box-shadow: 0 8px 20px #2563eb30;
        }

        .prof-topbar h1 { margin: 0; font-size: 23px; }
        .prof-subtitle { margin: 5px 0 0; color: #718096; font-size: 13px; }

        .prof-button {
          border: 0;
          border-radius: 10px;
          padding: 11px 16px;
          font-weight: 700;
          cursor: pointer;
          transition: transform .15s, opacity .15s;
        }

        .prof-button:hover { transform: translateY(-1px); }
        .prof-button:disabled { opacity: .55; cursor: not-allowed; transform: none; }

        .prof-logout { color: #334155; background: white; border: 1px solid #e2e8f0; }

        .prof-welcome {
          border-radius: 20px;
          padding: 27px;
          color: white;
          background: linear-gradient(115deg, #172554, #1d4ed8 75%, #4338ca);
          margin-bottom: 22px;
          box-shadow: 0 12px 30px #1e40af1a;
        }

        .prof-welcome-label {
          color: #bfdbfe;
          text-transform: uppercase;
          letter-spacing: 1.3px;
          font-size: 11px;
          font-weight: 800;
        }

        .prof-welcome h2 { margin: 10px 0 7px; font-size: 27px; }
        .prof-welcome p { color: #dbeafe; margin: 0; font-size: 14px; }

        .prof-profile {
          display: flex;
          align-items: center;
          gap: 15px;
          padding: 20px;
          background: white;
          border: 1px solid #e7ebf2;
          border-radius: 16px;
          margin-bottom: 22px;
        }

        .prof-avatar {
          flex-shrink: 0;
          width: 58px;
          height: 58px;
          border-radius: 17px;
          display: grid;
          place-items: center;
          background: #dbeafe;
          color: #1d4ed8;
          font-size: 21px;
          font-weight: 800;
        }

        .prof-profile h3 { margin: 0 0 5px; font-size: 17px; }
        .prof-email { color: #64748b; font-size: 13px; overflow-wrap: anywhere; }
        .prof-tags { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 10px; }

        .prof-tag {
          display: inline-flex;
          border-radius: 7px;
          background: #f1f5f9;
          color: #475569;
          padding: 5px 9px;
          font-size: 12px;
        }

        .prof-section-title {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin: 28px 0 16px;
        }

        .prof-section-title h2 { margin: 0; font-size: 20px; }
        .prof-section-title p { margin: 5px 0 0; color: #64748b; font-size: 13px; }

        .prof-stats {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 15px;
          margin-bottom: 25px;
        }

        .prof-stat {
          padding: 19px;
          border: 1px solid #e7ebf2;
          background: white;
          border-radius: 15px;
          min-width: 0;
        }

        .prof-stat-label { color: #64748b; font-size: 13px; }
        .prof-stat-value { margin-top: 12px; font-size: 29px; font-weight: 800; }
        .prof-stat-icon {
          display: grid;
          place-items: center;
          width: 38px;
          height: 38px;
          border-radius: 11px;
          font-size: 19px;
          margin-bottom: 14px;
        }

        .prof-controls {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 16px;
        }

        .prof-search {
          flex: 1;
          min-width: 210px;
          border: 1px solid #dce3ed;
          border-radius: 10px;
          background: white;
          padding: 12px 14px;
          font-size: 14px;
          outline: none;
        }

        .prof-search:focus, .prof-select:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px #3b82f61c;
        }

        .prof-select {
          min-width: 160px;
          border: 1px solid #dce3ed;
          border-radius: 10px;
          background: white;
          padding: 12px;
          font-size: 14px;
          outline: none;
        }

        .prof-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 17px;
        }

        .prof-lecture {
          background: white;
          border: 1px solid #e4e9f1;
          border-radius: 16px;
          padding: 20px;
          min-width: 0;
          box-shadow: 0 3px 12px #0f172a05;
        }

        .prof-lecture-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 10px;
          margin-bottom: 18px;
        }

        .prof-lecture h3 { margin: 0; font-size: 18px; }
        .prof-class { margin-top: 6px; color: #64748b; font-size: 13px; }

        .status {
          display: inline-flex;
          align-items: center;
          border-radius: 20px;
          padding: 6px 9px;
          font-size: 10px;
          font-weight: 800;
          text-transform: capitalize;
          white-space: nowrap;
        }

        .status-scheduled { color: #92400e; background: #fef3c7; }
        .status-ongoing { color: #166534; background: #dcfce7; }
        .status-completed { color: #1d4ed8; background: #dbeafe; }
        .status-cancelled { color: #b91c1c; background: #fee2e2; }

        .prof-detail {
          display: flex;
          gap: 10px;
          align-items: center;
          margin: 12px 0;
          color: #475569;
          font-size: 13px;
        }

        .prof-detail-icon {
          width: 29px;
          height: 29px;
          display: grid;
          place-items: center;
          border-radius: 8px;
          background: #f1f5f9;
        }

        .prof-lecture-footer {
          border-top: 1px solid #edf0f5;
          margin-top: 17px;
          padding-top: 15px;
        }

        .prof-start {
          width: 100%;
          background: #2563eb;
          color: white;
        }

        .prof-stop {
          width: 100%;
          background: #dc2626;
          color: white;
        }

        .prof-disabled-note { color: #94a3b8; font-size: 12px; margin: 0; }

        .prof-alert {
          padding: 13px 15px;
          border-radius: 11px;
          margin: 0 0 16px;
          font-size: 14px;
          overflow-wrap: anywhere;
        }

        .prof-error { color: #991b1b; background: #fee2e2; border: 1px solid #fecaca; }
        .prof-success { color: #166534; background: #dcfce7; border: 1px solid #bbf7d0; }

        .prof-empty {
          padding: 42px 20px;
          text-align: center;
          background: white;
          border: 1px dashed #cbd5e1;
          border-radius: 16px;
          color: #64748b;
        }

        .prof-empty-icon { font-size: 32px; margin-bottom: 10px; }

        .prof-qr-panel {
          margin-top: 26px;
          background: white;
          border: 1px solid #dbeafe;
          border-radius: 18px;
          padding: 25px;
          text-align: center;
          box-shadow: 0 10px 30px #2563eb0d;
        }

        .prof-qr-panel h2 { margin: 0 0 8px; }
        .prof-qr-meta { color: #64748b; font-size: 14px; }
        .prof-qr-box {
          display: inline-flex;
          padding: 18px;
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          margin: 15px auto;
        }

        .prof-qr-timer { font-size: 14px; color: #334155; }
        .prof-qr-note {
          max-width: 550px;
          margin: 12px auto 0;
          color: #92400e;
          background: #fffbeb;
          border-radius: 10px;
          padding: 12px;
          font-size: 12px;
        }

        .prof-footer {
          text-align: center;
          margin-top: 35px;
          color: #94a3b8;
          font-size: 12px;
        }

        @media (max-width: 1000px) {
          .prof-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .prof-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }

        @media (max-width: 600px) {
          .prof-page { padding: 16px; }
          .prof-topbar { align-items: flex-start; }
          .prof-topbar h1 { font-size: 19px; }
          .prof-logo { width: 42px; height: 42px; }
          .prof-welcome { padding: 21px; }
          .prof-welcome h2 { font-size: 23px; }
          .prof-profile { align-items: flex-start; padding: 16px; }
          .prof-avatar { width: 45px; height: 45px; }
          .prof-grid, .prof-stats { grid-template-columns: 1fr; }
          .prof-section-title { align-items: flex-start; flex-direction: column; }
          .prof-select { width: 100%; }
          .prof-qr-panel { padding: 18px 12px; }
        }
      `}</style>

      <div className="prof-container">
        <header className="prof-topbar">
          <div className="prof-brand">
            <div className="prof-logo">A</div>
            <div>
              <h1>Professor Dashboard</h1>
              <p className="prof-subtitle">QR-Based Attendance System</p>
            </div>
          </div>

          <button className="prof-button prof-logout" onClick={logout}>
            ↪ Logout
          </button>
        </header>

        <section className="prof-welcome">
          <div className="prof-welcome-label">Professor Portal</div>
          <h2>Welcome back, {professorName}!</h2>
          <p>Manage your lectures and attendance sessions from one place.</p>
        </section>

        <section className="prof-profile">
          <div className="prof-avatar">
            {professorName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3>{professorName}</h3>
            <div className="prof-email">
              {professor.email || "Email not available"}
            </div>

            <div className="prof-tags">
              {subjects.length ? (
                subjects.map((subject) => (
                  <span className="prof-tag" key={subject}>
                    {subject}
                  </span>
                ))
              ) : (
                <span className="prof-tag">Subjects not specified</span>
              )}

              {assignedClasses.map((className) => (
                <span className="prof-tag" key={className}>
                  {className}
                </span>
              ))}
            </div>
          </div>
        </section>

        {error && (
          <div className="prof-alert prof-error" role="alert">
            ⚠ {error}
          </div>
        )}

        {notice && (
          <div className="prof-alert prof-success" role="status">
            ✓ {notice}
          </div>
        )}

        <div className="prof-section-title">
          <div>
            <h2>Dashboard Overview</h2>
            <p>Your assigned lecture summary</p>
          </div>
        </div>

        <section className="prof-stats">
          <div className="prof-stat">
            <div className="prof-stat-icon" style={{ background: "#dbeafe" }}>▤</div>
            <div className="prof-stat-label">Total Lectures</div>
            <div className="prof-stat-value">{loading ? "—" : counts.total}</div>
          </div>

          <div className="prof-stat">
            <div className="prof-stat-icon" style={{ background: "#fef3c7" }}>◷</div>
            <div className="prof-stat-label">Scheduled</div>
            <div className="prof-stat-value">{loading ? "—" : counts.scheduled}</div>
          </div>

          <div className="prof-stat">
            <div className="prof-stat-icon" style={{ background: "#dcfce7" }}>●</div>
            <div className="prof-stat-label">Active Sessions</div>
            <div className="prof-stat-value">{loading ? "—" : counts.ongoing}</div>
          </div>

          <div className="prof-stat">
            <div className="prof-stat-icon" style={{ background: "#e0e7ff" }}>✓</div>
            <div className="prof-stat-label">Completed</div>
            <div className="prof-stat-value">{loading ? "—" : counts.completed}</div>
          </div>
        </section>

        <section>
          <div className="prof-section-title">
            <div>
              <h2>My Lectures</h2>
              <p>View your schedule and manage attendance.</p>
            </div>
          </div>

          <div className="prof-controls">
            <input
              className="prof-search"
              type="search"
              placeholder="Search subject or class..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search lectures"
            />

            <select
              className="prof-select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="Filter by lecture status"
            >
              <option value="all">All statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="ongoing">Ongoing</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {loading ? (
            <div className="prof-empty">Lectures load ho rahi hain...</div>
          ) : lectures.length === 0 ? (
            <div className="prof-empty">
              <div className="prof-empty-icon">▤</div>
              <strong>No lectures assigned yet</strong>
              <p>Admin ke lecture assign karne par yahan dikhai denge.</p>
            </div>
          ) : filteredLectures.length === 0 ? (
            <div className="prof-empty">
              <div className="prof-empty-icon">⌕</div>
              <strong>No matching lectures</strong>
              <p>Search ya status filter change karke dekhein.</p>
            </div>
          ) : (
            <div className="prof-grid">
              {filteredLectures.map((lecture) => {
                const id = getLectureId(lecture);
                const ongoing = lecture.status === "ongoing";
                const busy = busyLectureId === id;

                return (
                  <article className="prof-lecture" key={id}>
                    <div className="prof-lecture-top">
                      <div>
                        <h3>{lecture.subject || "Subject"}</h3>
                        <div className="prof-class">
                          Class: {lecture.assignedClass || "N/A"}
                        </div>
                      </div>

                      <span className={getStatusClass(lecture.status)}>
                        {lecture.status || "scheduled"}
                      </span>
                    </div>

                    <div className="prof-detail">
                      <span className="prof-detail-icon">▦</span>
                      <span>{formatDate(lecture.date)}</span>
                    </div>

                    <div className="prof-detail">
                      <span className="prof-detail-icon">◷</span>
                      <span>
                        {lecture.startTime || "--"} – {lecture.endTime || "--"}
                      </span>
                    </div>

                    <div className="prof-lecture-footer">
                      {ongoing ? (
                        <button
                          className="prof-button prof-stop"
                          disabled={Boolean(busyLectureId)}
                          onClick={() => stopLecture(lecture)}
                        >
                          {busy ? "Stopping..." : "■  Stop Attendance"}
                        </button>
                      ) : lecture.status === "scheduled" ? (
                        <button
                          className="prof-button prof-start"
                          disabled={Boolean(busyLectureId) || Boolean(activeLectureId)}
                          onClick={() => startLecture(lecture)}
                        >
                          {busy ? "Starting..." : "▦  Start Attendance"}
                        </button>
                      ) : (
                        <p className="prof-disabled-note">
                          {lecture.status === "completed"
                            ? "✓ This lecture is completed."
                            : "This lecture cannot be started."}
                        </p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {activeLecture?.status === "ongoing" && (
          <section className="prof-qr-panel">
            <h2>Live Attendance QR</h2>
            <p className="prof-qr-meta">
              {activeLecture.subject} · {activeLecture.assignedClass}
            </p>

            {qrData?.token ? (
              <>
                <div className="prof-qr-box">
                  <QRCodeSVG
                    value={JSON.stringify(qrData)}
                    size={240}
                    level="M"
                    includeMargin
                  />
                </div>

                <p className="prof-qr-timer">
                  QR token expiry: <strong>{remainingSeconds} seconds</strong>
                </p>
                <p className="prof-qr-meta">
                  QR refresh interval: 500 ms
                </p>
              </>
            ) : (
              <p className="prof-qr-meta">QR generate ho raha hai...</p>
            )}

            <div className="prof-qr-note">
              Students ko apne authenticated account se QR scan karna hoga.
              Attendance verification backend par honi chahiye.
            </div>
          </section>
        )}

        <footer className="prof-footer">
          QR-Based Attendance System · Professor Portal
        </footer>
      </div>
    </main>
  );
}

export default Professor;
