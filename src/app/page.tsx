import Link from "next/link";
import { FileVideo, Plus } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { statusLabel } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // Keep the list light: never pull ideaJson / script / imagePrompt blobs here.
  const videos = await prisma.video.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      topic: true,
      status: true,
      updatedAt: true,
      _count: {
        select: { scenes: true },
      },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Videos</h1>
          <p className="mt-1 text-sm text-muted-foreground">Plan scripts, scenes, assets, and metadata before AI automation.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/channels/new">
              <Plus />
              Create channel
            </Link>
          </Button>
          <Button asChild>
            <Link href="/videos/new">
              <Plus />
              Create video
            </Link>
          </Button>
        </div>
      </div>

      {videos.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No videos yet</CardTitle>
            <CardDescription>Create the first production item and start shaping the idea.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/channels/new">
                <Plus />
                Create channel
              </Link>
            </Button>
            <Button asChild>
              <Link href="/videos/new">
                <Plus />
                Create video
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {videos.map((video) => (
            <Link key={video.id} href={`/videos/${video.id}`} className="block">
              <Card className="transition-colors hover:bg-muted/40">
                <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex items-center gap-2">
                      <FileVideo className="size-4 text-muted-foreground" />
                      <h2 className="truncate text-base font-semibold">{video.title}</h2>
                    </div>
                    <p className="line-clamp-2 text-sm text-muted-foreground">{video.topic}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <Badge>{statusLabel(video.status)}</Badge>
                    <span>{video._count.scenes} scenes</span>
                    <span>Updated {formatDate(video.updatedAt)}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
