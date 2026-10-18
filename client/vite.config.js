import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import {fileURLToPath} from "node:url";

export default defineConfig({
  plugins:[react()],
  server:{proxy:{"/api":"http://localhost:8080"}},
  build:{rollupOptions:{input:{
    main:fileURLToPath(new URL("./index.html",import.meta.url)),
    b2b:fileURLToPath(new URL("./b2b.html",import.meta.url))
  }}}
});
