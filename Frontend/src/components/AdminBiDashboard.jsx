import { useCallback, useEffect, useMemo, useState } from "react";
import { adminService } from "../services/adminService";
import "./AdminBiDashboard.css";

const initialOverview = {
  totalStudents: 0,
  totalCompletedLectures: 0,
  totalSessionsAttended: 0,
  attendancePercentage: 0,
  students: [],
};

const emptyStudents = [];
const numberValue = (value) => Number(value) || 0;

function AdminBiDashboard({ admin, onBack }) {
  const [overview, setOverview] = useState(initialOverview);
  const [filters, setFilters] = useState({
    className: "all",
    division: "all",
    attendance: "all",
    search: "",
    sort: "attendance-desc",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await adminService.getAttendanceOverview();
      setOverview({ ...initialOverview, ...(result.data || {}) });
    } catch (requestError) {
      setError(requestError.message || "Unable to load BI dashboard data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(loadDashboard);
  }, [loadDashboard]);

  const students = Array.isArray(overview.students) ? overview.students : emptyStudents;
  const classes = useMemo(
    () => [...new Set(students.map((student) => student.class).filter(Boolean))].sort(),
    [students],
  );
  const divisions = useMemo(
    () => [
      ...new Set(
        students
          .filter((student) => filters.className === "all" || student.class === filters.className)
          .map((student) => student.division)
          .filter(Boolean),
      ),
    ].sort(),
    [students, filters.className],
  );

  const filteredStudents = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    const filtered = students.filter((student) => {
      const rate = numberValue(student.attendancePercentage);
      const matchesSearch =
        !query ||
        [student.name, student.rollNo, student.class, student.division]
          .some((value) => String(value || "").toLowerCase().includes(query));

      return (
        (filters.className === "all" || student.class === filters.className) &&
        (filters.division === "all" || student.division === filters.division) &&
        (filters.attendance === "all" ||
          (filters.attendance === "at-risk" && rate < 75) ||
          (filters.attendance === "on-track" && rate >= 75)) &&
        matchesSearch
      );
    });

    return filtered.sort((left, right) => {
      if (filters.sort === "attendance-asc") {
        return numberValue(left.attendancePercentage) - numberValue(right.attendancePercentage);
      }
      if (filters.sort === "sessions-desc") {
        return numberValue(right.totalSessionsConducted) - numberValue(left.totalSessionsConducted);
      }
      return numberValue(right.attendancePercentage) - numberValue(left.attendancePercentage);
    });
  }, [students, filters]);

  const metrics = useMemo(() => {
    const sessions = filteredStudents.reduce(
      (totals, student) => ({
        conducted: totals.conducted + numberValue(student.totalSessionsConducted),
        attended: totals.attended + numberValue(student.totalSessionsAttended),
      }),
      { conducted: 0, attended: 0 },
    );

    return {
      studentCount: filteredStudents.length,
      attendance: sessions.conducted
        ? Number(((sessions.attended / sessions.conducted) * 100).toFixed(1))
        : 0,
      sessionsAttended: sessions.attended,
      atRisk: filteredStudents.filter(
        (student) => numberValue(student.attendancePercentage) < 75,
      ).length,
    };
  }, [filteredStudents]);

  const classPerformance = useMemo(() => {
    const groups = new Map();
    for (const student of filteredStudents) {
      const name = student.class || "Unassigned";
      const group = groups.get(name) || { name, attended: 0, conducted: 0 };
      group.attended += numberValue(student.totalSessionsAttended);
      group.conducted += numberValue(student.totalSessionsConducted);
      groups.set(name, group);
    }

    return [...groups.values()]
      .map((group) => ({
        ...group,
        rate: group.conducted ? (group.attended / group.conducted) * 100 : 0,
      }))
      .sort((left, right) => right.rate - left.rate);
  }, [filteredStudents]);

  const distribution = useMemo(
    () => [
      { label: "Below 50%", min: 0, max: 50, color: "critical" },
      { label: "50–74%", min: 50, max: 75, color: "watch" },
      { label: "75–89%", min: 75, max: 90, color: "good" },
      { label: "90–100%", min: 90, max: 101, color: "excellent" },
    ].map((band) => ({
      ...band,
      count: filteredStudents.filter((student) => {
        const rate = numberValue(student.attendancePercentage);
        return rate >= band.min && rate < band.max;
      }).length,
    })),
    [filteredStudents],
  );

  const updateFilter = (key, value) => {
    setFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === "className" ? { division: "all" } : {}),
    }));
  };

  return (
    <section className="admin-bi">
      <header className="admin-bi-header">
        <div>
          <button type="button" className="admin-bi-back" onClick={onBack}>
            ← Dashboard
          </button>
          <p className="admin-bi-eyebrow">ADMIN WORKSPACE · BI ANALYTICS</p>
          <h2>Attendance insights</h2>
          <p className="admin-bi-subtitle">
            Explore student participation by class, division, and performance band.
          </p>
        </div>
        <button type="button" className="admin-bi-refresh" onClick={loadDashboard} disabled={loading}>
          {loading ? "Loading…" : "↻ Refresh"}
        </button>
      </header>

      {error && <p className="admin-bi-error" role="alert">{error}</p>}

      <section className="admin-bi-filters" aria-label="Dashboard filters">
        <label>
          Class
          <select value={filters.className} onChange={(event) => updateFilter("className", event.target.value)}>
            <option value="all">All classes</option>
            {classes.map((className) => <option key={className} value={className}>{className}</option>)}
          </select>
        </label>
        <label>
          Division
          <select value={filters.division} onChange={(event) => updateFilter("division", event.target.value)}>
            <option value="all">All divisions</option>
            {divisions.map((division) => <option key={division} value={division}>{division}</option>)}
          </select>
        </label>
        <label>
          Attendance
          <select value={filters.attendance} onChange={(event) => updateFilter("attendance", event.target.value)}>
            <option value="all">All performance</option>
            <option value="at-risk">At risk (&lt; 75%)</option>
            <option value="on-track">On track (≥ 75%)</option>
          </select>
        </label>
        <label>
          Find student
          <input
            type="search"
            placeholder="Name or roll number"
            value={filters.search}
            onChange={(event) => updateFilter("search", event.target.value)}
          />
        </label>
        <label>
          Sort by
          <select value={filters.sort} onChange={(event) => updateFilter("sort", event.target.value)}>
            <option value="attendance-desc">Highest attendance</option>
            <option value="attendance-asc">Lowest attendance</option>
            <option value="sessions-desc">Most sessions</option>
          </select>
        </label>
      </section>

      <p className="admin-bi-scope">
        {loading ? "Loading attendance data…" : `Showing ${filteredStudents.length} of ${students.length} students`}
        <span>All-time completed-lecture data · {admin?.name || "Administrator"}</span>
      </p>

      <section className="admin-bi-kpis" aria-label="Filtered attendance metrics">
        {[
          ["Students in view", metrics.studentCount, "blue"],
          ["Attendance rate", `${metrics.attendance}%`, "teal"],
          ["Sessions attended", metrics.sessionsAttended, "violet"],
          ["Below 75% target", metrics.atRisk, "amber"],
        ].map(([label, value, color]) => (
          <article className="admin-bi-kpi" key={label}>
            <span className={`admin-bi-kpi-mark ${color}`} aria-hidden="true" />
            <span>{label}</span>
            <strong>{loading ? "—" : value}</strong>
          </article>
        ))}
      </section>

      <section className="admin-bi-charts" aria-label="Attendance visualizations">
        <article className="admin-bi-panel">
          <div className="admin-bi-panel-heading">
            <div><h3>Attendance by class</h3><p>Weighted by applicable student sessions.</p></div>
            <span className="admin-bi-chart-tag">CLASS COMPARISON</span>
          </div>
          {classPerformance.length ? (
            <div className="admin-bi-bars">
              {classPerformance.map((group) => (
                <div className="admin-bi-bar-row" key={group.name}>
                  <span title={group.name}>{group.name}</span>
                  <div className="admin-bi-bar-track">
                    <div className="admin-bi-bar-fill" style={{ width: `${Math.min(group.rate, 100)}%` }} />
                  </div>
                  <strong>{group.rate.toFixed(1)}%</strong>
                </div>
              ))}
            </div>
          ) : <p className="admin-bi-empty">No student records match these filters.</p>}
        </article>

        <article className="admin-bi-panel">
          <div className="admin-bi-panel-heading">
            <div><h3>Student performance</h3><p>Students grouped by attendance rate.</p></div>
            <span className="admin-bi-chart-tag">DISTRIBUTION</span>
          </div>
          <div className="admin-bi-distribution">
            {distribution.map((band) => {
              const share = metrics.studentCount ? (band.count / metrics.studentCount) * 100 : 0;
              return (
                <div className="admin-bi-distribution-row" key={band.label}>
                  <span>{band.label}</span>
                  <div className="admin-bi-bar-track">
                    <div className={`admin-bi-bar-fill ${band.color}`} style={{ width: `${share}%` }} />
                  </div>
                  <strong>{band.count}</strong>
                </div>
              );
            })}
          </div>
        </article>
      </section>

      <section className="admin-bi-panel admin-bi-table-panel">
        <div className="admin-bi-panel-heading">
          <div><h3>Student performance details</h3><p>Individual attendance rates and session counts.</p></div>
          <span className="admin-bi-result-count">{filteredStudents.length} results</span>
        </div>
        <div className="admin-bi-table-wrap">
          <table className="admin-bi-table">
            <thead>
              <tr><th>Student</th><th>Class / division</th><th>Attended</th><th>Sessions</th><th>Attendance</th></tr>
            </thead>
            <tbody>
              {!loading && filteredStudents.length === 0 && (
                <tr><td colSpan="5" className="admin-bi-empty">No students match these filters.</td></tr>
              )}
              {filteredStudents.map((student, index) => {
                const rate = numberValue(student.attendancePercentage);
                return (
                  <tr key={student.studentId || student.rollNo || `${student.name}-${index}`}>
                    <td><strong>{student.name || "Student"}</strong><small>Roll {student.rollNo ?? "—"}</small></td>
                    <td>{student.class || "—"}{student.division ? ` / ${student.division}` : ""}</td>
                    <td>{numberValue(student.totalSessionsAttended)}</td>
                    <td>{numberValue(student.totalSessionsConducted)}</td>
                    <td><span className={`admin-bi-rate ${rate < 75 ? "below-target" : ""}`}>{rate.toFixed(1)}%</span></td>
                  </tr>
                );
              })}
              {loading && <tr><td colSpan="5" className="admin-bi-empty">Loading student insights…</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <p className="admin-bi-footnote">
        Attendance is calculated from completed lectures. Approved flagged records count as present.
      </p>
    </section>
  );
}

export default AdminBiDashboard;
