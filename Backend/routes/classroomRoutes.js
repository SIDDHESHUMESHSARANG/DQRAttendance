
import express from "express";

import {
    createClassroom,
    getClassrooms,
    updateClassroom,
} from "../controllers/classroomController.js";

import authMiddleware, {
    authorizeRoles,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// Only Admin can access classroom APIs
router.use(authMiddleware, authorizeRoles("admin"));

// Create classroom
router.post("/", createClassroom);

// Get classrooms
router.get("/", getClassrooms);

// Update classroom
router.patch("/:id", updateClassroom);

export default router;
