
import express from "express";

import {
    createLecture,
    getLectures,
    updateLecture,
    cancelLecture,
    startLecture,
    stopLecture,
} from "../controllers/lectureController.js";

import {
    generateLectureQR,
} from "../controllers/qrController.js";

import authMiddleware, {
    authorizeRoles,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// API 1: Admin and Professor can view lectures
router.get(
    "/",
    authMiddleware,
    authorizeRoles("admin", "professor"),
    getLectures
);

// API 2: Only Admin can create a lecture
router.post(
    "/",
    authMiddleware,
    authorizeRoles("admin"),
    createLecture
);

// API 3: Only Admin can update a lecture
router.put(
    "/:id",
    authMiddleware,
    authorizeRoles("admin"),
    updateLecture
);

// API 4: Only Admin can cancel a lecture
router.patch(
    "/:id/cancel",
    authMiddleware,
    authorizeRoles("admin"),
    cancelLecture
);

// API 5: Professor starts their assigned lecture
router.patch(
    "/:id/start",
    authMiddleware,
    authorizeRoles("professor"),
    startLecture
);

// API 6: Professor stops their assigned lecture
router.patch(
    "/:id/stop",
    authMiddleware,
    authorizeRoles("professor"),
    stopLecture
);

// API 7: Professor generates QR for their own ongoing lecture
router.post(
    "/:id/qr",
    authMiddleware,
    authorizeRoles("professor"),
    generateLectureQR
);

export default router;
