import { ApiError } from "./errors.js";

// Validates a job's input against the model's params schema from the DB —
// the same definition GET /v1/models publishes (one definition, two uses).
export function validateJobInput(params, input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new ApiError("validation_failed", "input must be a JSON object.");
  }
  for (const [name, def] of Object.entries(params)) {
    const value = input[name];
    if (value === undefined) {
      if (def.required) throw new ApiError("validation_failed", `input.${name} is required.`);
      continue;
    }
    if (def.type === "string") {
      if (typeof value !== "string") {
        throw new ApiError("validation_failed", `input.${name} must be a string.`);
      }
      if (def.max_bytes && Buffer.byteLength(value, "utf8") > def.max_bytes) {
        throw new ApiError(
          "input_too_large",
          `input.${name} is larger than the ${def.max_bytes}-byte limit for this model.`
        );
      }
    } else if (def.type === "integer") {
      if (!Number.isInteger(value)) {
        throw new ApiError("validation_failed", `input.${name} must be an integer.`);
      }
      // Every integer param on the menu is a count or dimension.
      if (value < 1) {
        throw new ApiError("validation_failed", `input.${name} must be at least 1.`);
      }
      if (def.max !== undefined && value > def.max) {
        throw new ApiError("validation_failed", `input.${name} must be at most ${def.max}.`);
      }
    }
  }
  for (const name of Object.keys(input)) {
    if (!(name in params)) {
      throw new ApiError("validation_failed", `Unknown input field '${name}'.`);
    }
  }
}

export function validateWebhookUrl(webhookUrl) {
  if (webhookUrl === undefined || webhookUrl === null) return null;
  if (typeof webhookUrl !== "string") {
    throw new ApiError("validation_failed", "webhook_url must be a string.");
  }
  let url;
  try {
    url = new URL(webhookUrl);
  } catch {
    throw new ApiError("validation_failed", "webhook_url must be a valid URL.");
  }
  const httpsOnly = process.env.NODE_ENV === "production";
  if (url.protocol !== "https:" && (httpsOnly || url.protocol !== "http:")) {
    throw new ApiError(
      "validation_failed",
      httpsOnly ? "webhook_url must use https." : "webhook_url must use http or https."
    );
  }
  return webhookUrl;
}

// Stable stringify (recursively sorted keys) for idempotency body comparison.
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
