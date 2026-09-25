import { PlansClient } from "@/components/plans-client";
import { Card, Empty } from "@/components/ui";
import { overview, pickProject } from "@/lib/queries";

export default async function Plans({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const project = pickProject((await searchParams).p);
  if (!project)
    return (
      <Card>
        <Empty>Create a project on the overview page first.</Empty>
      </Card>
    );
  const o = overview(project.id);
  return (
    <PlansClient
      project={{ id: project.id, name: project.name, baseUrl: project.baseUrl }}
      mapPages={o.mapPages}
      hasAi={Boolean(process.env.ANTHROPIC_API_KEY)}
    />
  );
}
