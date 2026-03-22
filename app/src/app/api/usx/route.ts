import { NextRequest, NextResponse } from "next/server";

const USX_API_URL = "https://instructions.solstice.finance/v1/instructions";
const USX_API_KEY = "5aJUZP9ebCApZm%2BVMIvGQLZlRr9E";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const res = await fetch(USX_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": USX_API_KEY,
      },
      body: JSON.stringify(body),
    });

    const data = await res.text();

    if (!res.ok) {
      return NextResponse.json(
        { error: data },
        { status: res.status }
      );
    }

    return NextResponse.json(JSON.parse(data));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Proxy request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
