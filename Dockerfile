# Stage 1: Frontend build
FROM node:22-alpine AS frontend
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci --ignore-scripts
COPY web/ ./
# Copy MediaPipe WASM + model and RNNoise WASM to public dir (served as static assets, loaded on demand)
RUN mkdir -p public/mediapipe/wasm public/mediapipe/models public/rnnoise \
    && cp node_modules/@mediapipe/tasks-vision/wasm/* public/mediapipe/wasm/ \
    && cp node_modules/@jitsi/rnnoise-wasm/dist/rnnoise.wasm public/rnnoise/ \
    && node -e "const https=require('https'),fs=require('fs');https.get('https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',r=>{r.pipe(fs.createWriteStream('public/mediapipe/models/selfie_segmenter.tflite'))})"
RUN npm run build

# Stage 2: Backend build
FROM golang:1.25-alpine AS backend
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend /app/web/dist ./web/dist
RUN CGO_ENABLED=0 go build -tags embedstatic -o /webmail ./cmd/webmail-api
RUN CGO_ENABLED=0 go install github.com/pressly/goose/v3/cmd/goose@latest

# Stage 3: Runtime
FROM ubuntu:24.04
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=backend /webmail /usr/local/bin/webmail
COPY --from=backend /go/bin/goose /bin/goose
COPY --from=backend /app/migrations /migrations
COPY --from=frontend /app/web/dist /web/dist
EXPOSE 8095
ENTRYPOINT ["webmail"]
