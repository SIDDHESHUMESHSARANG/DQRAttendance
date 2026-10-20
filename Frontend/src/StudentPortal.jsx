
import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { studentPortalService } from "./services/studentPortalService";
import "./StudentPortal.css";

function parseQr(value) {
  let parsed;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(
      "Invalid QR code. Please scan the professor's live attendance QR."
    );
  }

  if (
    !parsed ||
    typeof parsed.lectureId !== "string" ||
    typeof parsed.token !== "string"
  ) {
    throw new Error("QR code does not contain valid attendance details.");
  }

  return {
    lectureId: parsed.lectureId,
    token: parsed.token,
  };
}

function withTimeout(promise, milliseconds, message) {
  let timer;

  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = window.setTimeout(
        () => reject(new Error(message)),
        milliseconds
      );
    }),
  ]).finally(() => window.clearTimeout(timer));
}

function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Your browser does not support location services."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        resolve({
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
      },
      (error) => {
        const messages = {
          1: "Please allow location access in your browser.",
          2: "Location unavailable. Turn on your device location and retry.",
          3: "Location timed out. Please try again.",
        };

        reject(
          new Error(messages[error.code] || "Unable to get your location.")
        );
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  });
}

function StudentPortal({ onLogout }) {
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [qrInput, setQrInput] = useState("");
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [attendanceResult, setAttendanceResult] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    let active = true;

    studentPortalService
      .getDashboard()
      .then((result) => {
        if (active) setStudent(result.data);
      })
      .catch((requestError) => {
        if (active) {
          setError(
            requestError.message || "Unable to load your dashboard."
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!scanning || !streamRef.current || !videoRef.current) {
      return undefined;
    }

    const video = videoRef.current;
    video.srcObject = streamRef.current;

    video.play().catch(() => {
      setCameraError("Camera preview failed. Check camera permissions.");
    });

    let timer;
    let stopped = false;
    let detector = null;

    if (window.BarcodeDetector) {
      try {
        detector = new window.BarcodeDetector({
          formats: ["qr_code"],
        });
      } catch {
        detector = null;
      }
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", {
      willReadFrequently: true,
    });

    if (!context) {
      setCameraError("QR scanning is unavailable in this browser.");
      return undefined;
    }

    const detect = async () => {
      if (stopped) return;

      try {
        let rawValue;

        if (detector) {
          try {
            const codes = await detector.detect(video);
            rawValue = codes[0]?.rawValue;
          } catch {
            detector = null;
          }
        }

        if (
          !rawValue &&
          !detector &&
          video.videoWidth &&
          video.videoHeight
        ) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;

          context.drawImage(
            video,
            0,
            0,
            canvas.width,
            canvas.height
          );

          const image = context.getImageData(
            0,
            0,
            canvas.width,
            canvas.height
          );

          rawValue = jsQR(
            image.data,
            image.width,
            image.height,
            { inversionAttempts: "dontInvert" }
          )?.data;
        }

        if (rawValue) {
          try {
            parseQr(rawValue);

            setQrInput(rawValue);
            setNotice(
              "QR scanned successfully. Click Mark Attendance to continue."
            );
            setError("");
            setAttendanceResult(null);
          } catch (scanError) {
            setCameraError(scanError.message);
          }

          streamRef.current?.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
          setScanning(false);
          return;
        }
      } catch {
        setCameraError("Unable to read the QR. Please try again.");
      }

      if (!stopped) {
        timer = window.setTimeout(detect, 250);
      }
    };

    detect();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [scanning]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const startCamera = async () => {
    setCameraError("");
    setError("");
    setNotice("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "Camera unavailable. Use localhost or HTTPS, or paste the QR contents."
      );
      return;
    }

    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });

      setScanning(true);
    } catch (cameraFailure) {
      setCameraError(
        cameraFailure.name === "NotAllowedError"
          ? "Allow camera permission in your browser."
          : "Unable to open camera. You can paste the QR contents instead."
      );
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  };

  const markAttendance = async (event) => {
    event.preventDefault();

    if (submitting) return;

    setSubmitting(true);
    setError("");
    setNotice("");
    setAttendanceResult(null);

    try {
      // Step 1: Read QR details.
      const { lectureId, token } = parseQr(qrInput.trim());

      // Step 2: Verify QR with backend.
      setNotice("Step 1/3: Verifying QR code...");

      const validation = await withTimeout(
        studentPortalService.validateQr(lectureId, token),
        12000,
        "QR verification timed out. Please try again."
      );

      if (validation.valid !== true) {
        throw new Error(
          validation.message || "QR code is invalid or expired."
        );
      }

      // Step 3: Get student's current location.
      setNotice("Step 2/3: Checking your location. Please wait...");

      const location = await getLocation();

      // Step 4: Save attendance in the backend.
      setNotice("Step 3/3: Saving your attendance...");

      const result = await withTimeout(
        studentPortalService.submitAttendance(
          lectureId,
          token,
          location.latitude,
          location.longitude
        ),
        15000,
        "Attendance request timed out. Check your attendance before retrying."
      );

      if (!result.success) {
        throw new Error(result.message || "Attendance could not be recorded.");
      }

      const status = result.attendance?.status;

      setAttendanceResult({
        status,
        message:
          status === "present"
            ? "ATTENDANCE MARKED SUCCESSFULLY!"
            : status === "flagged"
              ? "ATTENDANCE RECORDED - ADMIN VERIFICATION PENDING"
              : result.message || "Attendance recorded successfully.",
        markedAt: result.attendance?.markedAt,
        distanceMeters: result.attendance?.distanceMeters,
      });

      setNotice(
        status === "present"
          ? "You are marked PRESENT for this lecture."
          : status === "flagged"
            ? "Your attendance is saved but requires Admin verification."
            : result.message || "Attendance recorded successfully."
      );

      setQrInput("");

      // Refresh dashboard without losing the success message.
      try {
        const dashboard = await withTimeout(
          studentPortalService.getDashboard(),
          10000,
          "Dashboard refresh timed out."
        );

        setStudent(dashboard.data);
      } catch (refreshError) {
        console.error("Dashboard refresh failed:", refreshError.message);
      }
    } catch (requestError) {
      setNotice("");
      setError(requestError.message || "Unable to mark attendance.");
    } finally {
      setSubmitting(false);
    }
  };

  const logout = async () => {
    setError("");

    try {
      await studentPortalService.logout();
    } catch (requestError) {
      setError(
        `Could not confirm logout with the server: ${requestError.message}`
      );
    } finally {
      localStorage.removeItem("studentToken");
      onLogout?.();
    }
  };

  const academic = student?.academicDetails || {};
  const summary = student?.attendanceSummary || {};
  const name = academic.fullName || "Student";
  const percentage = Number(summary.attendancePercentage || 0);

  return (
    <main className="student-portal">
      <div className="student-portal-inner">
        <header className="student-topbar">
          <a
            href="#student-home"
            className="student-brand"
            onClick={(event) => event.preventDefault()}
          >
            <span className="student-brand-mark">Q</span>
            <span>
              <strong>DQRAttendance</strong>
              <small>STUDENT PORTAL</small>
            </span>
          </a>

          <button
            type="button"
            className="student-logout"
            onClick={logout}
          >
            Sign out
          </button>
        </header>

        <section className="student-hero">
          <div>
            <span className="student-live-label">
              <i /> STUDENT DASHBOARD
            </span>
            <h1>Hello, {name.split(" ")[0]}</h1>
            <p>
              Your attendance, class details and live check-in are all in one
              place.
            </p>
          </div>
          <div className="student-hero-art" aria-hidden="true">
            <span>✓</span><i /><i /><i />
          </div>
        </section>

        {error && (
          <p className="student-alert is-error" role="alert">
            {error}
          </p>
        )}

        {notice && (
          <p className="student-alert is-success" role="status">
            {notice}
          </p>
        )}

        {attendanceResult && (
          <section
            className="student-panel"
            role="status"
            aria-live="polite"
            style={{
              marginBottom: "20px",
              padding: "22px",
              border: "2px solid",
              borderColor:
                attendanceResult.status === "present"
                  ? "#16a34a"
                  : attendanceResult.status === "flagged"
                    ? "#d97706"
                    : "#64748b",
            }}
          >
            <h2>
              {attendanceResult.status === "present"
                ? "✓ PRESENT"
                : attendanceResult.status === "flagged"
                  ? "⚠ PENDING VERIFICATION"
                  : "Attendance Result"}
            </h2>

            <p>{attendanceResult.message}</p>

            {attendanceResult.markedAt && (
              <p>
                <strong>Marked at:</strong>{" "}
                {new Date(attendanceResult.markedAt).toLocaleString()}
              </p>
            )}

            {Number.isFinite(attendanceResult.distanceMeters) && (
              <p>
                <strong>Distance from professor:</strong>{" "}
                {attendanceResult.distanceMeters} metres
              </p>
            )}
          </section>
        )}

        {loading ? (
          <div className="student-panel student-loading">
            Loading your attendance dashboard...
          </div>
        ) : (
          <>
            <section className="student-stat-grid">
              <article className="student-stat-card student-rate-card">
                <span>ATTENDANCE RATE</span>
                <strong>{percentage}%</strong>
                <div className="student-progress">
                  <i
                    style={{
                      width: `${Math.min(100, Math.max(0, percentage))}%`,
                    }}
                  />
                </div>
                <small>
                  {percentage >= 75
                    ? "You're meeting the 75% attendance target."
                    : "Attend upcoming classes to improve your attendance."}
                </small>
              </article>

              <article className="student-stat-card">
                <span>CLASSES ATTENDED</span>
                <strong>{summary.totalSessionsAttended ?? 0}</strong>
                <small>Completed and approved sessions</small>
              </article>

              <article className="student-stat-card">
                <span>SESSIONS CONDUCTED</span>
                <strong>{summary.totalSessionsConducted ?? 0}</strong>
                <small>For your assigned class</small>
              </article>
            </section>

            <section className="student-content-grid">
              <article className="student-panel student-profile-card">
                <div className="student-panel-title">
                  <div>
                    <p>YOUR PROFILE</p>
                    <h2>Academic details</h2>
                  </div>
                  <span className="student-profile-avatar">
                    {name.charAt(0).toUpperCase()}
                  </span>
                </div>

                <div className="student-profile-name">{name}</div>

                <div className="student-detail-list">
                  <div>
                    <span>Email</span>
                    <strong>{student?.email || "—"}</strong>
                  </div>
                  <div>
                    <span>Roll number</span>
                    <strong>{academic.rollNo ?? "—"}</strong>
                  </div>
                  <div>
                    <span>Class / Division</span>
                    <strong>
                      {academic.class || "—"}
                      {academic.division ? ` / ${academic.division}` : ""}
                    </strong>
                  </div>
                  <div>
                    <span>Batch</span>
                    <strong>{academic.batch || "—"}</strong>
                  </div>
                </div>

                <div className="student-device-note">
                  <span>◆</span> This account is secured to your trusted device.
                </div>
              </article>

              <article className="student-panel student-scan-card">
                <div className="student-panel-title">
                  <div>
                    <p>LIVE CHECK-IN</p>
                    <h2>Mark attendance</h2>
                  </div>
                  <span className="student-scan-icon">▦</span>
                </div>

                <p className="student-scan-description">
                  Scan the professor's active QR code to record attendance.
                  Location access is required for verification.
                </p>

                {scanning && (
                  <div className="student-camera-frame">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      aria-label="Camera QR scanner"
                    />
                    <span>Point your camera at the live QR</span>
                  </div>
                )}

                {cameraError && (
                  <p className="student-camera-message" role="status">
                    {cameraError}
                  </p>
                )}

                <div className="student-scan-actions">
                  {!scanning ? (
                    <button
                      className="student-scan-button"
                      type="button"
                      onClick={startCamera}
                      disabled={submitting}
                    >
                      Open camera scanner
                    </button>
                  ) : (
                    <button
                      className="student-scan-button secondary"
                      type="button"
                      onClick={stopCamera}
                    >
                      Stop camera
                    </button>
                  )}
                </div>

                <form className="student-qr-form" onSubmit={markAttendance}>
                  <label htmlFor="student-qr-payload">
                    Or paste QR contents
                  </label>

                  <textarea
                    id="student-qr-payload"
                    value={qrInput}
                    onChange={(event) => setQrInput(event.target.value)}
                    placeholder='{"lectureId":"...","token":"..."}'
                    rows="3"
                    required
                    disabled={submitting}
                  />

                  <button
                    type="submit"
                    className="student-submit-button"
                    disabled={submitting || !qrInput.trim()}
                  >
                    {submitting ? "Please wait..." : "Mark attendance"}
                  </button>
                </form>

                <p className="student-scan-footnote">
                  Scan the currently displayed QR and keep location enabled.
                  Do not submit repeatedly while verification is in progress.
                </p>
              </article>
            </section>
          </>
        )}

        <footer className="student-footer">
          DQRAttendance <span>Secure student access</span>
        </footer>
      </div>
    </main>
  );
}

export default StudentPortal;
