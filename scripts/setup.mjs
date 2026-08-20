import { randomBytes } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";

try {
  await access(".env.local");
  console.log(".env.local already exists; left it unchanged.");
} catch {
  const template = await readFile(".env.example", "utf8");
  const secret = randomBytes(32).toString("base64url");
  await writeFile(".env.local", template.replace("NEXTAUTH_SECRET=", `NEXTAUTH_SECRET=${secret}`));
  console.log("Created .env.local with a random session secret.");
}

try {
  await access(".dev.vars");
} catch {
  await writeFile(".dev.vars", await readFile(".dev.vars.example", "utf8"));
  console.log("Created .dev.vars for the local Workers preview.");
}

console.log("Local setup is ready. D1 and R2 data stay in .wrangler/; Cloudflare login is not required.");
