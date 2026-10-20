import { API_BASE_URL } from "./apiConfig";

async function request(path, options = {}, authenticated = true) {
  const token = localStorage.getItem("studentToken");
  const response = await fetch(`${API_BASE_URL}/student${path}`, {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...(authenticated && token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `Request failed (${response.status})`);
  }

  return data;
}

export const studentPortalService = {
  requestOtp(email) {
    return request("/register", {
      method: "POST",
      body: JSON.stringify({ email }),
    }, false);
  },

  verifyOtp(email, otp, password) {
    return request("/verify-otp", {
      method: "POST",
      body: JSON.stringify({ email, otp, password }),
    }, false);
  },

  login(email, password, incomingDeviceUuid) {
    return request("/login", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        incomingDeviceUuid,
        platformInfo: navigator.userAgent,
      }),
    }, false);
  },

  getDashboard() {
    return request("/dashboard");
  },

  validateQr(lectureId, token) {
    return request("/attendance/validate-qr", {
      method: "POST",
      body: JSON.stringify({ lectureId, token }),
    });
  },

  submitAttendance(lectureId, token, latitude, longitude) {
    return request("/attendance/scan", {
      method: "POST",
      body: JSON.stringify({ lectureId, token, latitude, longitude }),
    });
  },

  logout() {
    return request("/logout", { method: "POST" });
  },
};
