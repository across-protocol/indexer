# Set the build image
FROM node:20

# Set the work directory
WORKDIR /usr/src/app

# We need to install pnpm globally to use it in the next step
RUN npm install -g pnpm turbo

# Copy the rest of the files & build the app
COPY . .

# Build the dependencies into a node_modules folder
RUN pnpm install --frozen-lockfile

# Build the monorepo
RUN pnpm build

