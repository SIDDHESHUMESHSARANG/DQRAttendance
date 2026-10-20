const API_URL = "http://localhost:3000/api/professors";

async function professorRequest(endpoint, options = {}) {
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
        data.message ||
          "Admin session invalid hai ya permission nahi hai."
      );
    }

    throw new Error(
      data.message || "Professor request failed."
    );
  }

  return data;
}

export const professorService = {
  // Get all professors
  getProfessors(search = "") {
    const query = search.trim();

    if (query) {
      return professorRequest(
        `/search?${new URLSearchParams({ search: query })}`
      );
    }

    return professorRequest("/");
  },

  // Add a professor
  addProfessor(professor) {
    return professorRequest("/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(professor),
    });
  },

  // Update professor details
  updateProfessor(id, professor) {
    return professorRequest(
      `/${encodeURIComponent(id)}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(professor),
      }
    );
  },

  // Deactivate professor account
  deactivateProfessor(id) {
    return professorRequest(
      `/${encodeURIComponent(id)}/deactivate`,
      {
        method: "PATCH",
      }
    );
  },

  // Reactivate professor account
  reactivateProfessor(id) {
    return professorRequest(
      `/${encodeURIComponent(id)}/reactivate`,
      {
        method: "PATCH",
      }
    );
  },

  // Bulk upload professors using CSV or Excel file
  bulkUpload(file) {
    const formData = new FormData();
    formData.append("file", file);

    return professorRequest("/bulk-upload", {
      method: "POST",
      body: formData,
    });
  },
};