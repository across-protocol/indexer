FROM node:lts-iron AS development


WORKDIR /usr/src/app

# We need to install pnpm globally to use it in the next step
RUN npm install -g pnpm

COPY package*.json ./
COPY pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm build

FROM node:lts-iron AS production

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

WORKDIR /usr/src/app
COPY package*.json ./
COPY pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
COPY --from=development /usr/src/app/dist ./dist
