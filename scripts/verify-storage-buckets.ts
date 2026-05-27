/**
 * Verificador de buckets de Supabase Storage
 *
 * Verifica que todos los buckets criticos existan en la instancia de Supabase.
 * Usar como checklist pre-deploy o post-migracion.
 *
 * Uso:
 *   npx tsx scripts/verify-storage-buckets.ts
 *
 * Requiere:
 *   NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local o entorno
 */

import { createClient } from "@supabase/supabase-js";

const REQUIRED_BUCKETS = [
  {
    id: "avatars",
    expectedPublic: true,
    description: "Fotos de perfil de medicos",
  },
  {
    id: "credenciales-medicos",
    expectedPublic: false,
    description: "Fotos de credenciales (registro medico)",
  },
  {
    id: "consultas-temp",
    expectedPublic: false,
    description: "Estudios temporales de consultas",
  },
  {
    id: "firmas-medicos",
    expectedPublic: false,
    description: "Firmas manuscritas de medicos",
  },
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("❌ Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const { data: buckets, error } = await supabase.storage.listBuckets();

  if (error) {
    console.error("❌ Error listando buckets:", error.message);
    process.exit(1);
  }

  const bucketMap = new Map(buckets.map((b) => [b.id, b]));
  let allOk = true;

  console.log("\n=== Verificacion de buckets de Storage ===\n");

  for (const req of REQUIRED_BUCKETS) {
    const bucket = bucketMap.get(req.id);

    if (!bucket) {
      console.log(`❌ ${req.id} — NO EXISTE (${req.description})`);
      allOk = false;
      continue;
    }

    if (bucket.public !== req.expectedPublic) {
      console.log(
        `⚠️  ${req.id} — existe pero public=${bucket.public} (esperado: ${req.expectedPublic})`
      );
      allOk = false;
      continue;
    }

    console.log(`✅ ${req.id} — OK (public=${bucket.public})`);
  }

  // Check for unexpected buckets
  const knownIds = new Set(REQUIRED_BUCKETS.map((b) => b.id));
  const unknown = buckets.filter((b) => !knownIds.has(b.id));
  if (unknown.length > 0) {
    console.log(`\n⚠️  Buckets no registrados en este script:`);
    for (const b of unknown) {
      console.log(`   - ${b.id} (public=${b.public})`);
    }
  }

  console.log(allOk ? "\n✅ Todos los buckets OK\n" : "\n❌ Hay problemas — revisar arriba\n");
  process.exit(allOk ? 0 : 1);
}

main();
