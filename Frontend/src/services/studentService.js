
import { API_BASE_URL } from "./apiConfig";

const API_URL = `${API_BASE_URL}/admin`;

async function studentRequest(endpoint, options = {}) {
  const token = localStorage.getItem("adminToken");

  if (!token) {
    throw new Error("Admin session nahi mila. Dobara login karein.");
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    ...options.headers,
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        data.message || "Session invalid hai ya permission nahi hai."
      );
    }

    throw new Error(data.message || "Request failed. Please try again.");
  }

  return data;
}

export const studentService = {
  getStudents(search = "") {
    const query = new URLSearchParams();

    if (search.trim()) {
      query.set("search", search.trim());
    }

    const suffix = query.toString() ? `?${query.toString()}` : "";

    return studentRequest(`/students${suffix}`);
  },

  addStudent(student) {
    return studentRequest("/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(student),
    });
  },

  updateStudent(id, student) {
    return studentRequest(`/students/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(student),
    });
  },

  deleteStudent(id) {
    return studentRequest(`/students/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },

  resetTrustedDevice(id) {
    return studentRequest(`/students/${encodeURIComponent(id)}/reset-device`, {
      method: "PATCH",
    });
  },

  bulkUpload(file) {
    const formData = new FormData();
    formData.append("file", file);

    return studentRequest("/students/bulk-upload", {
      method: "POST",
      body: formData,
    });
  },

  getAttendanceHistory(id) {
    return studentRequest(
      `/students/${encodeURIComponent(id)}/attendance`
    );
  },
};
