
import { useCallback, useEffect, useState } from "react";
import { professorService } from "../services/professorService";
import "./ProfessorManagement.css";

const emptyForm = {
  name: "",
  email: "",
  subjects: "",
  assignedClasses: "",
};

function toList(value) {
  if (Array.isArray(value)) return value.join(" | ");
  return value || "";
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
  URL.revokeObjectURL(url);
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
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadProfessors = useCallback(async (searchText = "") => {
    setLoading(true);
    setError("");

    try {
      const data = await professorService.getProfessors(searchText);

      const list = Array.isArray(data)
        ? data
        : data.professors || data.data || [];

      setProfessors(list);
    } catch (err) {
      setError(err.message || "Professors load nahi ho sake.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(loadProfessors);
  }, [loadProfessors]);

  const handleSearch = (event) => {
    event.preventDefault();
    loadProfessors(search);
  };

  const startAdd = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
    setError("");
    setNotice("");
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
    setError("");
    setNotice("");
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

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
        setNotice("Professor details updated successfully.");
      } else {
        await professorService.addProfessor(professorData);
        setNotice("Professor added successfully.");
      }

      setShowForm(false);
      setForm(emptyForm);
      setEditingId(null);
      await loadProfessors(search);
    } catch (err) {
      setError(err.message || "Professor save nahi ho sake.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (professor) => {
    const id = professor._id || professor.id;

    if (!id) {
      setError("Professor ID nahi mila. Status change nahi ho sakta.");
      return;
    }

    const isActive = professor.isActive !== false;
    const action = isActive ? "deactivate" : "activate";

    const confirmed = window.confirm(
      `Kya aap ${professor.name} ka account ${action} karna chahte hain?`
    );

    if (!confirmed) return;

    setChangingStatusId(id);
    setError("");
    setNotice("");

    try {
      if (isActive) {
        await professorService.deactivateProfessor(id);
      } else {
        await professorService.reactivateProfessor(id);
      }

      setNotice(
        `${professor.name} ka account ${
          isActive ? "deactivate" : "activate"
        } ho gaya.`
      );

      await loadProfessors(search);
    } catch (err) {
      setError(err.message || "Professor status update nahi ho saka.");
    } finally {
      setChangingStatusId(null);
    }
  };

  const handleBulkUpload = async (event) => {
    event.preventDefault();

    if (!selectedFile) {
      setError("Pehle CSV ya XLSX file select karein.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const result = await professorService.bulkUpload(selectedFile);

      setNotice(result.message || "Bulk upload request completed.");
      setSelectedFile(null);
      event.currentTarget.reset();
      await loadProfessors(search);
    } catch (err) {
      setError(err.message || "Bulk upload failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="professor-management">
      <div className="pm-header">
        <div>
          <p className="pm-eyebrow">ADMIN MANAGEMENT</p>
          <h2>Professor Management</h2>
          <p>Add professors, assign subjects and manage professor records.</p>
        </div>

        <button
          className="pm-secondary-btn"
          onClick={onBack}
          type="button"
        >
          ← Overview
        </button>
      </div>

      <div className="pm-stats">
        <article className="pm-stat-card">
          <span>Total professors</span>
          <strong>{professors.length}</strong>
        </article>

        <article className="pm-stat-card">
          <span>Registered</span>
          <strong>
            {professors.filter((item) => item.isRegistered).length}
          </strong>
        </article>

        <article className="pm-stat-card">
          <span>Pending registration</span>
          <strong>
            {professors.filter((item) => !item.isRegistered).length}
          </strong>
        </article>
      </div>

      {error && (
        <p className="pm-message pm-error" role="alert">
          {error}
        </p>
      )}

      {notice && (
        <p className="pm-message pm-success" role="status">
          {notice}
        </p>
      )}

      <div className="pm-panel">
        <div className="pm-panel-heading">
          <div>
            <h3>Professor records</h3>
            <p>Search, add and update professor information.</p>
          </div>

          <button
            className="pm-primary-btn"
            onClick={startAdd}
            type="button"
          >
            + Add Professor
          </button>
        </div>

        <form className="pm-search" onSubmit={handleSearch}>
          <input
            type="search"
            placeholder="Search by name, email, subject or class..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <button className="pm-secondary-btn" type="submit">
            Search
          </button>

          <button
            className="pm-secondary-btn"
            type="button"
            onClick={() => {
              setSearch("");
              loadProfessors("");
            }}
          >
            Reset
          </button>
        </form>

        {showForm && (
          <form className="pm-form" onSubmit={handleSave}>
            <h3>{editingId ? "Edit Professor" : "Add Professor"}</h3>

            <div className="pm-form-grid">
              <label>
                Professor name
                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  required
                />
              </label>

              <label>
                Email address
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm({ ...form, email: event.target.value })
                  }
                  disabled={Boolean(editingId)}
                  required
                />
                {editingId && (
                  <small>
                    Registered professor ka email yahan change nahi hoga.
                  </small>
                )}
              </label>

              <label>
                Subjects
                <input
                  value={form.subjects}
                  onChange={(event) =>
                    setForm({ ...form, subjects: event.target.value })
                  }
                  placeholder="Java | Python | DBMS"
                />
                <small>Multiple subjects ko | se separate karein.</small>
              </label>

              <label>
                Assigned classes
                <input
                  value={form.assignedClasses}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      assignedClasses: event.target.value,
                    })
                  }
                  placeholder="TYBSC-CS | SYBSC-CS"
                />
                <small>Multiple classes ko | se separate karein.</small>
              </label>
            </div>

            <div className="pm-form-actions">
              <button
                className="pm-primary-btn"
                disabled={saving}
                type="submit"
              >
                {saving
                  ? "Saving..."
                  : editingId
                    ? "Update Professor"
                    : "Save Professor"}
              </button>

              <button
                className="pm-secondary-btn"
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                  setForm(emptyForm);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="pm-table-wrap">
          <table className="pm-table">
            <thead>
              <tr>
                <th>Professor</th>
                <th>Subjects</th>
                <th>Assigned classes</th>
                <th>Registration</th>
                <th>Account</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="pm-empty">
                    Loading professors...
                  </td>
                </tr>
              ) : professors.length === 0 ? (
                <tr>
                  <td colSpan="6" className="pm-empty">
                    No professors found.
                  </td>
                </tr>
              ) : (
                professors.map((professor) => {
                  const id = professor._id || professor.id;
                  const isActive = professor.isActive !== false;
                  const isChanging = changingStatusId === id;

                  return (
                    <tr key={id || professor.email}>
                      <td>
                        <strong>{professor.name}</strong>
                        <small className="pm-email">{professor.email}</small>
                      </td>

                      <td>{toList(professor.subjects) || "—"}</td>

                      <td>{toList(professor.assignedClasses) || "—"}</td>

                      <td>
                        <span
                          className={`pm-status ${
                            professor.isRegistered
                              ? "pm-registered"
                              : "pm-pending"
                          }`}
                        >
                          {professor.isRegistered ? "Registered" : "Pending"}
                        </span>
                      </td>

                      <td>
                        <span
                          className={`pm-status ${
                            isActive ? "pm-registered" : "pm-inactive"
                          }`}
                        >
                          {isActive ? "Active" : "Inactive"}
                        </span>
                      </td>

                      <td>
                        <div className="pm-row-actions">
                          <button
                            className="pm-edit-btn"
                            type="button"
                            onClick={() => startEdit(professor)}
                          >
                            Edit
                          </button>

                          <button
                            className={`pm-toggle-btn ${
                              isActive ? "pm-deactivate-btn" : "pm-activate-btn"
                            }`}
                            type="button"
                            disabled={isChanging || loading}
                            onClick={() => handleToggleStatus(professor)}
                          >
                            {isChanging
                              ? "Please wait..."
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

        <button
          className="pm-refresh-btn"
          type="button"
          onClick={() => loadProfessors(search)}
          disabled={loading}
        >
          ↻ Refresh list
        </button>
      </div>

      <div className="pm-panel pm-upload-panel">
        <div className="pm-panel-heading">
          <div>
            <h3>Bulk upload professors</h3>
            <p>Import multiple professor records using a supported file.</p>
          </div>

          <button
            className="pm-secondary-btn"
            type="button"
            onClick={downloadProfessorTemplate}
          >
            ↓ Download Excel Template
          </button>
        </div>

        <p className="pm-upload-help">
          <strong>Step 1:</strong> Download the template and open it in Excel.
          <br />
          <strong>Step 2:</strong> Replace the demo row with actual professor
          details.
          <br />
          <strong>Step 3:</strong> Save as CSV or XLSX and upload below.
          <br />
          <br />
          Required columns: name, email, subjects, class. Separate multiple
          subjects or classes with |. Remove the demo row before uploading.
        </p>

        <form className="pm-upload-form" onSubmit={handleBulkUpload}>
          <input
            type="file"
            accept=".csv,.xlsx"
            onChange={(event) =>
              setSelectedFile(event.target.files?.[0] || null)
            }
          />

          <button
            className="pm-primary-btn"
            type="submit"
            disabled={saving}
          >
            {saving ? "Uploading..." : "Upload file"}
          </button>
        </form>
      </div>
    </section>
  );
}

export default ProfessorManagement;
