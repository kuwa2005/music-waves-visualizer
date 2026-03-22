# ベースイメージ
FROM node:18-alpine AS base

# 依存関係のインストールステージ
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# package.jsonとpackage-lock.jsonをコピー
COPY package.json package-lock.json* ./
# postinstall は scripts/ 未コピーだと失敗するため、依存だけ先に入れる
RUN npm ci --legacy-peer-deps --ignore-scripts

# ビルドステージ
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 環境変数の設定（ビルド時に必要）
ENV NEXT_TELEMETRY_DISABLED 1
# 本番デフォルトは false。開発用イメージは --build-arg NEXT_PUBLIC_DEVELOPER_MODE=true
ARG NEXT_PUBLIC_DEVELOPER_MODE=false
ENV NEXT_PUBLIC_DEVELOPER_MODE=$NEXT_PUBLIC_DEVELOPER_MODE

# ビルド実行
RUN npm run build

# 本番イメージ
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Next.js standalone出力は.next/standaloneディレクトリに全てのファイルを含む
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]

