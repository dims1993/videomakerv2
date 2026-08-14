import Link from "next/link";

import {
  createReferenceDocumentAction,
  deleteReferenceDocumentAction,
  toggleReferenceDocumentActiveAction,
} from "@/app/reference-actions";
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

export default async function ReferenceLibraryPage({
  searchParams,
}: {
  searchParams?: Promise<{ saved?: string; deleted?: string }>;
}) {
  const query = searchParams ? await searchParams : {};
  const channels = getChannelOptions();
  const documents = await prisma.referenceDocument.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      channelKey: true,
      type: true,
      sourceName: true,
      wordCount: true,
      isActive: true,
      updatedAt: true,
      analysisJson: true,
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Reference Library
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload competitor transcripts and editorial references for browser
            automation. Content is treated as untrusted analysis material only.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/">Back</Link>
        </Button>
      </div>

      {query.saved ? (
        <p className="text-sm text-muted-foreground">Reference saved.</p>
      ) : null}
      {query.deleted ? (
        <p className="text-sm text-muted-foreground">Reference deleted.</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Add transcript</CardTitle>
          <CardDescription>
            Supports paste from `.txt`, `.md`, `.json`, `.srt`, or `.vtt` content.
            Duplicates are blocked by normalized content hash.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createReferenceDocumentAction} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="title">Title</Label>
                <Input id="title" name="title" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="channelKey">Channel</Label>
                <select
                  id="channelKey"
                  name="channelKey"
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue={channels[0]?.key}
                >
                  {channels.map((channel) => (
                    <option key={channel.key} value={channel.key}>
                      {channel.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="type">Type</Label>
                <select
                  id="type"
                  name="type"
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue="competitor_transcript"
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
                <Input id="sourceName" name="sourceName" />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="sourceUrl">Source URL (optional)</Label>
                <Input id="sourceUrl" name="sourceUrl" type="url" />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="tagsJson">Tags (comma-separated or JSON)</Label>
                <Input id="tagsJson" name="tagsJson" placeholder="hook, retention, cta" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="content">Transcript</Label>
              <Textarea
                id="content"
                name="content"
                required
                className="min-h-48 font-mono text-sm"
                placeholder="Paste transcript text here..."
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isActive"
                value="on"
                defaultChecked
                className="size-4"
              />
              Active (available for automation)
            </label>
            <Button type="submit">Save reference</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Library</CardTitle>
          <CardDescription>{documents.length} documents</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No references yet.</p>
          ) : (
            documents.map((document) => (
              <div
                key={document.id}
                className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <Link
                    href={`/reference-library/${document.id}`}
                    className="font-medium hover:underline"
                  >
                    {document.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {document.channelKey} · {document.type}
                    {document.sourceName ? ` · ${document.sourceName}` : ""} ·{" "}
                    {document.wordCount} words ·{" "}
                    {document.isActive ? "active" : "inactive"}
                    {document.analysisJson ? " · analyzed" : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <form action={toggleReferenceDocumentActiveAction.bind(null, document.id)}>
                    <Button type="submit" variant="outline" size="sm">
                      {document.isActive ? "Deactivate" : "Activate"}
                    </Button>
                  </form>
                  <form action={deleteReferenceDocumentAction.bind(null, document.id)}>
                    <Button type="submit" variant="destructive" size="sm">
                      Delete
                    </Button>
                  </form>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
