FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY data ./data
RUN npm run build:index
RUN npm run build

FROM node:20-slim AS run
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/data ./data
COPY src/prompts ./src/prompts
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:3001/api/health').then(r=>r.ok||process.exit(1)).catch(()=>process.exit(1))"
CMD ["node", "dist/src/server.js"]
