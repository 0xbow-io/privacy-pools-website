import { NextRequest, NextResponse } from 'next/server';
import { getConstants } from '~/config/constants';
import { ROUTER } from '~/utils/router';

const { COOKIES } = getConstants();
const { USER_LOGGED, USER_CONNECTED } = COOKIES;

export function middleware(request: NextRequest) {
  const userLogged = request.cookies.get(USER_LOGGED.name);
  const userConnected = request.cookies.get(USER_CONNECTED.name);

  if (userConnected && !userLogged) {
    if (!request.nextUrl.pathname.startsWith(ROUTER.account.base)) {
      return NextResponse.redirect(new URL(ROUTER.account.base, request.url));
    }
  }

  if (userConnected && userLogged) {
    if (request.nextUrl.pathname.startsWith(ROUTER.account.base)) {
      return NextResponse.redirect(new URL(ROUTER.home.base, request.url));
    }
  }

  return NextResponse.next();
}
