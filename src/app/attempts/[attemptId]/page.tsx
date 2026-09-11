import Workspace from "@/ui/workspace";
export default async function AttemptPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  return <Workspace key={attemptId} attemptId={attemptId}/>;
}
