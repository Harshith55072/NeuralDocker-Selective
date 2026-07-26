# Build stage
FROM node:20 AS builder

WORKDIR /app

# Vite bakes these into the JS bundle at build time — they must be build ARGs,
# not container-runtime env vars (the built static files can't read env vars
# after the fact). Passed in from docker-compose.yml's `build.args`.
ARG VITE_API_URL=http://localhost:8081
ARG VITE_AI_API_URL=http://localhost:8000
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_AI_API_URL=${VITE_AI_API_URL}

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

# Production stage
FROM nginx:alpine

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]