FROM oven/bun:latest

# Set working directory
WORKDIR /app

# Copy dependency definitions
COPY package.json bun.lock ./

# Install dependencies (production mode)
RUN bun install --production

# Copy the rest of the application code
COPY . .

# Expose the port (Render will also override this with process.env.PORT)
EXPOSE 3000

# Start the application
CMD ["bun", "run", "server/index.js"]
