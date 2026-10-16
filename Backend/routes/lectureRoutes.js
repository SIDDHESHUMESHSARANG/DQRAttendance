import express from "express";
import {
    createLecture,
    getLectures,
    updateLecture,
    cancelLecture,
} from "../controllers/lectureController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/", authMiddleware, createLecture);
router.get("/", authMiddleware, getLectures);
router.put("/:id", authMiddleware, updateLecture);
router.patch("/:id/cancel", authMiddleware, cancelLecture);

export default router;