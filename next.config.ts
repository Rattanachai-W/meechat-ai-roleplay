import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // กัน warning จาก package-lock.json ที่อยู่นอก project (OneDrive path)
    root: import.meta.dirname,
  },
};

export default nextConfig;
