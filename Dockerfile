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

# Copy the injection script
COPY inject-env.js /app/

# Expose port 5522
EXPOSE 5522

# Define environment variables
ENV DUCK_UI_EXTERNAL_CONNECTION_NAME=""
ENV DUCK_UI_EXTERNAL_HOST=""
ENV DUCK_UI_EXTERNAL_PORT=""
ENV DUCK_UI_EXTERNAL_USER=""
ENV DUCK_UI_EXTERNAL_PASS=""
ENV DUCK_UI_EXTERNAL_DATABASE_NAME=""

RUN addgroup -S duck-group -g 1001 && adduser -S duck-user -u 1001 -G duck-group
RUN chown -R duck-user:duck-group /app

USER duck-user

# Run the injection script then serve
CMD node inject-env.js && serve -s -l 5522