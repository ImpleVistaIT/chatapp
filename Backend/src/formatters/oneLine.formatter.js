export function formatOneLine({ entity, intent, id, data, intentDef }) {
  // ✅ If no template, do NOT try to stringify objects/arrays
  if (!intentDef || typeof intentDef.template !== "function") {
    return null;
  }

  return intentDef.template({ entity, intent, id, data, intentDef });
}