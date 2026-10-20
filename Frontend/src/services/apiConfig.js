
const configuredApiUrl = (
  import.meta.env.VITE_API_URL || "/api"
).trim().replace(/\/+$/, "");

const API_BASE_URL = configuredApiUrl.endsWith("/api")
  ? configuredApiUrl
  : `${configuredApiUrl}/api`;

export { API_BASE_URL };
export default API_BASE_URL;
