import { PublicConfigSchema } from "../../../domain/schemas";
import { REVIEW_BASE, supportedContent } from "../../../server/configuration";
import { platformAvailable } from "../../../server/credentials";
import { json } from "../../../server/http";
export const dynamic = "force-dynamic";
export async function GET() {
  return json(PublicConfigSchema.parse({ ...REVIEW_BASE, platformAvailable: platformAvailable(), content: supportedContent(),
    limits: { reviewTimeoutMs: 70_000, maxBodyBytes: 256 * 1024, maxDesignBytes: 64 * 1024 },
  }));
}
