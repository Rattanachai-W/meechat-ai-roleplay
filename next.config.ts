import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  turbopack: {
    // กัน warning จาก package-lock.json ที่อยู่นอก project (OneDrive path)
    root: import.meta.dirname,
  },
};

export default withNextIntl(nextConfig);
