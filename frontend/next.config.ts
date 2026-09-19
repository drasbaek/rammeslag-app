import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The repo's agent instructions live in the root AGENTS.md, and CLAUDE.md is
  // a one-line pointer to it (see AGENTS.md). Next 16 otherwise drops its own
  // generated copies in frontend/ on every dev start.
  agentRules: false,
};

export default nextConfig;
