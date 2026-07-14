// Cloudflare R2 backend — implemented in task 4.2. Fails loud, never silent.
function createR2Backend() {
  throw new Error("The R2 storage backend is not implemented yet (task 4.2). Use STORAGE_BACKEND=local.");
}

module.exports = { createR2Backend };
