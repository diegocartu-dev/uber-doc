import { redirect } from "next/navigation";
import { getFlag } from "@/lib/feature-flags";

export default async function NovaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await getFlag("nova_ai"))) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
