import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

type CollapsibleCardProps = {
  title: string;
  description?: string;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
};

export function CollapsibleCard({
  title,
  description,
  badge,
  defaultOpen = false,
  children,
  className,
}: CollapsibleCardProps) {
  return (
    <details
      className={cn(
        "group rounded-lg border bg-card text-card-foreground shadow-sm",
        className,
      )}
      // Uncontrolled after first paint; suppress warning if the browser
      // restores open state across soft navigations.
      open={defaultOpen ? true : undefined}
      suppressHydrationWarning
    >
      <summary className="flex cursor-pointer list-none items-start gap-3 p-5 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold leading-none tracking-normal">
              {title}
            </h3>
            {badge}
          </div>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-4 border-t px-5 pb-5 pt-4">{children}</div>
    </details>
  );
}
