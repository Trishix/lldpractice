import Catalogue from "@/ui/catalogue";
import { getPublicProblemSnapshot, listPublicProblems } from "@/server/content";
export default async function Home({ searchParams }: { searchParams: Promise<{ problem?: string }> }) {
  const { problem } = await searchParams;
  const problems = listPublicProblems().flatMap(p => (["java", "python", "cpp"] as const).map(language => getPublicProblemSnapshot(p.problemId, p.contentVersion, language)!));
  return <Catalogue key={problem ?? "catalogue"} initialProblem={problem ?? null} problems={problems}/>;
}
