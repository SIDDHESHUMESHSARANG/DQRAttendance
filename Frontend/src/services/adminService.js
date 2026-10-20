import { API_BASE_URL } from "./apiConfig";

async function request(path, options = {}) {
  const token = localStorage.getItem("adminToken");
  if (!token) throw new Error("Admin session expired. Please log in again.");

  const response = await fetch(`${API_BASE_URL}/admin${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `Request failed (${response.status})`);
  }

  return data;
}

export const adminService = {
  getDashboardStats: () => request("/dashboard/stats"),
  getAttendanceOverview: () => request("/attendance/overview"),
  getAttendanceByDate: (date) =>
    request(`/attendance/by-date?${new URLSearchParams({ date })}`),
  getFlaggedAttendance: () => request("/flagged-attendance"),
  reviewFlaggedAttendance: (id, action) =>
    request(`/attendance/${encodeURIComponent(id)}/review`, {
      method: "PATCH",
      body: JSON.stringify({ action }),
    }),
  getLowAttendanceStudents: () => request("/students/low-attendance"),
  sendAttendanceAlert: (id) =>
    request(`/students/${encodeURIComponent(id)}/attendance-alert`, {
      method: "POST",
    }),
};
