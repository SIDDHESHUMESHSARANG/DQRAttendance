import express from "express";

import {
  registerStudent,
  loginStudent,
  getStudentDashboard,
  updateStudentProfile,
  deleteStudentAccount,
  registerDeviceFingerprint,
  processQrAttendance,
} from "../controllers/studentController.js";

import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

// ==========================================
//          PUBLIC AUTH ENDPOINTS
// ==========================================

// Student Registration
router.post("/register", registerStudent);

// Student Login
router.post("/login", loginStudent);

// ==========================================
//        PROTECTED CRUD & SECURITY
// ==========================================

// Get Student Profile / Dashboard
router.get("/dashboard", authMiddleware, getStudentDashboard);

// Update Student Profile
router.put("/profile", authMiddleware, updateStudentProfile);

// Delete Student Account
router.delete("/account", authMiddleware, deleteStudentAccount);

// ==========================================
//        PROJECT SPECIFIC MECHANICS
// ==========================================

// Register Device Fingerprint (One Device One Student Policy)
router.post("/device/register", authMiddleware, registerDeviceFingerprint);

// Process Scan & Record QR Attendance (Dynamic QR + Geofence Verification)
router.post("/attendance/scan", authMiddleware, processQrAttendance);

export default router;
