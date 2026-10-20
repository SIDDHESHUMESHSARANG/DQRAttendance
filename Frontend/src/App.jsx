import { useState } from "react";
import "./App.css";

import StudentManagement from "./components/StudentManagement";
import ProfessorManagement from "./components/ProfessorManagement";
import ClassroomManagement from "./components/ClassroomManagement";
import AdminAttendance from "./components/AdminAttendance";
import AdminOverview from "./components/AdminOverview";
import Professor from "./Professor.jsx";
import StudentPortal from "./StudentPortal.jsx";
import { studentPortalService } from "./services/studentPortalService";
import { API_BASE_URL } from "./services/apiConfig";

const API_URL = `${API_BASE_URL}/admin`;
const PROFESSOR_API_URL = `${API_BASE_URL}/professors`;

function getStudentDeviceId() {
  const key = "studentDeviceUuid";
  let deviceId = localStorage.getItem(key);
  if (!deviceId) {
    deviceId = window.crypto?.randomUUID?.() ||
      `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(key, deviceId);
  }
  return deviceId;
}

// Reusable API request function
async function apiRequest(endpoint, body, baseURL = API_URL) {
  const response = await fetch(`${baseURL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Request failed. Please try again.");
  }

  return data;
}

// Role information
const roleDetails = {
  admin: {
    title: "Admin",
    description: "Manage students, professors and attendance.",
    icon: "🛡️",
  },
  professor: {
    title: "Professor",
    description: "Manage lectures and student attendance.",
    icon: "🎓",
  },
  student: {
    title: "Student",
    description: "View attendance and scan QR codes.",
    icon: "📚",
  },
};

function App() {
  // Restore the saved session when the page loads
  const [page, setPage] = useState(() => {
    try {
      if (
        localStorage.getItem("adminToken") &&
        localStorage.getItem("adminData")
      ) {
        return "dashboard";
      }

      if (
        localStorage.getItem("professorToken") &&
        localStorage.getItem("professorData")
      ) {
        return "professorDashboard";
      }
      if (localStorage.getItem("studentToken")) {
        return "studentDashboard";
      }
    } catch {
      return "roles";
    }

    return "roles";
  });

  // Authentication state
  const [role, setRole] = useState("admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Dashboard state
  const [dashboardMenuOpen, setDashboardMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("overview");

  // Restore Admin details
  const [admin, setAdmin] = useState(() => {
    try {
      const token = localStorage.getItem("adminToken");
      const savedAdmin = localStorage.getItem("adminData");

      if (token && savedAdmin) {
        const parsed = JSON.parse(savedAdmin);

        if (parsed && typeof parsed === "object") {
          return parsed;
        }
      }
    } catch {
      localStorage.removeItem("adminToken");
      localStorage.removeItem("adminData");
    }

    return null;
  });

  // Restore Professor details
  const [professor, setProfessor] = useState(() => {
    try {
      const token = localStorage.getItem("professorToken");
      const savedProfessor = localStorage.getItem("professorData");

      if (token && savedProfessor) {
        const parsed = JSON.parse(savedProfessor);

        if (parsed && typeof parsed === "object") {
          return parsed;
        }
      }
    } catch {
      localStorage.removeItem("professorToken");
      localStorage.removeItem("professorData");
    }

    return null;
  });

  // Common page navigation
  const changePage = (nextPage) => {
    setPage(nextPage);
    setError("");
    setNotice("");
  };

  // Select Admin, Professor or Student
  const selectRole = (nextRole) => {
    setRole(nextRole);
    setEmail("");
    setPassword("");
    setName("");
    setOtp("");
    setShowPassword(false);
    setError("");
    setNotice("");
    setPage("login");
  };

  // Login
  const handleLogin = async (event) => {
    event.preventDefault();

    setLoading(true);
    setError("");
    setNotice("");

    if (role === "student") {
      try {
        const data = await studentPortalService.login(
          email.trim(),
          password,
          getStudentDeviceId()
        );

        if (!data.token) {
          throw new Error("Invalid response received from Student server.");
        }

        localStorage.setItem("studentToken", data.token);
        localStorage.removeItem("adminToken");
        localStorage.removeItem("adminData");
        localStorage.removeItem("professorToken");
        localStorage.removeItem("professorData");
        setAdmin(null);
        setProfessor(null);
        setPassword("");
        setPage("studentDashboard");
      } catch (err) {
        setError(
          err instanceof TypeError
            ? "Cannot connect to the backend. Check that the server is running."
            : err.message
        );
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      if (role === "admin") {
        const data = await apiRequest("/login", {
          email: email.trim(),
          password,
        });

        if (!data.token || !data.admin) {
          throw new Error("Invalid response received from Admin server.");
        }

        localStorage.setItem("adminToken", data.token);
        localStorage.setItem("adminData", JSON.stringify(data.admin));

        localStorage.removeItem("professorToken");
        localStorage.removeItem("professorData");

        setAdmin(data.admin);
        setProfessor(null);
        setPassword("");
        setDashboardMenuOpen(false);
        setActiveSection("overview");
        setPage("dashboard");
      } else if (role === "professor") {
        const data = await apiRequest(
          "/login",
          {
            email: email.trim(),
            password,
          },
          PROFESSOR_API_URL
        );

        if (!data.token || !data.professor) {
          throw new Error("Invalid response received from Professor server.");
        }

        localStorage.setItem("professorToken", data.token);
        localStorage.setItem(
          "professorData",
          JSON.stringify(data.professor)
        );

        localStorage.removeItem("adminToken");
        localStorage.removeItem("adminData");

        setProfessor(data.professor);
        setAdmin(null);
        setPassword("");
        setDashboardMenuOpen(false);
        setPage("professorDashboard");
      }
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "Cannot connect to the backend. Check that the server is running."
          : err.message
      );
    } finally {
      setLoading(false);
    }
  };

  // Registration
  const handleRegister = async (event) => {
    event.preventDefault();

    setLoading(true);
    setError("");
    setNotice("");

    try {
      if (role === "admin") {
        await apiRequest("/register", {
          name: name.trim(),
          email: email.trim(),
          password,
        });

        setPassword("");
        setOtp("");
        setPage("verify");
        setNotice("OTP sent successfully. Check your registered email.");
      } else if (role === "professor") {
        // Professor email must already be registered by Admin.
        await apiRequest(
          "/register",
          {
            email: email.trim(),
          },
          PROFESSOR_API_URL
        );

        setPassword("");
        setOtp("");
        setPage("verify");
        setNotice("OTP sent successfully. Check your registered email.");
      } else {
        await studentPortalService.requestOtp(email.trim());
        setPassword("");
        setOtp("");
        setPage("verify");
        setNotice("Activation OTP sent. Check your registered email.");
      }
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "Cannot connect to the backend. Check that the server is running."
          : err.message
      );
    } finally {
      setLoading(false);
    }
  };

  // Verify OTP
  const handleVerifyOTP = async (event) => {
    event.preventDefault();

    setLoading(true);
    setError("");
    setNotice("");

    try {
      if (role === "admin") {
        await apiRequest("/verify-otp", {
          email: email.trim(),
          otp: otp.trim(),
        });

        setPassword("");
        setOtp("");
        setName("");
        setPage("login");
        setNotice("Account verified successfully. You can now sign in.");
      } else if (role === "professor") {
        if (password.length < 8) {
          throw new Error("Password must be at least 8 characters long.");
        }

        await apiRequest(
          "/verify-otp",
          {
            email: email.trim(),
            otp: otp.trim(),
            password,
          },
          PROFESSOR_API_URL
        );

        setPassword("");
        setOtp("");
        setPage("login");
        setNotice("Account activated successfully. You can now sign in.");
      } else {
        if (password.length < 8) {
          throw new Error("Password must be at least 8 characters long.");
        }

        await studentPortalService.verifyOtp(
          email.trim(),
          otp.trim(),
          password
        );
        setPassword("");
        setOtp("");
        setPage("login");
        setNotice("Account activated successfully. You can now sign in.");
      }
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "Cannot connect to the backend. Check that the server is running."
          : err.message
      );
    } finally {
      setLoading(false);
    }
  };

  // Admin logout
  const handleLogout = async () => {
    const token = localStorage.getItem("adminToken");

    try {
      if (token) {
        await fetch(`${API_URL}/logout`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      }
    } catch {
      // Clear the local session even if the backend is unreachable.
    } finally {
      localStorage.removeItem("adminToken");
      localStorage.removeItem("adminData");
      localStorage.removeItem("professorToken");
      localStorage.removeItem("professorData");

      setAdmin(null);
      setProfessor(null);
      setEmail("");
      setPassword("");
      setName("");
      setOtp("");
      setRole("admin");
      setDashboardMenuOpen(false);
      setActiveSection("overview");
      setPage("roles");
      setError("");
      setNotice("");
    }
  };

  // Professor logout
  const handleProfessorLogout = () => {
    localStorage.removeItem("professorToken");
    localStorage.removeItem("professorData");

    setProfessor(null);
    setEmail("");
    setPassword("");
    setName("");
    setOtp("");
    setRole("professor");
    setDashboardMenuOpen(false);
    setPage("roles");
    setError("");
    setNotice("");
  };

  const handleStudentLogout = () => {
    localStorage.removeItem("studentToken");
    setEmail("");
    setPassword("");
    setRole("student");
    setPage("roles");
    setError("");
    setNotice("");
  };

  // Return to role selection
  const backToRoles = () => {
    setEmail("");
    setPassword("");
    setName("");
    setOtp("");
    setShowPassword(false);
    changePage("roles");
  };

  // Open an Admin dashboard section
  const openSection = (section) => {
    setActiveSection(section);
    setDashboardMenuOpen(false);
    setError("");
    setNotice("");
  };

  // =====================================================
  // PROFESSOR DASHBOARD
  // Render the separate Professor.jsx component.
  // =====================================================
  if (page === "professorDashboard" && professor) {
    return <Professor onLogout={handleProfessorLogout} />;
  }

  if (page === "studentDashboard") {
    return <StudentPortal onLogout={handleStudentLogout} />;
  }

  // =====================================================
  // ADMIN DASHBOARD
  // =====================================================
  if (page === "dashboard" && admin) {
    const adminName = admin.name || "Admin";

    const initials = adminName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("");

    const sectionTitles = {
      overview: "Overview",
      students: "Students",
      professors: "Professors",
      classrooms: "Classrooms",
      attendance: "Attendance",
    };

    return (
      <main className="dashboard-shell">
        <aside
          className={`dashboard-sidebar ${
            dashboardMenuOpen ? "sidebar-open" : ""
          }`}
        >
          <a
            className="dashboard-brand"
            href="#dashboard"
            onClick={(event) => {
              event.preventDefault();
              openSection("overview");
            }}
          >
            <span className="dashboard-brand-mark">Q</span>
            <span className="dashboard-brand-name">
              DQRAttendance
              <small>ADMIN WORKSPACE</small>
            </span>
          </a>

          <div className="sidebar-section-label">WORKSPACE</div>

          <nav className="dashboard-nav" aria-label="Admin navigation">
            <button
              type="button"
              className={`dashboard-nav-item ${
                activeSection === "overview" ? "active" : ""
              }`}
              onClick={() => openSection("overview")}
            >
              <span className="nav-symbol">▦</span>
              <span>Overview</span>
            </button>

            <div className="sidebar-section-label">MANAGEMENT</div>

            <button
              type="button"
              className={`dashboard-nav-item ${
                activeSection === "students" ? "active" : ""
              }`}
              onClick={() => openSection("students")}
            >
              <span className="nav-symbol">♙</span>
              <span>Students</span>
            </button>

            <button
              type="button"
              className={`dashboard-nav-item ${
                activeSection === "professors" ? "active" : ""
              }`}
              onClick={() => openSection("professors")}
            >
              <span className="nav-symbol">♧</span>
              <span>Professors</span>
            </button>

            <button
              type="button"
              className={`dashboard-nav-item ${
                activeSection === "classrooms" ? "active" : ""
              }`}
              onClick={() => openSection("classrooms")}
            >
              <span className="nav-symbol">▤</span>
              <span>Classrooms</span>
            </button>

            <button
              type="button"
              className={`dashboard-nav-item ${
                activeSection === "attendance" ? "active" : ""
              }`}
              onClick={() => openSection("attendance")}
            >
              <span className="nav-symbol">✓</span>
              <span>Attendance</span>
            </button>
          </nav>

          <div className="sidebar-bottom">
            <div className="sidebar-admin">
              <span className="admin-avatar">{initials || "A"}</span>
              <span className="sidebar-admin-info">
                <strong>{adminName}</strong>
                <small>Administrator</small>
              </span>
            </div>

            <button
              className="dashboard-logout"
              type="button"
              onClick={handleLogout}
            >
              <span>↪</span>
              Sign out
            </button>
          </div>
        </aside>

        {dashboardMenuOpen && (
          <button
            className="dashboard-overlay"
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setDashboardMenuOpen(false)}
          />
        )}

        <section className="dashboard-main">
          <header className="dashboard-topbar">
            <div className="dashboard-topbar-left">
              <button
                className="dashboard-menu-toggle"
                type="button"
                aria-label="Toggle navigation"
                aria-expanded={dashboardMenuOpen}
                onClick={() =>
                  setDashboardMenuOpen((current) => !current)
                }
              >
                <span />
                <span />
                <span />
              </button>

              <div>
                <div className="dashboard-breadcrumb">
                  Workspace <span>/</span>{" "}
                  {sectionTitles[activeSection] || "Overview"}
                </div>
                <h1>Dashboard</h1>
              </div>
            </div>

            <div className="dashboard-topbar-right">
              <div className="topbar-date">
                <span className="status-dot" />
                Signed in
              </div>
              <div className="topbar-avatar" title={adminName}>
                {initials || "A"}
              </div>
            </div>
          </header>

          <div className="dashboard-content" id="dashboard-overview">
            {activeSection === "students" ? (
              <StudentManagement
                onBack={() => openSection("overview")}
              />
            ) : activeSection === "professors" ? (
              <ProfessorManagement
                onBack={() => openSection("overview")}
              />
            ) : activeSection === "classrooms" ? (
              <ClassroomManagement
                onBack={() => openSection("overview")}
              />
            ) : activeSection === "overview" ? (
              <AdminOverview admin={admin} onNavigate={openSection} />
            ) : activeSection === "attendance" ? (
              <AdminAttendance onBack={() => openSection("overview")} />
            ) : (
              <section className="dashboard-section">
                <div className="section-heading">
                  <div>
                    <p className="dashboard-overline">MANAGEMENT</p>
                    <h3>{sectionTitles[activeSection]}</h3>
                    <p>Select a workspace section from the navigation menu.</p>
                  </div>
                </div>

                <button
                  className="primary-button"
                  type="button"
                  onClick={() => openSection("overview")}
                >
                  ← Back to Overview
                </button>
              </section>
            )}
          </div>
        </section>
      </main>
    );
  }

  // =====================================================
  // ROLE SELECTION, LOGIN, REGISTRATION AND OTP
  // =====================================================
  return (
    <main className="auth-page">
      <header className="auth-header">
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            backToRoles();
          }}
        >
          <span className="brand-mark">QR</span>
          <span>DQRAttendance</span>
        </a>

        <span className="header-caption">
          ATTENDANCE MANAGEMENT
        </span>
      </header>

      {page === "roles" ? (
        <section className="role-selection">
          <div className="role-heading">
            <span className="mobile-brand-mark">QR</span>
            <p className="eyebrow">WELCOME</p>
            <h1>Select your role</h1>
            <p className="form-description">
              Choose how you want to access DQRAttendance.
            </p>
          </div>

          <div className="role-grid">
            {Object.entries(roleDetails).map(([key, item]) => (
              <button
                className="role-card"
                type="button"
                key={key}
                onClick={() => selectRole(key)}
              >
                <span className={`role-icon role-icon-${key}`}>
                  {item.icon}
                </span>

                <span className="role-card-title">{item.title}</span>

                <span className="role-card-description">
                  {item.description}
                </span>

                <span className="role-card-action">
                  Continue <span aria-hidden="true">→</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="auth-layout">
          <aside className="intro-panel">
            <div className="intro-content">
              <span className="intro-tag">DQRAttendance</span>

              <h1>
                Attendance
                <br />
                management,
                <br />
                <span>simplified.</span>
              </h1>

              <p>{roleDetails[role].description}</p>
              <div className="intro-divider" />

              <div className="intro-point">
                <span className="point-symbol">01</span>
                <span>Role-based access</span>
              </div>

              <div className="intro-point">
                <span className="point-symbol">02</span>
                <span>Secure account authentication</span>
              </div>

              <div className="intro-point">
                <span className="point-symbol">03</span>
                <span>Email verification for registration</span>
              </div>
            </div>

            <p className="intro-footer">DQRAttendance</p>
          </aside>

          <section className="form-panel">
            <div className="auth-card">
              <button
                className="back-button"
                type="button"
                onClick={backToRoles}
              >
                ← Change role
              </button>

              <div className="selected-role">
                <span className={`role-icon role-icon-${role}`}>
                  {roleDetails[role].icon}
                </span>
                <span>{roleDetails[role].title}</span>
              </div>

              {/* LOGIN */}
              {page === "login" && (
                <>
                  <p className="eyebrow">WELCOME BACK</p>
                  <h2>Login</h2>

                  <p className="form-description">
                    Sign in to your {roleDetails[role].title.toLowerCase()}{" "}
                    account.
                  </p>

                  {notice && (
                    <p className="message success-message" role="status">
                      {notice}
                    </p>
                  )}

                  <form onSubmit={handleLogin}>
                    <div className="form-group">
                      <label htmlFor="login-email">
                        Email address
                      </label>

                      <input
                        id="login-email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        autoComplete="username"
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="login-password">
                        Password
                      </label>

                      <div className="password-field">
                        <input
                          id="login-password"
                          type={showPassword ? "text" : "password"}
                          placeholder="Enter your password"
                          value={password}
                          onChange={(event) =>
                            setPassword(event.target.value)
                          }
                          autoComplete="current-password"
                          required
                        />

                        <button
                          className="text-button"
                          type="button"
                          onClick={() =>
                            setShowPassword((current) => !current)
                          }
                        >
                          {showPassword ? "Hide" : "Show"}
                        </button>
                      </div>
                    </div>

                    {error && (
                      <p className="message error-message" role="alert">
                        {error}
                      </p>
                    )}

                    <button
                      className="primary-button"
                      type="submit"
                      disabled={loading}
                    >
                      {loading ? "Signing in..." : "Login"}
                      {!loading && <span aria-hidden="true"> →</span>}
                    </button>
                  </form>

                  <div className="form-switch">
                    <span>New user?</span>

                    <button
                      className="text-button link-button"
                      type="button"
                      onClick={() => {
                        setPassword("");
                        setError("");
                        setNotice("");
                        changePage("register");
                      }}
                    >
                      Register
                    </button>
                  </div>
                </>
              )}

              {/* REGISTRATION */}
              {page === "register" && (
                <>
                  <p className="eyebrow">CREATE ACCOUNT</p>
                  <h2>Register</h2>

                  <p className="form-description">
                    {role === "admin"
                      ? "Enter your details to create an Admin account."
                      : role === "professor"
                      ? "Enter the email already registered by Admin. We will send an OTP to verify your email."
                      : "Activate the student account created for you by your Admin using your registered email."}
                  </p>

                  <form onSubmit={handleRegister}>
                    {role === "admin" && (
                      <div className="form-group">
                        <label htmlFor="register-name">
                          Full name
                        </label>

                        <input
                          id="register-name"
                          type="text"
                          placeholder="Enter your full name"
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                          autoComplete="name"
                          required
                        />
                      </div>
                    )}

                    <div className="form-group">
                      <label htmlFor="register-email">
                        Email address
                      </label>

                      <input
                        id="register-email"
                        type="email"
                        placeholder="Enter your registered email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        autoComplete="email"
                        required
                      />
                    </div>

                    {role === "admin" && (
                      <div className="form-group">
                        <label htmlFor="register-password">
                          Create password
                        </label>

                        <div className="password-field">
                          <input
                            id="register-password"
                            type={showPassword ? "text" : "password"}
                            placeholder="At least 8 characters"
                            value={password}
                            onChange={(event) =>
                              setPassword(event.target.value)
                            }
                            autoComplete="new-password"
                            minLength={8}
                            required
                          />

                          <button
                            className="text-button"
                            type="button"
                            onClick={() =>
                              setShowPassword((current) => !current)
                            }
                          >
                            {showPassword ? "Hide" : "Show"}
                          </button>
                        </div>
                      </div>
                    )}

                    {error && (
                      <p className="message error-message" role="alert">
                        {error}
                      </p>
                    )}

                    <button
                      className="primary-button"
                      type="submit"
                      disabled={loading}
                    >
                      {loading ? "Please wait..." : "Send OTP"}
                      {!loading && <span aria-hidden="true"> →</span>}
                    </button>
                  </form>

                  <div className="form-switch">
                    <span>Already registered?</span>

                    <button
                      className="text-button link-button"
                      type="button"
                      onClick={() => changePage("login")}
                    >
                      Login
                    </button>
                  </div>
                </>
              )}

              {/* OTP VERIFICATION */}
              {page === "verify" && (
                <>
                  <div className="otp-icon" aria-hidden="true">
                    ✉
                  </div>

                  <p className="eyebrow">EMAIL VERIFICATION</p>
                  <h2>Verify your email</h2>

                  <p className="form-description">
                    Enter the 6-digit OTP sent to <strong>{email}</strong>.
                    The code expires after 3 minutes.
                  </p>

                  {notice && (
                    <p className="message success-message" role="status">
                      {notice}
                    </p>
                  )}

                  <form onSubmit={handleVerifyOTP}>
                    <div className="form-group">
                      <label htmlFor="otp">
                        Verification code
                      </label>

                      <input
                        id="otp"
                        className="otp-input"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="000000"
                        value={otp}
                        onChange={(event) =>
                          setOtp(
                            event.target.value.replace(/\D/g, "").slice(0, 6)
                          )
                        }
                        pattern="[0-9]{6}"
                        maxLength={6}
                        minLength={6}
                        required
                      />
                    </div>

                    {(role === "professor" || role === "student") && (
                      <div className="form-group">
                        <label htmlFor="account-new-password">
                          Create password
                        </label>

                        <div className="password-field">
                          <input
                            id="account-new-password"
                            type={showPassword ? "text" : "password"}
                            placeholder="At least 8 characters"
                            value={password}
                            onChange={(event) =>
                              setPassword(event.target.value)
                            }
                            autoComplete="new-password"
                            minLength={8}
                            required
                          />

                          <button
                            className="text-button"
                            type="button"
                            onClick={() =>
                              setShowPassword((current) => !current)
                            }
                          >
                            {showPassword ? "Hide" : "Show"}
                          </button>
                        </div>
                      </div>
                    )}

                    {error && (
                      <p className="message error-message" role="alert">
                        {error}
                      </p>
                    )}

                    <button
                      className="primary-button"
                      type="submit"
                      disabled={
                        loading ||
                        otp.length !== 6 ||
                        ((role === "professor" || role === "student") &&
                          password.length < 8)
                      }
                    >
                      {loading
                        ? "Verifying..."
                        : role === "professor" || role === "student"
                        ? "Verify OTP and create password"
                        : "Verify email"}
                    </button>
                  </form>

                  <p className="otp-help">
                    If the OTP expires, return to registration and request
                    another code.
                  </p>
                </>
              )}

              <div className="security-note">
                <span aria-hidden="true">◆</span>
                <span>Secure role-based access</span>
              </div>
            </div>
          </section>
        </section>
      )}

      <footer className="page-footer">
        <span>
          © {new Date().getFullYear()} DQRAttendance
        </span>
        <span>SECURE ATTENDANCE MANAGEMENT</span>
      </footer>
    </main>
  );
}

export default App;
