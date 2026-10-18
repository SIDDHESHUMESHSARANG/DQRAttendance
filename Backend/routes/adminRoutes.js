
import express from "express";
import multer from "multer";

import {
  registerAdmin,
  verifyAdminOTP,
  loginAdmin,
  logoutAdmin,
  addStudent,
  getStudents,
  updateStudent,
  bulkUploadStudents,
  resetStudentTrustedDevice,
  getFlaggedAttendance,
  reviewFlaggedAttendance,
} from "../controllers/adminController.js";

import authMiddleware, {
  authorizeRoles,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// Multer configuration for CSV and Excel uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // Maximum 5 MB
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = /\.(csv|xlsx|xls)$/i;

    if (allowedExtensions.test(file.originalname)) {
      return cb(null, true);
    }

    cb(new Error("Only CSV and Excel files are allowed"));
  },
});

// Admin Registration - send OTP
router.post("/register", registerAdmin);

// Verify OTP - complete registration
router.post("/verify-otp", verifyAdminOTP);

// Admin Login
router.post("/login", loginAdmin);

// Admin Logout
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

// Student Management - Admin only
router.post(
  "/students",
  authMiddleware,
  authorizeRoles("admin"),
  addStudent
);

router.get(
  "/students",
  authMiddleware,
  authorizeRoles("admin"),
  getStudents
);

router.put(
  "/students/:id",
  authMiddleware,
  authorizeRoles("admin"),
  updateStudent
);

// Bulk Upload Students - CSV / Excel
router.post(
  "/students/bulk-upload",
  authMiddleware,
  authorizeRoles("admin"),
  upload.single("file"),
  bulkUploadStudents
);

// Reset Student Trusted Device - Admin only
router.patch(
  "/students/:id/reset-device",
  authMiddleware,
  authorizeRoles("admin"),
  resetStudentTrustedDevice
);

// View flagged attendance pending Admin review
router.get(
  "/flagged-attendance",
  authMiddleware,
  authorizeRoles("admin"),
  getFlaggedAttendance
);

// Approve or reject flagged attendance - Admin only
router.patch(
  "/attendance/:id/review",
  authMiddleware,
  authorizeRoles("admin"),
  reviewFlaggedAttendance
);

export default router;
