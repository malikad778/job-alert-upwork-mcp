import { NextRequest, NextResponse } from "next/server";
import { generateProposalPrompt, generateRepeatDeltaPrompt, generateClientReplyPrompt } from "../../../../lib/bpass-wrapper";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const type = body.type || "proposal";

    if (type === "repeat") {
      const prompt = generateRepeatDeltaPrompt(body);
      return NextResponse.json({ success: true, prompt });
    }

    if (type === "reply") {
      const prompt = generateClientReplyPrompt(body);
      return NextResponse.json({ success: true, prompt });
    }

    const prompt = generateProposalPrompt(body);
    return NextResponse.json({ success: true, prompt });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || "Prompt generation failed" }, { status: 500 });
  }
}
