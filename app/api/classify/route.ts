import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import {
  SYSTEM_PROMPT_BBL,
  SYSTEM_PROMPT_GENERIC,
  SYSTEM_PROMPT_KRUNGSRI,
  SYSTEM_PROMPT_SCB,
} from "./prompts";

/**
 * Zod schema for a single normalized slip
 */
const SlipSchema = z.object({
  // Link back to the upload
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
      name: z.string().default(""),
      account_number: z.string().default(""),
    })
    .optional(),

  to: z
    .object({
      name: z.string().default(""),
      account_number: z.string().default(""),
      biller_id: z.string().default(""),
      store_code: z.string().default(""),
      transaction_code: z.string().default(""),
    })
    .optional(),

  // Money
  amount: z.number().default(0).describe("Amount in THB"),
  currency: z.string().default("THB").describe("Currency"),
  fee: z.number().default(0).describe("Fee in THB"),

  // References
  transaction_reference: z
    .string()
    .default("")
    .describe("เลขที่รายการ / หมายเลขอ้างอิง / เลขที่อ้างอิง"),
  reference_number: z.string().default(""),
  reference_code: z.string().default(""),

  // Misc
  qr_code: z.string().default(""),
});

/**
 * System prompt (bank-agnostic). Push all logic here.
 */

function choosePrompt(raw: string) {
  const t = raw.toLowerCase();
  if (t.includes("scb") || t.includes("ไทยพาณิชย์")) return SYSTEM_PROMPT_SCB;
  if (t.includes("bangkok bank") || t.includes("ธนาคารกรุงเทพ"))
    return SYSTEM_PROMPT_BBL;
  if (t.includes("krungsri") || t.includes("กรุงศรี"))
    return SYSTEM_PROMPT_KRUNGSRI;
  // fallback (generic)
  return SYSTEM_PROMPT_GENERIC;
}

/** Build a minimal per-slip user prompt with the raw text only */
function buildUserPromptForSlip(
  text: string,
  meta: { id: string; fileName?: string }
) {
  return `
<INPUT_SLIP>
ID: ${meta.id}
FILE_NAME: ${meta.fileName ?? ""}

RAW_TEXT:
${text}
</INPUT_SLIP>

Return a single JSON object per the schema. Do not include explanations.`;
}

/** Extract a SINGLE slip (no manual preprocessing) */
async function extractOneSlip({
  id,
  text,
  fileName,
}: {
  id: string;
  text: string;
  fileName?: string;
}) {
  const textContent = text.toLowerCase();
  const systemPrompt = choosePrompt(textContent);

  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    output: "object",
    schema: SlipSchema,
    system: systemPrompt,
    prompt: buildUserPromptForSlip(text, { id, fileName }),
    // Optional: encourage determinism
    // temperature: 0,
  });

  return {
    ...object,
    source_id: id || object.source_id || "",
    file_name: fileName ?? object.file_name ?? "",
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const texts = Array.isArray(body?.texts) ? body.texts : [];

    if (texts.length === 0) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

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

    // Process each slip independently (robust for many images)
    const results = await Promise.all(items.map(extractOneSlip));

    // Minimal post-normalization; keep logic light
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
