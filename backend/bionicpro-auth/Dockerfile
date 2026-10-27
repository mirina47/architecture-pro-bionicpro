# Build stage
FROM node:21.1.0

# Set working directory
WORKDIR /app

# Copy package.json file
COPY package.json ./

# Download dependencies
RUN npm install --legacy-peer-deps

# Copy the source code
COPY . .

RUN npm run build

# Expose the port the app runs on
EXPOSE 8000

CMD ["node", "dist/main.js"]