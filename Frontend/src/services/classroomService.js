import { API_BASE_URL } from "./apiConfig";

const API_URL = `${API_BASE_URL}/classrooms`;

const getHeaders = () => {
  const token = localStorage.getItem("adminToken");

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
};

const handleResponse = async (response) => {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Something went wrong.");
  }

  return data;
};

export const getClassrooms = async () => {
  const response = await fetch(API_URL, {
    method: "GET",
    headers: getHeaders(),
  });

  return handleResponse(response);
};

export const createClassroom = async (classroomData) => {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(classroomData),
  });

  return handleResponse(response);
};

export const updateClassroom = async (id, classroomData) => {
  const response = await fetch(`${API_URL}/${id}`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify(classroomData),
  });

  return handleResponse(response);
};