import { redirect } from "next/navigation";
import { getFlag } from "@/lib/feature-flags";

export default async function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const registroAbierto = await getFlag("registro_pacientes_publico");

  if (!registroAbierto) {
    redirect("/");
  }

  return <>{children}</>;
}
