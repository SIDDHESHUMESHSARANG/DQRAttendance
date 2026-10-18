
import express from "express";

import {
  registerAdmin,
  verifyAdminOTP,
  loginAdmin,
  logoutAdmin,
} from "../controllers/adminController.js";
import {
  getLowAttendanceStudents,
  sendLowAttendanceAlert,
} from "../controllers/attendanceAlertController.js";

import authMiddleware, {
  authorizeRoles,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// Admin Registration - send OTP
router.post("/register", registerAdmin);

// Verify OTP - complete registration
router.post("/verify-otp", verifyAdminOTP);

// Admin Login
router.post("/login", loginAdmin);

// Admin Logout - authenticated user can logout
router.post("/logout", authMiddleware, logoutAdmin);

// Protected Admin Profile - Admin only
router.get(
  "/profile",
  authMiddleware,
  authorizeRoles("admin"),
  (req, res) => {
    res.status(200).json({
      message: "Admin profile accessed successfully",
      admin: req.user,
    });
  }
);

// Low-attendance listing and WhatsApp alert delivery
router.get(
  "/students/low-attendance",
  authMiddleware,
  authorizeRoles("admin"),
  getLowAttendanceStudents
);
router.post(
  "/students/:studentId/attendance-alert",
  authMiddleware,
  authorizeRoles("admin"),
  sendLowAttendanceAlert
);

export default router;
