/** @type {import('next').NextConfig} */
const nextConfig = {
  // The admin is its own deploy unit (separate Vercel project rooted at
  // admin/, or any Node host: npm ci && npm run build && npm start).
  serverExternalPackages: ["argon2", "pg"],
};
export default nextConfig;
