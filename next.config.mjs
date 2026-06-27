const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['better-sqlite3'],
  allowedDevOrigins: ['187.77.156.41', '127.0.0.1', 'localhost'],
  generateBuildId: async () => {
    // Use timestamp + git hash to force unique build ids every time
    return `b${Date.now()}`;
  },
};

export default nextConfig;
