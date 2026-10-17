
import Professor from "../models/Professor.js";
import Lecture from "../models/Lecture.js";

// Helper: Escape special characters for regex search
const escapeRegex = (value) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Helper: Validate date in YYYY-MM-DD format
const isValidDate = (value) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const date = new Date(`${value}T00:00:00.000Z`);

    return (
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
    );
};

// Helper: Find the professor assigned to a subject and class
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
            professor.subjects.some(
                (item) =>
                    item.toLowerCase() === subjectName.toLowerCase()
            ) &&
            professor.assignedClasses.some(
                (item) =>
                    item.toLowerCase() === className.toLowerCase()
            )
    );

    if (matchingProfessors.length === 0) {
        return {
            error: "No active professor is assigned to this subject and class",
            status: 400,
        };
    }

    if (matchingProfessors.length > 1) {
        return {
            error: "Multiple professors match this subject and class",
            status: 409,
        };
    }

    return { professor: matchingProfessors[0] };
};


// API 1: Create Lecture
export const createLecture = async (req, res) => {
    try {
        const { subject, assignedClass, date, startTime, endTime } = req.body;

        if (
            typeof subject !== "string" ||
            !subject.trim() ||
            typeof assignedClass !== "string" ||
            !assignedClass.trim() ||
            !isValidDate(date) ||
            typeof startTime !== "string" ||
            typeof endTime !== "string"
        ) {
            return res.status(400).json({
                message:
                    "Valid subject, class, date (YYYY-MM-DD), start time and end time are required",
            });
        }

        const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

        if (
            !timeRegex.test(startTime) ||
            !timeRegex.test(endTime) ||
            startTime >= endTime
        ) {
            return res.status(400).json({
                message: "Please provide valid start and end times",
            });
        }

        const result = await findAssignedProfessor(subject, assignedClass);

        if (result.error) {
            return res.status(result.status).json({
                message: result.error,
            });
        }

        const professor = result.professor;

        const lecture = await Lecture.create({
            professor: professor._id,
            professorName: professor.name,
            subject: professor.subjects.find(
                (item) =>
                    item.toLowerCase() === subject.trim().toLowerCase()
            ),
            assignedClass: professor.assignedClasses.find(
                (item) =>
                    item.toLowerCase() === assignedClass.trim().toLowerCase()
            ),
            date: new Date(`${date}T00:00:00.000Z`),
            startTime,
            endTime,
        });

        return res.status(201).json({
            message: "Lecture created successfully",
            lecture,
        });
    } catch (error) {
        console.error("Create lecture error:", error.message);

        return res.status(500).json({
            message: "Server error while creating lecture",
        });
    }
};


// API 2: Get All Lectures (optional date filter)
export const getLectures = async (req, res) => {
    try {
        const { date } = req.query;
        const filter = {};

        // Optional date filter
        if (date !== undefined) {
            if (!isValidDate(date)) {
                return res.status(400).json({
                    message: "Date must be a valid date in YYYY-MM-DD format",
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

        // Professor can only view their own lectures
        if (req.user.role === "professor") {
            filter.professor = req.user.id;
        }

        const lectures = await Lecture.find(filter).sort({
            date: -1,
            startTime: 1,
        });

        return res.status(200).json({
            count: lectures.length,
            lectures,
        });
    } catch (error) {
        console.error("Get lectures error:", error.message);

        return res.status(500).json({
            message: "Server error while fetching lectures",
        });
    }
};


// API 3: Update Lecture (Admin route)
export const updateLecture = async (req, res) => {
    try {
        const { id } = req.params;

        if (!/^[0-9a-fA-F]{24}$/.test(id)) {
            return res.status(400).json({
                message: "Invalid lecture ID",
            });
        }

        const lecture = await Lecture.findById(id);

        if (!lecture) {
            return res.status(404).json({
                message: "Lecture not found",
            });
        }

        if (["completed", "cancelled"].includes(lecture.status)) {
            return res.status(400).json({
                message: "Completed or cancelled lectures cannot be updated",
            });
        }

        const { subject, assignedClass, date, startTime, endTime } = req.body;

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
                message: "Subject, class and valid date are required",
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
                message: "Please provide valid start and end times",
            });
        }

        const result = await findAssignedProfessor(newSubject, newClass);

        if (result.error) {
            return res.status(result.status).json({
                message: result.error,
            });
        }

        const professor = result.professor;

        lecture.professor = professor._id;
        lecture.professorName = professor.name;

        lecture.subject = professor.subjects.find(
            (item) =>
                item.toLowerCase() === newSubject.trim().toLowerCase()
        );

        lecture.assignedClass = professor.assignedClasses.find(
            (item) =>
                item.toLowerCase() === newClass.trim().toLowerCase()
        );

        lecture.date = new Date(`${newDate}T00:00:00.000Z`);
        lecture.startTime = newStartTime;
        lecture.endTime = newEndTime;

        await lecture.save();

        return res.status(200).json({
            message: "Lecture updated successfully",
            lecture,
        });
    } catch (error) {
        console.error("Update lecture error:", error.message);

        return res.status(500).json({
            message: "Server error while updating lecture",
        });
    }
};


// API 4: Cancel Lecture (record is retained)
export const cancelLecture = async (req, res) => {
    try {
        const { id } = req.params;

        if (!/^[0-9a-fA-F]{24}$/.test(id)) {
            return res.status(400).json({
                message: "Invalid lecture ID",
            });
        }

        const lecture = await Lecture.findById(id);

        if (!lecture) {
            return res.status(404).json({
                message: "Lecture not found",
            });
        }

        if (lecture.status === "cancelled") {
            return res.status(400).json({
                message: "Lecture is already cancelled",
            });
        }

        if (lecture.status === "completed") {
            return res.status(400).json({
                message: "Completed lecture cannot be cancelled",
            });
        }

        lecture.status = "cancelled";
        await lecture.save();

        return res.status(200).json({
            message: "Lecture cancelled successfully",
            lecture,
        });
    } catch (error) {
        console.error("Cancel lecture error:", error.message);

        return res.status(500).json({
            message: "Server error while cancelling lecture",
        });
    }
};


// API 5: Professor Start Lecture
export const startLecture = async (req, res) => {
    try {
        const { id } = req.params;

        if (!/^[0-9a-fA-F]{24}$/.test(id)) {
            return res.status(400).json({
                message: "Invalid lecture ID",
            });
        }

        const lecture = await Lecture.findById(id);

        if (!lecture) {
            return res.status(404).json({
                message: "Lecture not found",
            });
        }

        // Professor can only start their own lecture
        if (lecture.professor.toString() !== req.user.id) {
            return res.status(403).json({
                message: "You can only start your own lectures",
            });
        }

        if (lecture.status !== "scheduled") {
            return res.status(400).json({
                message: "Only scheduled lectures can be started",
            });
        }

        lecture.status = "ongoing";
        await lecture.save();

        return res.status(200).json({
            message: "Lecture started successfully",
            lecture,
        });
    } catch (error) {
        console.error("Start lecture error:", error.message);

        return res.status(500).json({
            message: "Server error while starting lecture",
        });
    }
};


// API 6: Professor Stop Lecture
export const stopLecture = async (req, res) => {
    try {
        const { id } = req.params;

        if (!/^[0-9a-fA-F]{24}$/.test(id)) {
            return res.status(400).json({
                message: "Invalid lecture ID",
            });
        }

        const lecture = await Lecture.findById(id);

        if (!lecture) {
            return res.status(404).json({
                message: "Lecture not found",
            });
        }

        // Professor can only stop their own lecture
        if (lecture.professor.toString() !== req.user.id) {
            return res.status(403).json({
                message: "You can only stop your own lectures",
            });
        }

        if (lecture.status !== "ongoing") {
            return res.status(400).json({
                message: "Only ongoing lectures can be stopped",
            });
        }

        lecture.status = "completed";
        await lecture.save();

        return res.status(200).json({
            message: "Lecture stopped successfully",
            lecture,
        });
    } catch (error) {
        console.error("Stop lecture error:", error.message);

        return res.status(500).json({
            message: "Server error while stopping lecture",
        });
    }
};
