import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";

// Define the structure for SCB slip data
export interface SCBSlipData {
  bank: string;
  status: string;
  date_time: string;
  transaction_reference: string;
  from: {
    name: string;
    account_number: string;
  };
  to: {
    name: string;
    biller_id?: string;
    store_code?: string;
    transaction_code?: string;
  };
  amount: number;
  currency: string;
  qr_code?: string;
}

// AI classification API endpoint
export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }
    // Define the system prompt for SCB slip classification
    const systemPrompt = `
        You are an AI assistant that extracts and classifies information from SCB (Siam Commercial Bank) payment slips in Thailand.
        Extract the information from the text.
        
        Only include fields that you can extract from the text. If information is not present, omit the field or use null.
        For the amount, convert it to a number without currency symbols or commas.
        If any field cannot be extracted, use an empty string for its value.
      `;

    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      output: "object",
      schema: z.object({
        bank: z.string().default("SCB"),
        status: z.string().default(""),
        date_time: z.string().default(""),
        transaction_reference: z.string().default(""),
        from: z
          .object({
            name: z.string().default(""),
            account_number: z.string().default(""),
          })
          .optional(),
        to: z
          .object({
            name: z.string().default(""),
            biller_id: z.string().optional().default(""),
            store_code: z.string().optional().default(""),
            transaction_code: z.string().optional().default(""),
          })
          .optional(),
        amount: z.number().default(0),
        currency: z.string().default("THB"),
        qr_code: z.string().optional().default(""),
      }),
      prompt: `${systemPrompt}\n\nHere is the text:\n${text}`,
    });
    return NextResponse.json(object);
  } catch (error) {
    console.error("AI classification error:", error);
    return NextResponse.json(
      { error: "Failed to classify text" },
      { status: 500 }
    );
  }
}
