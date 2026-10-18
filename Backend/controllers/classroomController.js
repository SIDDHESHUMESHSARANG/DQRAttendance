
import Classroom from "../models/Classroom.js";

// API 1: Create Classroom
export const createClassroom = async (req, res) => {
    try {
        const {
            classroomName,
            building,
            latitude,
            longitude,
            radiusMeters,
        } = req.body || {};

        if (
            typeof classroomName !== "string" ||
            !classroomName.trim() ||
            typeof latitude !== "number" ||
            typeof longitude !== "number"
        ) {
            return res.status(400).json({
                message:
                    "Classroom name, numeric latitude and numeric longitude are required.",
            });
        }

        if (
            !Number.isFinite(latitude) ||
            latitude < -90 ||
            latitude > 90 ||
            !Number.isFinite(longitude) ||
            longitude < -180 ||
            longitude > 180
        ) {
            return res.status(400).json({
                message: "Invalid latitude or longitude.",
            });
        }

        const radius = radiusMeters === undefined ? 30 : radiusMeters;

        if (
            typeof radius !== "number" ||
            !Number.isFinite(radius) ||
            radius < 1 ||
            radius > 500
        ) {
            return res.status(400).json({
                message: "Radius must be between 1 and 500 metres.",
            });
        }

        const cleanBuilding =
            typeof building === "string" ? building.trim() : "";

        const classroom = await Classroom.create({
            classroomName: classroomName.trim(),
            building: cleanBuilding,
            latitude,
            longitude,
            radiusMeters: radius,
        });

        return res.status(201).json({
            message: "Classroom created successfully.",
            classroom,
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                message:
                    "A classroom with this name already exists in this building.",
            });
        }

        if (error.name === "ValidationError") {
            return res.status(400).json({
                message: error.message,
            });
        }

        console.error("Create classroom error:", error);

        return res.status(500).json({
            message: "Unable to create classroom.",
        });
    }
};

// API 2: Get Classrooms
export const getClassrooms = async (req, res) => {
    try {
        const { includeInactive } = req.query;

        const filter =
            includeInactive === "true" ? {} : { isActive: true };

        const classrooms = await Classroom.find(filter).sort({
            building: 1,
            classroomName: 1,
        });

        return res.status(200).json({
            count: classrooms.length,
            classrooms,
        });
    } catch (error) {
        console.error("Get classrooms error:", error);

        return res.status(500).json({
            message: "Unable to fetch classrooms.",
        });
    }
};

// API 3: Update Classroom
export const updateClassroom = async (req, res) => {
    try {
        const { id } = req.params;

        if (!/^[a-f\d]{24}$/i.test(id)) {
            return res.status(400).json({
                message: "Invalid classroom ID.",
            });
        }

        const classroom = await Classroom.findById(id);

        if (!classroom) {
            return res.status(404).json({
                message: "Classroom not found.",
            });
        }

        const {
            classroomName,
            building,
            latitude,
            longitude,
            radiusMeters,
        } = req.body || {};

        if (classroomName !== undefined) {
            if (
                typeof classroomName !== "string" ||
                !classroomName.trim()
            ) {
                return res.status(400).json({
                    message: "Classroom name cannot be empty.",
                });
            }

            classroom.classroomName = classroomName.trim();
        }

        if (building !== undefined) {
            if (typeof building !== "string") {
                return res.status(400).json({
                    message: "Building must be a string.",
                });
            }

            classroom.building = building.trim();
        }

        if (latitude !== undefined) {
            if (
                typeof latitude !== "number" ||
                !Number.isFinite(latitude) ||
                latitude < -90 ||
                latitude > 90
            ) {
                return res.status(400).json({
                    message: "Invalid latitude.",
                });
            }

            classroom.latitude = latitude;
        }

        if (longitude !== undefined) {
            if (
                typeof longitude !== "number" ||
                !Number.isFinite(longitude) ||
                longitude < -180 ||
                longitude > 180
            ) {
                return res.status(400).json({
                    message: "Invalid longitude.",
                });
            }

            classroom.longitude = longitude;
        }

        if (radiusMeters !== undefined) {
            if (
                typeof radiusMeters !== "number" ||
                !Number.isFinite(radiusMeters) ||
                radiusMeters < 1 ||
                radiusMeters > 500
            ) {
                return res.status(400).json({
                    message:
                        "Radius must be between 1 and 500 metres.",
                });
            }

            classroom.radiusMeters = radiusMeters;
        }

        await classroom.save();

        return res.status(200).json({
            message: "Classroom updated successfully.",
            classroom,
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                message:
                    "A classroom with this name already exists in this building.",
            });
        }

        if (error.name === "ValidationError") {
            return res.status(400).json({
                message: error.message,
            });
        }

        console.error("Update classroom error:", error);

        return res.status(500).json({
            message: "Unable to update classroom.",
        });
    }
};
