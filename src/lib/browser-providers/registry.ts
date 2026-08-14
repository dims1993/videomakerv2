import type { BrowserModelProvider } from "@/lib/browser-automation/types";
import { ChatGptBrowserProvider } from "@/lib/browser-providers/chatgpt-browser-provider";
import { FakeBrowserModelProvider } from "@/lib/browser-providers/fake-browser-provider";

const providers = new Map<string, BrowserModelProvider>();

function registerDefaultProviders() {
  if (providers.size > 0) {
    return;
  }

  const fake = new FakeBrowserModelProvider();
  providers.set(fake.key, fake);

  const chatgpt = new ChatGptBrowserProvider();
  providers.set(chatgpt.key, chatgpt);
}

export function getBrowserModelProvider(key: string): BrowserModelProvider {
  registerDefaultProviders();
  const provider = providers.get(key);

  if (!provider) {
    throw new Error(
      `Unknown browser model provider "${key}". Available: ${[...providers.keys()].join(", ")}`,
    );
  }

  return provider;
}

export function listBrowserModelProviders() {
  registerDefaultProviders();
  return [...providers.values()].map((provider) => ({
    key: provider.key,
    displayName: provider.displayName,
  }));
}
