# Use an official Node runtime as a parent image
FROM node:20-alpine AS build

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json (or yarn.lock)
COPY package*.json ./

# Install dependencies
RUN npm install

# Run browser list update
RUN npx update-browserslist-db@latest

# Bundle app source inside Docker image
COPY . .

# Build the app
RUN npm run build

# Use a second stage to reduce image size
FROM node:20-alpine

# Set the working directory for the second stage
WORKDIR /app

# Install 'serve' to serve the app on port 5522
RUN npm install -g serve

# Copy the build directory from the first stage to the second stage
COPY --from=build /app/dist /app

# Expose port 5522 to have it mapped by the Docker daemon
EXPOSE 5522

RUN addgroup -S duck-group -g 1001 && adduser -S duck-user -u 1001 -G duck-group

RUN chown -R duck-user:duck-group /app

# Use a shell script to inject environment variables and then serve the app
CMD ["/bin/sh", "-c", "serve -s -l 5522"]