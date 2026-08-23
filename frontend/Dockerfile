# TODO: pin by digest in CI
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
# Both server configs ship in the image; the plain-HTTP one is the default.
# docker-compose.tls.yml swaps default.conf for the TLS variant at run time, so
# switching to HTTPS needs no rebuild.
COPY nginx.app-locations.conf /etc/nginx/snippets/app-locations.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx.tls.conf /etc/nginx/nginx.tls.conf

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
