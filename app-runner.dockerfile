# Use the official Node.js 20 Alpine image as a base image
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Command to keep the container running
CMD ["sh", "-c", "tail -f /dev/null"]
