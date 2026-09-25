import Link from "next/link";
import { Badge, Card, Empty, SectionTitle } from "@/components/ui";
import { listBugs, pickProject } from "@/lib/queries";

export default async function Bugs({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const project = pickProject((await searchParams).p);
  const bugs = project ? listBugs(project.id) : [];
  return (
    <div className="grid grid-cols-1 gap-6">
      <h1 className="text-2xl font-semibold">Bugs</h1>
      <Card>
        <SectionTitle>{project ? project.name : "No project"}</SectionTitle>
        {bugs.length === 0 ? (
          <Empty>No bugs. Failures classified as product bugs show up here.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {bugs.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/bugs/${b.id}`}
                  className="flex items-center gap-3 py-3 text-sm hover:text-accent"
                >
                  <span className="min-w-0 flex-1 truncate">{b.title}</span>
                  {b.jiraKey && <span className="font-mono text-xs text-muted">{b.jiraKey}</span>}
                  <Badge value={b.severity} />
                  <Badge value={b.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
