
import Professor from "../models/Professor.js";
import Lecture from "../models/Lecture.js";
import Classroom from "../models/Classroom.js";

// Helper: Escape special characters for regex search
const escapeRegex = (value) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Helper: Validate date in YYYY-MM-DD format
const isValidDate = (value) => {
    if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
        return false;
    }

    const date = new Date(`${value}T00:00:00.000Z`);

    return (
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
    );
};

// Helper: Validate MongoDB ObjectId
const isValidObjectId = (value) =>
    typeof value === "string" &&
    /^[a-f\d]{24}$/i.test(value);

// Helper: Find professor assigned to subject and class
const findAssignedProfessor = async (subject, assignedClass) => {
    const subjectName = subject.trim();
    const className = assignedClass.trim();

    const professors = await Professor.find({
        isActive: true,
        subjects: {
            $regex: `^${escapeRegex(subjectName)}$`,
            $options: "i",
        },
    });

    const matchingProfessors = professors.filter(
        (professor) =>
            (professor.subjects || []).some(
                (item) =>
                    item.toLowerCase() === subjectName.toLowerCase()
            ) &&
            (professor.assignedClasses || []).some(
                (item) =>
                    item.toLowerCase() === className.toLowerCase()
            )
    );

    if (matchingProfessors.length === 0) {
        return {
            error: "No active professor is assigned to this subject and class.",
            status: 400,
        };
    }

    if (matchingProfessors.length > 1) {
        return {
            error: "Multiple professors match this subject and class.",
            status: 409,
        };
    }

    return { professor: matchingProfessors[0] };
};

// Helper: Find an active classroom by ID (legacy compatibility)
const findActiveClassroom = async (classroomId) => {
    if (!isValidObjectId(classroomId)) {
        return null;
    }

    return Classroom.findOne({
        _id: classroomId,
        isActive: true,
    });
};

// Helper: Resolve classroom details.
// A classroom name can be entered freely. A database record is optional.
const resolveClassroom = async (classroomName, classroomId) => {
    const name =
        typeof classroomName === "string"
            ? classroomName.trim()
            : "";

    if (name) {
        let classroom = null;

        if (isValidObjectId(classroomId)) {
            classroom = await findActiveClassroom(classroomId);
        }

        return {
            classroomName: name,
            classroomId: classroom ? classroom._id : null,
        };
    }

    // Backward compatibility for requests using an existing classroom ID
    const classroom = await findActiveClassroom(classroomId);

    if (classroom) {
        return {
            classroomName: classroom.classroomName,
            classroomId: classroom._id,
        };
    }

    return null;
};

// Helper: Check for overlapping lecture schedules
const findLectureConflict = async ({
    professorId,
    assignedClass,
    classroomName,
    classroomId,
    date,
    startTime,
    endTime,
    excludeLectureId = null,
}) => {
    const dateStart = new Date(date);
    dateStart.setUTCHours(0, 0, 0, 0);

    const dateEnd = new Date(dateStart);
    dateEnd.setUTCDate(dateEnd.getUTCDate() + 1);

    // Find lectures on the same date with overlapping times.
    // Example: 14:00-15:00 overlaps with 14:30-15:30.
    // Example: 14:00-15:00 does not overlap with 15:00-16:00.
    const query = {
        date: {
            $gte: dateStart,
            $lt: dateEnd,
        },
        status: { $ne: "cancelled" },
        startTime: { $lt: endTime },
        endTime: { $gt: startTime },
    };

    // Exclude the current lecture when updating it.
    if (excludeLectureId) {
        query._id = { $ne: excludeLectureId };
    }

    const existingLectures = await Lecture.find(query);

    const normalizedClass = assignedClass.trim().toLowerCase();
    const normalizedRoom = classroomName.trim().toLowerCase();
    const currentProfessorId = String(professorId);

    for (const existing of existingLectures) {
        const sameClass =
            typeof existing.assignedClass === "string" &&
            existing.assignedClass.trim().toLowerCase() ===
                normalizedClass;

        const existingRoomName =
            typeof existing.classroomName === "string"
                ? existing.classroomName.trim().toLowerCase()
                : "";

        const sameRoomName =
            Boolean(normalizedRoom) &&
            Boolean(existingRoomName) &&
            existingRoomName === normalizedRoom;

        const sameRoomId =
            Boolean(classroomId) &&
            Boolean(existing.classroom) &&
            String(existing.classroom) === String(classroomId);

        const sameProfessor =
            existing.professor &&
            String(existing.professor) === currentProfessorId;

        const conflictDetails = {
            subject: existing.subject,
            assignedClass: existing.assignedClass,
            classroomName: existing.classroomName,
            date: existing.date,
            startTime: existing.startTime,
            endTime: existing.endTime,
            status: existing.status,
        };

        // Same class cannot have overlapping lectures.
        if (sameClass) {
            return {
                message:
                    `This class already has a lecture scheduled from ` +
                    `${existing.startTime} to ${existing.endTime}. ` +
                    `Choose a different time.`,
                conflict: conflictDetails,
            };
        }

        // Same classroom cannot be booked for overlapping lectures.
        if (sameRoomName || sameRoomId) {
            return {
                message:
                    `This classroom is already booked from ` +
                    `${existing.startTime} to ${existing.endTime}. ` +
                    `Choose a different time or classroom.`,
                conflict: conflictDetails,
            };
        }

        // Same professor cannot teach overlapping lectures.
        if (sameProfessor) {
            return {
                message:
                    `This professor already has a lecture from ` +
                    `${existing.startTime} to ${existing.endTime}. ` +
                    `Choose a different time.`,
                conflict: conflictDetails,
            };
        }
    }

    return null;
};

// API 1: Create Lecture (Admin)
export const createLecture = async (req, res) => {
    try {
        const {
            subject,
            assignedClass,
            classroomName,
            classroomId,
            date,
            startTime,
            endTime,
        } = req.body || {};

        if (
            typeof subject !== "string" ||
            !subject.trim() ||
            typeof assignedClass !== "string" ||
            !assignedClass.trim() ||
            typeof classroomName !== "string" ||
            !classroomName.trim() ||
            classroomName.trim().length > 150 ||
            !isValidDate(date) ||
            typeof startTime !== "string" ||
            typeof endTime !== "string"
        ) {
            return res.status(400).json({
                message:
                    "Subject, class, classroom name, valid date, start time and end time are required.",
            });
        }

        const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

        if (
            !timeRegex.test(startTime) ||
            !timeRegex.test(endTime) ||
            startTime >= endTime
        ) {
            return res.status(400).json({
                message: "Please provide valid start and end times.",
            });
        }

        // Only the classroom name is required.
        // No matching Classroom database record is necessary.
        const resolvedClassroom = await resolveClassroom(
            classroomName,
            classroomId
        );

        if (!resolvedClassroom) {
            return res.status(400).json({
                message: "Enter a valid classroom name.",
            });
        }

        const result = await findAssignedProfessor(
            subject,
            assignedClass
        );

        if (result.error) {
            return res.status(result.status).json({
                message: result.error,
            });
        }

        const professor = result.professor;

        const matchedSubject = professor.subjects.find(
            (item) =>
                item.toLowerCase() === subject.trim().toLowerCase()
        );

        const matchedClass = professor.assignedClasses.find(
            (item) =>
                item.toLowerCase() ===
                assignedClass.trim().toLowerCase()
        );

        // NEW: Check schedule conflicts before creating the lecture.
        const conflict = await findLectureConflict({
            professorId: professor._id,
            assignedClass: matchedClass,
            classroomName: resolvedClassroom.classroomName,
            classroomId: resolvedClassroom.classroomId,
            date: new Date(`${date}T00:00:00.000Z`),
            startTime,
            endTime,
        });

        if (conflict) {
            return res.status(409).json({
                message: conflict.message,
                conflict: conflict.conflict,
            });
        }

        const lecture = await Lecture.create({
            professor: professor._id,
            professorName: professor.name,
            subject: matchedSubject,
            assignedClass: matchedClass,
            classroom: resolvedClassroom.classroomId,
            classroomName: resolvedClassroom.classroomName,
            date: new Date(`${date}T00:00:00.000Z`),
            startTime,
            endTime,
        });

        return res.status(201).json({
            message: "Lecture created successfully.",
            lecture,
        });
    } catch (error) {
        console.error("Create lecture error:", error);

        if (error.name === "ValidationError") {
            return res.status(400).json({
                message: error.message,
            });
        }

        return res.status(500).json({
            message: "Server error while creating lecture.",
        });
    }
};

// API 2: Get Lectures (optional date filter)
export const getLectures = async (req, res) => {
    try {
        const { date } = req.query;
        const filter = {};

        if (date !== undefined) {
            if (!isValidDate(date)) {
                return res.status(400).json({
                    message: "Date must be valid and in YYYY-MM-DD format.",
                });
            }

            const startDate = new Date(`${date}T00:00:00.000Z`);
            const endDate = new Date(startDate);
            endDate.setUTCDate(endDate.getUTCDate() + 1);

            filter.date = {
                $gte: startDate,
                $lt: endDate,
            };
        }

        // Professors only receive their own assigned lectures.
        // Admins can view all lectures allowed by the route middleware.
        if (req.user.role === "professor") {
            filter.professor = req.user.id;
        }

        const lectures = await Lecture.find(filter)
            .populate(
                "classroom",
                "classroomName building latitude longitude radiusMeters isActive"
            )
            .sort({ date: -1, startTime: 1 });

        return res.status(200).json({
            count: lectures.length,
            lectures,
        });
    } catch (error) {
        console.error("Get lectures error:", error);

        return res.status(500).json({
            message: "Server error while fetching lectures.",
        });
    }
};

// API 3: Update Lecture (Admin)
export const updateLecture = async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                message: "Invalid lecture ID.",
            });
        }

        const lecture = await Lecture.findById(id);

        if (!lecture) {
            return res.status(404).json({
                message: "Lecture not found.",
            });
        }

        if (["completed", "cancelled"].includes(lecture.status)) {
            return res.status(400).json({
                message: "Completed or cancelled lectures cannot be updated.",
            });
        }

        const {
            subject,
            assignedClass,
            classroomName,
            classroomId,
            date,
            startTime,
            endTime,
        } = req.body || {};

        const newSubject =
            subject === undefined ? lecture.subject : subject;

        const newClass =
            assignedClass === undefined
                ? lecture.assignedClass
                : assignedClass;

        const newDate =
            date === undefined
                ? lecture.date.toISOString().slice(0, 10)
                : date;

        const newStartTime =
            startTime === undefined ? lecture.startTime : startTime;

        const newEndTime =
            endTime === undefined ? lecture.endTime : endTime;

        if (
            typeof newSubject !== "string" ||
            !newSubject.trim() ||
            typeof newClass !== "string" ||
            !newClass.trim() ||
            !isValidDate(newDate)
        ) {
            return res.status(400).json({
                message: "Subject, class and valid date are required.",
            });
        }

        const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

        if (
            typeof newStartTime !== "string" ||
            typeof newEndTime !== "string" ||
            !timeRegex.test(newStartTime) ||
            !timeRegex.test(newEndTime) ||
            newStartTime >= newEndTime
        ) {
            return res.status(400).json({
                message: "Please provide valid start and end times.",
            });
        }

        const requestedClassroomName =
            classroomName === undefined
                ? lecture.classroomName
                : classroomName;

        const requestedClassroomId =
            classroomId === undefined
                ? lecture.classroom?.toString()
                : classroomId;

        const resolvedClassroom = await resolveClassroom(
            requestedClassroomName,
            requestedClassroomId
        );

        if (!resolvedClassroom) {
            return res.status(400).json({
                message: "Enter a classroom name.",
            });
        }

        const result = await findAssignedProfessor(
            newSubject,
            newClass
        );

        if (result.error) {
            return res.status(result.status).json({
                message: result.error,
            });
        }

        const professor = result.professor;

        const matchedSubject = professor.subjects.find(
            (item) =>
                item.toLowerCase() === newSubject.trim().toLowerCase()
        );

        const matchedClass = professor.assignedClasses.find(
            (item) =>
                item.toLowerCase() === newClass.trim().toLowerCase()
        );

        // NEW: Check schedule conflicts before updating the lecture.
        // Exclude this lecture from the conflict search.
        const conflict = await findLectureConflict({
            professorId: professor._id,
            assignedClass: matchedClass,
            classroomName: resolvedClassroom.classroomName,
            classroomId: resolvedClassroom.classroomId,
            date: new Date(`${newDate}T00:00:00.000Z`),
            startTime: newStartTime,
            endTime: newEndTime,
            excludeLectureId: lecture._id,
        });

        if (conflict) {
            return res.status(409).json({
                message: conflict.message,
                conflict: conflict.conflict,
            });
        }

        lecture.professor = professor._id;
        lecture.professorName = professor.name;
        lecture.subject = matchedSubject;
        lecture.assignedClass = matchedClass;
        lecture.classroom = resolvedClassroom.classroomId;
        lecture.classroomName = resolvedClassroom.classroomName;
        lecture.date = new Date(`${newDate}T00:00:00.000Z`);
        lecture.startTime = newStartTime;
        lecture.endTime = newEndTime;

        await lecture.save();

        return res.status(200).json({
            message: "Lecture updated successfully.",
            lecture,
        });
    } catch (error) {
        console.error("Update lecture error:", error);

        if (error.name === "ValidationError") {
            return res.status(400).json({
                message: error.message,
            });
        }

        return res.status(500).json({
            message: "Server error while updating lecture.",
        });
    }
};

// API 4: Cancel Lecture (record is retained)
export const cancelLecture = async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                message: "Invalid lecture ID.",
            });
        }

        const lecture = await Lecture.findById(id);

        if (!lecture) {
            return res.status(404).json({
                message: "Lecture not found.",
            });
        }

        if (lecture.status === "cancelled") {
            return res.status(400).json({
                message: "Lecture is already cancelled.",
            });
        }

        if (lecture.status === "completed") {
            return res.status(400).json({
                message: "Completed lecture cannot be cancelled.",
            });
        }

        lecture.status = "cancelled";
        await lecture.save();

        return res.status(200).json({
            message: "Lecture cancelled successfully.",
            lecture,
        });
    } catch (error) {
        console.error("Cancel lecture error:", error);

        return res.status(500).json({
            message: "Server error while cancelling lecture.",
        });
    }
};

// API 5: Professor Start Lecture
export const startLecture = async (req, res) => {
    try {
        const { id } = req.params;
        const { latitude, longitude } = req.body || {};

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid lecture ID.",
            });
        }

        if (
            typeof latitude !== "number" ||
            typeof longitude !== "number" ||
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude) ||
            latitude < -90 ||
            latitude > 90 ||
            longitude < -180 ||
            longitude > 180
        ) {
            return res.status(400).json({
                success: false,
                message: "Valid Professor location is required to start attendance.",
            });
        }

        const lecture = await Lecture.findById(id);

        if (!lecture) {
            return res.status(404).json({
                success: false,
                message: "Lecture not found.",
            });
        }

        if (lecture.professor.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: "You can only start your own lectures.",
            });
        }

        if (lecture.status !== "scheduled") {
            return res.status(400).json({
                success: false,
                message: "Only scheduled lectures can be started.",
            });
        }

        // Free-text classroom names do not require a Classroom record.
        // Legacy lectures without a saved name still require an active room.
        if (!lecture.classroomName) {
            const classroom = await findActiveClassroom(
                lecture.classroom?.toString()
            );

            if (!classroom) {
                return res.status(400).json({
                    success: false,
                    message: "The lecture needs a classroom name or an active classroom record.",
                });
            }

            lecture.classroomName = classroom.classroomName;
        }

        lecture.professorLocation = {
            latitude,
            longitude,
            capturedAt: new Date(),
        };

        // Preserve the 30-metre attendance radius.
        lecture.attendanceRadiusMeters = 30;
        lecture.status = "ongoing";

        await lecture.save();

        return res.status(200).json({
            success: true,
            message: "Lecture started successfully.",
            lecture,
            professorLocation: {
                latitude: lecture.professorLocation.latitude,
                longitude: lecture.professorLocation.longitude,
                capturedAt: lecture.professorLocation.capturedAt,
            },
            attendanceRadiusMeters: lecture.attendanceRadiusMeters,
        });
    } catch (error) {
        console.error("Start lecture error:", error);

        return res.status(500).json({
            success: false,
            message: "Server error while starting lecture.",
        });
    }
};

// API 6: Professor Stop Lecture
export const stopLecture = async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                message: "Invalid lecture ID.",
            });
        }

        const lecture = await Lecture.findById(id);

        if (!lecture) {
            return res.status(404).json({
                message: "Lecture not found.",
            });
        }

        if (lecture.professor.toString() !== req.user.id) {
            return res.status(403).json({
                message: "You can only stop your own lectures.",
            });
        }

        if (lecture.status !== "ongoing") {
            return res.status(400).json({
                message: "Only ongoing lectures can be stopped.",
            });
        }

        lecture.status = "completed";
        await lecture.save();

        return res.status(200).json({
            message: "Lecture stopped successfully.",
            lecture,
        });
    } catch (error) {
        console.error("Stop lecture error:", error);

        return res.status(500).json({
            message: "Server error while stopping lecture.",
        });
    }
};
