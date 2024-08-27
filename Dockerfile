FROM node:20 AS development


WORKDIR /usr/src/app

# We need to install pnpm globally to use it in the next step
RUN npm install -g pnpm

COPY package*.json ./
COPY pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm build

FROM node:20 AS production

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

WORKDIR /usr/src/app

# Copy pnpm from the development stage
COPY --from=development /usr/local/bin/pnpm /usr/local/bin/pnpm

# Ensure that APP is set
ARG APP
RUN if [ -z "$APP" ]; then echo "Error: APP is not set. Please provide a value for APP." && exit 1; fi

# Print the APP value
RUN echo "APP is set to $APP"

COPY package*.json ./
COPY pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
COPY --from=development /usr/src/app/dist ./dist

CMD ["pnpm", "--filter @repo/node-app start"]