import XLSX from "xlsx";
import Professor from "../models/Professor.js";
import PendingProfessorRegistration from "../models/PendingProfessorRegistration.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { sendProfessorRegistrationOTP } from "../utils/emailService.js";

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

// OTP ko securely hash karna
const hashOTP = (otp) =>
    crypto
        .createHmac("sha256", process.env.OTP_SECRET)
        .update(otp)
        .digest("hex");

// OTP hashes ko timing-safe way mein compare karna
const safeCompare = (a, b) => {
    const bufferA = Buffer.from(a, "hex");
    const bufferB = Buffer.from(b, "hex");

    return (
        bufferA.length === bufferB.length &&
        crypto.timingSafeEqual(bufferA, bufferB)
    );
};

// Safe Professor response: password kabhi return nahi hoga
const safeProfessor = (professor) => ({
    id: professor._id,
    name: professor.name,
    email: professor.email,
    subjects: professor.subjects,
    assignedClasses: professor.assignedClasses,
    isRegistered: professor.isRegistered,
    isActive: professor.isActive,
    createdAt: professor.createdAt,
    updatedAt: professor.updatedAt,
});

// API 1: Add Professor (Admin)
export const addProfessor = async (req, res) => {
    try {
        const {
            name,
            email,
            subjects,
            assignedClasses,
            class: classValue,
        } = req.body;

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

        const professor = await Professor.create({
            name: name.trim(),
            email: normalizedEmail,
            subjects: normalizeList(subjects),
            assignedClasses: normalizeList(classesInput),
        });

        return res.status(201).json({
            message: "Professor added successfully",
            professor: safeProfessor(professor),
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
            professors: professors.map(safeProfessor),
        });
    } catch (error) {
        console.error("Get professors error:", error.message);

        return res.status(500).json({
            message: "Server error while fetching professors",
        });
    }
};

// API 3: Search Professors
export const searchProfessors = async (req, res) => {
    try {
        const { search } = req.query;

        if (typeof search !== "string" || !search.trim()) {
            return res.status(400).json({
                message: "Please enter a name, email, or subject to search",
            });
        }

        // Escape regex special characters from user input
        const searchText = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
            professors: professors.map(safeProfessor),
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

            // Registered account ka email change hone par OTP identity break ho sakti hai.
            if (professor.isRegistered && normalizedEmail !== professor.email) {
                return res.status(400).json({
                    message: "Registered Professor email cannot be changed here",
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
            professor: safeProfessor(professor),
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
            professor: safeProfessor(professor),
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
            professor: safeProfessor(professor),
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

            seenEmails.add(email);

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

// API 8: Send Professor Registration OTP
export const sendProfessorOTP = async (req, res) => {
    try {
        const { email } = req.body;

        if (typeof email !== "string" || !email.trim()) {
            return res.status(400).json({
                message: "Email is required",
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        if (!emailRegex.test(normalizedEmail)) {
            return res.status(400).json({
                message: "Invalid email format",
            });
        }

        if (!process.env.OTP_SECRET) {
            return res.status(500).json({
                message: "OTP configuration is missing",
            });
        }

        const professor = await Professor.findOne({
            email: normalizedEmail,
        });

        if (!professor) {
            return res.status(404).json({
                message: "This email is not registered by the Admin",
            });
        }

        if (!professor.isActive) {
            return res.status(403).json({
                message: "This Professor account is inactive",
            });
        }

        if (professor.isRegistered) {
            return res.status(409).json({
                message: "Professor is already registered. Please login.",
            });
        }

        const existingPending =
            await PendingProfessorRegistration.findOne({
                email: normalizedEmail,
            });

        if (existingPending) {
            if (existingPending.expiresAt > new Date()) {
                return res.status(429).json({
                    message: "An OTP was already sent. Please wait 3 minutes.",
                });
            }

            await PendingProfessorRegistration.deleteOne({
                _id: existingPending._id,
            });
        }

        const otp = crypto.randomInt(100000, 1000000).toString();

        const pending = await PendingProfessorRegistration.create({
            email: normalizedEmail,
            otpHash: hashOTP(otp),
            expiresAt: new Date(Date.now() + 3 * 60 * 1000),
            attempts: 0,
        });

        try {
            await sendProfessorRegistrationOTP(normalizedEmail, otp);
        } catch (emailError) {
            await PendingProfessorRegistration.deleteOne({
                _id: pending._id,
            });

            console.error("Professor OTP email error:", emailError.message);

            return res.status(502).json({
                message: "Unable to send OTP email",
            });
        }

        return res.status(200).json({
            message: "OTP sent successfully. It is valid for 3 minutes.",
            email: normalizedEmail,
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(429).json({
                message: "An OTP request is already being processed. Please try again shortly.",
            });
        }

        console.error("Send Professor OTP error:", error.message);

        return res.status(500).json({
            message: "Internal server error",
        });
    }
};

// API 9: Verify OTP and Complete Professor Registration
export const verifyProfessorOTP = async (req, res) => {
    try {
        const { email, otp, password } = req.body;

        if (
            typeof email !== "string" ||
            !email.trim() ||
            otp === undefined ||
            password === undefined
        ) {
            return res.status(400).json({
                message: "Email, OTP and password are required",
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        if (!emailRegex.test(normalizedEmail)) {
            return res.status(400).json({
                message: "Invalid email format",
            });
        }

        if (!/^\d{6}$/.test(String(otp))) {
            return res.status(400).json({
                message: "OTP must contain 6 digits",
            });
        }

        if (typeof password !== "string" || password.length < 8) {
            return res.status(400).json({
                message: "Password must be at least 8 characters",
            });
        }

        if (!process.env.OTP_SECRET) {
            return res.status(500).json({
                message: "OTP configuration is missing",
            });
        }

        const pending = await PendingProfessorRegistration.findOne({
            email: normalizedEmail,
        }).select("+otpHash");

        if (!pending) {
            return res.status(400).json({
                message: "Registration not found or OTP expired. Please request a new OTP.",
            });
        }

        if (pending.expiresAt <= new Date()) {
            await PendingProfessorRegistration.deleteOne({
                _id: pending._id,
            });

            return res.status(400).json({
                message: "OTP has expired. Please request a new OTP.",
            });
        }

        const submittedHash = hashOTP(String(otp));

        if (!safeCompare(submittedHash, pending.otpHash)) {
            pending.attempts += 1;

            if (pending.attempts >= 5) {
                await PendingProfessorRegistration.deleteOne({
                    _id: pending._id,
                });

                return res.status(429).json({
                    message: "Too many incorrect OTP attempts. Please request a new OTP.",
                });
            }

            await pending.save();

            return res.status(400).json({
                message: "Incorrect OTP",
                attemptsRemaining: 5 - pending.attempts,
            });
        }

        const professor = await Professor.findOne({
            email: normalizedEmail,
        });

        if (!professor) {
            await PendingProfessorRegistration.deleteOne({
                _id: pending._id,
            });

            return res.status(404).json({
                message: "Professor record not found. Contact the Admin.",
            });
        }

        if (!professor.isActive) {
            await PendingProfessorRegistration.deleteOne({
                _id: pending._id,
            });

            return res.status(403).json({
                message: "This Professor account is inactive",
            });
        }

        if (professor.isRegistered) {
            await PendingProfessorRegistration.deleteOne({
                _id: pending._id,
            });

            return res.status(409).json({
                message: "Professor is already registered. Please login.",
            });
        }

        professor.password = await bcrypt.hash(password, 10);
        professor.isRegistered = true;

        await professor.save();

        await PendingProfessorRegistration.deleteOne({
            _id: pending._id,
        });

        return res.status(201).json({
            message: "Professor registered successfully. You can now login.",
            professor: {
                id: professor._id,
                name: professor.name,
                email: professor.email,
            },
        });
    } catch (error) {
        console.error("Verify Professor OTP error:", error.message);

        return res.status(500).json({
            message: "Internal server error",
        });
    }
};
// API 10: Professor Login
export const loginProfessor = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check required fields
        if (
            typeof email !== "string" ||
            !email.trim() ||
            typeof password !== "string" ||
            !password
        ) {
            return res.status(400).json({
                message: "Email and password are required",
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        // Validate email
        if (!emailRegex.test(normalizedEmail)) {
            return res.status(400).json({
                message: "Invalid email format",
            });
        }

        // Find Professor
        const professor = await Professor.findOne({
            email: normalizedEmail,
        }).select("+password");

        if (!professor) {
            return res.status(401).json({
                message: "Invalid email or password",
            });
        }

        // Check account status
        if (!professor.isActive) {
            return res.status(403).json({
                message: "Professor account is inactive",
            });
        }

        // Check registration
        if (!professor.isRegistered) {
            return res.status(403).json({
                message: "Professor registration is not completed",
            });
        }

        // Check password
        const isPasswordCorrect = await bcrypt.compare(
            password,
            professor.password
        );

        if (!isPasswordCorrect) {
            return res.status(401).json({
                message: "Invalid email or password",
            });
        }

        // Generate JWT
        const token = jwt.sign(
            {
                id: professor._id,
                email: professor.email,
                role: "professor",
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "7d",
            }
        );

        return res.status(200).json({
            message: "Professor login successful",
            token,
            professor: {
                id: professor._id,
                name: professor.name,
                email: professor.email,
                subjects: professor.subjects,
                assignedClasses: professor.assignedClasses,
                isRegistered: professor.isRegistered,
                isActive: professor.isActive,
            },
        });
    } catch (error) {
        console.error("Professor login error:", error.message);

        return res.status(500).json({
            message: "Internal server error",
        });
    }
};