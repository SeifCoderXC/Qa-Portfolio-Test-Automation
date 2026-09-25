import { AssistantChat } from "@/components/assistant-chat";
import { Card, Empty } from "@/components/ui";
import { pickProject } from "@/lib/queries";

export default async function Assistant({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const project = pickProject((await searchParams).p);
  if (!project)
    return (
      <Card>
        <Empty>Create a project first.</Empty>
      </Card>
    );
  return (
    <AssistantChat
      projectId={project.id}
      projectName={project.name}
      hasAi={Boolean(process.env.ANTHROPIC_API_KEY)}
    />
  );
}
