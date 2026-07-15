import RecuperarContrasena from "./RecuperarContrasena";

export const dynamic = "force-dynamic";

// Server component: lee ?motivo= (con el que /auth/callback reenvía los links de
// recuperación vencidos/usados) y se lo pasa al form client como prop.
export default async function RecuperarContrasenaPage({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string }>;
}) {
  const { motivo } = await searchParams;
  return <RecuperarContrasena motivoLinkInvalido={motivo === "link-invalido"} />;
}
