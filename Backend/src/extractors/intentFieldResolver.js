export function resolveIntentPaths(intentDef) {
  return Array.isArray(intentDef?.paths) ? intentDef.paths : [];
}