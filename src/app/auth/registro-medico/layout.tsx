import { redirect } from "next/navigation";
import { getFlag } from "@/lib/feature-flags";

export default async function RegistroMedicoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const registroAbierto = await getFlag("registro_medicos_publico");

  if (!registroAbierto) {
    redirect("/");
  }

  return <>{children}</>;
}
