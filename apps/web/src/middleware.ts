import { NextResponse, type NextRequest } from 'next/server';

/**
 * Every request gets a name (task P1.4.3, docs/architecture/09 §1).
 *
 * A UUID, generated HERE — never taken from the client. An `x-request-id` a
 * browser sent would be an attacker's choice of what their errors are filed
 * under, and a way to write arbitrary text into every log line. So any inbound
 * value is overwritten.
 *
 * It travels two ways. Forward, as a request header, so the API's composition
 * root can read it and stamp it on every log line, audit entry and error of this
 * request. And back, as a response header, so a support conversation that
 * starts with "it said حدث خطأ" can end with the id the server already filed it
 * under — the same id printed inside that Arabic message.
 *
 * Static assets are excluded: an image has no request worth correlating, and
 * middleware on every thumbnail is latency on exactly the connections this
 * product is built for.
 */
export function middleware(request: NextRequest) {
  const id = crypto.randomUUID();

  const headers = new Headers(request.headers);
  headers.set('x-request-id', id);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set('x-request-id', id);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|dev-media|favicon\.ico|icon\.svg).*)'],
};
