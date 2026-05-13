export const frontendRole = process.env.NEXT_PUBLIC_FRONTEND_ROLE === "admin" ? "admin" : "api";

export function isAdminFrontend() {
  return frontendRole === "admin";
}
