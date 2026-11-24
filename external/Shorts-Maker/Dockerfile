# Shorts-Maker Docker image
#
# Vendored, unmodified Next.js 16 + React 19 + Remotion 4 app (external/Shorts-Maker).
# Runs as its own container, parallel to snaps-pixelle-video, and is reached by the
# main snaps backend over the internal docker network only (never published publicly).
#
# Node 22 on Debian "bookworm" (NOT alpine): Remotion's server-side renderer
# (lib/studio/render-remotion-server.ts) launches a headless Chrome instance via
# @remotion/renderer, and Chromium-on-Alpine (musl libc) has known compatibility
# problems with the prebuilt Chrome binaries Remotion downloads. We do not apt-get
# install "chromium" ourselves: @remotion/renderer manages/downloads its own Chrome
# Headless Shell on first render (no browserExecutable override exists anywhere in
# this codebase's render path), which is more reliable than hand-pinning a distro
# Chromium build. We still need to install the shared system libraries that any
# Chrome/Chromium binary requires on Debian, or Remotion's downloaded browser will
# fail to start.
#
# ffmpeg is installed via apt and is on $PATH, so STUDIO_FFMPEG_PATH / FFMPEG_PATH
# (read by lib/studio/render-native-server.ts) are simply set to "ffmpeg".
#
# next.config.ts has no `output: "standalone"`, so the runtime image ships the full
# node_modules tree and runs `next start` directly. This is intentionally simple
# over minimal image size (task priority: correctness > size).

ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---------------------------------------------------------------------------
# deps: install npm dependencies (this is a standalone npm project, not part
# of the root pnpm workspace - it has its own package.json/package-lock.json).
# ---------------------------------------------------------------------------
FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# builder: production Next.js build.
# ---------------------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# runner: production runtime. Installs ffmpeg + the Debian shared libraries a
# headless Chrome/Chromium binary needs (Remotion downloads its own browser on
# first use, but that browser still links against these system libs).
# ---------------------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    ffmpeg \
    fonts-liberation \
    fonts-noto-cjk \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxkbcommon0 \
    libxrandr2 \
    libxtst6 \
    wget \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# ffmpeg is on $PATH after the apt install above.
ENV STUDIO_FFMPEG_PATH=ffmpeg
ENV FFMPEG_PATH=ffmpeg

# fonts-noto-cjk above is what makes Korean captions render at all. The default
# caption stack is
#   "Pretendard Variable", "Pretendard", -apple-system, ..., "Malgun Gothic", sans-serif
# (lib/publish/template-branding.ts), and "Pretendard Variable" only arrives
# through the jsDelivr @import in styles/studio-fonts.css that remotion/index.ts
# pulls in at render time. On a host without egress those @imports fail and the
# stack falls through to generic sans-serif, i.e. Noto Sans CJK: still readable
# Korean, just not the intended typeface. See docs/snaps-shorts-maker.md.

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts

# Remotion bundles the composition from SOURCE at render time, not from .next:
# lib/studio/render-remotion-server.ts calls
#   bundle({ entryPoint: join(process.cwd(), "remotion", "index.ts") })
# so these directories must exist in the runtime image or every video render
# fails with a missing entry point. remotion/ pulls in types/, lib/studio/ and
# app/shorts-json-studio/components/templates/* through relative and "@/" imports,
# and tsconfig.json (copied above) is what resolves the "@/" alias for the bundler.
COPY --from=builder /app/remotion ./remotion
COPY --from=builder /app/types ./types
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/app ./app

EXPOSE 4100

# Port confirmed against package.json's "dev": "next dev -p 4100" and
# CLAUDE.md ("dev server on port 4100"); "start": "next start" has no default
# -p flag on its own, so it is set explicitly here to keep prod/dev consistent.
CMD ["npx", "next", "start", "-p", "4100"]
