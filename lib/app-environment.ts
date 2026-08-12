export function isDevelopmentAdminBypassEnabled() {
  if (process.env.NEXT_PUBLIC_APP_ENV !== "development") return false;

  const vercelEnvironment = process.env.VERCEL_ENV;
  if (vercelEnvironment) {
    return vercelEnvironment === "preview" || vercelEnvironment === "development";
  }

  return process.env.NODE_ENV === "development";
}
