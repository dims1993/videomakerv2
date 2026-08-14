import Link from "next/link";
import { notFound } from "next/navigation";

import { updateReferenceDocumentAction } from "@/app/reference-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getChannelOptions } from "@/lib/channels-server";
import { prisma } from "@/lib/prisma";

export default async function ReferenceDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const document = await prisma.referenceDocument.findUnique({ where: { id } });
  if (!document) {
    notFound();
  }

  const channels = getChannelOptions();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{document.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Edit reference transcript and preview content.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/reference-library">Back to library</Link>
        </Button>
      </div>

      {query.saved ? (
        <p className="text-sm text-muted-foreground">Changes saved.</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Edit</CardTitle>
          <CardDescription>
            {document.wordCount} words · hash {document.contentHash.slice(0, 12)}…
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={updateReferenceDocumentAction.bind(null, document.id)}
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  name="title"
                  required
                  defaultValue={document.title}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="type">Type</Label>
                <select
                  id="type"
                  name="type"
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue={document.type}
                >
                  <option value="competitor_transcript">
                    Competitor transcript
                  </option>
                  <option value="successful_script">Successful script</option>
                  <option value="editorial_reference">Editorial reference</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sourceName">Source / competitor</Label>
                <Input
                  id="sourceName"
                  name="sourceName"
                  defaultValue={document.sourceName ?? ""}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sourceUrl">Source URL</Label>
                <Input
                  id="sourceUrl"
                  name="sourceUrl"
                  defaultValue={document.sourceUrl ?? ""}
                />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="tagsJson">Tags</Label>
                <Input
                  id="tagsJson"
                  name="tagsJson"
                  defaultValue={document.tagsJson ?? ""}
                />
              </div>
            </div>
            <input type="hidden" name="channelKey" value={document.channelKey} />
            <div className="grid gap-2">
              <Label htmlFor="content">Content</Label>
              <Textarea
                id="content"
                name="content"
                required
                className="min-h-80 font-mono text-sm"
                defaultValue={document.content}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isActive"
                value="on"
                defaultChecked={document.isActive}
                className="size-4"
              />
              Active
            </label>
            <p className="text-xs text-muted-foreground">
              Channel:{" "}
              {channels.find((channel) => channel.key === document.channelKey)
                ?.name ?? document.channelKey}
            </p>
            <Button type="submit">Save changes</Button>
          </form>
        </CardContent>
      </Card>

      {document.analysisJson ? (
        <Card>
          <CardHeader>
            <CardTitle>Stored analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-auto rounded-md border bg-muted/30 p-3 text-xs">
              {document.analysisJson}
            </pre>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
