export function modelFields(model) {
  return Object.entries(model.params || {}).map(([name, definition]) => ({
    name,
    definition,
    label: fieldLabel(name),
    required: Boolean(definition.required),
  })).sort((left, right) => Number(right.required) - Number(left.required));
}

export function initialModelValues(model) {
  const values = {};
  for (const field of modelFields(model)) {
    values[field.name] = field.definition.default ?? "";
  }
  return values;
}

export function fieldLabel(name) {
  return name
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      if (word.toLowerCase() === "id") return "ID";
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

export function buildModelInput(model, values) {
  const input = {};
  for (const field of modelFields(model)) {
    const value = values[field.name];
    if (value === undefined || value === "") continue;
    input[field.name] = field.definition.type === "integer" ? Number(value) : value;
  }
  return input;
}

export function validateModelValues(model, values) {
  for (const field of modelFields(model)) {
    const value = values[field.name];
    if (!field.required) continue;
    if (field.definition.type === "string" && !String(value || "").trim()) {
      return `${field.label} is required.`;
    }
    if (field.definition.type === "integer" && (value === "" || !Number.isInteger(Number(value)))) {
      return `${field.label} must be a whole number.`;
    }
  }
  return null;
}

export function modelTitle(model) {
  return model.slug
    .split("-")
    .filter(Boolean)
    .map((part) => {
      if (/^\d+(\.\d+)?$/.test(part)) return part;
      if (part.length <= 4 && /[a-z]/i.test(part)) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

export function modalityLabel(modality) {
  if (modality === "llm") return "Text";
  if (modality === "image") return "Image";
  return fieldLabel(String(modality || "model"));
}

export function formatRuntime(seconds) {
  if (!seconds) return "Runtime varies";
  if (seconds < 60) return `Up to ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `Up to ${minutes}m ${remainder}s` : `Up to ${minutes}m`;
}

export function parameterSummary(model) {
  const fields = modelFields(model);
  const required = fields.filter((field) => field.required).length;
  const optional = fields.length - required;
  if (optional === 0) return `${required} required field${required === 1 ? "" : "s"}`;
  return `${required} required, ${optional} optional`;
}
