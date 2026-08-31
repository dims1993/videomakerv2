export type SpeechDisplayReplacement = {
  spokenWords: string[];
  displayToken: string;
};

export type PreparedSpeechText = {
  spokenText: string;
  displayText: string;
  replacements: SpeechDisplayReplacement[];
};

const ONES = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
] as const;

const TENS = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
] as const;

function normalizeWord(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function underOneThousandToWords(value: number): string[] {
  const words: string[] = [];
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;

  if (hundreds > 0) {
    words.push(ONES[hundreds], "hundred");
  }

  if (rest === 0) {
    return words;
  }

  if (rest < 20) {
    words.push(ONES[rest]);
    return words;
  }

  words.push(TENS[Math.floor(rest / 10)]);
  if (rest % 10 > 0) {
    words.push(ONES[rest % 10]);
  }

  return words;
}

export function integerToSpokenWords(value: number): string[] {
  if (!Number.isFinite(value) || value < 0) {
    return [];
  }

  const whole = Math.floor(value);

  if (whole === 0) {
    return ["zero"];
  }

  if (whole > 999_999_999_999) {
    return [];
  }

  const parts: Array<{ amount: number; label?: string }> = [
    { amount: Math.floor(whole / 1_000_000_000), label: "billion" },
    { amount: Math.floor((whole % 1_000_000_000) / 1_000_000), label: "million" },
    { amount: Math.floor((whole % 1_000_000) / 1_000), label: "thousand" },
    { amount: whole % 1_000 },
  ];

  const words: string[] = [];

  for (const part of parts) {
    if (part.amount <= 0) {
      continue;
    }

    words.push(...underOneThousandToWords(part.amount));
    if (part.label) {
      words.push(part.label);
    }
  }

  return words;
}

function centsToSpokenWords(cents: number): string[] {
  if (cents <= 0) {
    return [];
  }

  const amountWords = integerToSpokenWords(cents);
  return [...amountWords, cents === 1 ? "cent" : "cents"];
}

function parseGroupedInteger(raw: string) {
  const cleaned = raw.replace(/,/g, "");
  if (!/^\d+$/.test(cleaned)) {
    return null;
  }

  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function moneySuffixMultiplier(suffix: string | undefined) {
  if (!suffix) {
    return 1;
  }

  const normalized = suffix.toLowerCase();
  if (normalized === "k" || normalized === "thousand") return 1_000;
  if (normalized === "m" || normalized === "million") return 1_000_000;
  if (normalized === "b" || normalized === "billion") return 1_000_000_000;
  return 1;
}

function moneyMatchToSpokenWords(match: {
  raw: string;
  integerPart: string;
  decimalPart?: string;
  suffix?: string;
}): string[] | null {
  const multiplier = moneySuffixMultiplier(match.suffix);
  const base = Number(match.integerPart.replace(/,/g, ""));

  if (!Number.isFinite(base)) {
    return null;
  }

  let dollars = base * multiplier;
  let cents = 0;

  if (match.decimalPart && multiplier === 1) {
    const padded = `${match.decimalPart}00`.slice(0, 2);
    cents = Number(padded);
    if (!Number.isFinite(cents)) {
      return null;
    }
  } else if (match.decimalPart && multiplier > 1) {
    const fraction = Number(`0.${match.decimalPart}`);
    if (!Number.isFinite(fraction)) {
      return null;
    }
    dollars = (base + fraction) * multiplier;
  }

  const wholeDollars = Math.floor(dollars);
  const words = integerToSpokenWords(wholeDollars);

  if (words.length === 0) {
    return null;
  }

  words.push(wholeDollars === 1 ? "dollar" : "dollars");

  if (cents > 0 && multiplier === 1) {
    words.push("and", ...centsToSpokenWords(cents));
  }

  return words;
}

/**
 * Expand money / percentages for TTS while remembering how to show them
 * back as compact tokens in subtitles.
 */
export function prepareVoiceoverSpeechText(displayText: string): PreparedSpeechText {
  const display = displayText.trim().replace(/\n{3,}/g, "\n\n");
  const replacements: SpeechDisplayReplacement[] = [];

  // $4,982 | $4982 | $4.50 | $1.2M | $50k | $1.2 million
  const moneyPattern =
    /\$\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(?:\s*(k|m|b|thousand|million|billion)\b)?/gi;

  let spokenText = display.replace(moneyPattern, (raw, integerPart, decimalPart, suffix) => {
    const spokenWords = moneyMatchToSpokenWords({
      raw,
      integerPart,
      decimalPart,
      suffix,
    });

    if (!spokenWords || spokenWords.length === 0) {
      return raw;
    }

    replacements.push({
      spokenWords,
      displayToken: raw.replace(/\s+/g, ""),
    });

    return spokenWords.join(" ");
  });

  // 50% / 12.5%
  spokenText = spokenText.replace(
    /(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d+))?\s*%/g,
    (raw, integerPart, decimalPart) => {
      const whole = parseGroupedInteger(integerPart);
      if (whole === null) {
        return raw;
      }

      const spokenWords = [...integerToSpokenWords(whole)];
      if (decimalPart) {
        spokenWords.push("point", ...decimalPart.split("").map((digit: string) => ONES[Number(digit)] ?? digit));
      }
      spokenWords.push("percent");

      replacements.push({
        spokenWords,
        displayToken: raw.replace(/\s+/g, ""),
      });

      return spokenWords.join(" ");
    },
  );

  // Bare grouped numbers like 4,982 (common money-looking amounts)
  spokenText = spokenText.replace(/\b(\d{1,3}(?:,\d{3})+)\b/g, (raw) => {
    const value = parseGroupedInteger(raw);
    if (value === null || value < 1_000) {
      return raw;
    }

    const spokenWords = integerToSpokenWords(value);
    if (spokenWords.length === 0) {
      return raw;
    }

    replacements.push({
      spokenWords,
      displayToken: raw,
    });

    return spokenWords.join(" ");
  });

  // Biblical tetragrammaton: TTS spells Y-H-W-H unless expanded.
  // Keep the on-screen token as written; speak the common English form.
  spokenText = spokenText.replace(/\b(YHWH|YHVH)\b/gi, (raw) => {
    const spokenWords = ["Yahweh"];
    replacements.push({
      spokenWords,
      displayToken: raw,
    });
    return spokenWords.join(" ");
  });

  return {
    spokenText: spokenText.replace(/[ \t]{2,}/g, " ").trim(),
    displayText: display,
    replacements,
  };
}

type TimedWord = {
  word: string;
  start: number;
  end: number;
};

/**
 * After forced alignment on spoken text, collapse expanded number phrases
 * back into compact display tokens ($4,982, 50%, etc.).
 */
export function remapSpeechWordsToDisplay<T extends TimedWord>(
  words: T[],
  replacements: SpeechDisplayReplacement[],
): T[] {
  if (words.length === 0 || replacements.length === 0) {
    return words;
  }

  const ordered = [...replacements].sort(
    (a, b) => b.spokenWords.length - a.spokenWords.length,
  );
  const result: T[] = [];
  let index = 0;

  while (index < words.length) {
    let matched: SpeechDisplayReplacement | null = null;

    for (const replacement of ordered) {
      const length = replacement.spokenWords.length;
      if (length === 0 || index + length > words.length) {
        continue;
      }

      const slice = words.slice(index, index + length);
      const matches = replacement.spokenWords.every((spokenWord, offset) => {
        return normalizeWord(slice[offset]?.word ?? "") === normalizeWord(spokenWord);
      });

      if (matches) {
        matched = replacement;
        break;
      }
    }

    if (!matched) {
      result.push(words[index]);
      index += 1;
      continue;
    }

    const slice = words.slice(index, index + matched.spokenWords.length);
    result.push({
      ...slice[0],
      word: matched.displayToken,
      start: slice[0].start,
      end: slice[slice.length - 1].end,
    });
    index += matched.spokenWords.length;
  }

  return result;
}
