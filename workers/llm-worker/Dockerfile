# Nodera LLM worker — talks to the provider host's Ollama server.
FROM node:22-alpine
WORKDIR /app
COPY app.js .
# Never run job code as root (docs/BLUEPRINT.md §11).
USER node
ENTRYPOINT ["node", "app.js"]
