import { useEffect, useRef, useState } from "react";
import { studentPortalService } from "./services/studentPortalService";
import "./StudentPortal.css";

function parseQr(value) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        "This QR code is not an attendance code. Scan the live lecture QR.",
        { cause: error },
      );
    }
    throw error;
  }
  if (!parsed || typeof parsed !== "object" || typeof parsed.lectureId !== "string" || typeof parsed.token !== "string") {
    throw new Error("QR code does not contain attendance details.");
  }
  return { lectureId: parsed.lectureId, token: parsed.token };
}

function getLocation() {
  if (!navigator.geolocation) {
    return Promise.reject(new Error("This browser does not support location services."));
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      (error) => reject(new Error({
        1: "Allow location access to verify attendance.",
        2: "Your current location could not be determined.",
        3: "Location request timed out. Please try again.",
      }[error.code] || "Unable to access your location.")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
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
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    let active = true;
    studentPortalService.getDashboard()
      .then((result) => {
        if (active) setStudent(result.data);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || "Unable to load your dashboard.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!scanning || !streamRef.current || !videoRef.current) return undefined;
    const video = videoRef.current;
    video.srcObject = streamRef.current;
    video.play().catch(() => setCameraError("Camera preview could not start. Check browser permissions."));
    let timer;
    let stopped = false;
    const Detector = window.BarcodeDetector;
    if (!Detector) {
      return undefined;
    }
    const detector = new Detector({ formats: ["qr_code"] });
    const detect = async () => {
      if (stopped) return;
      try {
        const codes = await detector.detect(video);
        if (codes[0]?.rawValue) {
          setQrInput(codes[0].rawValue);
          setNotice("QR code found. Select “Mark attendance” to continue.");
          setScanning(false);
          streamRef.current?.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
          return;
        }
      } catch {
        setCameraError("Could not read the QR code. Hold it steady and try again.");
      }
      timer = window.setTimeout(detect, 220);
    };
    detect();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [scanning]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const startCamera = async () => {
    setCameraError("");
    setNotice("");
    if (!window.BarcodeDetector) {
      setCameraError("Automatic QR scanning is not supported by this browser. Paste the QR contents below instead.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera access is unavailable. Use a secure connection or paste the QR contents.");
      return;
    }
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      setScanning(true);
    } catch (cameraFailure) {
      setCameraError(cameraFailure.name === "NotAllowedError"
        ? "Allow camera access in your browser to scan the attendance QR."
        : "Unable to open the camera. You can paste the QR contents instead.");
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  };

  const markAttendance = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const { lectureId, token } = parseQr(qrInput.trim());
      const validation = await studentPortalService.validateQr(lectureId, token);
      if (!validation.valid) throw new Error(validation.message || "QR code is no longer valid.");
      const location = await getLocation();
      const result = await studentPortalService.submitAttendance(
        lectureId, token, location.latitude, location.longitude,
      );
      setNotice(result.message || "Attendance recorded.");
      setQrInput("");
      const dashboard = await studentPortalService.getDashboard();
      setStudent(dashboard.data);
    } catch (requestError) {
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
      setError(`Could not confirm logout with the server: ${requestError.message}`);
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
          <a href="#student-home" className="student-brand" onClick={(event) => event.preventDefault()}>
            <span className="student-brand-mark">Q</span>
            <span><strong>DQRAttendance</strong><small>STUDENT PORTAL</small></span>
          </a>
          <button type="button" className="student-logout" onClick={logout}>Sign out <span aria-hidden="true">↗</span></button>
        </header>

        <section className="student-hero">
          <div>
            <span className="student-live-label"><i /> STUDENT DASHBOARD</span>
            <h1>Hello, {name.split(" ")[0]}</h1>
            <p>Your attendance, class details and live check-in are all in one place.</p>
          </div>
          <div className="student-hero-art" aria-hidden="true"><span>✓</span><i /><i /><i /></div>
        </section>

        {error && <p className="student-alert is-error" role="alert">{error}</p>}
        {notice && <p className="student-alert is-success" role="status">{notice}</p>}

        {loading ? <div className="student-panel student-loading">Loading your attendance dashboard…</div> : (
          <>
            <section className="student-stat-grid">
              <article className="student-stat-card student-rate-card">
                <span>ATTENDANCE RATE</span>
                <strong>{percentage}%</strong>
                <div className="student-progress"><i style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }} /></div>
                <small>{percentage >= 75 ? "You're meeting the 75% attendance target." : "Attend upcoming classes to improve your attendance."}</small>
              </article>
              <article className="student-stat-card"><span>CLASSES ATTENDED</span><strong>{summary.totalSessionsAttended ?? 0}</strong><small>Completed and approved sessions</small></article>
              <article className="student-stat-card"><span>SESSIONS CONDUCTED</span><strong>{summary.totalSessionsConducted ?? 0}</strong><small>For your assigned class</small></article>
            </section>

            <section className="student-content-grid">
              <article className="student-panel student-profile-card">
                <div className="student-panel-title"><div><p>YOUR PROFILE</p><h2>Academic details</h2></div><span className="student-profile-avatar">{name.charAt(0).toUpperCase()}</span></div>
                <div className="student-profile-name">{name}</div>
                <div className="student-detail-list">
                  <div><span>Email</span><strong>{student?.email || "—"}</strong></div>
                  <div><span>Roll number</span><strong>{academic.rollNo ?? "—"}</strong></div>
                  <div><span>Class / Division</span><strong>{academic.class || "—"}{academic.division ? ` / ${academic.division}` : ""}</strong></div>
                  <div><span>Batch</span><strong>{academic.batch || "—"}</strong></div>
                </div>
                <div className="student-device-note"><span>◆</span> This account is secured to your trusted device.</div>
              </article>

              <article className="student-panel student-scan-card">
                <div className="student-panel-title"><div><p>LIVE CHECK-IN</p><h2>Mark attendance</h2></div><span className="student-scan-icon">▦</span></div>
                <p className="student-scan-description">Scan the professor’s active QR code to record attendance. Location access is required for verification.</p>
                {scanning && <div className="student-camera-frame"><video ref={videoRef} playsInline muted aria-label="Camera QR scanner" /><span>Point your camera at the live QR</span></div>}
                {cameraError && <p className="student-camera-message" role="status">{cameraError}</p>}
                <div className="student-scan-actions">
                  {!scanning ? <button className="student-scan-button" type="button" onClick={startCamera}>Open camera scanner</button> : <button className="student-scan-button secondary" type="button" onClick={stopCamera}>Stop camera</button>}
                </div>
                <form className="student-qr-form" onSubmit={markAttendance}>
                  <label htmlFor="student-qr-payload">Or paste QR contents</label>
                  <textarea id="student-qr-payload" value={qrInput} onChange={(event) => setQrInput(event.target.value)} placeholder='{"lectureId":"…","token":"…"}' rows="3" required />
                  <button type="submit" className="student-submit-button" disabled={submitting || !qrInput.trim()}>{submitting ? "Verifying location…" : "Mark attendance"}</button>
                </form>
                <p className="student-scan-footnote">QR codes refresh frequently. Scan the currently displayed code, and keep location enabled.</p>
              </article>
            </section>
          </>
        )}
        <footer className="student-footer">DQRAttendance <span>Secure student access</span></footer>
      </div>
    </main>
  );
}

export default StudentPortal;
