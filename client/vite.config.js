import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import {fileURLToPath} from "node:url";
import {wholesaleOfflineBuild} from './scripts/wholesale-offline-build.mjs';

export default defineConfig({
  plugins:[react(),wholesaleOfflineBuild()],
  server:{proxy:{"/api":"http://localhost:8080"}},
  build:{rollupOptions:{input:{
    main:fileURLToPath(new URL("./index.html",import.meta.url)),
    b2b:fileURLToPath(new URL("./b2b.html",import.meta.url)),
    wholesale:fileURLToPath(new URL("./wholesale.html",import.meta.url))
  }}}
});
