# Use an official Node runtime as a parent image with bun
FROM oven/bun:1-alpine AS build

# Set the working directory
WORKDIR /app

# Copy package.json and bun.lockb (if exists)
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Bundle app source inside Docker image
COPY . .

# Build the app
RUN bun run build

# Use a second stage to reduce image size
FROM oven/bun:1-alpine

# Set the working directory for the second stage
WORKDIR /app

# Copy the build directory from the first stage to the second stage
COPY --from=build /app/dist /app

# Copy the injection script
COPY inject-env.js /app/

# Install just serve for serving the built app
RUN bun add serve

# Expose port 5522
EXPOSE 5522

# Define environment variables
ENV DUCK_UI_EXTERNAL_CONNECTION_NAME=""
ENV DUCK_UI_EXTERNAL_HOST=""
ENV DUCK_UI_EXTERNAL_PORT=""
ENV DUCK_UI_EXTERNAL_USER=""
ENV DUCK_UI_EXTERNAL_PASS=""
ENV DUCK_UI_EXTERNAL_DATABASE_NAME=""

# Create user and change ownership
RUN addgroup -S duck-group -g 1001 && adduser -S duck-user -u 1001 -G duck-group
RUN chown -R duck-user:duck-group /app

USER duck-user

# Run the injection script then serve using bunx
CMD bun inject-env.js && bunx serve -s -l 5522