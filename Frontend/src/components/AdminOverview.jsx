import { useEffect, useState } from "react";
import { adminService } from "../services/adminService";
import "./AdminOverview.css";

const initialStats = {
  totalStudents: 0,
  totalProfessors: 0,
  activeProfessors: 0,
  totalClassrooms: 0,
  activeClassrooms: 0,
  todaysLectures: 0,
  completedLectures: 0,
  overallAttendancePercentage: 0,
};

function AdminOverview({ admin, onNavigate }) {
  const [stats, setStats] = useState(initialStats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadStats = async () => {
    try {
      const result = await adminService.getDashboardStats();
      setStats({ ...initialStats, ...(result.stats || {}) });
    } catch (requestError) {
      setError(requestError.message || "Unable to load dashboard statistics.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.resolve().then(loadStats);
  }, []);

  const refreshStats = () => {
    setLoading(true);
    setError("");
    loadStats();
  };

  const cards = [
    { label: "Students", value: stats.totalStudents, note: "Enrolled records", icon: "ST", color: "blue" },
    { label: "Professors", value: stats.totalProfessors, note: `${stats.activeProfessors} active`, icon: "PR", color: "violet" },
    { label: "Classrooms", value: stats.totalClassrooms, note: `${stats.activeClassrooms} active`, icon: "RM", color: "teal" },
    { label: "Today's lectures", value: stats.todaysLectures, note: `${stats.completedLectures} completed overall`, icon: "LE", color: "amber" },
  ];

  return (
    <div className="admin-overview">
      <section className="admin-welcome">
        <div>
          <p className="admin-overline">YOUR CAMPUS AT A GLANCE</p>
          <h2>Welcome back, {admin.name || "Admin"}</h2>
          <p>Keep classes moving and attendance organized from one workspace.</p>
        </div>
        <button className="admin-refresh" type="button" onClick={refreshStats} disabled={loading}>
          {loading ? "Refreshing…" : "↻ Refresh"}
        </button>
      </section>

      {error && <p className="admin-error" role="alert">{error}</p>}

      <section className="admin-stat-grid" aria-label="Campus statistics">
        {cards.map((card) => (
          <article className="admin-stat-card" key={card.label}>
            <span className={`admin-stat-icon ${card.color}`}>{card.icon}</span>
            <span className="admin-stat-label">{card.label}</span>
            <strong>{loading ? "—" : card.value}</strong>
            <small>{card.note}</small>
          </article>
        ))}
      </section>

      <section className="admin-attendance-highlight">
        <div className="admin-attendance-copy">
          <span className="admin-attendance-icon">✓</span>
          <div>
            <h3>Overall attendance</h3>
            <p>Calculated from completed lectures and approved records.</p>
          </div>
        </div>
        <div className="admin-attendance-value">
          <strong>{loading ? "—" : `${stats.overallAttendancePercentage}%`}</strong>
          <span>campus average</span>
        </div>
      </section>

      <section className="admin-quick-actions">
        <div className="admin-section-heading">
          <div>
            <h3>Quick actions</h3>
            <p>Jump into a workspace module.</p>
          </div>
        </div>
        <div className="admin-action-grid">
          {[
            ["students", "Manage students", "Add, update, import and review student records.", "01"],
            ["professors", "Manage professors", "Manage teaching staff and subject assignments.", "02"],
            ["classrooms", "Schedule a lecture", "Set up classes, locations and lecture times.", "03"],
            ["attendance", "Review attendance", "Explore reports, low attendance and flagged scans.", "04"],
          ].map(([section, title, detail, number]) => (
            <button className="admin-action-card" type="button" key={section} onClick={() => onNavigate(section)}>
              <span>{number}</span>
              <div><strong>{title}</strong><small>{detail}</small></div>
              <b aria-hidden="true">→</b>
            </button>
          ))}
        </div>
      </section>

      <footer className="dashboard-footer">
        <span>DQRSmartAttendance</span>
        <span>Live data from your campus workspace</span>
      </footer>
    </div>
  );
}

export default AdminOverview;
