import XLSX from "xlsx";
import Professor from "../models/Professor.js";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Subjects ya Classes ko array mein convert karna
const normalizeList = (value) => {
    if (Array.isArray(value)) {
        return value
            .filter((item) => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean);
    }

    if (typeof value === "string" && value.trim()) {
        return value
            .split("|")
            .map((item) => item.trim())
            .filter(Boolean);
    }

    return [];
};

// API 1: Add Professor
export const addProfessor = async (req, res) => {
    try {
        const { name, email, subjects, assignedClasses, class: classValue } = req.body;

        if (
            typeof name !== "string" ||
            !name.trim() ||
            typeof email !== "string" ||
            !email.trim()
        ) {
            return res.status(400).json({
                message: "Professor name and email are required",
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        if (!emailRegex.test(normalizedEmail)) {
            return res.status(400).json({
                message: "Please enter a valid email address",
            });
        }

        if (
            subjects !== undefined &&
            !Array.isArray(subjects) &&
            typeof subjects !== "string"
        ) {
            return res.status(400).json({
                message: "Subjects must be a string or an array",
            });
        }

        const classesInput = assignedClasses ?? classValue;

        if (
            classesInput !== undefined &&
            !Array.isArray(classesInput) &&
            typeof classesInput !== "string"
        ) {
            return res.status(400).json({
                message: "Classes must be a string or an array",
            });
        }

        const existingProfessor = await Professor.findOne({
            email: normalizedEmail,
        });

        if (existingProfessor) {
            return res.status(409).json({
                message: "Professor with this email already exists",
            });
        }

        const professorSubjects = normalizeList(subjects);
        const professorClasses = normalizeList(classesInput);

        const professor = await Professor.create({
            name: name.trim(),
            email: normalizedEmail,
            subjects: professorSubjects,
            assignedClasses: professorClasses,
        });

        return res.status(201).json({
            message: "Professor added successfully",
            professor,
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                message: "Professor with this email already exists",
            });
        }

        console.error("Add professor error:", error.message);

        return res.status(500).json({
            message: "Server error while adding professor",
        });
    }
};

// API 2: Get All Professors
export const getProfessors = async (req, res) => {
    try {
        const professors = await Professor.find()
            .select("-__v")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            count: professors.length,
            professors,
        });
    } catch (error) {
        console.error("Get professors error:", error.message);

        return res.status(500).json({
            message: "Server error while fetching professors",
        });
    }
};

// API 3: Search Professors by Name, Email, or Subject
export const searchProfessors = async (req, res) => {
    try {
        const { search } = req.query;

        if (typeof search !== "string" || !search.trim()) {
            return res.status(400).json({
                message: "Please enter a name, email, or subject to search",
            });
        }

        const searchText = search.trim();

        const professors = await Professor.find({
            $or: [
                { name: { $regex: searchText, $options: "i" } },
                { email: { $regex: searchText, $options: "i" } },
                { subjects: { $regex: searchText, $options: "i" } },
                { assignedClasses: { $regex: searchText, $options: "i" } },
            ],
        })
            .select("-__v")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            count: professors.length,
            professors,
        });
    } catch (error) {
        console.error("Search professors error:", error.message);

        return res.status(500).json({
            message: "Server error while searching professors",
        });
    }
};

// API 4: Update Professor
export const updateProfessor = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, subjects, assignedClasses } = req.body;

        if (!/^[0-9a-fA-F]{24}$/.test(id)) {
            return res.status(400).json({
                message: "Invalid professor ID",
            });
        }

        const professor = await Professor.findById(id);

        if (!professor) {
            return res.status(404).json({
                message: "Professor not found",
            });
        }

        if (name !== undefined) {
            if (typeof name !== "string" || !name.trim()) {
                return res.status(400).json({
                    message: "Name must be a non-empty string",
                });
            }

            professor.name = name.trim();
        }

        if (email !== undefined) {
            if (typeof email !== "string" || !email.trim()) {
                return res.status(400).json({
                    message: "Email must be a non-empty string",
                });
            }

            const normalizedEmail = email.trim().toLowerCase();

            if (!emailRegex.test(normalizedEmail)) {
                return res.status(400).json({
                    message: "Please enter a valid email address",
                });
            }

            const existingProfessor = await Professor.findOne({
                email: normalizedEmail,
                _id: { $ne: id },
            });

            if (existingProfessor) {
                return res.status(409).json({
                    message: "This email is already used by another professor",
                });
            }

            professor.email = normalizedEmail;
        }

        if (subjects !== undefined) {
            if (
                !Array.isArray(subjects) &&
                typeof subjects !== "string"
            ) {
                return res.status(400).json({
                    message: "Subjects must be a string or an array",
                });
            }

            professor.subjects = normalizeList(subjects);
        }

        if (assignedClasses !== undefined) {
            if (
                !Array.isArray(assignedClasses) &&
                typeof assignedClasses !== "string"
            ) {
                return res.status(400).json({
                    message: "Classes must be a string or an array",
                });
            }

            professor.assignedClasses = normalizeList(assignedClasses);
        }

        await professor.save();

        return res.status(200).json({
            message: "Professor updated successfully",
            professor,
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                message: "This email is already used by another professor",
            });
        }

        console.error("Update professor error:", error.message);

        return res.status(500).json({
            message: "Server error while updating professor",
        });
    }
};

// API 5: Deactivate Professor
export const deactivateProfessor = async (req, res) => {
    try {
        const { id } = req.params;

        if (!/^[0-9a-fA-F]{24}$/.test(id)) {
            return res.status(400).json({
                message: "Invalid professor ID",
            });
        }

        const professor = await Professor.findById(id);

        if (!professor) {
            return res.status(404).json({
                message: "Professor not found",
            });
        }

        if (!professor.isActive) {
            return res.status(400).json({
                message: "Professor is already deactivated",
            });
        }

        professor.isActive = false;
        await professor.save();

        return res.status(200).json({
            message: "Professor deactivated successfully",
            professor,
        });
    } catch (error) {
        console.error("Deactivate professor error:", error.message);

        return res.status(500).json({
            message: "Server error while deactivating professor",
        });
    }
};

// API 6: Reactivate Professor
export const reactivateProfessor = async (req, res) => {
    try {
        const { id } = req.params;

        if (!/^[0-9a-fA-F]{24}$/.test(id)) {
            return res.status(400).json({
                message: "Invalid professor ID",
            });
        }

        const professor = await Professor.findById(id);

        if (!professor) {
            return res.status(404).json({
                message: "Professor not found",
            });
        }

        if (professor.isActive) {
            return res.status(400).json({
                message: "Professor is already active",
            });
        }

        professor.isActive = true;
        await professor.save();

        return res.status(200).json({
            message: "Professor reactivated successfully",
            professor,
        });
    } catch (error) {
        console.error("Reactivate professor error:", error.message);

        return res.status(500).json({
            message: "Server error while reactivating professor",
        });
    }
};

// API 7: Bulk Upload Professors
export const bulkUploadProfessors = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                message: "Please upload a CSV or Excel file",
            });
        }

        const workbook = XLSX.read(req.file.buffer, {
            type: "buffer",
        });

        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

        if (!firstSheet) {
            return res.status(400).json({
                message: "The uploaded file has no worksheet",
            });
        }

        const rows = XLSX.utils.sheet_to_json(firstSheet, {
            defval: "",
            raw: false,
        });

        if (rows.length === 0) {
            return res.status(400).json({
                message: "The uploaded file is empty",
            });
        }

        if (rows.length > 1000) {
            return res.status(400).json({
                message: "Maximum 1000 rows are allowed per upload",
            });
        }

        const normalizedRows = rows.map((row) => {
            const normalized = {};

            for (const [key, value] of Object.entries(row)) {
                normalized[String(key).trim().toLowerCase()] = value;
            }

            return normalized;
        });

        const requiredColumns = ["name", "email", "subjects", "class"];
        const headers = Object.keys(normalizedRows[0]);

        const missingColumns = requiredColumns.filter(
            (column) => !headers.includes(column)
        );

        if (missingColumns.length > 0) {
            return res.status(400).json({
                message: "Required columns are missing",
                missingColumns,
            });
        }

        const seenEmails = new Set();
        const errors = [];
        const validRows = [];

        normalizedRows.forEach((row, index) => {
            const rowNumber = index + 2;
            const name = String(row.name ?? "").trim();
            const email = String(row.email ?? "").trim().toLowerCase();
            const subjectsText = String(row.subjects ?? "").trim();
            const classesText = String(row.class ?? "").trim();

            if (!name || !email) {
                errors.push({
                    row: rowNumber,
                    email: email || null,
                    reason: "Name and email are required",
                });
                return;
            }

            if (!emailRegex.test(email)) {
                errors.push({
                    row: rowNumber,
                    email,
                    reason: "Invalid email address",
                });
                return;
            }

            if (seenEmails.has(email)) {
                errors.push({
                    row: rowNumber,
                    email,
                    reason: "Duplicate email in uploaded file",
                });
                return;
            }

            if (!subjectsText || !classesText) {
                errors.push({
                    row: rowNumber,
                    email,
                    reason: "Subjects and class are required",
                });
                return;
            }

            seenEmails.add(email);

            const subjects = normalizeList(subjectsText);
            const assignedClasses = normalizeList(classesText);

            if (!subjects.length || !assignedClasses.length) {
                errors.push({
                    row: rowNumber,
                    email,
                    reason: "At least one subject and one class are required",
                });
                return;
            }

            validRows.push({
                row: rowNumber,
                name,
                email,
                subjects,
                assignedClasses,
            });
        });

        const emails = validRows.map((row) => row.email);

        const existingProfessors = await Professor.find({
            email: { $in: emails },
        }).select("email");

        const existingEmails = new Set(
            existingProfessors.map((professor) =>
                professor.email.toLowerCase()
            )
        );

        const imported = [];

        for (const row of validRows) {
            if (existingEmails.has(row.email)) {
                errors.push({
                    row: row.row,
                    email: row.email,
                    reason: "Professor email already exists",
                });
                continue;
            }

            try {
                const professor = await Professor.create({
                    name: row.name,
                    email: row.email,
                    subjects: row.subjects,
                    assignedClasses: row.assignedClasses,
                });

                imported.push({
                    row: row.row,
                    name: professor.name,
                    email: professor.email,
                    subjects: professor.subjects,
                    assignedClasses: professor.assignedClasses,
                });
            } catch (error) {
                if (error.code === 11000) {
                    errors.push({
                        row: row.row,
                        email: row.email,
                        reason: "Professor email already exists",
                    });
                } else {
                    console.error(
                        `Bulk upload row ${row.row} error:`,
                        error.message
                    );

                    errors.push({
                        row: row.row,
                        email: row.email,
                        reason: "Could not save this professor",
                    });
                }
            }
        }

        return res.status(200).json({
            message: "Bulk upload processed",
            totalRows: rows.length,
            importedCount: imported.length,
            failedCount: errors.length,
            imported,
            errors,
        });
    } catch (error) {
        console.error("Bulk upload professors error:", error.message);

        return res.status(500).json({
            message: "Server error while uploading professors",
        });
    }
};
