import { notFound } from "next/navigation";
import { RunView } from "@/components/run-view";
import { runDetail } from "@/lib/queries";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const detail = runDetail((await params).id);
  if (!detail) notFound();
  return <RunView initial={JSON.parse(JSON.stringify(detail))} />;
}
