
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./ClassroomManagement.css";
import {
    createClassroom,
    getClassrooms,
    updateClassroom,
} from "../services/classroomService";
import { API_BASE_URL } from "../services/apiConfig";

const API = API_BASE_URL;

const initialForm = {
    assignedClass: "",
    subject: "",
    classroomName: "",
    building: "",
    date: "",
    startTime: "",
    endTime: "",
};

const initialClassroomForm = {
    classroomName: "",
    building: "",
    latitude: "",
    longitude: "",
    radiusMeters: "30",
};

const getId = (item) => item?._id || item?.id || "";

const getList = (response, key) => {
    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.[key])) return response[key];
    if (Array.isArray(response?.data?.[key])) return response.data[key];
    if (Array.isArray(response?.data)) return response.data;
    return [];
};

const normalise = (value = "") =>
    String(value).trim().toLowerCase();

const timeTo24 = (value = "") => {
    const match = value.trim().match(
        /^(0?[1-9]|1[0-2]):([0-5]\d)\s*(AM|PM)$/i
    );

    if (!match) return null;

    let hours = Number(match[1]) % 12;

    if (match[3].toUpperCase() === "PM") {
        hours += 12;
    }

    return `${String(hours).padStart(2, "0")}:${match[2]}`;
};

const timeToMinutes = (value) => {
    const converted = timeTo24(value);

    if (!converted) return null;

    const [hours, minutes] = converted.split(":").map(Number);

    return hours * 60 + minutes;
};

const displayTime = (value = "") => {
    const match = value.match(/^(\d{2}):(\d{2})$/);

    if (!match) return value || "—";

    let hours = Number(match[1]);
    const period = hours >= 12 ? "PM" : "AM";

    hours = hours % 12 || 12;

    return `${String(hours).padStart(2, "0")}:${match[2]} ${period}`;
};

const toLocalDateString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
};

const getRelativeDate = (offset) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + offset);

    return toLocalDateString(date);
};

const formatDate = (value) => {
    if (!value) return "—";

    const [year, month, day] = String(value)
        .slice(0, 10)
        .split("-")
        .map(Number);

    if (!year || !month || !day) return value;

    return new Date(year, month - 1, day).toLocaleDateString(
        "en-IN",
        {
            day: "2-digit",
            month: "short",
            year: "numeric",
        }
    );
};

function ClassroomManagement({ onBack }) {
    const [classrooms, setClassrooms] = useState([]);
    const [professors, setProfessors] = useState([]);
    const [lectures, setLectures] = useState([]);

    const [form, setForm] = useState(initialForm);
    const [classroomForm, setClassroomForm] = useState(initialClassroomForm);

    const [editingClassroom, setEditingClassroom] = useState(null);
    const [showClassroomForm, setShowClassroomForm] = useState(false);

    const [dateFilter, setDateFilter] = useState("today");
    const [searchDate, setSearchDate] = useState(
        () => getRelativeDate(0)
    );

    const [showForm, setShowForm] = useState(false);
    const [editingLecture, setEditingLecture] = useState(null);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [cancellingId, setCancellingId] = useState("");

    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const toastTimerRef = useRef(null);

    const token = () => localStorage.getItem("adminToken");

    const headers = useCallback(() => ({
        "Content-Type": "application/json",
        Authorization: `Bearer ${token()}`,
    }), []);

    const readResponse = useCallback(async (response, fallback) => {
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.message || fallback);
        }

        return data;
    }, []);

    // Show a success/error notification and automatically dismiss it.
    const showToast = useCallback((message, type = "success") => {
        if (toastTimerRef.current) {
            clearTimeout(toastTimerRef.current);
        }

        if (type === "error") {
            setNotice("");
            setError(message);
        } else {
            setError("");
            setNotice(message);
        }

        toastTimerRef.current = setTimeout(() => {
            setNotice("");
            setError("");
            toastTimerRef.current = null;
        }, 3500);
    }, []);

    // Load classroom locations, professors, and lectures.
    const loadData = useCallback(async ({ showLoading = true } = {}) => {
        if (showLoading) {
            setLoading(true);
        }

        try {
            const [roomResponse, professorResponse, lectureResponse] =
                await Promise.all([
                    getClassrooms(),

                    fetch(`${API}/professors`, {
                        headers: headers(),
                    }).then((response) =>
                        readResponse(
                            response,
                            "Unable to load professors."
                        )
                    ),

                    fetch(`${API}/lectures`, {
                        headers: headers(),
                    }).then((response) =>
                        readResponse(
                            response,
                            "Unable to load lectures."
                        )
                    ),
                ]);

            setClassrooms(getList(roomResponse, "classrooms"));
            setProfessors(getList(professorResponse, "professors"));
            setLectures(getList(lectureResponse, "lectures"));

            return true;
        } catch (err) {
            setError((previous) =>
                previous || err.message || "Unable to load data."
            );

            return false;
        } finally {
            if (showLoading) {
                setLoading(false);
            }
        }
    }, [headers, readResponse]);

    useEffect(() => {
        loadData();

        return () => {
            if (toastTimerRef.current) {
                clearTimeout(toastTimerRef.current);
                toastTimerRef.current = null;
            }
        };
    }, [loadData]);

    useEffect(() => {
        if (dateFilter === "today") {
            setSearchDate(getRelativeDate(0));
        } else if (dateFilter === "tomorrow") {
            setSearchDate(getRelativeDate(1));
        } else if (dateFilter === "yesterday") {
            setSearchDate(getRelativeDate(-1));
        }
    }, [dateFilter]);

    const activeClassrooms = useMemo(
        () => classrooms.filter((room) => room.isActive !== false),
        [classrooms]
    );

    const availableClasses = useMemo(() => {
        const values = professors
            .filter((professor) => professor.isActive !== false)
            .flatMap((professor) => professor.assignedClasses || [])
            .filter(Boolean)
            .map((value) => value.trim());

        return [...new Set(values)].sort((a, b) =>
            a.localeCompare(b)
        );
    }, [professors]);

    const availableSubjects = useMemo(() => {
        if (!form.assignedClass) return [];

        const values = professors
            .filter(
                (professor) =>
                    professor.isActive !== false &&
                    (professor.assignedClasses || []).some(
                        (item) =>
                            normalise(item) === normalise(form.assignedClass)
                    )
            )
            .flatMap((professor) => professor.subjects || [])
            .filter(Boolean)
            .map((value) => value.trim());

        return [...new Set(values)].sort((a, b) =>
            a.localeCompare(b)
        );
    }, [professors, form.assignedClass]);

    const matchingProfessors = useMemo(() => {
        if (!form.assignedClass || !form.subject) return [];

        return professors.filter(
            (professor) =>
                professor.isActive !== false &&
                (professor.assignedClasses || []).some(
                    (item) =>
                        normalise(item) === normalise(form.assignedClass)
                ) &&
                (professor.subjects || []).some(
                    (item) => normalise(item) === normalise(form.subject)
                )
        );
    }, [professors, form.assignedClass, form.subject]);

    const filteredLectures = useMemo(() => {
        if (!searchDate) return [];

        return lectures
            .filter((lecture) => {
                if (!lecture.date) return false;

                return String(lecture.date).slice(0, 10) === searchDate;
            })
            .sort((a, b) =>
                String(a.startTime || "").localeCompare(
                    String(b.startTime || "")
                )
            );
    }, [lectures, searchDate]);

    const changeField = (event) => {
        const { name, value } = event.target;

        setForm((previous) => ({
            ...previous,
            [name]: value,
        }));
    };

    const changeClassroomField = (event) => {
        const { name, value } = event.target;

        setClassroomForm((previous) => ({
            ...previous,
            [name]: value,
        }));
    };

    const openClassroomForm = (classroom = null) => {
        setEditingClassroom(classroom);

        setClassroomForm(
            classroom
                ? {
                    classroomName: classroom.classroomName || "",
                    building: classroom.building || "",
                    latitude: String(classroom.latitude ?? ""),
                    longitude: String(classroom.longitude ?? ""),
                    radiusMeters: String(classroom.radiusMeters ?? 30),
                }
                : { ...initialClassroomForm }
        );

        setShowClassroomForm(true);
        setError("");
        setNotice("");
    };

    const saveClassroom = async (event) => {
        event.preventDefault();

        setSaving(true);
        setError("");
        setNotice("");

        const payload = {
            classroomName: classroomForm.classroomName.trim(),
            building: classroomForm.building.trim(),
            latitude: Number(classroomForm.latitude),
            longitude: Number(classroomForm.longitude),
            radiusMeters: Number(classroomForm.radiusMeters),
        };

        if (
            !payload.classroomName ||
            classroomForm.latitude.trim() === "" ||
            classroomForm.longitude.trim() === "" ||
            classroomForm.radiusMeters.trim() === "" ||
            !Number.isFinite(payload.latitude) ||
            payload.latitude < -90 ||
            payload.latitude > 90 ||
            !Number.isFinite(payload.longitude) ||
            payload.longitude < -180 ||
            payload.longitude > 180 ||
            !Number.isFinite(payload.radiusMeters) ||
            payload.radiusMeters < 1 ||
            payload.radiusMeters > 500
        ) {
            showToast(
                "Enter a classroom name and valid coordinates and radius.",
                "error"
            );
            setSaving(false);
            return;
        }

        try {
            const result = editingClassroom
                ? await updateClassroom(getId(editingClassroom), payload)
                : await createClassroom(payload);

            setShowClassroomForm(false);
            setEditingClassroom(null);
            setClassroomForm({ ...initialClassroomForm });

            await loadData({ showLoading: false });

            showToast(
                result.message ||
                    (editingClassroom
                        ? "Classroom updated successfully."
                        : "Classroom created successfully.")
            );
        } catch (requestError) {
            showToast(
                requestError.message || "Unable to save classroom.",
                "error"
            );
        } finally {
            setSaving(false);
        }
    };

    const changeClass = (event) => {
        setForm((previous) => ({
            ...previous,
            assignedClass: event.target.value,
            subject: "",
        }));
    };

    const openForm = () => {
        setError("");
        setNotice("");
        setEditingLecture(null);
        setForm({ ...initialForm });
        setShowForm(true);
    };

    const openEditForm = (lecture) => {
        setError("");
        setNotice("");
        setEditingLecture(lecture);

        setForm({
            assignedClass: lecture.assignedClass || "",
            subject: lecture.subject || "",
            classroomName:
                classroomNameFor(lecture) === "Classroom"
                    ? ""
                    : classroomNameFor(lecture),
            building: "",
            date: lecture.date ? String(lecture.date).slice(0, 10) : "",
            startTime: displayTime(lecture.startTime),
            endTime: displayTime(lecture.endTime),
        });

        setShowForm(true);
    };

    const closeForm = () => {
        if (saving) return;

        setShowForm(false);
        setEditingLecture(null);
        setForm({ ...initialForm });
        setError("");
    };

    const handleCreateLecture = async (event) => {
        event.preventDefault();

        setError("");
        setNotice("");

        if (!token()) {
            showToast(
                "Admin session expired. Please log in again.",
                "error"
            );
            return;
        }

        if (!form.assignedClass || !form.subject) {
            showToast("Select a class and subject.", "error");
            return;
        }

        if (matchingProfessors.length !== 1) {
            showToast(
                matchingProfessors.length === 0
                    ? "No active professor is assigned to this class and subject."
                    : "Multiple professors match this class and subject. Please correct the assignment.",
                "error"
            );
            return;
        }

        const classroomName = form.classroomName.trim();

        if (!classroomName) {
            showToast("Enter a classroom name.", "error");
            return;
        }

        const selectedClassroom = activeClassrooms.find(
            (room) =>
                normalise(room.classroomName) === normalise(classroomName)
        );

        if (!selectedClassroom) {
            showToast(
                "Select a saved, active classroom location. Add it under Classroom locations first.",
                "error"
            );
            return;
        }

        const startTime = timeTo24(form.startTime);
        const endTime = timeTo24(form.endTime);
        const startMinutes = timeToMinutes(form.startTime);
        const endMinutes = timeToMinutes(form.endTime);

        if (startMinutes === null || endMinutes === null) {
            showToast(
                "Enter time in AM/PM format, e.g. 09:00 AM.",
                "error"
            );
            return;
        }

        if (endMinutes <= startMinutes) {
            showToast("End time must be later than start time.", "error");
            return;
        }

        if (!form.date) {
            showToast("Select the lecture date.", "error");
            return;
        }

        setSaving(true);

        const isEditing = Boolean(editingLecture);

        try {
            const response = await fetch(
                isEditing
                    ? `${API}/lectures/${getId(editingLecture)}`
                    : `${API}/lectures`,
                {
                    method: isEditing ? "PUT" : "POST",
                    headers: headers(),
                    body: JSON.stringify({
                        subject: form.subject,
                        assignedClass: form.assignedClass,
                        classroomName,
                        classroomId: getId(selectedClassroom),
                        date: form.date,
                        startTime,
                        endTime,
                    }),
                }
            );

            const data = await readResponse(
                response,
                isEditing
                    ? "Unable to update lecture."
                    : "Unable to create lecture."
            );

            if (data.lecture) {
                setLectures((previous) => [
                    data.lecture,
                    ...previous.filter(
                        (item) => getId(item) !== getId(data.lecture)
                    ),
                ]);
            }

            const successMessage =
                data.message ||
                (isEditing
                    ? "Lecture updated successfully."
                    : "Lecture created successfully.");

            setShowForm(false);
            setEditingLecture(null);
            setForm({ ...initialForm });

            // Refresh data without switching to the loading screen.
            await loadData({ showLoading: false });

            showToast(successMessage, "success");
        } catch (err) {
            showToast(
                err.message ||
                    (isEditing
                        ? "Unable to update lecture."
                        : "Unable to create lecture."),
                "error"
            );
        } finally {
            setSaving(false);
        }
    };

    const handleCancelLecture = async (lecture) => {
        if (!getId(lecture)) {
            showToast("Lecture ID is missing.", "error");
            return;
        }

        if (lecture.status !== "scheduled") {
            showToast(
                "Only scheduled lectures can be cancelled.",
                "error"
            );
            return;
        }

        const confirmed = window.confirm(
            `Are you sure you want to cancel "${lecture.subject}" for ${lecture.assignedClass}?`
        );

        if (!confirmed) return;

        setError("");
        setNotice("");
        setCancellingId(getId(lecture));

        try {
            const response = await fetch(
                `${API}/lectures/${getId(lecture)}/cancel`,
                {
                    method: "PATCH",
                    headers: headers(),
                }
            );

            const data = await readResponse(
                response,
                "Unable to cancel lecture."
            );

            setLectures((previous) =>
                previous.map((item) =>
                    getId(item) === getId(lecture)
                        ? {
                            ...item,
                            ...(data.lecture || {}),
                            status: data.lecture?.status || "cancelled",
                        }
                        : item
                )
            );

            await loadData({ showLoading: false });

            showToast(
                data.message || "Lecture cancelled successfully.",
                "success"
            );
        } catch (err) {
            showToast(
                err.message || "Unable to cancel lecture.",
                "error"
            );
        } finally {
            setCancellingId("");
        }
    };

    const classroomNameFor = (lecture) => {
        if (lecture.classroomName) {
            return lecture.classroomName;
        }

        if (
            lecture.classroom &&
            typeof lecture.classroom === "object"
        ) {
            return [
                lecture.classroom.classroomName,
                lecture.classroom.building,
            ]
                .filter(Boolean)
                .join(" — ");
        }

        const room = classrooms.find(
            (item) => getId(item) === lecture.classroom
        );

        return room
            ? [room.classroomName, room.building]
                .filter(Boolean)
                .join(" — ")
            : "Classroom";
    };

    const handleSpecificDateChange = (event) => {
        setSearchDate(event.target.value);
        setDateFilter("specific");
    };

    const chooseDateFilter = (filter) => {
        setDateFilter(filter);

        if (filter === "today") setSearchDate(getRelativeDate(0));
        if (filter === "tomorrow") setSearchDate(getRelativeDate(1));
        if (filter === "yesterday") setSearchDate(getRelativeDate(-1));
    };

    const selectedDateLabel = {
        today: "Today's Lectures",
        tomorrow: "Tomorrow's Lectures",
        yesterday: "Yesterday's Lectures",
        specific: "Lectures for Selected Date",
    }[dateFilter];

    return (
        <section className="cm-page">
            {/* Floating success/error toast */}
            {(notice || error) && (
                <div
                    className={`cm-toast ${
                        error ? "cm-toast-error" : "cm-toast-success"
                    }`}
                    role={error ? "alert" : "status"}
                    key={error || notice}
                >
                    <span className="cm-toast-icon" aria-hidden="true">
                        {error ? "!" : "✓"}
                    </span>

                    <div className="cm-toast-content">
                        <strong>
                            {error ? "Attention" : "Success"}
                        </strong>
                        <span>{error || notice}</span>
                    </div>

                    <button
                        type="button"
                        className="cm-toast-close"
                        aria-label="Dismiss notification"
                        onClick={() => {
                            setError("");
                            setNotice("");

                            if (toastTimerRef.current) {
                                clearTimeout(toastTimerRef.current);
                                toastTimerRef.current = null;
                            }
                        }}
                    >
                        ×
                    </button>
                </div>
            )}

            <header className="cm-page-header">
                <div className="cm-header-title">
                    <p className="cm-eyebrow">ADMINISTRATION / ACADEMICS</p>
                    <h2>Classroom Management</h2>
                    <p className="cm-subtitle">
                        Plan lectures, assign professors, and manage your
                        classroom schedule.
                    </p>
                </div>

                <div className="cm-header-actions">
                    <button
                        type="button"
                        className="cm-button cm-button-secondary"
                        onClick={() => loadData()}
                        disabled={loading || saving}
                    >
                        ↻ Refresh
                    </button>

                    <button
                        type="button"
                        className="cm-button cm-button-primary"
                        onClick={openForm}
                        disabled={saving}
                    >
                        + Create Lecture
                    </button>

                    {onBack && (
                        <button
                            type="button"
                            className="cm-button cm-button-secondary"
                            onClick={onBack}
                        >
                            ← Back
                        </button>
                    )}
                </div>
            </header>

            {/* Inline messages from the second branch are preserved */}
            {error && (
                <div className="cm-message cm-error" role="alert">
                    {error}
                </div>
            )}

            {notice && (
                <div className="cm-message cm-success" role="status">
                    {notice}
                </div>
            )}

            {/* Classroom location management */}
            <div className="cm-panel">
                <div className="cm-panel-heading">
                    <div>
                        <h3>Classroom locations</h3>
                        <p>
                            Set the GPS point and permitted attendance radius
                            for each room.
                        </p>
                    </div>

                    <button
                        type="button"
                        className="cm-button cm-button-primary"
                        onClick={() => openClassroomForm()}
                        disabled={saving}
                    >
                        + Add Classroom
                    </button>
                </div>

                {showClassroomForm && (
                    <form
                        className="cm-classroom-form"
                        onSubmit={saveClassroom}
                    >
                        <div className="cm-form-grid">
                            <div className="cm-field">
                                <label htmlFor="cm-room-name">
                                    Classroom name *
                                </label>
                                <input
                                    id="cm-room-name"
                                    name="classroomName"
                                    value={classroomForm.classroomName}
                                    onChange={changeClassroomField}
                                    required
                                />
                            </div>

                            <div className="cm-field">
                                <label htmlFor="cm-room-building">
                                    Building
                                </label>
                                <input
                                    id="cm-room-building"
                                    name="building"
                                    value={classroomForm.building}
                                    onChange={changeClassroomField}
                                />
                            </div>

                            <div className="cm-field">
                                <label htmlFor="cm-room-lat">
                                    Latitude *
                                </label>
                                <input
                                    id="cm-room-lat"
                                    name="latitude"
                                    type="number"
                                    min="-90"
                                    max="90"
                                    step="any"
                                    value={classroomForm.latitude}
                                    onChange={changeClassroomField}
                                    required
                                />
                            </div>

                            <div className="cm-field">
                                <label htmlFor="cm-room-long">
                                    Longitude *
                                </label>
                                <input
                                    id="cm-room-long"
                                    name="longitude"
                                    type="number"
                                    min="-180"
                                    max="180"
                                    step="any"
                                    value={classroomForm.longitude}
                                    onChange={changeClassroomField}
                                    required
                                />
                            </div>

                            <div className="cm-field">
                                <label htmlFor="cm-room-radius">
                                    Attendance radius (metres) *
                                </label>
                                <input
                                    id="cm-room-radius"
                                    name="radiusMeters"
                                    type="number"
                                    min="1"
                                    max="500"
                                    value={classroomForm.radiusMeters}
                                    onChange={changeClassroomField}
                                    required
                                />
                            </div>
                        </div>

                        <div className="cm-form-actions">
                            <button
                                type="button"
                                className="cm-button cm-button-secondary"
                                onClick={() => {
                                    if (saving) return;
                                    setShowClassroomForm(false);
                                    setEditingClassroom(null);
                                    setClassroomForm({
                                        ...initialClassroomForm,
                                    });
                                }}
                                disabled={saving}
                            >
                                Cancel
                            </button>

                            <button
                                type="submit"
                                className="cm-button cm-button-primary"
                                disabled={saving}
                            >
                                {saving
                                    ? "Saving…"
                                    : editingClassroom
                                        ? "Save classroom"
                                        : "Create classroom"}
                            </button>
                        </div>
                    </form>
                )}

                <div className="cm-classroom-list">
                    {!loading && classrooms.length === 0 && (
                        <div className="cm-empty">
                            No classroom locations yet. Add one to enable
                            location-verified attendance.
                        </div>
                    )}

                    {classrooms.map((classroom) => (
                        <article
                            className="cm-classroom-item"
                            key={getId(classroom)}
                        >
                            <span className="cm-classroom-icon">⌖</span>

                            <div>
                                <strong>{classroom.classroomName}</strong>
                                <small>
                                    {classroom.building || "Campus"} ·{" "}
                                    {classroom.radiusMeters || 30}m radius
                                </small>
                                <small>
                                    {classroom.latitude},{" "}
                                    {classroom.longitude}
                                </small>
                            </div>

                            <button
                                type="button"
                                className="cm-button cm-button-edit"
                                onClick={() => openClassroomForm(classroom)}
                                disabled={saving}
                            >
                                Edit
                            </button>
                        </article>
                    ))}
                </div>
            </div>

            {/* Create or edit a lecture */}
            {showForm && (
                <div className="cm-panel cm-create-panel">
                    <div className="cm-panel-heading">
                        <div>
                            <p className="cm-eyebrow">LECTURE SCHEDULE</p>
                            <h3>
                                {editingLecture
                                    ? "Edit Lecture"
                                    : "Create a Lecture"}
                            </h3>
                            <p>
                                Add the lecture details below. The professor
                                is matched automatically using the class and
                                subject.
                            </p>
                        </div>

                        <button
                            type="button"
                            className="cm-button cm-button-secondary"
                            onClick={closeForm}
                            disabled={saving}
                        >
                            Close ×
                        </button>
                    </div>

                    <form onSubmit={handleCreateLecture}>
                        <div className="cm-form-grid">
                            <div className="cm-field">
                                <label htmlFor="cm-class">Class *</label>
                                <select
                                    id="cm-class"
                                    name="assignedClass"
                                    value={form.assignedClass}
                                    onChange={changeClass}
                                    required
                                >
                                    <option value="">Select class</option>

                                    {availableClasses.map((item) => (
                                        <option key={item} value={item}>
                                            {item}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="cm-field">
                                <label htmlFor="cm-subject">Subject *</label>
                                <select
                                    id="cm-subject"
                                    name="subject"
                                    value={form.subject}
                                    onChange={changeField}
                                    disabled={!form.assignedClass}
                                    required
                                >
                                    <option value="">Select subject</option>

                                    {availableSubjects.map((item) => (
                                        <option key={item} value={item}>
                                            {item}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="cm-field">
                            <label>Assigned Professor</label>

                            <div className="cm-professor-preview">
                                <span aria-hidden="true">♙</span>
                                <span>
                                    {matchingProfessors.length === 1
                                        ? matchingProfessors[0].name
                                        : matchingProfessors.length > 1
                                            ? "Multiple matching professors"
                                            : "Select a class and subject"}
                                </span>

                                {matchingProfessors.length === 1 && (
                                    <span className="cm-assigned-label">
                                        Assigned
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="cm-field">
                            <label htmlFor="cm-classroom">
                                Classroom *
                            </label>

                            <input
                                id="cm-classroom"
                                name="classroomName"
                                list="cm-classroom-options"
                                value={form.classroomName}
                                onChange={changeField}
                                placeholder="e.g. Lab 02 or Room 105"
                                autoComplete="off"
                                maxLength={150}
                                required
                            />

                            <datalist id="cm-classroom-options">
                                {activeClassrooms.map((room) => (
                                    <option
                                        key={getId(room)}
                                        value={room.classroomName}
                                        label={
                                            room.building
                                                ? `${room.classroomName} — ${room.building}`
                                                : room.classroomName
                                        }
                                    />
                                ))}
                            </datalist>

                            <small>
                                Select a saved classroom location so
                                attendance scans can verify the room.
                            </small>
                        </div>

                        <div className="cm-form-grid cm-time-grid">
                            <div className="cm-field">
                                <label htmlFor="cm-date">
                                    Lecture Date *
                                </label>
                                <input
                                    id="cm-date"
                                    name="date"
                                    type="date"
                                    value={form.date}
                                    onChange={changeField}
                                    required
                                />
                            </div>

                            <div className="cm-field">
                                <label htmlFor="cm-start">
                                    Start Time *
                                </label>
                                <input
                                    id="cm-start"
                                    name="startTime"
                                    value={form.startTime}
                                    onChange={changeField}
                                    placeholder="09:00 AM"
                                    pattern="(0?[1-9]|1[0-2]):[0-5][0-9]\s?(AM|PM|am|pm)"
                                    title="Example: 09:00 AM"
                                    required
                                />
                            </div>

                            <div className="cm-field">
                                <label htmlFor="cm-end">
                                    End Time *
                                </label>
                                <input
                                    id="cm-end"
                                    name="endTime"
                                    value={form.endTime}
                                    onChange={changeField}
                                    placeholder="10:00 AM"
                                    pattern="(0?[1-9]|1[0-2]):[0-5][0-9]\s?(AM|PM|am|pm)"
                                    title="Example: 10:00 AM"
                                    required
                                />
                            </div>
                        </div>

                        <div className="cm-form-actions">
                            <button
                                type="button"
                                className="cm-button cm-button-secondary"
                                onClick={closeForm}
                                disabled={saving}
                            >
                                Cancel
                            </button>

                            <button
                                type="submit"
                                className="cm-button cm-button-primary"
                                disabled={saving || loading}
                            >
                                {saving
                                    ? editingLecture
                                        ? "Saving..."
                                        : "Creating..."
                                    : editingLecture
                                        ? "Save Changes"
                                        : "✓ Create Lecture"}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Lecture schedule and date filters */}
            <div className="cm-panel cm-schedule-panel">
                <div className="cm-panel-heading">
                    <div>
                        <p className="cm-eyebrow">LECTURE OVERVIEW</p>
                        <h3>Lecture Schedule</h3>
                        <p>
                            Browse scheduled lectures by date and review
                            their current status.
                        </p>
                    </div>
                </div>

                <div className="cm-date-filter">
                    <button
                        type="button"
                        className={`cm-date-filter-button ${
                            dateFilter === "today" ? "active" : ""
                        }`}
                        onClick={() => chooseDateFilter("today")}
                    >
                        Today
                    </button>

                    <button
                        type="button"
                        className={`cm-date-filter-button ${
                            dateFilter === "tomorrow" ? "active" : ""
                        }`}
                        onClick={() => chooseDateFilter("tomorrow")}
                    >
                        Tomorrow
                    </button>

                    <button
                        type="button"
                        className={`cm-date-filter-button ${
                            dateFilter === "yesterday" ? "active" : ""
                        }`}
                        onClick={() => chooseDateFilter("yesterday")}
                    >
                        Yesterday
                    </button>

                    <button
                        type="button"
                        className={`cm-date-filter-button ${
                            dateFilter === "specific" ? "active" : ""
                        }`}
                        onClick={() => chooseDateFilter("specific")}
                    >
                        Specific Date
                    </button>
                </div>

                {dateFilter === "specific" && (
                    <div className="cm-date-search">
                        <label htmlFor="cm-search-date">
                            Search lectures by date
                        </label>

                        <input
                            id="cm-search-date"
                            type="date"
                            value={searchDate}
                            onChange={handleSpecificDateChange}
                        />

                        <button
                            type="button"
                            className="cm-button cm-button-secondary"
                            onClick={() => chooseDateFilter("today")}
                        >
                            Back to Today
                        </button>
                    </div>
                )}

                <div className="cm-lecture-results-heading">
                    <div>
                        <h3>{selectedDateLabel}</h3>
                        <p className="cm-selected-date">
                            {formatDate(searchDate)}
                        </p>
                    </div>

                    <span className="cm-lecture-count">
                        {filteredLectures.length}{" "}
                        {filteredLectures.length === 1
                            ? "lecture"
                            : "lectures"}
                    </span>
                </div>

                {loading ? (
                    <div className="cm-empty">
                        <span className="cm-empty-icon">◷</span>
                        <h3>Loading schedule...</h3>
                        <p>
                            Please wait while lecture details are fetched.
                        </p>
                    </div>
                ) : filteredLectures.length === 0 ? (
                    <div className="cm-empty">
                        <span className="cm-empty-icon">▤</span>
                        <h3>No lectures scheduled</h3>
                        <p>
                            No lectures were found for{" "}
                            {formatDate(searchDate)}. Create a lecture to add
                            it to the schedule.
                        </p>

                        <button
                            type="button"
                            className="cm-button cm-button-primary"
                            onClick={openForm}
                        >
                            + Create Lecture
                        </button>
                    </div>
                ) : (
                    <div className="cm-lecture-grid">
                        {filteredLectures.map((lecture) => (
                            <article
                                className="cm-lecture-card"
                                key={getId(lecture)}
                            >
                                <div className="cm-lecture-card-header">
                                    <div className="cm-lecture-title-wrap">
                                        <span className="cm-card-kicker">
                                            {lecture.assignedClass || "Class"}
                                        </span>

                                        <h3>
                                            {lecture.subject ||
                                                "Untitled Subject"}
                                        </h3>

                                        <p>
                                            <span aria-hidden="true">♙ </span>
                                            {lecture.professorName ||
                                                "Assigned professor"}
                                        </p>
                                    </div>

                                    <span
                                        className={`cm-status cm-status-${
                                            lecture.status || "scheduled"
                                        }`}
                                    >
                                        <span className="cm-status-dot" />
                                        {lecture.status || "scheduled"}
                                    </span>
                                </div>

                                <div className="cm-lecture-card-divider" />

                                <div className="cm-card-info-grid">
                                    <div className="cm-card-info">
                                        <span className="cm-info-icon">⌖</span>
                                        <div>
                                            <small>Classroom</small>
                                            <strong>
                                                {classroomNameFor(lecture)}
                                            </strong>
                                        </div>
                                    </div>

                                    <div className="cm-card-info">
                                        <span className="cm-info-icon">▦</span>
                                        <div>
                                            <small>Date</small>
                                            <strong>
                                                {formatDate(
                                                    lecture.date
                                                        ? String(
                                                            lecture.date
                                                        ).slice(0, 10)
                                                        : ""
                                                )}
                                            </strong>
                                        </div>
                                    </div>

                                    <div className="cm-card-info cm-card-time">
                                        <span className="cm-info-icon">◷</span>
                                        <div>
                                            <small>Lecture Time</small>
                                            <strong>
                                                {displayTime(
                                                    lecture.startTime
                                                )}
                                                {" – "}
                                                {displayTime(lecture.endTime)}
                                            </strong>
                                        </div>
                                    </div>
                                </div>

                                {lecture.status === "scheduled" && (
                                    <div className="cm-lecture-card-footer">
                                        <span className="cm-upcoming-label">
                                            <span className="cm-status-dot" />
                                            Scheduled lecture
                                        </span>

                                        <button
                                            type="button"
                                            className="cm-button cm-button-edit"
                                            onClick={() =>
                                                openEditForm(lecture)
                                            }
                                            disabled={saving}
                                        >
                                            Edit Lecture
                                        </button>

                                        <button
                                            type="button"
                                            className="cm-button cm-button-cancel"
                                            onClick={() =>
                                                handleCancelLecture(lecture)
                                            }
                                            disabled={
                                                cancellingId === getId(lecture)
                                            }
                                        >
                                            {cancellingId === getId(lecture)
                                                ? "Cancelling..."
                                                : "Cancel Lecture"}
                                        </button>
                                    </div>
                                )}
                            </article>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}

export default ClassroomManagement;
