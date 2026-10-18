
import express from "express";

import {
  registerStudent,
  verifyStudentOTP,
  loginStudent,
  getStudentDashboard,
  updateStudentProfile,
  registerDeviceFingerprint,
  processQrAttendance,
} from "../controllers/studentController.js";

import {
  validateLectureQR,
} from "../controllers/qrController.js";

import authMiddleware, {
  authorizeRoles,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// Public student activation and login
router.post("/register", registerStudent);
router.post("/verify-otp", verifyStudentOTP);
router.post("/login", loginStudent);

// Protected student routes: logged-in student only
router.get(
  "/dashboard",
  authMiddleware,
  authorizeRoles("student"),
  getStudentDashboard
);

router.put(
  "/profile",
  authMiddleware,
  authorizeRoles("student"),
  updateStudentProfile
);

router.post(
  "/device/register",
  authMiddleware,
  authorizeRoles("student"),
  registerDeviceFingerprint
);

// Validate QR token before attendance scanning
router.post(
  "/attendance/validate-qr",
  authMiddleware,
  authorizeRoles("student"),
  validateLectureQR
);

// Attendance scan endpoint (recording implementation comes later)
router.post(
  "/attendance/scan",
  authMiddleware,
  authorizeRoles("student"),
  processQrAttendance
);

export default router;
