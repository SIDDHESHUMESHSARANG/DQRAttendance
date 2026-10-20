
import Classroom from "../models/Classroom.js";

// API 1: Create Classroom
// Only classroomName is required. GPS coordinates are not required.
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
            !classroomName.trim()
        ) {
            return res.status(400).json({
                message: "Classroom name is required.",
            });
        }

        const cleanBuilding =
            typeof building === "string" ? building.trim() : "";

        const classroomData = {
            classroomName: classroomName.trim(),
            building: cleanBuilding,
        };

        // Keep compatibility with older requests that still send GPS.
        // If coordinates are supplied, validate both.
        const hasLatitude =
            latitude !== undefined && latitude !== null && latitude !== "";

        const hasLongitude =
            longitude !== undefined &&
            longitude !== null &&
            longitude !== "";

        if (hasLatitude !== hasLongitude) {
            return res.status(400).json({
                message:
                    "If GPS coordinates are supplied, both latitude and longitude are required.",
            });
        }

        if (hasLatitude && hasLongitude) {
            const lat = Number(latitude);
            const long = Number(longitude);

            if (
                !Number.isFinite(lat) ||
                lat < -90 ||
                lat > 90 ||
                !Number.isFinite(long) ||
                long < -180 ||
                long > 180
            ) {
                return res.status(400).json({
                    message: "Invalid latitude or longitude.",
                });
            }

            classroomData.latitude = lat;
            classroomData.longitude = long;
        }

        if (
            radiusMeters !== undefined &&
            radiusMeters !== null &&
            radiusMeters !== ""
        ) {
            const radius = Number(radiusMeters);

            if (
                !Number.isFinite(radius) ||
                radius < 1 ||
                radius > 500
            ) {
                return res.status(400).json({
                    message: "Radius must be between 1 and 500 metres.",
                });
            }

            classroomData.radiusMeters = radius;
        }

        const classroom = await Classroom.create(classroomData);

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

        if (latitude !== undefined || longitude !== undefined) {
            const lat =
                latitude === undefined || latitude === null || latitude === ""
                    ? classroom.latitude
                    : Number(latitude);

            const long =
                longitude === undefined ||
                longitude === null ||
                longitude === ""
                    ? classroom.longitude
                    : Number(longitude);

            // Allow legacy classroom records to keep optional coordinates.
            if (
                (lat !== undefined && lat !== null &&
                    (!Number.isFinite(lat) || lat < -90 || lat > 90)) ||
                (long !== undefined && long !== null &&
                    (!Number.isFinite(long) || long < -180 || long > 180))
            ) {
                return res.status(400).json({
                    message: "Invalid latitude or longitude.",
                });
            }

            if (lat !== undefined && lat !== null) {
                classroom.latitude = lat;
            }

            if (long !== undefined && long !== null) {
                classroom.longitude = long;
            }
        }

        if (radiusMeters !== undefined) {
            const radius = Number(radiusMeters);

            if (
                !Number.isFinite(radius) ||
                radius < 1 ||
                radius > 500
            ) {
                return res.status(400).json({
                    message:
                        "Radius must be between 1 and 500 metres.",
                });
            }

            classroom.radiusMeters = radius;
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
