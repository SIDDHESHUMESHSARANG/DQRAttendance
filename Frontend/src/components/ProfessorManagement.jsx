import { useCallback, useEffect, useState } from "react";
import { Toaster, toast } from "react-hot-toast";
import { professorService } from "../services/professorService";

const emptyForm = {
  name: "",
  email: "",
  subjects: "",
  assignedClasses: "",
};

const THEME = {
  primary: "#1E1B4B",
  primaryHover: "#312E81",
  primaryLight: "#EEF2FF",
  background: "#F8FAFC",
  white: "#FFFFFF",
  border: "#E2E8F0",
  text: "#1E1B4B",
  muted: "#64748B",
  success: "#166534",
  successBg: "#DCFCE7",
  warning: "#92400E",
  warningBg: "#FEF3C7",
  danger: "#B91C1C",
  dangerBg: "#FEE2E2",
};

function toList(value) {
  if (Array.isArray(value)) return value.join(" | ");
  return value || "";
}

/* Toast: short duration and readable on mobile/desktop */
function showSuccess(message) {
  toast.success(message, {
    duration: 2000,
    position: "top-center",
    style: {
      background: "#166534",
      color: "#FFFFFF",
      padding: "13px 18px",
      borderRadius: "10px",
      fontSize: "15px",
      fontWeight: "600",
      lineHeight: 1.5,
      maxWidth: "calc(100vw - 32px)",
      boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
    },
  });
}

function showError(message) {
  toast.error(message, {
    duration: 3000,
    position: "top-center",
    style: {
      background: "#991B1B",
      color: "#FFFFFF",
      padding: "13px 18px",
      borderRadius: "10px",
      fontSize: "15px",
      fontWeight: "600",
      lineHeight: 1.5,
      maxWidth: "calc(100vw - 32px)",
      boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
    },
  });
}

function downloadProfessorTemplate() {
  const rows = [
    ["name", "email", "subjects", "class"],
    [
      "Demo Professor",
      "demo.professor@example.com",
      "Java|Python",
      "SYBSC-CS",
    ],
  ];

  const csvContent =
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\r\n");

  const blob = new Blob([csvContent], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "Professor_Bulk_Upload_Template.csv";

  document.body.appendChild(link);
  link.click();
  link.remove();

  // Give the browser time to begin the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  showSuccess("CSV template downloaded successfully.");
}

function ProfessorManagement({ onBack }) {
  const [professors, setProfessors] = useState([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [changingStatusId, setChangingStatusId] = useState(null);

  // Custom centered confirmation modal
  const [confirmProfessor, setConfirmProfessor] = useState(null);

  const loadProfessors = useCallback(async (searchText = "") => {
    setLoading(true);

    try {
      const data = await professorService.getProfessors(searchText);
      const list = Array.isArray(data)
        ? data
        : data?.professors || data?.data || [];

      setProfessors(list);
    } catch (err) {
      showError(err.message || "Failed to load professors list.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(loadProfessors);
  }, [loadProfessors]);

  const handleSearch = (event) => {
    event.preventDefault();
    loadProfessors(search.trim());
  };

  const handleResetSearch = () => {
    setSearch("");
    loadProfessors("");
  };

  const startAdd = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  };

  const startEdit = (professor) => {
    setForm({
      name: professor.name || "",
      email: professor.email || "",
      subjects: toList(professor.subjects),
      assignedClasses: toList(professor.assignedClasses),
    });

    setEditingId(professor._id || professor.id);
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSave = async (event) => {
    event.preventDefault();

    if (saving) return;

    setSaving(true);

    const professorData = {
      name: form.name.trim(),
      email: form.email.trim(),
      subjects: form.subjects
        .split("|")
        .map((item) => item.trim())
        .filter(Boolean),
      assignedClasses: form.assignedClasses
        .split("|")
        .map((item) => item.trim())
        .filter(Boolean),
    };

    try {
      if (editingId) {
        await professorService.updateProfessor(editingId, professorData);
        showSuccess("Professor details updated successfully.");
      } else {
        await professorService.addProfessor(professorData);
        showSuccess(
          "Professor added successfully. Registration is pending until activation."
        );
      }

      setShowForm(false);
      setForm(emptyForm);
      setEditingId(null);

      await loadProfessors(search.trim());
    } catch (err) {
      showError(err.message || "Could not save professor details.");
    } finally {
      setSaving(false);
    }
  };

  // Open the custom confirmation modal instead of window.confirm().
  const handleToggleStatus = (professor) => {
    const id = professor._id || professor.id;

    if (!id) {
      showError("Professor record ID is missing.");
      return;
    }

    if (changingStatusId !== null) return;

    setConfirmProfessor(professor);
  };

  // Runs only after the user clicks the modal's confirmation button.
  const confirmToggleStatus = async () => {
    if (!confirmProfessor || changingStatusId !== null) return;

    const professor = confirmProfessor;
    const id = professor._id || professor.id;
    const isActive = professor.isActive !== false;

    setConfirmProfessor(null);
    setChangingStatusId(id);

    try {
      if (isActive) {
        await professorService.deactivateProfessor(id);
        showSuccess("Professor account deactivated successfully.");
      } else {
        await professorService.reactivateProfessor(id);
        showSuccess("Professor account activated successfully.");
      }

      await loadProfessors(search.trim());
    } catch (err) {
      showError(err.message || "Failed to change professor account status.");
    } finally {
      setChangingStatusId(null);
    }
  };

  const handleBulkUpload = async (event) => {
    event.preventDefault();

    if (saving) return;

    if (!selectedFile) {
      showError("Please select a CSV or Excel file before uploading.");
      return;
    }

    setSaving(true);

    try {
      const result = await professorService.bulkUpload(selectedFile);

      showSuccess(
        result?.message || "Professor file uploaded successfully."
      );

      setSelectedFile(null);

      const fileInput = document.getElementById("professor-bulk-file");
      if (fileInput) fileInput.value = "";

      await loadProfessors(search.trim());
    } catch (err) {
      showError(
        err.message || "Bulk upload failed. Please check the file and try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const registeredCount = professors.filter(
    (item) => item.isRegistered
  ).length;

  const pendingCount = professors.filter(
    (item) => !item.isRegistered
  ).length;

  const activeCount = professors.filter(
    (item) => item.isActive !== false
  ).length;

  const isConfirmActive =
    confirmProfessor && confirmProfessor.isActive !== false;

  const styles = {
    page: {
      width: "100%",
      maxWidth: "1200px",
      margin: "0 auto",
      padding: "8px 0 32px",
      color: THEME.text,
      boxSizing: "border-box",
      fontFamily: "Inter, Arial, sans-serif",
    },

    header: {
      display: "flex",
      flexWrap: "wrap",
      justifyContent: "space-between",
      alignItems: "center",
      gap: "16px",
      marginBottom: "28px",
      paddingBottom: "22px",
      borderBottom: `2px solid ${THEME.border}`,
    },

    eyebrow: {
      margin: "0 0 7px",
      fontSize: "12px",
      fontWeight: "800",
      letterSpacing: "1.2px",
      color: THEME.muted,
    },

    pageTitle: {
      margin: 0,
      fontSize: "clamp(22px, 3vw, 30px)",
      fontWeight: "800",
      lineHeight: 1.3,
      color: THEME.primary,
    },

    subtitle: {
      margin: "7px 0 0",
      color: THEME.muted,
      fontSize: "14px",
      lineHeight: 1.6,
    },

    section: {
      background: THEME.white,
      border: `1px solid ${THEME.border}`,
      borderRadius: "14px",
      padding: "clamp(16px, 3vw, 26px)",
      marginBottom: "26px",
      boxShadow: "0 4px 16px rgba(30, 27, 75, 0.045)",
      minWidth: 0,
      boxSizing: "border-box",
    },

    sectionHeader: {
      display: "flex",
      flexWrap: "wrap",
      justifyContent: "space-between",
      alignItems: "center",
      gap: "14px",
      marginBottom: "22px",
    },

    sectionTitle: {
      margin: 0,
      color: THEME.primary,
      fontSize: "19px",
      fontWeight: "800",
      lineHeight: 1.4,
    },

    sectionSubtitle: {
      margin: "5px 0 0",
      color: THEME.muted,
      fontSize: "13px",
      lineHeight: 1.6,
    },

    divider: {
      height: "1px",
      background: THEME.border,
      border: 0,
      margin: "22px 0",
    },

    input: {
      width: "100%",
      minWidth: 0,
      minHeight: "44px",
      padding: "11px 13px",
      border: `1px solid ${THEME.border}`,
      borderRadius: "8px",
      fontSize: "14px",
      lineHeight: 1.5,
      color: THEME.text,
      background: THEME.white,
      outline: "none",
      boxSizing: "border-box",
    },

    label: {
      display: "block",
      marginBottom: "8px",
      fontSize: "13px",
      fontWeight: "700",
      color: THEME.primary,
    },

    field: {
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
    },

    primaryButton: {
      minHeight: "44px",
      padding: "11px 17px",
      border: `1px solid ${THEME.primary}`,
      borderRadius: "8px",
      background: THEME.primary,
      color: THEME.white,
      fontSize: "14px",
      fontWeight: "700",
      cursor: "pointer",
      display: "inline-flex",
      justifyContent: "center",
      alignItems: "center",
      gap: "8px",
      whiteSpace: "nowrap",
    },

    outlineButton: {
      minHeight: "44px",
      padding: "10px 15px",
      border: `1px solid ${THEME.border}`,
      borderRadius: "8px",
      background: THEME.white,
      color: THEME.primary,
      fontSize: "14px",
      fontWeight: "700",
      cursor: "pointer",
      display: "inline-flex",
      justifyContent: "center",
      alignItems: "center",
      gap: "7px",
      whiteSpace: "nowrap",
    },

    smallButton: {
      minHeight: "36px",
      padding: "8px 11px",
      border: `1px solid ${THEME.border}`,
      borderRadius: "7px",
      background: THEME.white,
      color: THEME.primary,
      fontSize: "12px",
      fontWeight: "700",
      cursor: "pointer",
      whiteSpace: "nowrap",
    },

    formPanel: {
      padding: "clamp(16px, 2.5vw, 22px)",
      background: "#F8FAFF",
      border: "1px solid #DDE4FF",
      borderRadius: "12px",
      marginBottom: "26px",
    },

    fieldGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 230px), 1fr))",
      gap: "20px",
    },

    tableWrapper: {
      width: "100%",
      overflowX: "auto",
      border: `1px solid ${THEME.border}`,
      borderRadius: "10px",
      background: THEME.white,
    },

    table: {
      width: "100%",
      minWidth: "850px",
      borderCollapse: "collapse",
      textAlign: "left",
    },

    th: {
      padding: "15px 16px",
      background: "#F1F5F9",
      borderBottom: `2px solid ${THEME.border}`,
      color: THEME.primary,
      fontSize: "12px",
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: "0.4px",
      whiteSpace: "nowrap",
    },

    td: {
      padding: "16px",
      borderBottom: `1px solid ${THEME.border}`,
      fontSize: "13px",
      verticalAlign: "middle",
      lineHeight: 1.6,
    },

    emptyState: {
      padding: "32px 16px",
      textAlign: "center",
      color: THEME.muted,
      fontSize: "14px",
    },

    statusBadge: {
      display: "inline-block",
      padding: "6px 11px",
      borderRadius: "20px",
      fontSize: "12px",
      fontWeight: "800",
      whiteSpace: "nowrap",
    },

    analyticsGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
      gap: "18px",
      marginBottom: "28px",
    },

    analyticsCard: {
      padding: "21px",
      background: THEME.white,
      border: `1px solid ${THEME.border}`,
      borderRadius: "12px",
      boxShadow: "0 3px 12px rgba(30, 27, 75, 0.035)",
    },

    analyticsLabel: {
      display: "block",
      color: THEME.muted,
      fontSize: "13px",
      fontWeight: "600",
      lineHeight: 1.5,
    },

    analyticsValue: {
      display: "block",
      marginTop: "10px",
      color: THEME.primary,
      fontSize: "30px",
      fontWeight: "800",
    },

    searchForm: {
      display: "flex",
      flexWrap: "wrap",
      gap: "10px",
      marginBottom: "22px",
      alignItems: "center",
    },

    actionGroup: {
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
      gap: "8px",
    },

    helperText: {
      margin: "8px 0 0",
      fontSize: "12px",
      color: THEME.muted,
      lineHeight: 1.6,
    },
  };

  return (
    <div style={styles.page}>
      {/* Toast messages appear around the center of the screen. */}
      <Toaster
        position="top-center"
        containerStyle={{
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: 99999,
        }}
        toastOptions={{
          duration: 2000,
        }}
      />

      {/* Page header */}
      <header style={styles.header}>
        <div>
          <p style={styles.eyebrow}>ADMIN PANEL / FACULTY</p>
          <h2 style={styles.pageTitle}>Professors Directory</h2>
          <p style={styles.subtitle}>
            Manage professor details, assigned subjects, classes and account status.
          </p>
        </div>

        <button
          style={styles.outlineButton}
          onClick={onBack}
          type="button"
        >
          ← Back to Overview
        </button>
      </header>

      {/* Analytics cards */}
      <div style={styles.analyticsGrid}>
        <div style={{ ...styles.analyticsCard, borderTop: "4px solid #4F46E5" }}>
          <span style={styles.analyticsLabel}>Total Faculty</span>
          <strong style={styles.analyticsValue}>{professors.length}</strong>
          <p style={styles.helperText}>
            Professors in the current list or search results.
          </p>
        </div>

        <div style={{ ...styles.analyticsCard, borderTop: "4px solid #16A34A" }}>
          <span style={styles.analyticsLabel}>Registered Professors</span>
          <strong style={styles.analyticsValue}>{registeredCount}</strong>
          <p style={styles.helperText}>
            Professors who have completed registration.
          </p>
        </div>

        <div style={{ ...styles.analyticsCard, borderTop: "4px solid #D97706" }}>
          <span style={styles.analyticsLabel}>Pending Registration</span>
          <strong style={styles.analyticsValue}>{pendingCount}</strong>
          <p style={styles.helperText}>
            Professors who have not completed activation.
          </p>
        </div>

        <div style={{ ...styles.analyticsCard, borderTop: "4px solid #0284C7" }}>
          <span style={styles.analyticsLabel}>Active Accounts</span>
          <strong style={styles.analyticsValue}>{activeCount}</strong>
          <p style={styles.helperText}>
            Accounts currently marked active.
          </p>
        </div>
      </div>

      {/* Faculty records section */}
      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <div>
            <h3 style={styles.sectionTitle}>Faculty Records</h3>
            <p style={styles.sectionSubtitle}>
              Search, edit and manage professor accounts.
            </p>
          </div>

          <button
            style={styles.primaryButton}
            onClick={startAdd}
            type="button"
          >
            + Add Professor
          </button>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} style={styles.searchForm}>
          <input
            style={{ ...styles.input, flex: "1 1 280px" }}
            type="search"
            placeholder="Search by name, email, subject or class..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search professors"
          />

          <button
            style={styles.primaryButton}
            type="submit"
            disabled={loading}
          >
            {loading ? "Searching..." : "Search"}
          </button>

          <button
            style={styles.outlineButton}
            type="button"
            onClick={handleResetSearch}
            disabled={loading}
          >
            Reset
          </button>
        </form>

        {/* Add/Edit professor form */}
        {showForm && (
          <form onSubmit={handleSave} style={styles.formPanel}>
            <div style={styles.sectionHeader}>
              <div>
                <h3 style={styles.sectionTitle}>
                  {editingId ? "Edit Professor" : "Add New Professor"}
                </h3>
                <p style={styles.sectionSubtitle}>
                  Separate multiple subjects or classes using the | symbol.
                </p>
              </div>
            </div>

            <div style={styles.fieldGrid}>
              <div style={styles.field}>
                <label style={styles.label} htmlFor="professor-name">
                  Full Name *
                </label>
                <input
                  id="professor-name"
                  style={styles.input}
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  placeholder="Enter professor name"
                  autoComplete="name"
                  required
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label} htmlFor="professor-email">
                  Email Address *
                </label>
                <input
                  id="professor-email"
                  type="email"
                  style={styles.input}
                  value={form.email}
                  onChange={(event) =>
                    setForm({ ...form, email: event.target.value })
                  }
                  placeholder="professor@example.com"
                  autoComplete="email"
                  disabled={Boolean(editingId)}
                  required
                />
                {editingId && (
                  <p style={styles.helperText}>
                    Email cannot be changed from this form.
                  </p>
                )}
              </div>

              <div style={styles.field}>
                <label style={styles.label} htmlFor="professor-subjects">
                  Subjects
                </label>
                <input
                  id="professor-subjects"
                  style={styles.input}
                  value={form.subjects}
                  onChange={(event) =>
                    setForm({ ...form, subjects: event.target.value })
                  }
                  placeholder="Java | Python | DBMS"
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label} htmlFor="professor-classes">
                  Assigned Classes
                </label>
                <input
                  id="professor-classes"
                  style={styles.input}
                  value={form.assignedClasses}
                  onChange={(event) =>
                    setForm({ ...form, assignedClasses: event.target.value })
                  }
                  placeholder="TYBSC-CS | SYBSC-CS"
                />
              </div>
            </div>

            <hr style={styles.divider} />

            <div style={styles.actionGroup}>
              <button
                style={{
                  ...styles.primaryButton,
                  opacity: saving ? 0.65 : 1,
                  cursor: saving ? "not-allowed" : "pointer",
                }}
                disabled={saving}
                type="submit"
              >
                {saving
                  ? "Saving..."
                  : editingId
                    ? "Save Changes"
                    : "Add Professor"}
              </button>

              <button
                style={styles.outlineButton}
                type="button"
                onClick={cancelForm}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Professor table */}
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Professor</th>
                <th style={styles.th}>Subjects</th>
                <th style={styles.th}>Assigned Classes</th>
                <th style={styles.th}>Registration</th>
                <th style={styles.th}>Account Status</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={styles.emptyState}>
                    Loading professor records...
                  </td>
                </tr>
              ) : professors.length === 0 ? (
                <tr>
                  <td colSpan={6} style={styles.emptyState}>
                    <strong style={{ display: "block", marginBottom: "6px" }}>
                      No professors found
                    </strong>
                    Try another search or use Add Professor to create a record.
                  </td>
                </tr>
              ) : (
                professors.map((professor) => {
                  const id = professor._id || professor.id;
                  const isActive = professor.isActive !== false;

                  return (
                    <tr key={id || professor.email}>
                      <td style={styles.td}>
                        <strong
                          style={{
                            display: "block",
                            color: THEME.primary,
                            fontSize: "14px",
                          }}
                        >
                          {professor.name || "Unnamed Professor"}
                        </strong>
                        <span
                          style={{
                            display: "block",
                            marginTop: "4px",
                            color: THEME.muted,
                            overflowWrap: "anywhere",
                          }}
                        >
                          {professor.email}
                        </span>
                      </td>

                      <td style={styles.td}>
                        {toList(professor.subjects) || "—"}
                      </td>

                      <td style={styles.td}>
                        {toList(professor.assignedClasses) || "—"}
                      </td>

                      <td style={styles.td}>
                        <span
                          style={{
                            ...styles.statusBadge,
                            background: professor.isRegistered
                              ? THEME.successBg
                              : THEME.warningBg,
                            color: professor.isRegistered
                              ? THEME.success
                              : THEME.warning,
                          }}
                        >
                          {professor.isRegistered ? "Registered" : "Pending"}
                        </span>
                      </td>

                      <td style={styles.td}>
                        <span
                          style={{
                            ...styles.statusBadge,
                            background: isActive
                              ? THEME.successBg
                              : THEME.dangerBg,
                            color: isActive
                              ? THEME.success
                              : THEME.danger,
                          }}
                        >
                          {isActive ? "Active" : "Inactive"}
                        </span>
                      </td>

                      <td style={styles.td}>
                        <div style={styles.actionGroup}>
                          <button
                            style={styles.smallButton}
                            type="button"
                            onClick={() => startEdit(professor)}
                          >
                            Edit
                          </button>

                          <button
                            style={{
                              ...styles.smallButton,
                              color: isActive ? THEME.danger : THEME.success,
                              borderColor: isActive ? "#FECACA" : "#BBF7D0",
                              opacity: changingStatusId === id ? 0.6 : 1,
                            }}
                            type="button"
                            disabled={!id || changingStatusId !== null}
                            onClick={() => handleToggleStatus(professor)}
                          >
                            {changingStatusId === id
                              ? "Updating..."
                              : isActive
                                ? "Deactivate"
                                : "Activate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            marginTop: "18px",
          }}
        >
          <p style={{ ...styles.helperText, margin: 0 }}>
            Showing {professors.length} professor record(s).
          </p>

          <button
            style={styles.outlineButton}
            type="button"
            onClick={() => loadProfessors(search.trim())}
            disabled={loading}
          >
            ↻ {loading ? "Refreshing..." : "Refresh List"}
          </button>
        </div>
      </section>

      {/* Bulk upload section */}
      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <div>
            <h3 style={styles.sectionTitle}>Bulk Upload Faculty</h3>
            <p style={styles.sectionSubtitle}>
              Add multiple professor records using a CSV or Excel file.
            </p>
          </div>

          <button
            style={styles.outlineButton}
            type="button"
            onClick={downloadProfessorTemplate}
          >
            ↓ Download CSV Template
          </button>
        </div>

        <hr style={styles.divider} />

        <form onSubmit={handleBulkUpload}>
          <div style={styles.field}>
            <label style={styles.label} htmlFor="professor-bulk-file">
              Select CSV or Excel File
            </label>

            <input
              id="professor-bulk-file"
              type="file"
              style={{
                ...styles.input,
                padding: "8px",
                background: THEME.white,
              }}
              accept=".csv,.xlsx"
              onChange={(event) =>
                setSelectedFile(event.target.files?.[0] || null)
              }
            />

            <p style={styles.helperText}>
              Use the downloaded template and keep the column headings unchanged.
              Supported formats: .csv and .xlsx.
            </p>

            {selectedFile && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: "10px",
                  padding: "12px 14px",
                  marginTop: "12px",
                  borderRadius: "8px",
                  border: "1px solid #C7D2FE",
                  background: THEME.primaryLight,
                  fontSize: "13px",
                  overflowWrap: "anywhere",
                }}
              >
                <span aria-hidden="true">📄</span>
                <strong>Selected file:</strong>
                <span>{selectedFile.name}</span>

                <button
                  type="button"
                  style={{
                    ...styles.smallButton,
                    marginLeft: "auto",
                  }}
                  onClick={() => {
                    setSelectedFile(null);
                    const fileInput = document.getElementById(
                      "professor-bulk-file"
                    );
                    if (fileInput) fileInput.value = "";
                  }}
                  disabled={saving}
                >
                  Remove
                </button>
              </div>
            )}
          </div>

          <hr style={styles.divider} />

          <div style={styles.actionGroup}>
            <button
              style={{
                ...styles.primaryButton,
                opacity: saving ? 0.65 : 1,
                cursor: saving ? "not-allowed" : "pointer",
              }}
              type="submit"
              disabled={saving}
            >
              {saving ? "Uploading File..." : "Upload Professors"}
            </button>
          </div>
        </form>
      </section>

      {/* Centered custom confirmation modal */}
      {confirmProfessor && (
        <div
          onClick={() => {
            if (changingStatusId === null) setConfirmProfessor(null);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100000,
            background: "rgba(15, 23, 42, 0.62)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "18px",
            boxSizing: "border-box",
            backdropFilter: "blur(3px)",
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="professor-confirm-title"
            aria-describedby="professor-confirm-description"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "440px",
              background: THEME.white,
              borderRadius: "16px",
              padding: "clamp(22px, 5vw, 30px)",
              boxSizing: "border-box",
              boxShadow: "0 24px 80px rgba(0,0,0,0.28)",
              border: `1px solid ${THEME.border}`,
              animation: "professorModalIn 160ms ease-out",
            }}
          >
            <div
              style={{
                width: "54px",
                height: "54px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "18px",
                background: isConfirmActive
                  ? THEME.dangerBg
                  : THEME.successBg,
                color: isConfirmActive
                  ? THEME.danger
                  : THEME.success,
                fontSize: "27px",
                fontWeight: "800",
              }}
            >
              {isConfirmActive ? "!" : "✓"}
            </div>

            <h3
              id="professor-confirm-title"
              style={{
                margin: "0 0 10px",
                fontSize: "22px",
                lineHeight: 1.35,
                color: THEME.primary,
                fontWeight: "800",
              }}
            >
              {isConfirmActive
                ? "Deactivate Professor?"
                : "Activate Professor?"}
            </h3>

            <p
              id="professor-confirm-description"
              style={{
                margin: "0 0 12px",
                color: "#475569",
                fontSize: "15px",
                lineHeight: 1.7,
                overflowWrap: "anywhere",
              }}
            >
              Are you sure you want to{" "}
              <strong>
                {isConfirmActive ? "deactivate" : "activate"}
              </strong>{" "}
              this professor account?
            </p>

            <div
              style={{
                padding: "13px 14px",
                background: THEME.background,
                border: `1px solid ${THEME.border}`,
                borderRadius: "9px",
                marginBottom: "24px",
              }}
            >
              <strong
                style={{
                  display: "block",
                  color: THEME.primary,
                  fontSize: "15px",
                  lineHeight: 1.5,
                  overflowWrap: "anywhere",
                }}
              >
                {confirmProfessor.name || "Unnamed Professor"}
              </strong>
              <span
                style={{
                  display: "block",
                  color: THEME.muted,
                  fontSize: "13px",
                  marginTop: "3px",
                  overflowWrap: "anywhere",
                }}
              >
                {confirmProfessor.email}
              </span>
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "flex-end",
                gap: "10px",
              }}
            >
              <button
                style={{
                  ...styles.outlineButton,
                  flex: "1 1 120px",
                }}
                type="button"
                onClick={() => setConfirmProfessor(null)}
                disabled={changingStatusId !== null}
              >
                Cancel
              </button>

              <button
                style={{
                  ...styles.primaryButton,
                  flex: "1 1 150px",
                  background: isConfirmActive
                    ? THEME.danger
                    : THEME.success,
                  borderColor: isConfirmActive
                    ? THEME.danger
                    : THEME.success,
                }}
                type="button"
                onClick={confirmToggleStatus}
                disabled={changingStatusId !== null}
              >
                {isConfirmActive
                  ? "Yes, Deactivate"
                  : "Yes, Activate"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>
        {`
          @keyframes professorModalIn {
            from {
              opacity: 0;
              transform: translateY(8px) scale(0.98);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }

          @media (max-width: 600px) {
            .professor-management-table {
              font-size: 12px;
            }
          }
        `}
      </style>
    </div>
  );
}

export default ProfessorManagement;
