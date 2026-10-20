
const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "/api"
).replace(/\/+$/, "");

export { API_BASE_URL };
export default API_BASE_URL;
