import { readFileSync } from "node:fs";
import path from "node:path";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, type Plugin, type UserConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// The admin imports the storefront's shared modules (estimate.js, render.js,
// icons.js) from the theme extension folder. In dev, Vite would serve them at
// /extensions/..., but the Shopify CLI proxy reserves that path for its
// extension server and answers 404, so the app's JavaScript never loads. Serve
// them as virtual modules (/@id/...) instead. The CSS is exposed as a string
// via "virtual:ede-widget-css".
function sharedStorefrontAssets(): Plugin {
  const dir = path.resolve(__dirname, "extensions/delivery-estimate/assets");
  const PREFIX = "\0ede-shared/";
  const CSS_ID = "virtual:ede-widget-css";
  return {
    name: "ede-shared-storefront-assets",
    enforce: "pre",
    resolveId(source, importer) {
      if (source === CSS_ID) return `${PREFIX}widget.css.js`;
      if (!importer || !source.startsWith(".")) return null;
      const base = importer.startsWith(PREFIX) ? dir : path.dirname(importer.split("?")[0]);
      const file = path.resolve(base, source);
      if (path.dirname(file) === dir && file.endsWith(".js")) return PREFIX + path.basename(file);
      return null;
    },
    load(id) {
      if (!id.startsWith(PREFIX)) return null;
      const name = id.slice(PREFIX.length);
      if (name === "widget.css.js") {
        const file = path.join(dir, "widget.css");
        this.addWatchFile(file);
        return `export default ${JSON.stringify(readFileSync(file, "utf8"))};`;
      }
      const file = path.join(dir, name);
      this.addWatchFile(file);
      return readFileSync(file, "utf8");
    },
  };
}

// Related: https://github.com/remix-run/remix/issues/2835#issuecomment-1144102176
// Replace the HOST env var with SHOPIFY_APP_URL so that it doesn't break the Vite server.
// The CLI will eventually stop passing in HOST,
// so we can remove this workaround after the next major release.
if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL ||
    process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}

const host = new URL(process.env.SHOPIFY_APP_URL || "http://localhost")
  .hostname;

let hmrConfig;
if (host === "localhost") {
  hmrConfig = {
    protocol: "ws",
    host: "localhost",
    port: 64999,
    clientPort: 64999,
  };
} else {
  hmrConfig = {
    protocol: "wss",
    host: host,
    port: parseInt(process.env.FRONTEND_PORT!) || 8002,
    clientPort: 443,
  };
}

export default defineConfig({
  server: {
    allowedHosts: [host],
    cors: {
      preflightContinue: true,
    },
    port: Number(process.env.PORT || 3000),
    hmr: hmrConfig,
    fs: {
      // See https://vitejs.dev/config/server-options.html#server-fs-allow for more information
      allow: ["app", "node_modules"],
    },
  },
  plugins: [
    sharedStorefrontAssets(),
    reactRouter(),
    tsconfigPaths(),
  ],
  build: {
    assetsInlineLimit: 0,
  },
  optimizeDeps: {
    include: ["@shopify/app-bridge-react"],
  },
}) satisfies UserConfig;
