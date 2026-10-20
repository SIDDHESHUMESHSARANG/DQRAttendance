import { useCallback, useEffect, useState } from "react";
import { adminService } from "../services/adminService";
import "./AdminAttendance.css";

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const dateLabel = (value) => value
  ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
  : "—";

function AdminAttendance({ onBack }) {
  const [tab, setTab] = useState("overview");
  const [overview, setOverview] = useState(null);
  const [date, setDate] = useState(today);
  const [dateReport, setDateReport] = useState(null);
  const [flagged, setFlagged] = useState([]);
  const [lowAttendance, setLowAttendance] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadTab = useCallback(async (activeTab = tab) => {
    try {
      if (activeTab === "overview") {
        const result = await adminService.getAttendanceOverview();
        setOverview(result.data);
      } else if (activeTab === "date") {
        const result = await adminService.getAttendanceByDate(date);
        setDateReport(result);
      } else if (activeTab === "flagged") {
        const result = await adminService.getFlaggedAttendance();
        setFlagged(Array.isArray(result.attendance) ? result.attendance : []);
      } else {
        const result = await adminService.getLowAttendanceStudents();
        setLowAttendance(Array.isArray(result.students) ? result.students : []);
      }
      setError("");
    } catch (requestError) {
      setError(requestError.message || "Unable to load attendance data.");
    } finally {
      setLoading(false);
    }
  }, [date, tab]);

  useEffect(() => { Promise.resolve().then(() => loadTab(tab)); }, [tab, loadTab]);

  const review = async (record, action) => {
    const id = record._id || record.id;
    if (!id) {
      setError("Attendance record identifier is missing.");
      return;
    }
    setBusyId(id);
    setError("");
    setNotice("");
    try {
      const result = await adminService.reviewFlaggedAttendance(id, action);
      setNotice(result.message || `Attendance ${action}d.`);
      await loadTab("flagged");
    } catch (requestError) {
      setError(requestError.message || `Unable to ${action} attendance.`);
    } finally {
      setBusyId("");
    }
  };

  const sendAlert = async (student) => {
    const id = student.id || student._id;
    if (!id) {
      setError("Student identifier is missing.");
      return;
    }
    setBusyId(id);
    setError("");
    setNotice("");
    try {
      const result = await adminService.sendAttendanceAlert(id);
      setNotice(result.message || `Alert sent to ${student.name}.`);
    } catch (requestError) {
      setError(requestError.message || "Unable to send WhatsApp alert.");
    } finally {
      setBusyId("");
    }
  };

  const tabs = [
    ["overview", "Overview"],
    ["date", "By date"],
    ["flagged", `Flagged${flagged.length ? ` (${flagged.length})` : ""}`],
    ["low", "Low attendance"],
  ];

  return (
    <section className="attendance-page">
      <header className="attendance-header">
        <div>
          <button type="button" className="attendance-back" onClick={onBack}>← Dashboard</button>
          <p className="attendance-eyebrow">ADMIN WORKSPACE</p>
          <h2>Attendance & reports</h2>
          <p className="attendance-subtitle">Monitor participation, review unusual scans, and follow up with students.</p>
        </div>
        <button type="button" className="attendance-refresh" onClick={() => { setLoading(true); loadTab(tab); }} disabled={loading}>
          {loading ? "Loading…" : "↻ Refresh"}
        </button>
      </header>

      {error && <p className="attendance-message is-error" role="alert">{error}</p>}
      {notice && <p className="attendance-message is-success" role="status">{notice}</p>}

      <nav className="attendance-tabs" aria-label="Attendance reports">
        {tabs.map(([value, label]) => (
          <button type="button" key={value} className={tab === value ? "is-active" : ""} onClick={() => { setLoading(true); setTab(value); }}>
            {label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <section className="attendance-panel">
          <div className="attendance-panel-heading">
            <div><h3>Campus attendance overview</h3><p>Summary across completed lectures and enrolled students.</p></div>
            <strong className="attendance-score">{overview ? `${overview.attendancePercentage}%` : "—"}<small>average</small></strong>
          </div>
          <div className="attendance-metrics">
            <div><span>Students</span><strong>{overview?.totalStudents ?? "—"}</strong></div>
            <div><span>Completed lectures</span><strong>{overview?.totalCompletedLectures ?? "—"}</strong></div>
            <div><span>Present records</span><strong>{overview?.totalSessionsAttended ?? "—"}</strong></div>
            <div><span>Absent / unconfirmed</span><strong>{overview?.totalSessionsAbsentOrUnconfirmed ?? "—"}</strong></div>
          </div>
          <div className="attendance-table-wrap">
            <table className="attendance-table">
              <thead><tr><th>Student</th><th>Class</th><th>Attended</th><th>Sessions</th><th>Attendance</th></tr></thead>
              <tbody>
                {!loading && !overview?.students?.length && <tr><td colSpan="5" className="attendance-empty">No attendance records yet.</td></tr>}
                {(overview?.students || []).map((student) => (
                  <tr key={student.studentId}>
                    <td><strong>{student.name || "Student"}</strong><small>Roll {student.rollNo ?? "—"}</small></td>
                    <td>{student.class || "—"}{student.division ? ` / ${student.division}` : ""}</td>
                    <td>{student.totalSessionsAttended}</td>
                    <td>{student.totalSessionsConducted}</td>
                    <td><span className={`attendance-percent ${student.attendancePercentage < 75 ? "below-target" : ""}`}>{student.attendancePercentage}%</span></td>
                  </tr>
                ))}
                {loading && <tr><td colSpan="5" className="attendance-empty">Loading report…</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "date" && (
        <section className="attendance-panel">
          <div className="attendance-panel-heading date-heading">
            <div><h3>Daily attendance</h3><p>Lecture attendance summary for a selected date.</p></div>
            <label className="attendance-date">Choose date
              <input type="date" value={date} onChange={(event) => { setLoading(true); setDate(event.target.value); }} />
            </label>
          </div>
          <div className="attendance-table-wrap">
            <table className="attendance-table">
              <thead><tr><th>Lecture</th><th>Class</th><th>Time</th><th>Students</th><th>Present</th><th>Absent</th><th>Pending</th><th>Rate</th></tr></thead>
              <tbody>
                {!loading && !dateReport?.data?.length && <tr><td colSpan="8" className="attendance-empty">{dateReport?.message || "No completed lectures for this date."}</td></tr>}
                {(dateReport?.data || []).map((lecture) => (
                  <tr key={lecture.lectureId}>
                    <td><strong>{lecture.subject}</strong><small>{dateLabel(lecture.date)}</small></td>
                    <td>{lecture.class}</td><td>{lecture.startTime}–{lecture.endTime}</td>
                    <td>{lecture.totalStudents}</td><td>{lecture.present}</td><td>{lecture.absent}</td><td>{lecture.pendingVerification}</td>
                    <td><span className="attendance-percent">{lecture.attendancePercentage}%</span></td>
                  </tr>
                ))}
                {loading && <tr><td colSpan="8" className="attendance-empty">Loading report…</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "flagged" && (
        <section className="attendance-panel">
          <div className="attendance-panel-heading"><div><h3>Needs your review</h3><p>Out-of-range attendance scans awaiting approval or rejection.</p></div><span className="attendance-count">{flagged.length} pending</span></div>
          {loading ? <p className="attendance-empty">Loading flagged scans…</p> : flagged.length === 0 ? <p className="attendance-empty">No flagged attendance is awaiting review.</p> : (
            <div className="attendance-review-list">
              {flagged.map((record) => {
                const id = record._id || record.id;
                const student = record.student || {};
                const lecture = record.lecture || {};
                const classroom = record.classroom || {};
                return <article className="attendance-review-card" key={id}>
                  <div className="attendance-review-top">
                    <div><strong>{student.academicDetails?.fullName || student.name || "Student"}</strong><small>Roll {student.academicDetails?.rollNo ?? "—"} · {student.academicDetails?.class || lecture.assignedClass || "Class unavailable"}</small></div>
                    <span className="attendance-flag">Needs review</span>
                  </div>
                  <p>{lecture.subject || "Lecture"} · {classroom.name || classroom.classroomName || "Classroom"} · {dateLabel(record.markedAt)}</p>
                  {record.verificationNote && <p className="attendance-note">{record.verificationNote}</p>}
                  <div className="attendance-review-actions">
                    <button type="button" className="review-approve" disabled={Boolean(busyId)} onClick={() => review(record, "approve")}>{busyId === id ? "Saving…" : "Approve"}</button>
                    <button type="button" className="review-reject" disabled={Boolean(busyId)} onClick={() => review(record, "reject")}>Reject</button>
                  </div>
                </article>;
              })}
            </div>
          )}
        </section>
      )}

      {tab === "low" && (
        <section className="attendance-panel">
          <div className="attendance-panel-heading"><div><h3>Students below 75%</h3><p>Send an individual WhatsApp reminder to students who have a contact number on file.</p></div><span className="attendance-count">{lowAttendance.length} students</span></div>
          <div className="attendance-table-wrap">
            <table className="attendance-table">
              <thead><tr><th>Student</th><th>Class</th><th>Attendance</th><th>Contact</th><th>Action</th></tr></thead>
              <tbody>
                {!loading && !lowAttendance.length && <tr><td colSpan="5" className="attendance-empty">No students below the attendance threshold.</td></tr>}
                {lowAttendance.map((student) => {
                  const id = student.id || student._id;
                  return <tr key={id}>
                    <td><strong>{student.name}</strong><small>Roll {student.rollNo ?? "—"} · {student.email}</small></td>
                    <td>{student.class || "—"}{student.batch ? ` · ${student.batch}` : ""}</td>
                    <td><span className="attendance-percent below-target">{student.attendanceSummary?.attendancePercentage ?? 0}%</span></td>
                    <td>{student.whatsappNumber || "No WhatsApp number"}</td>
                    <td><button type="button" className="attendance-alert-button" disabled={!student.whatsappNumber || Boolean(busyId)} onClick={() => sendAlert(student)}>{busyId === id ? "Sending…" : "Send reminder"}</button></td>
                  </tr>;
                })}
                {loading && <tr><td colSpan="5" className="attendance-empty">Loading students…</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}

export default AdminAttendance;
