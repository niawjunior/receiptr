import { NextRequest, NextResponse } from "next/server";

// OCR API endpoint
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const imageFile = formData.get("file") as File;

    if (!imageFile) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Get API key from environment variables (secure server-side access)
    const apiKey = process.env.OPENTYPHOON_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "OCR API key not configured" },
        { status: 500 }
      );
    }

    // Prepare OCR API request

    const params = {
      model: "typhoon-ocr-preview",
      task_type: "default",
      max_tokens: 16000,
      temperature: 0.1,
      top_p: 0.6,
      repetition_penalty: 1.2,
    };

    const formDataForApi = new FormData();
    formDataForApi.append("file", imageFile);
    formDataForApi.append("params", JSON.stringify(params));
    // Make request to OCR API
    const response = await fetch("https://api.opentyphoon.ai/v1/ocr", {
      method: "POST",
      body: formDataForApi,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json(
        { error: "OCR API error", details: errorData },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Extract text from successful results
    const extractedTexts = [];
    for (const pageResult of data.results || []) {
      if (pageResult.success && pageResult.message) {
        let content = pageResult.message.choices[0].message.content;
        try {
          // Try to parse as JSON if it's structured output
          const parsedContent = JSON.parse(content);
          content = parsedContent.natural_text || content;
        } catch (e) {
          console.log(e);
          // Use content as-is if not JSON
        }
        extractedTexts.push(content);
      } else if (!pageResult.success) {
        console.error(
          `Error processing ${pageResult.filename || "unknown"}: ${
            pageResult.error || "Unknown error"
          }`
        );
      }
    }

    const extractedText = extractedTexts.join("\n");
    return NextResponse.json({ text: extractedText });
  } catch (error) {
    console.error("OCR processing error:", error);
    return NextResponse.json(
      { error: "Failed to process image" },
      { status: 500 }
    );
  }
}
