
import Admin from "../models/Admin.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import RevokedToken from "../models/RevokedToken.js";

// Admin Registration
export const registerAdmin = async (req, res) => {
    try {
        const { name, email, password, setupKey } = req.body;

        // Check required fields
        if (!name || !email || !password || !setupKey) {
            return res.status(400).json({
                message: "All fields are required"
            });
        }

        // Check setup key
        if (setupKey !== process.env.ADMIN_SETUP_KEY) {
            return res.status(403).json({
                message: "Invalid registration key"
            });
        }

        // Check email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(email)) {
            return res.status(400).json({
                message: "Invalid email format"
            });
        }

        // Check existing admin
        const existingAdmin = await Admin.findOne({
            email: email.trim().toLowerCase()
        });

        if (existingAdmin) {
            return res.status(409).json({
                message: "Admin already exists"
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create admin
        const admin = await Admin.create({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            password: hashedPassword
        });

        return res.status(201).json({
            message: "Admin registered successfully",
            admin: {
                id: admin._id,
                name: admin.name,
                email: admin.email,
                role: admin.role
            }
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                message: "Email already registered"
            });
        }

        console.error("Admin registration error:", error.message);

        return res.status(500).json({
            message: "Internal server error"
        });
    }
};

// Admin Login
export const loginAdmin = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check required fields
        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required"
            });
        }

        // Check email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(email)) {
            return res.status(400).json({
                message: "Invalid email format"
            });
        }

        // Find admin
        const admin = await Admin.findOne({
            email: email.trim().toLowerCase()
        }).select("+password");

        if (!admin) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        // Compare password
        const isMatch = await bcrypt.compare(
            password,
            admin.password
        );

        if (!isMatch) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            {
                id: admin._id,
                role: admin.role
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
                role: admin.role
            }
        });

    } catch (error) {
        console.error("Admin login error:", error.message);

        return res.status(500).json({
            message: "Internal server error"
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
            expiresAt: new Date(req.user.exp * 1000)
        });

        return res.status(200).json({
            message: "Logout successful"
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(200).json({
                message: "Logout successful"
            });
        }

        console.error("Admin logout error:", error.message);

        return res.status(500).json({
            message: "Internal server error"
        });
    }
};