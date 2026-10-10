
import Admin from "../models/Admin.js";
import PendingAdminRegistration from "../models/PendingAdminRegistration.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import RevokedToken from "../models/RevokedToken.js";
import { sendAdminOTP } from "../utils/emailService.js";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const hashOTP = (otp) =>
    crypto
        .createHmac("sha256", process.env.OTP_SECRET)
        .update(otp)
        .digest("hex");

const safeCompare = (a, b) => {
    const bufferA = Buffer.from(a, "hex");
    const bufferB = Buffer.from(b, "hex");

    return (
        bufferA.length === bufferB.length &&
        crypto.timingSafeEqual(bufferA, bufferB)
    );
};

// Admin Registration: create pending record and send OTP
export const registerAdmin = async (req, res) => {
    let pending;

    try {
        const { name, email, password } = req.body;

        if (!name?.trim() || !email?.trim() || !password) {
            return res.status(400).json({
                message: "All fields are required",
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

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

        const existingPending =
            await PendingAdminRegistration.findOne({
                email: normalizedEmail,
            });

        if (existingPending) {
            if (existingPending.expiresAt > new Date()) {
                return res.status(429).json({
                    message: "An OTP was already sent. Please wait 3 minutes before trying again.",
                });
            }

            await PendingAdminRegistration.deleteOne({
                _id: existingPending._id,
            });
        }

        const otp = crypto
            .randomInt(100000, 1000000)
            .toString();

        const passwordHash = await bcrypt.hash(password, 10);
        const otpHash = hashOTP(otp);

        pending = await PendingAdminRegistration.create({
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

            console.error("OTP email error:", emailError.message);

            return res.status(502).json({
                message: "Unable to send OTP email. Please check email configuration.",
            });
        }

        return res.status(200).json({
            message: "OTP sent successfully. It is valid for 3 minutes.",
            email: normalizedEmail,
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                message: "A registration for this email already exists. Please try again shortly.",
            });
        }

        console.error("Admin registration error:", error.message);

        return res.status(500).json({
            message: "Internal server error",
        });
    }
};

// Verify OTP and create Admin
export const verifyAdminOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email?.trim() || !otp) {
            return res.status(400).json({
                message: "Email and OTP are required",
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
                message: "Registration not found or OTP expired. Please register again.",
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
            pending.attempts += 1;

            if (pending.attempts >= 5) {
                await PendingAdminRegistration.deleteOne({
                    _id: pending._id,
                });

                return res.status(429).json({
                    message: "Too many incorrect OTP attempts. Please register again.",
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

        // Password is already hashed; do not hash it again.
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
        console.error("OTP verification error:", error.message);

        return res.status(500).json({
            message: "Internal server error",
        });
    }
};

// Admin Login
export const loginAdmin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required",
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        if (!emailRegex.test(normalizedEmail)) {
            return res.status(400).json({
                message: "Invalid email format",
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
        console.error("Admin login error:", error.message);

        return res.status(500).json({
            message: "Internal server error",
        });
    }
};

// Admin Logout
export const logoutAdmin = async (req, res) => {
    try {
        const token = req.headers.authorization.split(" ")[1];

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

        console.error("Admin logout error:", error.message);

        return res.status(500).json({
            message: "Internal server error",
        });
    }
};