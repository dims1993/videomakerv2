"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Tabs } from "@/components/ui/tabs";
import type { VideoDetailTab } from "@/lib/video-detail-tabs";

type VideoPageTabsProps = {
  activeTab: VideoDetailTab;
  children: ReactNode;
};

export function VideoPageTabs({ activeTab, children }: VideoPageTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onValueChange(nextTab: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    params.delete("saved");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <Tabs
      value={activeTab}
      onValueChange={onValueChange}
      className="space-y-4"
    >
      {children}
    </Tabs>
  );
}
