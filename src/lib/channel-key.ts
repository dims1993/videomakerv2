export class ChannelScaffoldError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChannelScaffoldError";
  }
}

export function slugifyChannelKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function validateChannelKey(key: string) {
  if (!/^[a-z][a-z0-9-]{1,62}$/.test(key)) {
    throw new ChannelScaffoldError(
      "Channel key must start with a letter and use only lowercase letters, numbers, and hyphens (2–63 chars).",
    );
  }
}
