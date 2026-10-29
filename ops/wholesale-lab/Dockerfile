FROM node:22.23.4-bookworm AS build
WORKDIR /app
COPY package.json ./
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json
RUN npm install --no-audit --no-fund
COPY client ./client
COPY server ./server
COPY tools ./tools
COPY shared ./shared
COPY ops/wholesale-lab ./ops/wholesale-lab
RUN npm run build:client && npm run prisma:generate -w server

FROM postgres:16-bookworm
COPY --from=build /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/ops/wholesale-lab ./ops/wholesale-lab
COPY --from=build /app/package.json ./package.json
ENV NODE_ENV=production NODE_OPTIONS=--max-old-space-size=192 WHOLESALE_LAB=1
USER postgres
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/lab/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["bash", "/app/ops/wholesale-lab/entrypoint.sh"]
