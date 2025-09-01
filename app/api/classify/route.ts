import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";

/**
 * Zod schema for a single normalized slip
 */
const SlipSchema = z.object({
  // Keep linkage to the original upload
  source_id: z.string().default("").describe("Original slip id from input"),
  file_name: z.string().default("").describe("Original file name if available"),

  // High-level
  bank_from: z
    .string()
    .default("")
    .describe("Bank name of sender (e.g., SCB, KBank, BBL)"),
  bank_to: z.string().default("").describe("Bank name of recipient if shown"),
  status: z
    .string()
    .default("")
    .describe("e.g., โอนเงินสำเร็จ / รายการสำเร็จ / success"),

  // Date/Time
  date_time_text: z
    .string()
    .default("")
    .describe("Date & time exactly as seen in the slip text"),
  date_time_iso: z
    .string()
    .default("")
    .describe(
      "Normalized ISO 8601 in Asia/Bangkok, e.g., 2025-08-22T13:21:00+07:00"
    ),

  // Parties
  from: z
    .object({
      name: z.string().default("").describe("Name of sender"),
      account_number: z
        .string()
        .default("")
        .describe("Account number of sender"),
    })
    .optional(),

  to: z
    .object({
      name: z.string().default("").describe("Name of recipient"),
      account_number: z
        .string()
        .default("")
        .describe("Account number of recipient"),
      biller_id: z.string().default("").describe("Biller ID of recipient"),
      store_code: z.string().default("").describe("Store code of recipient"),
      transaction_code: z
        .string()
        .default("")
        .describe("Transaction code of recipient"),
    })
    .optional(),

  // Money
  amount: z.number().default(0).describe("Amount in THB"),
  currency: z.string().default("THB").describe("Currency"),
  fee: z.number().default(0).describe("Fee in THB"),

  // References (handle common Thai labels)
  transaction_reference: z
    .string()
    .default("")
    .describe("เลขที่รายการ / หมายเลขอ้างอิง / เลขที่อ้างอิง"),
  reference_number: z.string().default("").describe("Reference number"),
  reference_code: z.string().default("").describe("Reference code"),

  // Misc
  qr_code: z.string().default("").describe("QR code"),
});

/**
 * System prompt (single-slip)
 * Keep it strict and bank-agnostic. Thai + EN.
 */
const SYSTEM_PROMPT = `
You are an expert OCR normalizer for Thai bank payment slips (SCB, KBank, BBL, Krungthai, etc.).

TASK
- Extract only fields that are explicitly present. Do not guess or infer.
- If a field cannot be found, return an empty string "" (or 0 for amount/fee).
- Parse Thai or English dates and normalize to ISO 8601 in Asia/Bangkok (e.g., 2025-08-22T13:21:00+07:00) in "date_time_iso".
- Keep the original date string in "date_time_text".
- Remove currency symbols and commas from numeric fields; "amount" and "fee" are numbers.
- Map "เลขที่รายการ", "หมายเลขอ้างอิง", "เลขที่อ้างอิง", "reference", "ref no." into the reference fields as appropriate.
- If bank names are shown for both parties, set "bank_from" and "bank_to". Otherwise leave them empty.
- Respect masking: if an account shows as XXX-X-XXXX-X, keep the same masked format in "account_number".
- For QR payments, look for text after "ไปยัง" (meaning "to") and before any Biller ID or store code as the recipient name. For example, if you see "ไปยัง\n\nQR Payment at BTS", then "QR Payment at BTS" is the recipient name.
- Never include explanations, just compliant JSON.

DATE EXAMPLES
- "1 ส.ค. 68 08:33 น." -> interpret BE/AD correctly. If year seems two-digit, assume Thai slips often show Buddhist Era; convert to Gregorian if it is clearly BE. If unclear, preserve in "date_time_text" and best-effort ISO using AD if pattern indicates AD (e.g., Western bank UIs like BBL app usually AD).
- "22 ส.ค. 68, 13:21"
- "2025-08-22 13:21"
`;

/**
 * Builds a per-slip user prompt with just the needed text chunk to keep tokens small.
 */
function buildUserPromptForSlip(
  text: string,
  meta: { id: string; fileName?: string }
) {
  return `
<INPUT_SLIP>
ID: ${meta.id}
FILE_NAME: ${meta?.fileName ?? ""}

RAW_TEXT:
${text}
</INPUT_SLIP>

Return a single JSON object per the schema.
`;
}

/**
 * Wrap generateObject for a SINGLE slip to avoid token bloat and to parallelize safely.
 */
async function extractOneSlip({
  id,
  text,
  fileName,
}: {
  id: string;
  text: string;
  fileName?: string;
}) {
  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    output: "object",
    schema: SlipSchema,
    system: SYSTEM_PROMPT,
    prompt: buildUserPromptForSlip(text, { id, fileName }),
  });

  // Ensure linkage is present
  return {
    ...object,
    source_id: id,
    file_name: fileName ?? "",
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const texts = Array.isArray(body?.texts) ? body.texts : [];

    if (texts.length === 0) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    // Defensive: only pick fields we actually use
    const items = texts
      .map((t: any) => ({
        id: String(t?.id ?? ""),
        text: String(t?.text ?? ""),
        fileName: t?.fileName ? String(t.fileName) : "",
      }))
      .filter((i: any) => i.text.trim().length > 0);

    if (items.length === 0) {
      return NextResponse.json(
        { error: "No valid slip text found" },
        { status: 400 }
      );
    }

    // Batch per slip to keep context small and handle many images
    const results = await Promise.all(items.map(extractOneSlip));

    // Optionally, light post-normalization for numeric safety
    const safeResults = results.map((r) => ({
      ...r,
      amount: Number.isFinite(r.amount) ? r.amount : 0,
      fee: Number.isFinite((r as any).fee) ? (r as any).fee : 0,
      currency: r.currency || "THB",
      status: r.status || "",
      bank_from: r.bank_from || "",
      bank_to: r.bank_to || "",
    }));

    return NextResponse.json({ slips: safeResults }, { status: 200 });
  } catch (error) {
    console.error("AI classification error:", error);
    return NextResponse.json(
      { error: "Failed to classify text" },
      { status: 500 }
    );
  }
}
