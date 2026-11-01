import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE } from "@/config/demo";

export function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.delete(DEMO_COOKIE);
  return response;
}
