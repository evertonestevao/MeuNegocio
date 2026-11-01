import { NextResponse } from "next/server";
import { DEMO_COOKIE } from "@/config/demo";

export function GET() {
  // Destino relativo: atrás de túnel ou proxy, o host de request.url é o interno.
  const response = new NextResponse(null, { status: 307, headers: { location: "/" } });
  response.cookies.delete(DEMO_COOKIE);
  return response;
}
