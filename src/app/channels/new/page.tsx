import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { CreateChannelForm } from "@/components/create-channel-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default function NewChannelPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Button asChild variant="ghost" className="w-fit px-0">
        <Link href="/">
          <ArrowLeft />
          Back
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Create channel</CardTitle>
          <CardDescription>
            Register a new production channel with the minimum files and settings
            needed to start creating videos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateChannelForm />
        </CardContent>
      </Card>
    </div>
  );
}
