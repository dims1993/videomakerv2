export class BrowserAutomationError extends Error {
  readonly code: string;
  readonly requiresUserAction: boolean;

  constructor(
    message: string,
    options?: { code?: string; requiresUserAction?: boolean },
  ) {
    super(message);
    this.name = "BrowserAutomationError";
    this.code = options?.code ?? "browser_automation_error";
    this.requiresUserAction = Boolean(options?.requiresUserAction);
  }
}

export class BrowserSessionExpiredError extends BrowserAutomationError {
  constructor(message = "Browser session expired. Sign in manually and resume.") {
    super(message, {
      code: "session_expired",
      requiresUserAction: true,
    });
    this.name = "BrowserSessionExpiredError";
  }
}

export class BrowserRateLimitError extends BrowserAutomationError {
  constructor(message = "Provider usage limit reached. Resolve manually and resume.") {
    super(message, {
      code: "rate_limit",
      requiresUserAction: true,
    });
    this.name = "BrowserRateLimitError";
  }
}

export class BrowserSelectorNotFoundError extends BrowserAutomationError {
  constructor(message = "Essential provider selector was not found.") {
    super(message, {
      code: "selector_not_found",
      requiresUserAction: true,
    });
    this.name = "BrowserSelectorNotFoundError";
  }
}
