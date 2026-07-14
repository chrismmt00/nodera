// A stand-in Ollama server for container tests: listens on all interfaces so
// worker containers can reach it via host.docker.internal, answers
// /api/generate after a configurable delay.
const http = require("node:http");

function startMockOllama({ port, delayMs = 0, text = "mock generation" }) {
  const server = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/api/generate") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        setTimeout(() => {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              response: text,
              prompt_eval_count: 7,
              eval_count: 13,
              done: true,
            })
          );
        }, delayMs);
      });
    } else {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => {
    server.listen(port, "0.0.0.0", () =>
      resolve({ server, stop: () => new Promise((r) => server.close(r)) })
    );
  });
}

module.exports = { startMockOllama };
