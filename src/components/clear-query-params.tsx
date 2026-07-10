"use client";

import { useEffect } from "react";

type ClearQueryParamsProps = {
  params: string[];
};

export function ClearQueryParams({ params }: ClearQueryParamsProps) {
  useEffect(() => {
    const url = new URL(window.location.href);
    let changed = false;

    for (const param of params) {
      if (url.searchParams.has(param)) {
        url.searchParams.delete(param);
        changed = true;
      }
    }

    if (changed) {
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, [params]);

  return null;
}
