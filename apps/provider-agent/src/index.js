// Entry point for the dev provider agent.
const path = require("node:path");
const { loadEnv } = require("@nodera/shared");
loadEnv(path.join(__dirname, "..", "..", ".."));

const { ProviderAgent } = require("./agent.js");

const agent = new ProviderAgent();

async function shutdown(reason) {
  console.log(`shutting down (${reason})...`);
  await agent.stop();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.stdin.on("data", (chunk) => {
  if (chunk.toString().trim() === "shutdown") shutdown("stdin");
});
process.stdin.on("error", () => {});

agent.start().catch((err) => {
  console.error(`agent failed to start: ${err.message}`);
  process.exit(1);
});
