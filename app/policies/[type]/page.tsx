import { notFound } from "next/navigation";
import { PolicyDocument } from "@/app/components/policy-document";
import type { PolicyKey } from "@/lib/legal-policies";

const supported = new Set<PolicyKey>(["terms", "privacy", "refund"]);

export default async function PolicyPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (!supported.has(type as PolicyKey)) notFound();
  return <PolicyDocument type={type as PolicyKey} />;
}
