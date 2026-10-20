
import { useEffect, useMemo, useState } from "react";
import "./ClassroomManagement.css";
import { getClassrooms } from "../services/classroomService";

const API = "http://localhost:3000/api";

const initialForm = {
    assignedClass: "",
    subject: "",
    classroomName: "",
    building: "",
    date: "",
    startTime: "",
    endTime: "",
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

    if (!match) return value;

    let hours = Number(match[1]);
    const period = hours >= 12 ? "PM" : "AM";

    hours = hours % 12 || 12;

    return `${String(hours).padStart(2, "0")}:${match[2]} ${period}`;
};

// Use local date, not UTC, for Today / Tomorrow / Yesterday.
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

    const [year, month, day] = value.split("-").map(Number);

    if (!year || !month || !day) return value;

    return new Date(year, month - 1, day).toLocaleDateString(
        "en-IN",
        {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        }
    );
};

function ClassroomManagement({ onBack }) {
    const [classrooms, setClassrooms] = useState([]);
    const [professors, setProfessors] = useState([]);
    const [lectures, setLectures] = useState([]);
    const [form, setForm] = useState(initialForm);

    // Default: show today's lectures, not every lecture.
    const [dateFilter, setDateFilter] = useState("today");
    const [searchDate, setSearchDate] = useState(
        () => getRelativeDate(0)
    );

    const [showForm, setShowForm] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [cancellingId, setCancellingId] = useState("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const token = () => localStorage.getItem("adminToken");

    const headers = () => ({
        "Content-Type": "application/json",
        Authorization: `Bearer ${token()}`,
    });

    const readResponse = async (response, fallback) => {
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.message || fallback);
        }

        return data;
    };

    const loadData = async () => {
        setLoading(true);
        setError("");

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
        } catch (err) {
            setError(err.message || "Unable to load data.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    // Keep the chosen date in sync with the selected quick filter.
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

    // Only show lectures belonging to the selected date.
    const filteredLectures = useMemo(() => {
        if (!searchDate) return [];

        return lectures.filter((lecture) => {
            if (!lecture.date) return false;

            // Backend stores dates at UTC midnight.
            // Extract the date portion to avoid timezone shifts.
            const lectureDate = String(lecture.date).slice(0, 10);

            return lectureDate === searchDate;
        });
    }, [lectures, searchDate]);

    const changeField = (event) => {
        const { name, value } = event.target;

        setForm((previous) => ({
            ...previous,
            [name]: value,
        }));
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
        setForm(initialForm);
        setShowForm(true);
    };

    const closeForm = () => {
        if (saving) return;

        setShowForm(false);
        setForm(initialForm);
        setError("");
    };

    const handleCreateLecture = async (event) => {
        event.preventDefault();

        setError("");
        setNotice("");

        if (!token()) {
            setError("Admin session expired. Please log in again.");
            return;
        }

        if (!form.assignedClass || !form.subject) {
            setError("Select a class and subject.");
            return;
        }

        if (matchingProfessors.length !== 1) {
            setError(
                matchingProfessors.length === 0
                    ? "No active professor is assigned to this class and subject."
                    : "Multiple professors match this class and subject. Please correct the assignment."
            );
            return;
        }

        const classroomName = form.classroomName.trim();

        if (!classroomName) {
            setError("Enter a classroom name.");
            return;
        }

        const startTime = timeTo24(form.startTime);
        const endTime = timeTo24(form.endTime);
        const startMinutes = timeToMinutes(form.startTime);
        const endMinutes = timeToMinutes(form.endTime);

        if (startMinutes === null || endMinutes === null) {
            setError("Enter time in AM/PM format, e.g. 09:00 AM.");
            return;
        }

        if (endMinutes <= startMinutes) {
            setError("End time must be later than start time.");
            return;
        }

        if (!form.date) {
            setError("Select the lecture date.");
            return;
        }

        setSaving(true);

        try {
            const response = await fetch(`${API}/lectures`, {
                method: "POST",
                headers: headers(),
                body: JSON.stringify({
                    subject: form.subject,
                    assignedClass: form.assignedClass,
                    classroomName,
                    date: form.date,
                    startTime,
                    endTime,
                }),
            });

            const data = await readResponse(
                response,
                "Unable to create lecture."
            );

            if (data.lecture) {
                setLectures((previous) => [
                    data.lecture,
                    ...previous.filter(
                        (item) => getId(item) !== getId(data.lecture)
                    ),
                ]);
            }

            setShowForm(false);
            setForm(initialForm);
            setNotice("Lecture created successfully.");

            await loadData();
        } catch (err) {
            setError(err.message || "Unable to create lecture.");
        } finally {
            setSaving(false);
        }
    };

    const handleCancelLecture = async (lecture) => {
        if (!getId(lecture)) {
            setError("Lecture ID is missing.");
            return;
        }

        if (lecture.status !== "scheduled") {
            setError("Only scheduled lectures can be cancelled.");
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

            await readResponse(response, "Unable to cancel lecture.");

            setLectures((previous) =>
                previous.map((item) =>
                    getId(item) === getId(lecture)
                        ? { ...item, status: "cancelled" }
                        : item
                )
            );

            setNotice("Lecture cancelled successfully.");

            await loadData();
        } catch (err) {
            setError(err.message || "Unable to cancel lecture.");
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

    const selectedDateLabel = {
        today: "Today's Lectures",
        tomorrow: "Tomorrow's Lectures",
        yesterday: "Yesterday's Lectures",
        specific: "Lectures for Selected Date",
    }[dateFilter];

    return (
        <section className="cm-page">
            <header className="cm-page-header">
                <div>
                    <p className="cm-eyebrow">ADMIN MANAGEMENT</p>
                    <h2>Classroom Management</h2>
                    <p className="cm-subtitle">
                        Create and manage lectures from one simple page.
                    </p>
                </div>

                <div className="cm-header-actions">
                    <button
                        type="button"
                        className="cm-button cm-button-secondary"
                        onClick={loadData}
                        disabled={loading || saving}
                    >
                        Refresh
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
                            Back
                        </button>
                    )}
                </div>
            </header>

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

            {showForm && (
                <div className="cm-panel">
                    <div className="cm-panel-heading">
                        <div>
                            <h3>Create Lecture</h3>
                            <p>
                                Select a class and subject, then fill in the lecture details.
                            </p>
                        </div>

                        <button
                            type="button"
                            className="cm-button cm-button-secondary"
                            onClick={closeForm}
                            disabled={saving}
                        >
                            Close
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
                                {matchingProfessors.length === 1
                                    ? matchingProfessors[0].name
                                    : matchingProfessors.length > 1
                                        ? "Multiple matching professors"
                                        : "Select a class and subject"}
                            </div>
                        </div>

                        <div className="cm-field">
                            <label htmlFor="cm-classroom">Classroom *</label>

                            <input
                                id="cm-classroom"
                                name="classroomName"
                                list="cm-classroom-options"
                                value={form.classroomName}
                                onChange={changeField}
                                placeholder="Type a classroom name"
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
                                Enter any classroom name. Selecting an existing suggestion is optional.
                            </small>
                        </div>

                        <div className="cm-form-grid">
                            <div className="cm-field">
                                <label htmlFor="cm-date">Date *</label>

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
                                <label htmlFor="cm-start">Start Time *</label>

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
                                <label htmlFor="cm-end">End Time *</label>

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
                                {saving ? "Creating..." : "Create Lecture"}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="cm-panel">
                <div className="cm-panel-heading">
                    <div>
                        <h3>Lecture Management</h3>
                        <p>
                            Select a date to view only the lectures scheduled for that day.
                        </p>
                    </div>
                </div>

                {/* Date filter options */}
                <div className="cm-date-filter">
                    <button
                        type="button"
                        className={`cm-date-filter-button ${
                            dateFilter === "today" ? "active" : ""
                        }`}
                        onClick={() => setDateFilter("today")}
                    >
                        Today
                    </button>

                    <button
                        type="button"
                        className={`cm-date-filter-button ${
                            dateFilter === "tomorrow" ? "active" : ""
                        }`}
                        onClick={() => setDateFilter("tomorrow")}
                    >
                        Tomorrow
                    </button>

                    <button
                        type="button"
                        className={`cm-date-filter-button ${
                            dateFilter === "yesterday" ? "active" : ""
                        }`}
                        onClick={() => setDateFilter("yesterday")}
                    >
                        Yesterday
                    </button>

                    <button
                        type="button"
                        className={`cm-date-filter-button ${
                            dateFilter === "specific" ? "active" : ""
                        }`}
                        onClick={() => setDateFilter("specific")}
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
                            onClick={() => {
                                setSearchDate(getRelativeDate(0));
                                setDateFilter("today");
                            }}
                        >
                            Back to Today
                        </button>
                    </div>
                )}

                <div className="cm-lecture-results-heading">
                    <h3>
                        {selectedDateLabel}
                    </h3>

                    <span className="cm-lecture-count">
                        {filteredLectures.length}{" "}
                        {filteredLectures.length === 1 ? "lecture" : "lectures"}
                    </span>
                </div>

                {searchDate && (
                    <p className="cm-selected-date">
                        Date: {formatDate(searchDate)}
                    </p>
                )}

                {loading ? (
                    <div className="cm-empty">Loading lectures...</div>
                ) : filteredLectures.length === 0 ? (
                    <div className="cm-empty">
                        No lectures found for {formatDate(searchDate)}.
                    </div>
                ) : (
                    <div className="cm-lecture-grid">
                        {filteredLectures.map((lecture) => (
                            <article
                                className="cm-lecture-card"
                                key={getId(lecture)}
                            >
                                <div className="cm-lecture-card-header">
                                    <div>
                                        <h3>
                                            {lecture.subject} — {lecture.assignedClass}
                                        </h3>

                                        <p>
                                            {lecture.professorName || "Assigned professor"}
                                        </p>
                                    </div>

                                    <span
                                        className={`cm-status cm-status-${lecture.status || "scheduled"}`}
                                    >
                                        {lecture.status || "scheduled"}
                                    </span>
                                </div>

                                <div className="cm-lecture-detail">
                                    <strong>Classroom:</strong>{" "}
                                    {classroomNameFor(lecture)}
                                </div>

                                <div className="cm-lecture-detail">
                                    <strong>Date:</strong>{" "}
                                    {formatDate(
                                        lecture.date
                                            ? String(lecture.date).slice(0, 10)
                                            : ""
                                    )}
                                </div>

                                <div className="cm-lecture-detail">
                                    <strong>Time:</strong>{" "}
                                    {displayTime(lecture.startTime)} –{" "}
                                    {displayTime(lecture.endTime)}
                                </div>

                                {lecture.status === "scheduled" && (
                                    <div className="cm-form-actions">
                                        <button
                                            type="button"
                                            className="cm-button cm-button-cancel"
                                            onClick={() => handleCancelLecture(lecture)}
                                            disabled={cancellingId === getId(lecture)}
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
