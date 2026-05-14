import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // React Compiler — auto-memoizes components, lets us drop most useCallback
  // and useMemo. Stable in Next 16. Dev compile time goes up (Babel-based).
  reactCompiler: true,
};

export default nextConfig;

import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
