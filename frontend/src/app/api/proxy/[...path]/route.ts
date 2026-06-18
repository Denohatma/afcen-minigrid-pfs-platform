import { NextRequest } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";

async function proxyRequest(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const backendPath = `/api/v1/${path.join("/")}`;
  const url = new URL(backendPath, BACKEND_URL);

  const searchParams = request.nextUrl.searchParams;
  searchParams.forEach((value, key) => url.searchParams.set(key, value));

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const init: RequestInit = {
    method: request.method,
    headers,
  };

  if (!["GET", "HEAD"].includes(request.method)) {
    const body = await request.text();
    if (body) init.body = body;
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(url.toString(), init);
  } catch {
    return new Response(
      JSON.stringify({ detail: "Backend unavailable. Configure BACKEND_URL." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const responseHeaders = new Headers();
  backendRes.headers.forEach((value, key) => {
    if (!["transfer-encoding", "connection"].includes(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  });

  if (backendRes.headers.get("content-type")?.includes("text/event-stream")) {
    return new Response(backendRes.body, {
      status: backendRes.status,
      headers: responseHeaders,
    });
  }

  const responseBody = await backendRes.arrayBuffer();
  return new Response(responseBody, {
    status: backendRes.status,
    headers: responseHeaders,
  });
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const DELETE = proxyRequest;
export const PATCH = proxyRequest;
