
import { useCallback, useEffect, useState } from "react";
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
  return student.id || student._id;
}

function getErrorMessage(error) {
  return error instanceof TypeError
    ? "Backend se connection nahi ho raha. Server check karein."
    : error.message || "Kuch galat ho gaya. Dobara try karein.";
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
  anchor.click();

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
  const [form, setForm] = useState(emptyForm);

  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);

  const [historyStudent, setHistoryStudent] = useState(null);
  const [history, setHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadStudents = useCallback(async (searchValue = "") => {
    setLoading(true);
    setError("");

    try {
      const result = await studentService.getStudents(searchValue);
      setStudents(Array.isArray(result.students) ? result.students : []);
    } catch (err) {
      setError(getErrorMessage(err));
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
    setForm(emptyForm);
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
    setShowForm(false);
    setEditingStudent(null);
    setForm(emptyForm);
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
    setSaving(true);
    setError("");
    setNotice("");

    const payload = {
      name: form.name.trim(),
      email: form.email.trim(),
      rollNo: Number(form.rollNo),
      batch: form.batch.trim(),
      class: form.class.trim(),
      division: form.division.trim(),
      phone: form.phone.trim(),
      whatsappNumber: form.whatsappNumber.trim(),
    };

    try {
      if (editingStudent) {
        await studentService.updateStudent(
          getStudentId(editingStudent),
          payload
        );
        setNotice("Student details updated successfully.");
      } else {
        await studentService.addStudent(payload);
        setNotice("Student added successfully.");
      }

      closeForm();
      await loadStudents(search);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // Delete student
  const handleDeleteStudent = async (student) => {
    const studentId = getStudentId(student);

    if (!studentId) {
      setError("Student ID nahi mili. Student delete nahi hua.");
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete "${student.name || "this student"}"?`
    );

    if (!confirmed) return;

    setDeletingStudentId(studentId);
    setError("");
    setNotice("");

    try {
      const result = await studentService.deleteStudent(studentId);

      setNotice(result.message || "Student deleted successfully.");
      await loadStudents(search);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setDeletingStudentId(null);
    }
  };

  const handleResetTrustedDevice = async (student) => {
    const studentId = getStudentId(student);
    if (!studentId) {
      setError("Student ID is missing. Trusted device was not reset.");
      return;
    }
    if (!window.confirm(`Reset the trusted device for ${student.name || "this student"}? They will be able to sign in from a new device.`)) return;

    setResettingDeviceId(studentId);
    setError("");
    setNotice("");
    try {
      const result = await studentService.resetTrustedDevice(studentId);
      setNotice(result.message || "Trusted device reset successfully.");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setResettingDeviceId(null);
    }
  };

  const handleUpload = async (event) => {
    event.preventDefault();

    if (!selectedFile) {
      setError("Pehle CSV ya Excel file select karein.");
      return;
    }

    setUploading(true);
    setError("");
    setNotice("");
    setUploadResult(null);

    try {
      const result = await studentService.bulkUpload(selectedFile);
      setUploadResult(result);
      setNotice(result.message || "Bulk upload request completed.");
      setSelectedFile(null);

      const fileInput = document.getElementById("student-bulk-file");
      if (fileInput) fileInput.value = "";

      await loadStudents(search);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const openAttendanceHistory = async (student) => {
    setHistoryStudent(student);
    setHistory(null);
    setHistoryLoading(true);
    setError("");

    try {
      const result = await studentService.getAttendanceHistory(
        getStudentId(student)
      );
      setHistory(result.data || result);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setHistoryLoading(false);
    }
  };

  const closeAttendanceHistory = () => {
    setHistoryStudent(null);
    setHistory(null);
  };

  return (
    <section className="student-management">
      <header className="sm-header">
        <div>
          <button
            type="button"
            className="sm-back-button"
            onClick={onBack}
          >
            ← Dashboard
          </button>

          <p className="sm-eyebrow">ADMIN WORKSPACE</p>
          <h2>Student Management</h2>
          <p className="sm-subtitle">
            Add, search, update, delete and import student records.
          </p>
        </div>

        <button
          type="button"
          className="sm-primary-button"
          onClick={openAddForm}
        >
          + Add Student
        </button>
      </header>

      {error && (
        <div className="sm-message sm-error" role="alert">
          {error}
        </div>
      )}

      {notice && (
        <div className="sm-message sm-success" role="status">
          {notice}
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
            <span aria-hidden="true">⌕</span>
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
            Refresh
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
                  <td colSpan="8" className="sm-empty">
                    No students found.
                  </td>
                </tr>
              )}

              {students.map((student) => (
                <tr key={getStudentId(student)}>
                  <td>
                    <strong>{student.name || "—"}</strong>
                  </td>
                  <td>{student.rollNo ?? "—"}</td>
                  <td>
                    {student.class || "—"}
                    {student.division ? ` / ${student.division}` : ""}
                  </td>
                  <td>{student.batch || "—"}</td>
                  <td>{student.email || "—"}</td>
                  <td>{student.phone || "—"}</td>
                  <td>{student.whatsappNumber || "—"}</td>
                  <td>
                    <div className="sm-actions">
                      <button
                        type="button"
                        className="sm-text-action"
                        onClick={() => openEditForm(student)}
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        className="sm-text-action"
                        onClick={() => openAttendanceHistory(student)}
                      >
                        History
                      </button>

                      <button
                        type="button"
                        className="sm-text-action"
                        onClick={() => handleResetTrustedDevice(student)}
                        disabled={resettingDeviceId === getStudentId(student)}
                      >
                        {resettingDeviceId === getStudentId(student)
                          ? "Resetting..."
                          : "Reset device"}
                      </button>

                      <button
                        type="button"
                        className="sm-text-action"
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
                  <td colSpan="8" className="sm-empty">
                    Loading student records...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
        </div>

        <button
          type="button"
          className="sm-secondary-button sm-template-button"
          onClick={downloadSampleCSV}
        >
          Download CSV template
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
          />

          {selectedFile && (
            <p className="sm-file-name">
              Selected: {selectedFile.name}
            </p>
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
            <p>Total rows: {uploadResult.totalRows ?? "—"}</p>
            <p>Imported: {uploadResult.importedCount ?? "—"}</p>
            <p>Failed: {uploadResult.failedCount ?? "—"}</p>

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

      {showForm && (
        <div className="sm-modal-backdrop">
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
              </div>

              <button
                type="button"
                className="sm-close-button"
                aria-label="Close form"
                onClick={closeForm}
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
                  <small>Optional. Use international format with a + and country code.</small>
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

      {historyStudent && (
        <div className="sm-modal-backdrop">
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
              </div>

              <button
                type="button"
                className="sm-close-button"
                aria-label="Close attendance history"
                onClick={closeAttendanceHistory}
              >
                ×
              </button>
            </header>

            {historyLoading ? (
              <p className="sm-empty">Loading attendance history...</p>
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
                  <table className="sm-table">
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
                          <td colSpan="3" className="sm-empty">
                            No attendance history found.
                          </td>
                        </tr>
                      ) : (
                        history.attendanceHistory.map((record, index) => (
                          <tr key={record._id || record.id || index}>
                            <td>
                              {record.date
                                ? new Date(record.date).toLocaleDateString()
                                : record.createdAt
                                  ? new Date(
                                      record.createdAt
                                    ).toLocaleDateString()
                                  : "—"}
                            </td>
                            <td>
                              {record.subject ||
                                record.lectureTitle ||
                                record.lecture?.title ||
                                "—"}
                            </td>
                            <td>
                              {record.status ||
                                record.attendanceStatus ||
                                "—"}
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
              >
                Close
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}

export default StudentManagement;
