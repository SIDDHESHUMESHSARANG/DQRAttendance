import express from "express";
import multer from "multer";

import {
    addProfessor,
    getProfessors,
    searchProfessors,
    updateProfessor,
    deactivateProfessor,
    reactivateProfessor,
    bulkUploadProfessors,
    sendProfessorOTP,
    verifyProfessorOTP,
    loginProfessor,
} from "../controllers/professorController.js";

import authMiddleware, {
    authorizeRoles,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// File Upload Configuration
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // Maximum 5 MB
    },
    fileFilter: (req, file, cb) => {
        const allowedExtensions = /\.(csv|xlsx)$/i;

        if (!allowedExtensions.test(file.originalname)) {
            return cb(
                new Error("Only CSV and XLSX files are allowed")
            );
        }

        cb(null, true);
    },
});

// ==========================================
// Public Professor Registration and Login
// ==========================================

// Step 1: Request registration OTP
router.post("/register", sendProfessorOTP);

// Step 2: Verify OTP and set password
router.post("/verify-otp", verifyProfessorOTP);

// Professor Login
router.post("/login", loginProfessor);

// ==========================================
// Admin-Only Professor Management APIs
// ==========================================

// Add Professor
router.post(
    "/",
    authMiddleware,
    authorizeRoles("admin"),
    addProfessor
);

// Get All Professors
router.get(
    "/",
    authMiddleware,
    authorizeRoles("admin"),
    getProfessors
);

// Search Professors
router.get(
    "/search",
    authMiddleware,
    authorizeRoles("admin"),
    searchProfessors
);

// Update Professor
router.put(
    "/:id",
    authMiddleware,
    authorizeRoles("admin"),
    updateProfessor
);

// Deactivate Professor
router.patch(
    "/:id/deactivate",
    authMiddleware,
    authorizeRoles("admin"),
    deactivateProfessor
);

// Reactivate Professor
router.patch(
    "/:id/reactivate",
    authMiddleware,
    authorizeRoles("admin"),
    reactivateProfessor
);

// Bulk Upload Professors
router.post(
    "/bulk-upload",
    authMiddleware,
    authorizeRoles("admin"),
    upload.single("file"),
    bulkUploadProfessors
);

export default router;
