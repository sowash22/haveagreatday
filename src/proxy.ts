import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/api/plan";
  url.searchParams.delete("format");
  return NextResponse.rewrite(url);
}

export const config = { matcher: [{ source: "/", has: [{ type: "query", key: "format", value: "json" }] }] };
