
import { useCallback, useEffect, useState } from "react";
import { Toaster, toast } from "react-hot-toast";
import { studentService } from "../services/studentService";
import "./StudentManagement.css";

const emptyForm = {
  name: "",
  email: "",
  rollNo: "",
  batch: "",
  class: "",
  division: "",
  phone: "",
  whatsappNumber: "",
};

function getStudentId(student) {
  return student?.id || student?._id || "";
}

function getErrorMessage(error) {
  return error instanceof TypeError
    ? "Backend se connection nahi ho raha. Server check karein."
    : error?.message || "Kuch galat ho gaya. Dobara try karein.";
}

function downloadSampleCSV() {
  const csv = [
    "Name,Roll No,Class,Division,Email,Batch,Phone,WhatsApp Number",
    "Rahul Sharma,1,TYBCA,A,rahul@example.com,2026,9876543210,+919876543210",
  ].join("\r\n");

  const blob = new Blob(["\uFEFF", csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = "student-upload-template.csv";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
}

function StudentManagement({ onBack }) {
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingStudentId, setDeletingStudentId] = useState(null);
  const [resettingDeviceId, setResettingDeviceId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });

  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);

  const [historyStudent, setHistoryStudent] = useState(null);
  const [history, setHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [confirmDeleteStudent, setConfirmDeleteStudent] = useState(null);

  const loadStudents = useCallback(async (searchValue = "") => {
    setLoading(true);
    setError("");

    try {
      const result = await studentService.getStudents(searchValue);

      setStudents(
        Array.isArray(result?.students)
          ? result.students
          : Array.isArray(result?.data?.students)
            ? result.data.students
            : Array.isArray(result?.data)
              ? result.data
              : []
      );
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadStudents(search);
    }, 300);

    return () => clearTimeout(timer);
  }, [search, loadStudents]);

  const openAddForm = () => {
    setEditingStudent(null);
    setForm({ ...emptyForm });
    setError("");
    setNotice("");
    setShowForm(true);
  };

  const openEditForm = (student) => {
    setEditingStudent(student);

    setForm({
      name: student.name || "",
      email: student.email || "",
      rollNo: student.rollNo ?? "",
      batch: student.batch || "",
      class: student.class || "",
      division: student.division || "",
      phone: student.phone || "",
      whatsappNumber: student.whatsappNumber || "",
    });

    setError("");
    setNotice("");
    setShowForm(true);
  };

  const closeForm = () => {
    if (saving) return;

    setShowForm(false);
    setEditingStudent(null);
    setForm({ ...emptyForm });
  };

  const handleFormChange = (event) => {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleSaveStudent = async (event) => {
    event.preventDefault();

    if (saving) return;

    const rollNo = Number(form.rollNo);

    if (
      !form.name.trim() ||
      !form.email.trim() ||
      !Number.isInteger(rollNo) ||
      rollNo < 1 ||
      !form.class.trim() ||
      !form.division.trim()
    ) {
      const message =
        "Name, valid Roll Number, Email, Class aur Division check karein.";
      setError(message);
      toast.error(message);
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    const payload = {
      name: form.name.trim(),
      email: form.email.trim(),
      rollNo,
      batch: form.batch.trim(),
      class: form.class.trim(),
      division: form.division.trim(),
      phone: form.phone.trim(),
      whatsappNumber: form.whatsappNumber.trim(),
    };

    try {
      let result;

      if (editingStudent) {
        result = await studentService.updateStudent(
          getStudentId(editingStudent),
          payload
        );
      } else {
        result = await studentService.addStudent(payload);
      }

      const message =
        result?.message ||
        (editingStudent
          ? "Student details updated successfully."
          : "Student added successfully.");

      setNotice(message);
      toast.success(message);

      setShowForm(false);
      setEditingStudent(null);
      setForm({ ...emptyForm });

      await loadStudents(search);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  // Open the custom centered delete confirmation.
  const handleDeleteStudent = (student) => {
    const studentId = getStudentId(student);

    if (!studentId) {
      const message = "Student ID nahi mili. Student delete nahi hua.";
      setError(message);
      toast.error(message);
      return;
    }

    setError("");
    setNotice("");
    setConfirmDeleteStudent(student);
  };

  const cancelDelete = () => {
    if (deletingStudentId) return;
    setConfirmDeleteStudent(null);
  };

  // Existing delete service and refresh behavior preserved.
  const confirmDelete = async () => {
    if (!confirmDeleteStudent || deletingStudentId) return;

    const studentId = getStudentId(confirmDeleteStudent);

    if (!studentId) {
      toast.error("Student ID nahi mili. Student delete nahi hua.");
      setConfirmDeleteStudent(null);
      return;
    }

    setDeletingStudentId(studentId);
    setError("");
    setNotice("");

    try {
      const result = await studentService.deleteStudent(studentId);
      const message = result?.message || "Student deleted successfully.";

      setNotice(message);
      toast.success(message);
      setConfirmDeleteStudent(null);

      await loadStudents(search);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      toast.error(message);
    } finally {
      setDeletingStudentId(null);
    }
  };

  const handleResetTrustedDevice = async (student) => {
    const studentId = getStudentId(student);

    if (!studentId) {
      const message =
        "Student ID is missing. Trusted device was not reset.";
      setError(message);
      toast.error(message);
      return;
    }

    const confirmed = window.confirm(
      `Reset the trusted device for ${
        student.name || "this student"
      }? They will be able to sign in from a new device.`
    );

    if (!confirmed) return;

    setResettingDeviceId(studentId);
    setError("");
    setNotice("");

    try {
      const result = await studentService.resetTrustedDevice(studentId);
      const message =
        result?.message || "Trusted device reset successfully.";

      setNotice(message);
      toast.success(message);
    } catch (requestError) {
      const message = getErrorMessage(requestError);
      setError(message);
      toast.error(message);
    } finally {
      setResettingDeviceId(null);
    }
  };

  const handleUpload = async (event) => {
    event.preventDefault();

    if (uploading) return;

    if (!selectedFile) {
      const message = "Pehle CSV ya Excel file select karein.";
      setError(message);
      toast.error(message);
      return;
    }

    const allowedExtensions = /\.(csv|xlsx|xls)$/i;

    if (!allowedExtensions.test(selectedFile.name)) {
      const message = "Sirf CSV, XLSX ya XLS file upload karein.";
      setError(message);
      toast.error(message);
      return;
    }

    if (selectedFile.size > 5 * 1024 * 1024) {
      const message = "File size 5 MB se kam honi chahiye.";
      setError(message);
      toast.error(message);
      return;
    }

    setUploading(true);
    setError("");
    setNotice("");
    setUploadResult(null);

    try {
      const result = await studentService.bulkUpload(selectedFile);

      setUploadResult(result);
      setNotice(result?.message || "Bulk upload request completed.");
      toast.success(result?.message || "Bulk upload request completed.");

      setSelectedFile(null);

      const fileInput = document.getElementById("student-bulk-file");
      if (fileInput) fileInput.value = "";

      await loadStudents(search);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  const openAttendanceHistory = async (student) => {
    const studentId = getStudentId(student);

    if (!studentId) {
      const message = "Student ID nahi mili. Attendance history load nahi ho sakti.";
      setError(message);
      toast.error(message);
      return;
    }

    setHistoryStudent(student);
    setHistory(null);
    setHistoryLoading(true);
    setError("");

    try {
      const result = await studentService.getAttendanceHistory(studentId);

      setHistory(result?.data || result);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      toast.error(message);
    } finally {
      setHistoryLoading(false);
    }
  };

  const closeAttendanceHistory = () => {
    if (historyLoading) return;

    setHistoryStudent(null);
    setHistory(null);
  };

  useEffect(() => {
    const modalOpen =
      showForm ||
      Boolean(historyStudent) ||
      Boolean(confirmDeleteStudent);

    if (!modalOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;

      if (confirmDeleteStudent && !deletingStudentId) {
        setConfirmDeleteStudent(null);
      } else if (historyStudent && !historyLoading) {
        setHistoryStudent(null);
        setHistory(null);
      } else if (showForm && !saving) {
        setShowForm(false);
        setEditingStudent(null);
        setForm({ ...emptyForm });
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    showForm,
    historyStudent,
    historyLoading,
    confirmDeleteStudent,
    deletingStudentId,
    saving,
  ]);

  return (
    <section className="student-management">
      <Toaster
        position="top-center"
        containerStyle={{
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 110000,
          width: "100%",
          maxWidth: "460px",
          padding: "0 16px",
        }}
        toastOptions={{
          duration: 2000,
          style: {
            maxWidth: "100%",
            minWidth: "0",
            padding: "13px 17px",
            borderRadius: "12px",
            fontSize: "14px",
            fontWeight: 500,
            boxShadow: "0 12px 35px rgba(15, 23, 42, 0.18)",
          },
        }}
      />

      <header className="sm-header">
        <div className="sm-header-content">
          <button
            type="button"
            className="sm-back-button"
            onClick={onBack}
          >
            <span aria-hidden="true">←</span> Dashboard
          </button>

          <p className="sm-eyebrow">ADMIN WORKSPACE</p>
          <h2>Student Management</h2>
          <p className="sm-subtitle">
            Manage student records, import data and view attendance history.
          </p>
        </div>

        <button
          type="button"
          className="sm-primary-button"
          onClick={openAddForm}
        >
          <span aria-hidden="true">＋</span> Add Student
        </button>
      </header>

      {error && (
        <div className="sm-message sm-error" role="alert">
          <span aria-hidden="true">!</span>
          <span>{error}</span>
          <button
            type="button"
            className="sm-message-close"
            aria-label="Dismiss error"
            onClick={() => setError("")}
          >
            ×
          </button>
        </div>
      )}

      {notice && (
        <div className="sm-message sm-success" role="status">
          <span aria-hidden="true">✓</span>
          <span>{notice}</span>
          <button
            type="button"
            className="sm-message-close"
            aria-label="Dismiss message"
            onClick={() => setNotice("")}
          >
            ×
          </button>
        </div>
      )}

      <section className="sm-panel">
        <div className="sm-panel-heading">
          <div>
            <h3>Student records</h3>
            <p>Search by student name, roll number, class or batch.</p>
          </div>

          <span className="sm-count">
            {loading ? "Loading..." : `${students.length} records`}
          </span>
        </div>

        <div className="sm-search-row">
          <label className="sm-search-box">
            <span className="sm-search-icon" aria-hidden="true">
              ⌕
            </span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, roll no, class or batch..."
              aria-label="Search students"
            />
          </label>

          <button
            type="button"
            className="sm-secondary-button"
            onClick={() => loadStudents(search)}
            disabled={loading}
          >
            <span aria-hidden="true">↻</span> Refresh
          </button>
        </div>

        <div className="sm-table-wrap">
          <table className="sm-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Roll No.</th>
                <th>Class / Division</th>
                <th>Batch</th>
                <th>Email</th>
                <th>Phone</th>
                <th>WhatsApp</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {!loading && students.length === 0 && (
                <tr>
                  <td colSpan={8} className="sm-empty">
                    <span className="sm-empty-icon" aria-hidden="true">
                      ◌
                    </span>
                    <strong>No students found</strong>
                    <span>Try another search or add a new student.</span>
                  </td>
                </tr>
              )}

              {students.map((student) => (
                <tr key={getStudentId(student)}>
                  <td>
                    <div className="sm-student-cell">
                      <span className="sm-avatar" aria-hidden="true">
                        {(student.name || "S").trim().charAt(0).toUpperCase()}
                      </span>
                      <strong>{student.name || "—"}</strong>
                    </div>
                  </td>

                  <td>{student.rollNo ?? "—"}</td>

                  <td>
                    {student.class || "—"}
                    {student.division ? ` / ${student.division}` : ""}
                  </td>

                  <td>{student.batch || "—"}</td>
                  <td className="sm-email-cell">{student.email || "—"}</td>
                  <td>{student.phone || "—"}</td>
                  <td>{student.whatsappNumber || "—"}</td>

                  <td>
                    <div className="sm-actions">
                      <button
                        type="button"
                        className="sm-action-button sm-edit-action"
                        onClick={() => openEditForm(student)}
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        className="sm-action-button sm-history-action"
                        onClick={() => openAttendanceHistory(student)}
                        disabled={historyLoading}
                      >
                        History
                      </button>

                      <button
                        type="button"
                        className="sm-action-button sm-device-action"
                        onClick={() => handleResetTrustedDevice(student)}
                        disabled={
                          resettingDeviceId === getStudentId(student)
                        }
                      >
                        {resettingDeviceId === getStudentId(student)
                          ? "Resetting..."
                          : "Reset device"}
                      </button>

                      <button
                        type="button"
                        className="sm-action-button sm-delete-action"
                        onClick={() => handleDeleteStudent(student)}
                        disabled={deletingStudentId === getStudentId(student)}
                      >
                        {deletingStudentId === getStudentId(student)
                          ? "Deleting..."
                          : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {loading && (
                <tr>
                  <td colSpan={8} className="sm-empty">
                    <span className="sm-loading-spinner" />
                    <strong>Loading student records...</strong>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="sm-table-footer">
          <span>
            {loading
              ? "Fetching records..."
              : `Showing ${students.length} student record${
                  students.length === 1 ? "" : "s"
                }`}
          </span>
          <span>Scroll horizontally to view all columns.</span>
        </div>
      </section>

      <section className="sm-panel">
        <div className="sm-panel-heading">
          <div>
            <h3>Bulk upload</h3>
            <p>
              Import student records from a CSV or Excel spreadsheet.
              WhatsApp Number is optional; include the country code (for
              example, +919876543210) to enable attendance reminders.
              Maximum file size: 5 MB.
            </p>
          </div>

          <span className="sm-upload-icon" aria-hidden="true">
            ↑
          </span>
        </div>

        <button
          type="button"
          className="sm-secondary-button sm-template-button"
          onClick={downloadSampleCSV}
        >
          <span aria-hidden="true">↓</span> Download CSV template
        </button>

        <form className="sm-upload-form" onSubmit={handleUpload}>
          <label className="sm-file-label" htmlFor="student-bulk-file">
            Select CSV / Excel file
          </label>

          <input
            id="student-bulk-file"
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(event) =>
              setSelectedFile(event.target.files?.[0] || null)
            }
            disabled={uploading}
          />

          {selectedFile && (
            <div className="sm-selected-file">
              <span aria-hidden="true">▤</span>
              <span className="sm-file-name">{selectedFile.name}</span>
              <button
                type="button"
                className="sm-remove-file"
                onClick={() => {
                  setSelectedFile(null);

                  const fileInput =
                    document.getElementById("student-bulk-file");

                  if (fileInput) fileInput.value = "";
                }}
                aria-label="Remove selected file"
                disabled={uploading}
              >
                ×
              </button>
            </div>
          )}

          <button
            type="submit"
            className="sm-primary-button"
            disabled={!selectedFile || uploading}
          >
            {uploading ? "Uploading..." : "Upload students"}
          </button>
        </form>

        {uploadResult && (
          <div className="sm-upload-result" role="status">
            <h4>Upload summary</h4>

            <div className="sm-upload-stats">
              <div>
                <span>Total rows</span>
                <strong>{uploadResult.totalRows ?? "—"}</strong>
              </div>
              <div>
                <span>Imported</span>
                <strong>{uploadResult.importedCount ?? "—"}</strong>
              </div>
              <div>
                <span>Failed</span>
                <strong>{uploadResult.failedCount ?? "—"}</strong>
              </div>
            </div>

            {Array.isArray(uploadResult.errors) &&
              uploadResult.errors.length > 0 && (
                <details>
                  <summary>View import errors</summary>
                  <ul>
                    {uploadResult.errors.map((item, index) => (
                      <li key={index}>
                        {typeof item === "string"
                          ? item
                          : JSON.stringify(item)}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
          </div>
        )}
      </section>

      {/* Add / Edit Student Modal */}
      {showForm && (
        <div
          className="sm-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeForm();
          }}
        >
          <section
            className="sm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sm-student-form-title"
          >
            <header className="sm-modal-header">
              <div>
                <p className="sm-eyebrow">STUDENT RECORDS</p>
                <h3 id="sm-student-form-title">
                  {editingStudent ? "Edit student" : "Add student"}
                </h3>
                <p className="sm-modal-subtitle">
                  {editingStudent
                    ? "Update the student information below."
                    : "Enter the details to create a student record."}
                </p>
              </div>

              <button
                type="button"
                className="sm-close-button"
                aria-label="Close form"
                onClick={closeForm}
                disabled={saving}
              >
                ×
              </button>
            </header>

            <form onSubmit={handleSaveStudent}>
              <div className="sm-form-grid">
                <div className="sm-form-group">
                  <label htmlFor="sm-name">Full name *</label>
                  <input
                    id="sm-name"
                    name="name"
                    value={form.name}
                    onChange={handleFormChange}
                    placeholder="Enter full name"
                    required
                  />
                </div>

                <div className="sm-form-group">
                  <label htmlFor="sm-email">Email address *</label>
                  <input
                    id="sm-email"
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleFormChange}
                    placeholder="student@example.com"
                    required
                  />
                </div>

                <div className="sm-form-group">
                  <label htmlFor="sm-roll">Roll number *</label>
                  <input
                    id="sm-roll"
                    name="rollNo"
                    type="number"
                    min="1"
                    step="1"
                    value={form.rollNo}
                    onChange={handleFormChange}
                    placeholder="Enter roll number"
                    required
                  />
                </div>

                <div className="sm-form-group">
                  <label htmlFor="sm-class">Class / Course *</label>
                  <input
                    id="sm-class"
                    name="class"
                    value={form.class}
                    onChange={handleFormChange}
                    placeholder="e.g. TYBSc CS"
                    required
                  />
                </div>

                <div className="sm-form-group">
                  <label htmlFor="sm-division">Division *</label>
                  <input
                    id="sm-division"
                    name="division"
                    value={form.division}
                    onChange={handleFormChange}
                    placeholder="e.g. A"
                    required
                  />
                </div>

                <div className="sm-form-group">
                  <label htmlFor="sm-batch">Batch</label>
                  <input
                    id="sm-batch"
                    name="batch"
                    value={form.batch}
                    onChange={handleFormChange}
                    placeholder="e.g. B1, B2"
                  />
                </div>

                <div className="sm-form-group sm-full-width">
                  <label htmlFor="sm-phone">Phone number</label>
                  <input
                    id="sm-phone"
                    name="phone"
                    type="tel"
                    value={form.phone}
                    onChange={handleFormChange}
                    placeholder="Enter phone number"
                  />
                </div>

                <div className="sm-form-group sm-full-width">
                  <label htmlFor="sm-whatsapp">WhatsApp number</label>
                  <input
                    id="sm-whatsapp"
                    name="whatsappNumber"
                    type="tel"
                    value={form.whatsappNumber}
                    onChange={handleFormChange}
                    placeholder="+919876543210"
                    pattern="\\+[1-9][0-9]{7,14}"
                    title="Include country code, for example +919876543210"
                  />
                  <small>
                    Optional. Use international format with a + and country
                    code.
                  </small>
                </div>
              </div>

              {error && (
                <div className="sm-message sm-error" role="alert">
                  {error}
                </div>
              )}

              <footer className="sm-modal-actions">
                <button
                  type="button"
                  className="sm-secondary-button"
                  onClick={closeForm}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="sm-primary-button"
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : editingStudent
                      ? "Save changes"
                      : "Add student"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {/* Attendance History Modal */}
      {historyStudent && (
        <div
          className="sm-modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !historyLoading
            ) {
              closeAttendanceHistory();
            }
          }}
        >
          <section
            className="sm-modal sm-history-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sm-history-title"
          >
            <header className="sm-modal-header">
              <div>
                <p className="sm-eyebrow">ATTENDANCE</p>
                <h3 id="sm-history-title">
                  {historyStudent.name || "Student"} — History
                </h3>
                <p className="sm-modal-subtitle">
                  Attendance summary and session records.
                </p>
              </div>

              <button
                type="button"
                className="sm-close-button"
                aria-label="Close attendance history"
                onClick={closeAttendanceHistory}
                disabled={historyLoading}
              >
                ×
              </button>
            </header>

            {historyLoading ? (
              <div className="sm-empty">
                <span className="sm-loading-spinner" />
                <strong>Loading attendance history...</strong>
              </div>
            ) : history ? (
              <>
                <div className="sm-history-summary">
                  <div>
                    <span>Total sessions</span>
                    <strong>
                      {history.attendanceSummary?.totalSessionsConducted ??
                        "—"}
                    </strong>
                  </div>

                  <div>
                    <span>Attended</span>
                    <strong>
                      {history.attendanceSummary?.totalSessionsAttended ??
                        "—"}
                    </strong>
                  </div>

                  <div>
                    <span>Attendance</span>
                    <strong>
                      {history.attendanceSummary?.attendancePercentage != null
                        ? `${history.attendanceSummary.attendancePercentage}%`
                        : "—"}
                    </strong>
                  </div>
                </div>

                <div className="sm-table-wrap">
                  <table className="sm-table sm-history-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Lecture / Subject</th>
                        <th>Status</th>
                      </tr>
                    </thead>

                    <tbody>
                      {(history.attendanceHistory || []).length === 0 ? (
                        <tr>
                          <td colSpan={3} className="sm-empty">
                            No attendance history found.
                          </td>
                        </tr>
                      ) : (
                        history.attendanceHistory.map((record, index) => (
                          <tr key={record._id || record.id || index}>
                            <td>
                              {record.date
                                ? new Date(record.date).toLocaleDateString(
                                    "en-IN"
                                  )
                                : record.createdAt
                                  ? new Date(
                                      record.createdAt
                                    ).toLocaleDateString("en-IN")
                                  : "—"}
                            </td>
                            <td>
                              {record.subject ||
                                record.lectureTitle ||
                                record.lecture?.title ||
                                "—"}
                            </td>
                            <td>
                              <span className="sm-status-text">
                                {record.status ||
                                  record.attendanceStatus ||
                                  "—"}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="sm-empty">
                Attendance history load nahi ho saki.
              </p>
            )}

            <footer className="sm-modal-actions">
              <button
                type="button"
                className="sm-secondary-button"
                onClick={closeAttendanceHistory}
                disabled={historyLoading}
              >
                Close
              </button>
            </footer>
          </section>
        </div>
      )}

      {/* Centered Delete Confirmation */}
      {confirmDeleteStudent && (
        <div
          className="sm-modal-backdrop sm-confirm-backdrop"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !deletingStudentId
            ) {
              cancelDelete();
            }
          }}
        >
          <section
            className="sm-modal sm-confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="sm-delete-title"
            aria-describedby="sm-delete-description"
          >
            <div className="sm-confirm-icon" aria-hidden="true">
              !
            </div>

            <h3 id="sm-delete-title">Delete student?</h3>

            <p id="sm-delete-description">
              Are you sure you want to delete this student? This action
              cannot be undone.
            </p>

            <span className="sm-confirm-student-name">
              {confirmDeleteStudent.name || "Selected student"}
            </span>

            <footer className="sm-modal-actions">
              <button
                type="button"
                className="sm-secondary-button"
                onClick={cancelDelete}
                disabled={Boolean(deletingStudentId)}
              >
                Cancel
              </button>

              <button
                type="button"
                className="sm-primary-button sm-delete-confirm-button"
                onClick={confirmDelete}
                disabled={Boolean(deletingStudentId)}
              >
                {deletingStudentId ? "Deleting..." : "Delete Student"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}

export default StudentManagement;
