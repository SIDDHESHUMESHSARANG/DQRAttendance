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

import authMiddleware from "../middleware/authMiddleware.js";

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

// Professor Registration OTP Routes (Public)
// Step 1: Request OTP
router.post("/register", sendProfessorOTP);

// Step 2: Verify OTP and set password
router.post("/verify-otp", verifyProfessorOTP);

// API 1: Add Professor (Admin)
router.post("/", authMiddleware, addProfessor);

// API 2: Get All Professors
router.get("/", authMiddleware, getProfessors);

// API 3: Search Professors
router.get("/search", authMiddleware, searchProfessors);

// API 4: Update Professor
router.put("/:id", authMiddleware, updateProfessor);

// API 5: Deactivate Professor
router.patch(
    "/:id/deactivate",
    authMiddleware,
    deactivateProfessor
);

// API 6: Reactivate Professor
router.patch(
    "/:id/reactivate",
    authMiddleware,
    reactivateProfessor
);

// API 7: Bulk Upload Professors
router.post(
    "/bulk-upload",
    authMiddleware,
    upload.single("file"),
    bulkUploadProfessors
);
router.post("/login", loginProfessor);
export default router;
