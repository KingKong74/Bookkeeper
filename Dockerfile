# --- build stage ---------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
# package-lock.json is out of sync with package.json (npm ci fails on it),
# same reason CI uses npm install.
RUN npm install --no-audit --no-fund

COPY . .

# Vite inlines these at build time, so they arrive as build args
# (Dokploy: Build Arguments, not runtime Environment).
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN npm run build

# --- serve stage ---------------------------------------------------------
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
