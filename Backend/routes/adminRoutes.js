
import express from "express";

import {
  registerAdmin,
  verifyAdminOTP,
  loginAdmin,
  logoutAdmin,
} from "../controllers/adminController.js";

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

export default router;
