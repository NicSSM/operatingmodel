// open-next.config.ts
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Minimal config. If you later enable R2 caching, you can add:
// import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
export default defineCloudflareConfig({
  // incrementalCache: r2IncrementalCache,
});
