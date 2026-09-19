import { NextRequest, NextResponse } from "next/server";
import { getApiDocs } from "@/lib/swagger";

function getConnectedApiUrl(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost?.split(",")[0]?.trim() || request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const protocol = forwardedProto?.split(",")[0]?.trim() || new URL(request.url).protocol.replace(":", "");

  return host ? `${protocol}://${host}/api` : "/api";
}

export async function GET(request: NextRequest) {
  return NextResponse.json(getApiDocs(getConnectedApiUrl(request)));
}
