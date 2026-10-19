
import Admin from "../models/Admin.js";
import PendingAdminRegistration from "../models/PendingAdminRegistration.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import XLSX from "xlsx";
import Lecture from "../models/Lecture.js";
import Student from "../models/StudentModel.js";
import RevokedToken from "../models/RevokedToken.js";
import { sendAdminOTP } from "../utils/emailService.js";
import Attendance from "../models/Attendance.js";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ==================================================
// COMMON HELPERS
// ==================================================

const hashOTP = (otp) =>
    crypto
        .createHmac("sha256", process.env.OTP_SECRET)
        .update(otp)
        .digest("hex");

const safeCompare = (a, b) => {
    if (typeof a !== "string" || typeof b !== "string") {
        return false;
    }

    const bufferA = Buffer.from(a, "hex");
    const bufferB = Buffer.from(b, "hex");

    return (
        bufferA.length > 0 &&
        bufferA.length === bufferB.length &&
        crypto.timingSafeEqual(bufferA, bufferB)
    );
};

const normalizeEmail = (value) =>
    String(value ?? "").trim().toLowerCase();

const normalizeClass = (value) =>
    String(value ?? "").trim().toUpperCase();

const formatStudent = (student) => ({
    id: student._id,
    name: student.academicDetails.fullName,
    rollNo: student.academicDetails.rollNo,
    batch: student.academicDetails.batch,
    class: student.academicDetails.class,
    division: student.academicDetails.division,
    email: student.email,
    phone: student.phone || "",
    isActivated: student.isActivated,
    createdAt: student.createdAt,
    updatedAt: student.updatedAt,
});

// Duplicate check: email globally unique; Roll No unique within a class.
const findStudentDuplicate = async ({
    email,
    rollNo,
    className,
    excludeId,
}) => {
    const exclusion = excludeId ? { _id: { $ne: excludeId } } : {};

    if (email) {
        const emailDuplicate = await Student.findOne({
            ...exclusion,
            email: normalizeEmail(email),
        });

        if (emailDuplicate) {
            return {
                type: "email",
                student: emailDuplicate,
            };
        }
    }

    if (rollNo !== undefined && className) {
        const rollDuplicate = await Student.findOne({
            ...exclusion,
            "academicDetails.rollNo": Number(rollNo),
            "academicDetails.class": normalizeClass(className),
        });

        if (rollDuplicate) {
            return {
                type: "rollNo",
                student: rollDuplicate,
            };
        }
    }

    return null;
};

// ==================================================
// ADMIN REGISTRATION - SEND OTP
// ==================================================

export const registerAdmin = async (req, res) => {
    try {
        const { name, email, password } = req.body || {};

        if (
            typeof name !== "string" ||
            !name.trim() ||
            typeof email !== "string" ||
            !email.trim() ||
            typeof password !== "string" ||
            !password
        ) {
            return res.status(400).json({
                message: "All fields are required",
            });
        }

        const normalizedEmail = normalizeEmail(email);

        if (!emailRegex.test(normalizedEmail)) {
            return res.status(400).json({
                message: "Invalid email format",
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                message: "Password must be at least 8 characters",
            });
        }

        if (!process.env.OTP_SECRET) {
            return res.status(500).json({
                message: "OTP configuration is missing",
            });
        }

        const existingAdmin = await Admin.findOne({
            email: normalizedEmail,
        });

        if (existingAdmin) {
            return res.status(409).json({
                message: "Admin already exists",
            });
        }

        const existingPending = await PendingAdminRegistration.findOne({
            email: normalizedEmail,
        });

        if (existingPending) {
            if (existingPending.expiresAt > new Date()) {
                return res.status(429).json({
                    message:
                        "An OTP was already sent. Please wait until it expires.",
                });
            }

            await PendingAdminRegistration.deleteOne({
                _id: existingPending._id,
            });
        }

        const otp = crypto.randomInt(100000, 1000000).toString();
        const passwordHash = await bcrypt.hash(password, 10);
        const otpHash = hashOTP(otp);

        const pending = await PendingAdminRegistration.create({
            name: name.trim(),
            email: normalizedEmail,
            passwordHash,
            otpHash,
            expiresAt: new Date(Date.now() + 3 * 60 * 1000),
            attempts: 0,
        });

        try {
            await sendAdminOTP(normalizedEmail, otp);
        } catch (emailError) {
            await PendingAdminRegistration.deleteOne({
                _id: pending._id,
            });

            console.error("OTP email error:", emailError);

            return res.status(502).json({
                message:
                    "Unable to send OTP email. Please check email configuration.",
            });
        }

        return res.status(200).json({
            message: "OTP sent successfully. It is valid for 3 minutes.",
            email: normalizedEmail,
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                message:
                    "A registration for this email already exists. Please try again.",
            });
        }

        console.error("Admin registration error:", error);

        return res.status(500).json({
            message: "Internal server error",
        });
    }
};

// ==================================================
// VERIFY OTP AND CREATE ADMIN
// ==================================================

export const verifyAdminOTP = async (req, res) => {
    try {
        const { email, otp } = req.body || {};

        if (
            typeof email !== "string" ||
            !email.trim() ||
            otp === undefined ||
            otp === null ||
            String(otp).trim() === ""
        ) {
            return res.status(400).json({
                message: "Email and OTP are required",
            });
        }

        const normalizedEmail = normalizeEmail(email);

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

        if (!process.env.OTP_SECRET) {
            return res.status(500).json({
                message: "OTP configuration is missing",
            });
        }

        const pending = await PendingAdminRegistration.findOne({
            email: normalizedEmail,
        }).select("+passwordHash +otpHash");

        if (!pending) {
            return res.status(400).json({
                message:
                    "Registration not found or OTP expired. Please register again.",
            });
        }

        if (pending.expiresAt <= new Date()) {
            await PendingAdminRegistration.deleteOne({
                _id: pending._id,
            });

            return res.status(400).json({
                message: "OTP has expired. Please register again.",
            });
        }

        const submittedHash = hashOTP(String(otp));

        if (!safeCompare(submittedHash, pending.otpHash)) {
            pending.attempts = (pending.attempts || 0) + 1;

            if (pending.attempts >= 5) {
                await PendingAdminRegistration.deleteOne({
                    _id: pending._id,
                });

                return res.status(429).json({
                    message:
                        "Too many incorrect OTP attempts. Please register again.",
                });
            }

            await pending.save();

            return res.status(400).json({
                message: "Incorrect OTP",
                attemptsRemaining: 5 - pending.attempts,
            });
        }

        const existingAdmin = await Admin.findOne({
            email: normalizedEmail,
        });

        if (existingAdmin) {
            await PendingAdminRegistration.deleteOne({
                _id: pending._id,
            });

            return res.status(409).json({
                message: "Admin already exists",
            });
        }

        const admin = await Admin.create({
            name: pending.name,
            email: pending.email,
            password: pending.passwordHash,
        });

        await PendingAdminRegistration.deleteOne({
            _id: pending._id,
        });

        return res.status(201).json({
            message: "Admin registered successfully",
            admin: {
                id: admin._id,
                name: admin.name,
                email: admin.email,
                role: admin.role,
            },
        });
    } catch (error) {
        console.error("OTP verification error:", error);

        return res.status(500).json({
            message: "Internal server error",
        });
    }
};

// ==================================================
// ADMIN LOGIN
// ==================================================

export const loginAdmin = async (req, res) => {
    try {
        const { email, password } = req.body || {};

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

        const normalizedEmail = normalizeEmail(email);

        if (!emailRegex.test(normalizedEmail)) {
            return res.status(400).json({
                message: "Invalid email format",
            });
        }

        if (!process.env.JWT_SECRET) {
            return res.status(500).json({
                message: "JWT configuration is missing",
            });
        }

        const admin = await Admin.findOne({
            email: normalizedEmail,
        }).select("+password");

        if (
            !admin ||
            !(await bcrypt.compare(password, admin.password))
        ) {
            return res.status(401).json({
                message: "Invalid email or password",
            });
        }

        const token = jwt.sign(
            {
                id: admin._id,
                role: admin.role,
            },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        return res.status(200).json({
            message: "Login successful",
            token,
            admin: {
                id: admin._id,
                name: admin.name,
                email: admin.email,
                role: admin.role,
            },
        });
    } catch (error) {
        console.error("Admin login error:", error);

        return res.status(500).json({
            message: "Internal server error",
        });
    }
};

// ==================================================
// ADMIN LOGOUT
// ==================================================

export const logoutAdmin = async (req, res) => {
    try {
        const authorization = req.headers.authorization || "";
        const parts = authorization.split(" ");

        if (parts.length !== 2 || parts[0] !== "Bearer" || !parts[1]) {
            return res.status(401).json({
                message: "Bearer token is required",
            });
        }

        if (!req.user?.exp) {
            return res.status(401).json({
                message: "Invalid or expired token",
            });
        }

        const token = parts[1];

        const tokenHash = crypto
            .createHash("sha256")
            .update(token)
            .digest("hex");

        await RevokedToken.create({
            tokenHash,
            expiresAt: new Date(req.user.exp * 1000),
        });

        return res.status(200).json({
            message: "Logout successful",
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(200).json({
                message: "Logout successful",
            });
        }

        console.error("Admin logout error:", error);

        return res.status(500).json({
            message: "Internal server error",
        });
    }
};

// ==================================================
// ADD STUDENT
// ==================================================

export const addStudent = async (req, res) => {
    try {
        const {
            name,
            fullName,
            email,
            rollNo,
            batch,
            class: className,
            course,
            division,
            phone,
        } = req.body || {};

        const rawName = fullName ?? name;
        const studentName =
            typeof rawName === "string" ? rawName.trim() : "";

        const studentClass = normalizeClass(className || course);
        const normalizedEmail = normalizeEmail(email);
        const divisionValue =
            typeof division === "string"
                ? division.trim().toUpperCase()
                : "";

        const rollText = String(rollNo ?? "").trim();
        const parsedRollNo = Number(rollText);

        if (
            !studentName ||
            !normalizedEmail ||
            !rollText ||
            !studentClass ||
            !divisionValue
        ) {
            return res.status(400).json({
                message:
                    "Name, email, roll number, class/course and division are required",
            });
        }

        if (!emailRegex.test(normalizedEmail)) {
            return res.status(400).json({
                message: "Invalid email format",
            });
        }

        if (!Number.isSafeInteger(parsedRollNo) || parsedRollNo <= 0) {
            return res.status(400).json({
                message: "Roll number must be a positive whole number",
            });
        }

        const duplicate = await findStudentDuplicate({
            email: normalizedEmail,
            rollNo: parsedRollNo,
            className: studentClass,
        });

        if (duplicate?.type === "email") {
            return res.status(409).json({
                message: "A student with this email already exists",
            });
        }

        if (duplicate?.type === "rollNo") {
            return res.status(409).json({
                message: "This roll number already exists in this class",
            });
        }

        const student = await Student.create({
            email: normalizedEmail,
            phone: typeof phone === "string" ? phone.trim() : "",
            isActivated: false,
            academicDetails: {
                fullName: studentName,
                rollNo: parsedRollNo,
                batch: normalizeClass(batch || studentClass),
                class: studentClass,
                division: divisionValue,
            },
        });

        return res.status(201).json({
            message: "Student record created successfully",
            student: formatStudent(student),
        });
    } catch (error) {
        if (error.code === 11000) {
            const fields = Object.keys(error.keyPattern || {});

            return res.status(409).json({
                message: fields.includes("email")
                    ? "A student with this email already exists"
                    : "Duplicate database value detected. Check StudentModel indexes.",
            });
        }

        if (error.name === "ValidationError") {
            return res.status(400).json({
                message: error.message,
            });
        }

        console.error("Add student error:", error);

        return res.status(500).json({
            message: "Internal server error",
        });
    }
};

// ==================================================
// GET / SEARCH STUDENTS
// ==================================================

export const getStudents = async (req, res) => {
    try {
        // Accept both ?search= and ?q=
        const searchValue =
            typeof req.query.search === "string"
                ? req.query.search
                : typeof req.query.q === "string"
                    ? req.query.q
                    : "";

        const q = searchValue.trim();
        const filter = {};

        if (q) {
            // Escape special regex characters safely
            const escapedQuery = q.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
            );

            const searchRegex = new RegExp(escapedQuery, "i");

            const searchConditions = [
                { "academicDetails.fullName": searchRegex },
                { "academicDetails.class": searchRegex },
                { "academicDetails.batch": searchRegex },
            ];

            // Search by numeric Roll No
            if (/^\d+$/.test(q)) {
                const rollNo = Number(q);

                if (Number.isSafeInteger(rollNo)) {
                    searchConditions.push({
                        "academicDetails.rollNo": rollNo,
                    });
                }
            }

            filter.$or = searchConditions;
        }

        const students = await Student.find(filter)
            .select(
                "email phone isActivated academicDetails.fullName academicDetails.rollNo academicDetails.batch academicDetails.class academicDetails.division createdAt updatedAt"
            )
            .sort({ createdAt: -1 })
            .lean();

        return res.status(200).json({
            count: students.length,
            students: students.map(formatStudent),
        });
    } catch (error) {
        console.error("Get students error:", error);

        return res.status(500).json({
            message: "Internal server error",
        });
    }
};


// ==================================================
// UPDATE STUDENT
// ==================================================

export const updateStudent = async (req, res) => {
    try {
        const { id } = req.params;

        if (!/^[a-f\d]{24}$/i.test(id)) {
            return res.status(400).json({
                message: "Invalid student ID",
            });
        }

        const student = await Student.findById(id);

        if (!student) {
            return res.status(404).json({
                message: "Student not found",
            });
        }

        const {
            name,
            fullName,
            email,
            rollNo,
            batch,
            class: className,
            course,
            division,
            phone,
            whatsappNumber,

        } = req.body || {};

        const details = student.academicDetails;

        if (fullName !== undefined || name !== undefined) {
            const updatedName = fullName ?? name;

            if (
                typeof updatedName !== "string" ||
                !updatedName.trim()
            ) {
                return res.status(400).json({
                    message: "Student name cannot be empty",
                });
            }

            details.fullName = updatedName.trim();
        }

        if (email !== undefined) {
            if (typeof email !== "string" || !email.trim()) {
                return res.status(400).json({
                    message: "Email cannot be empty",
                });
            }

            const normalizedEmail = normalizeEmail(email);

            if (!emailRegex.test(normalizedEmail)) {
                return res.status(400).json({
                    message: "Invalid email format",
                });
            }

            student.email = normalizedEmail;
        }

        if (rollNo !== undefined) {
            const rollText = String(rollNo).trim();
            const parsedRollNo = Number(rollText);

            if (
                !rollText ||
                !Number.isSafeInteger(parsedRollNo) ||
                parsedRollNo <= 0
            ) {
                return res.status(400).json({
                    message: "Roll number must be a positive whole number",
                });
            }

            details.rollNo = parsedRollNo;
        }

        if (className !== undefined || course !== undefined) {
            const updatedClass = className ?? course;

            if (
                typeof updatedClass !== "string" ||
                !updatedClass.trim()
            ) {
                return res.status(400).json({
                    message: "Class/course cannot be empty",
                });
            }

            details.class = normalizeClass(updatedClass);
        }

        if (batch !== undefined) {
            if (typeof batch !== "string" || !batch.trim()) {
                return res.status(400).json({
                    message: "Batch cannot be empty",
                });
            }

            details.batch = normalizeClass(batch);
        }

        if (division !== undefined) {
            if (typeof division !== "string" || !division.trim()) {
                return res.status(400).json({
                    message: "Division cannot be empty",
                });
            }

            details.division = division.trim().toUpperCase();
        }

        if (phone !== undefined) {
            if (typeof phone !== "string") {
                return res.status(400).json({
                    message: "Phone must be a string",
                });
            }

            student.phone = phone.trim();
        }
        if (whatsappNumber !== undefined) {
            if (
                typeof whatsappNumber !== "string" ||
                !/^\+[1-9]\d{7,14}$/.test(whatsappNumber.trim())
            ) {
                return res.status(400).json({
                    message: "WhatsApp number must include country code, e.g. +919876543210",
                });
            }

            student.whatsappNumber = whatsappNumber.trim();
        }

        const duplicate = await findStudentDuplicate({
            email: student.email,
            rollNo: details.rollNo,
            className: details.class,
            excludeId: student._id,
        });

        if (duplicate?.type === "email") {
            return res.status(409).json({
                message: "Another student already uses this email",
            });
        }

        if (duplicate?.type === "rollNo") {
            return res.status(409).json({
                message: "This roll number already exists in this class",
            });
        }
        

        await student.save();

        return res.status(200).json({
            message: "Student details updated successfully",
            student: formatStudent(student),
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                message:
                    "Duplicate value detected. Check the student database indexes.",
            });
        }

        if (error.name === "ValidationError") {
            return res.status(400).json({
                message: error.message,
            });
        }

        console.error("Update student error:", error);

        return res.status(500).json({
            message: "Internal server error",
        });
    }
};

// ==================================================
// BULK UPLOAD STUDENTS - CSV / EXCEL
// ==================================================

export const bulkUploadStudents = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                message: "Please upload a CSV or Excel file",
            });
        }

        const workbook = XLSX.read(req.file.buffer, {
            type: "buffer",
        });

        const firstSheet =
            workbook.Sheets[workbook.SheetNames[0]];

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

        const normalizeHeader = (header) =>
            String(header)
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]/g, "");

        const normalizedRows = rows.map((row) => {
            const normalized = {};

            for (const [key, value] of Object.entries(row)) {
                normalized[normalizeHeader(key)] = value;
            }

            return normalized;
        });

        const getValue = (row, aliases) => {
            for (const alias of aliases) {
                if (row[alias] !== undefined && row[alias] !== null) {
                    return String(row[alias]).trim();
                }
            }

            return "";
        };

        const headers = Object.keys(normalizedRows[0]);

        const requiredColumns = [
            {
                name: "Name",
                aliases: ["name", "fullname", "studentname"],
            },
            {
                name: "Roll No",
                aliases: ["rollno", "rollnumber", "roll"],
            },
            {
                name: "Class",
                aliases: ["class", "course"],
            },
            {
                name: "Division",
                aliases: ["division", "div"],
            },
            {
                name: "Email",
                aliases: ["email", "emailid", "emailaddress"],
            },
        ];

        const missingColumns = requiredColumns
            .filter(({ aliases }) =>
                !aliases.some((alias) => headers.includes(alias))
            )
            .map(({ name }) => name);

        if (missingColumns.length > 0) {
            return res.status(400).json({
                message: "Required columns are missing",
                missingColumns,
            });
        }

        const seenEmails = new Set();
        const seenClassRolls = new Set();
        const validRows = [];
        const errors = [];

        normalizedRows.forEach((row, index) => {
            const rowNumber = index + 2;

            const fail = (reason, email = null) => {
                errors.push({
                    row: rowNumber,
                    email,
                    reason,
                });
            };

            // Ignore blank rows in the spreadsheet.
            const isBlankRow = Object.values(row).every(
                (value) => String(value ?? "").trim() === ""
            );

            if (isBlankRow) {
                return;
            }

            const name = getValue(row, [
                "name",
                "fullname",
                "studentname",
            ]);

            const email = normalizeEmail(
                getValue(row, [
                    "email",
                    "emailid",
                    "emailaddress",
                ])
            );

            const rollText = getValue(row, [
                "rollno",
                "rollnumber",
                "roll",
            ]);

            const className = normalizeClass(
                getValue(row, ["class", "course"])
            );

            const division = getValue(row, [
                "division",
                "div",
            ]).toUpperCase();

            const batch =
                normalizeClass(
                    getValue(row, ["batch", "batchname"])
                ) || className;

            const phone = getValue(row, [
                "phone",
                "mobile",
                "mobileno",
                "phonenumber",
            ]);

            const rollNo = Number(rollText);

            if (!name || !email || !rollText || !className || !division) {
                fail(
                    "Name, email, roll number, class and division are required",
                    email || null
                );
                return;
            }

            if (!emailRegex.test(email)) {
                fail("Invalid email address", email);
                return;
            }

            if (!Number.isSafeInteger(rollNo) || rollNo <= 0) {
                fail(
                    "Roll number must be a positive whole number",
                    email
                );
                return;
            }

            const classRollKey = `${className}::${rollNo}`;

            if (seenEmails.has(email)) {
                fail("Duplicate email in uploaded file", email);
                return;
            }

            if (seenClassRolls.has(classRollKey)) {
                fail(
                    "Duplicate roll number in this class in uploaded file",
                    email
                );
                return;
            }

            seenEmails.add(email);
            seenClassRolls.add(classRollKey);

            validRows.push({
                row: rowNumber,
                name,
                email,
                rollNo,
                className,
                batch,
                division,
                phone,
            });
        });

        const imported = [];

        for (const row of validRows) {
            const duplicate = await findStudentDuplicate({
                email: row.email,
                rollNo: row.rollNo,
                className: row.className,
            });

            if (duplicate?.type === "email") {
                errors.push({
                    row: row.row,
                    email: row.email,
                    reason: "Student email already exists",
                });
                continue;
            }

            if (duplicate?.type === "rollNo") {
                errors.push({
                    row: row.row,
                    email: row.email,
                    reason:
                        "This roll number already exists in this class",
                });
                continue;
            }

            try {
                const student = await Student.create({
                    email: row.email,
                    phone: row.phone,
                    isActivated: false,
                    academicDetails: {
                        fullName: row.name,
                        rollNo: row.rollNo,
                        batch: row.batch,
                        class: row.className,
                        division: row.division,
                    },
                });

                imported.push({
                    row: row.row,
                    id: student._id,
                    name: student.academicDetails.fullName,
                    rollNo: student.academicDetails.rollNo,
                    class: student.academicDetails.class,
                    division: student.academicDetails.division,
                    email: student.email,
                });
            } catch (error) {
                let reason = "Could not save this student";

                if (error.code === 11000) {
                    const duplicateFields = Object.keys(
                        error.keyPattern || {}
                    );

                    if (duplicateFields.includes("email")) {
                        reason = "Student email already exists";
                    } else if (
                        duplicateFields.includes("academicDetails.class") ||
                        duplicateFields.includes("academicDetails.rollNo")
                    ) {
                        reason =
                            "Duplicate Roll No/class database index";
                    } else if (
                        duplicateFields.includes(
                            "deviceSecurity.deviceUuid"
                        )
                    ) {
                        reason = "Duplicate device UUID";
                    } else {
                        reason = `Duplicate value: ${duplicateFields.join(", ") || "unknown field"
                            }`;
                    }
                } else if (error.name === "ValidationError") {
                    reason = error.message;
                }

                console.error(
                    `Bulk upload row ${row.row} error:`,
                    error
                );

                errors.push({
                    row: row.row,
                    email: row.email,
                    reason,
                });
            }
        }

        return res.status(200).json({
            message: "Student bulk upload processed",
            totalRows: rows.length,
            importedCount: imported.length,
            failedCount: errors.length,
            imported,
            errors,
        });
    } catch (error) {
        console.error("Bulk upload students error:", error);

        return res.status(500).json({
            message: "Unable to process the uploaded file",
        });
    }
};

export const resetStudentTrustedDevice = async (req, res) => {
    try {
        const { id } = req.params;

        if (!/^[a-f\d]{24}$/i.test(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid student ID.",
            });
        }

        const student = await Student.findById(id);

        if (!student) {
            return res.status(404).json({
                success: false,
                message: "Student not found.",
            });
        }

        // Remove the old trusted device.
        student.set("deviceSecurity.deviceUuid", undefined);
        student.set("deviceSecurity.isLocked", false);
        student.set("deviceSecurity.lastUsedPlatform", "Unknown");

        await student.save();

        return res.status(200).json({
            success: true,
            message:
                "Trusted device reset successfully. The student can register a new device on the next login.",
        });
    } catch (error) {
        console.error("Student device reset failed:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to reset the student's trusted device.",
        });
    }
};
// ==================================================
// GET FLAGGED ATTENDANCE PENDING ADMIN REVIEW
// ==================================================

export const getFlaggedAttendance = async (req, res) => {
    try {
        const attendanceRecords = await Attendance.find({
            status: "flagged",
            $or: [
                { verificationStatus: "pending" },
                { verificationStatus: { $exists: false } },
            ],
        })
            .populate({
                path: "student",
                select: "email academicDetails.fullName academicDetails.rollNo academicDetails.class academicDetails.division",
            })
            .populate({
                path: "lecture",
                select: "subject assignedClass date startTime endTime",
            })
            .populate({
                path: "classroom",
                select: "name building radiusMeters",
            })
            .sort({ createdAt: -1 })
            .lean();

        return res.status(200).json({
            success: true,
            count: attendanceRecords.length,
            attendance: attendanceRecords,
        });
    } catch (error) {
        console.error("Get flagged attendance error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to fetch flagged attendance.",
        });
    }
};


// ==================================================
// APPROVE OR REJECT FLAGGED ATTENDANCE
// ==================================================

export const reviewFlaggedAttendance = async (req, res) => {
    try {
        const { id } = req.params;
        const { action } = req.body || {};

        if (!/^[a-f\d]{24}$/i.test(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid attendance ID.",
            });
        }

        if (!["approve", "reject"].includes(action)) {
            return res.status(400).json({
                success: false,
                message: "Action must be approve or reject.",
            });
        }

        if (!req.user?.id) {
            return res.status(401).json({
                success: false,
                message: "Admin authentication is required.",
            });
        }

        const verificationStatus =
            action === "approve" ? "approved" : "rejected";

        const attendance = await Attendance.findOneAndUpdate(
            {
                _id: id,
                status: "flagged",
                $or: [
                    { verificationStatus: "pending" },
                    { verificationStatus: { $exists: false } },
                ],
            },
            {
                $set: {
                    verificationStatus,
                    verifiedBy: req.user.id,
                    verifiedAt: new Date(),
                },
            },
            {
                new: true,
                runValidators: true,
            }
        );

        if (!attendance) {
            return res.status(404).json({
                success: false,
                message:
                    "Pending flagged attendance not found. It may already have been reviewed.",
            });
        }

        return res.status(200).json({
            success: true,
            message:
                action === "approve"
                    ? "Flagged attendance approved successfully."
                    : "Flagged attendance rejected successfully.",
            attendance,
        });
    } catch (error) {
        console.error("Review flagged attendance error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to review flagged attendance.",
        });
    }
};

/**
 * GET /api/admin/attendance/overview
 * Overall attendance summary for all students.
 */
export const getAttendanceOverview = async (req, res) => {
    try {
        const [
            totalStudents,
            completedLectures,
            students,
        ] = await Promise.all([
            Student.countDocuments({}),
            Lecture.find({ status: "completed" })
                .select("_id assignedClass subject date")
                .lean(),
            Student.find({})
                .select(
                    "email academicDetails.fullName academicDetails.rollNo academicDetails.class academicDetails.division"
                )
                .lean(),
        ]);

        const lectureIds = completedLectures.map(
            (lecture) => lecture._id
        );

        const attendanceRecords = lectureIds.length > 0 && students.length > 0
            ? await Attendance.find({
                lecture: { $in: lectureIds },
                student: { $in: students.map((student) => student._id) },
            })
                .select("student lecture status verificationStatus")
                .lean()
            : [];

        const attendanceMap = new Map();

        for (const record of attendanceRecords) {
            attendanceMap.set(
                `${record.student.toString()}_${record.lecture.toString()}`,
                record
            );
        }

        let totalApplicableSessions = 0;
        let totalSessionsAttended = 0;

        const studentSummaries = students.map((student) => {
            const studentClass = String(
                student.academicDetails?.class || ""
            ).trim().toLowerCase();

            const classLectures = completedLectures.filter(
                (lecture) =>
                    String(lecture.assignedClass || "")
                        .trim()
                        .toLowerCase() === studentClass
            );

            let attended = 0;

            for (const lecture of classLectures) {
                const key =
                    `${student._id.toString()}_${lecture._id.toString()}`;

                const record = attendanceMap.get(key);

                if (
                    record?.status === "present" ||
                    (
                        record?.status === "flagged" &&
                        record?.verificationStatus === "approved"
                    )
                ) {
                    attended++;
                }
            }

            const conducted = classLectures.length;

            totalApplicableSessions += conducted;
            totalSessionsAttended += attended;

            return {
                studentId: student._id,
                name: student.academicDetails?.fullName || "",
                rollNo: student.academicDetails?.rollNo ?? null,
                class: student.academicDetails?.class || "",
                division: student.academicDetails?.division || "",
                totalSessionsConducted: conducted,
                totalSessionsAttended: attended,
                attendancePercentage:
                    conducted === 0
                        ? 0
                        : Number(
                            ((attended / conducted) * 100).toFixed(2)
                        ),
            };
        });

        const attendancePercentage =
            totalApplicableSessions === 0
                ? 0
                : Number(
                    (
                        (totalSessionsAttended /
                            totalApplicableSessions) *
                        100
                    ).toFixed(2)
                );

        return res.status(200).json({
            success: true,
            data: {
                totalStudents,
                totalCompletedLectures: completedLectures.length,
                totalApplicableSessions,
                totalSessionsAttended,
                totalSessionsAbsentOrUnconfirmed:
                    totalApplicableSessions - totalSessionsAttended,
                attendancePercentage,
                students: studentSummaries,
            },
        });
    } catch (error) {
        console.error("Get attendance overview error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to fetch overall attendance overview.",
        });
    }
};


/**
 * GET /api/admin/students/:id/attendance
 * Attendance history for one student.
 */
export const getStudentAttendanceHistory = async (req, res) => {
    try {
        const { id } = req.params;

        if (!/^[a-f\d]{24}$/i.test(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid student ID.",
            });
        }

        const student = await Student.findById(id)
            .select(
                "email academicDetails.fullName academicDetails.rollNo academicDetails.batch academicDetails.class academicDetails.division"
            )
            .lean();

        if (!student) {
            return res.status(404).json({
                success: false,
                message: "Student not found.",
            });
        }

        const studentClass = String(
            student.academicDetails?.class || ""
        ).trim();

        if (!studentClass) {
            return res.status(400).json({
                success: false,
                message: "Student class is not available.",
            });
        }

        const escapedClass = studentClass.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
        );

        const lectures = await Lecture.find({
            assignedClass: {
                $regex: `^${escapedClass}$`,
                $options: "i",
            },
            status: "completed",
        })
            .select(
                "subject assignedClass date startTime endTime status"
            )
            .sort({ date: -1, startTime: -1 })
            .lean();

        const lectureIds = lectures.map((lecture) => lecture._id);

        const records = lectureIds.length > 0
            ? await Attendance.find({
                student: student._id,
                lecture: { $in: lectureIds },
            })
                .select(
                    "lecture attendanceDate markedAt status verificationStatus verificationNote"
                )
                .lean()
            : [];

        const attendanceMap = new Map(
            records.map((record) => [
                record.lecture.toString(),
                record,
            ])
        );

        let totalSessionsAttended = 0;

        const attendanceHistory = lectures.map((lecture) => {
            const record = attendanceMap.get(
                lecture._id.toString()
            );

            let attendanceStatus = "absent";

            if (record?.status === "present") {
                attendanceStatus = "present";
                totalSessionsAttended++;
            } else if (
                record?.status === "flagged" &&
                record?.verificationStatus === "approved"
            ) {
                attendanceStatus = "approved";
                totalSessionsAttended++;
            } else if (
                record?.status === "flagged" &&
                record?.verificationStatus === "pending"
            ) {
                attendanceStatus = "pending_verification";
            } else if (
                record?.status === "flagged" &&
                record?.verificationStatus === "rejected"
            ) {
                attendanceStatus = "rejected";
            }

            return {
                lectureId: lecture._id,
                subject: lecture.subject,
                class: lecture.assignedClass,
                date: lecture.date,
                startTime: lecture.startTime,
                endTime: lecture.endTime,
                attendanceStatus,
                attendanceDate: record?.attendanceDate || null,
                markedAt: record?.markedAt || null,
                verificationNote: record?.verificationNote || "",
            };
        });

        const totalSessionsConducted = lectures.length;

        const attendancePercentage =
            totalSessionsConducted === 0
                ? 0
                : Number(
                    (
                        (totalSessionsAttended /
                            totalSessionsConducted) *
                        100
                    ).toFixed(2)
                );

        return res.status(200).json({
            success: true,
            data: {
                student: {
                    id: student._id,
                    name: student.academicDetails?.fullName || "",
                    rollNo: student.academicDetails?.rollNo ?? null,
                    batch: student.academicDetails?.batch || "",
                    class: studentClass,
                    division: student.academicDetails?.division || "",
                    email: student.email,
                },
                attendanceSummary: {
                    totalSessionsConducted,
                    totalSessionsAttended,
                    attendancePercentage,
                },
                attendanceHistory,
            },
        });
    } catch (error) {
        console.error(
            "Get student attendance history error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to fetch student attendance history.",
        });
    }
};

/**
 * GET /api/admin/attendance/by-date?date=YYYY-MM-DD
 * Subject-wise attendance for a selected lecture date.
 */
export const getAttendanceByDate = async (req, res) => {
    try {
        const { date } = req.query;

        // Validate date format
        if (
            typeof date !== "string" ||
            !/^\d{4}-\d{2}-\d{2}$/.test(date)
        ) {
            return res.status(400).json({
                success: false,
                message: "Please provide date in YYYY-MM-DD format.",
            });
        }

        const startDate = new Date(`${date}T00:00:00.000Z`);

        if (
            Number.isNaN(startDate.getTime()) ||
            startDate.toISOString().slice(0, 10) !== date
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid date.",
            });
        }

        const endDate = new Date(startDate);
        endDate.setUTCDate(endDate.getUTCDate() + 1);

        // Find completed lectures on the selected date
        const lectures = await Lecture.find({
            status: "completed",
            date: {
                $gte: startDate,
                $lt: endDate,
            },
        })
            .select("_id subject assignedClass date startTime endTime")
            .lean();

        if (lectures.length === 0) {
            return res.status(200).json({
                success: true,
                date,
                count: 0,
                data: [],
                message: "No completed lectures found for this date.",
            });
        }

        const lectureIds = lectures.map((lecture) => lecture._id);

        // Count students by class
        const classNames = [
            ...new Set(
                lectures
                    .map((lecture) =>
                        String(lecture.assignedClass || "").trim()
                    )
                    .filter(Boolean)
            ),
        ];

        const students = await Student.find({
            "academicDetails.class": {
                $in: classNames,
            },
        })
            .select("_id academicDetails.class")
            .lean();

        const studentsByClass = new Map();

        for (const student of students) {
            const key = String(
                student.academicDetails?.class || ""
            ).trim().toLowerCase();

            studentsByClass.set(
                key,
                (studentsByClass.get(key) || 0) + 1
            );
        }

        const records = await Attendance.find({
            lecture: { $in: lectureIds },
        })
            .select("student lecture status verificationStatus")
            .lean();

        const attendanceByLecture = new Map();

        for (const record of records) {
            const key = record.lecture.toString();

            if (!attendanceByLecture.has(key)) {
                attendanceByLecture.set(key, []);
            }

            attendanceByLecture.get(key).push(record);
        }

        const data = lectures.map((lecture) => {
            const classKey = String(
                lecture.assignedClass || ""
            ).trim().toLowerCase();

            const totalStudents = studentsByClass.get(classKey) || 0;
            const lectureRecords =
                attendanceByLecture.get(lecture._id.toString()) || [];

            const presentRecords = lectureRecords.filter(
                (record) =>
                    record.status === "present" ||
                    (
                        record.status === "flagged" &&
                        record.verificationStatus === "approved"
                    )
            );

            const pendingRecords = lectureRecords.filter(
                (record) =>
                    record.status === "flagged" &&
                    record.verificationStatus === "pending"
            );

            const rejectedRecords = lectureRecords.filter(
                (record) =>
                    record.status === "flagged" &&
                    record.verificationStatus === "rejected"
            );

            const present = presentRecords.length;
            const pendingVerification = pendingRecords.length;
            const rejected = rejectedRecords.length;
            const absent = Math.max(
                0,
                totalStudents - present - pendingVerification - rejected
            );

            return {
                lectureId: lecture._id,
                subject: lecture.subject,
                class: lecture.assignedClass,
                date: lecture.date,
                startTime: lecture.startTime,
                endTime: lecture.endTime,
                totalStudents,
                present,
                absent,
                pendingVerification,
                rejected,
                attendancePercentage:
                    totalStudents === 0
                        ? 0
                        : Number(
                            ((present / totalStudents) * 100).toFixed(2)
                        ),
            };
        });

        return res.status(200).json({
            success: true,
            date,
            count: data.length,
            data,
        });
    } catch (error) {
        console.error("Get date-wise attendance error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to fetch date-wise attendance.",
        });
    }
};
