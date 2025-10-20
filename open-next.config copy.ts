import type { Config } from "@opennextjs/cloudflare";

const config: Config = {
  mode: "pages",
  nextConfigDir: ".",
  default: { runtime: "edge" },   // important for CF
  // leave other options at defaults unless you know you need them
};
export default config;
